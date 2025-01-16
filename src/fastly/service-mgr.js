/*
 * Copyright 2024 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */

import { FastlyApi } from './api/fastly-api.js';
import { FastlyService } from './service.js';

export const LOG_TYPES = {
  bigqueries: { api: 'bigquery' },
  // 'cloudfiles',
  // 'datadog',
  // 'digitalocean',
  // 'elasticsearch',
  // 'ftp',
  // 'gcs',
  // 'pubsub',
  // 'grafanacloudlogs',
  https: { api: 'https' },
  // 'heroku',
  // 'honeycomb',
  // 'kafka',
  // 'kinesis',
  // 'logshuttle',
  // 'loggly',
  // 'azureblob',
  newrelics: { api: 'newrelic' },
  // 'newrelicotlp',
  // 'openstack',
  // 'papertrail',
  // 's3',
  // 'sftp',
  // 'scalyr',
  splunks: { api: 'splunk' },
  // 'sumologic',
  // 'syslog',
};

// fields on service details that are objects or arrays
const SUPPORTED_FEATURES = [
  'products',
  'domains',
  'conditions',
  'headers',
  'backends',
  'acls',
  'dictionaries',
  'snippets',
  'vcls',
  'request_settings',
  'settings',
  'io_settings',
  'environments',
  ...Object.keys(LOG_TYPES),
];

/**
 * High-level Fastly service interactions.
 */
export class FastlyServiceManager {
  #fastly;

  constructor(apiToken) {
    this.#fastly = new FastlyApi(apiToken);
  }

  /**
   * Retrieve a service configuration from Fastly.
   *
   * @param {string} serviceId Fastly service id
   * @param {string} version Fastly service version. Optional, defaults to latest version. Can also use 'active' to fetch active version.
   */
  async getService(serviceId, version) {
    const versionType =
      version === undefined ? 'latest version' : version === 'active' ? 'active version' : `version ${version}`;
    console.log(`Fetching service ${serviceId} at ${versionType}...`);

    const fastly = this.#fastly;

    const details = await fastly.serviceDetails(serviceId, version === 'active' ? undefined : version);
    const service = { ...(version === 'active' ? details.active_version : details.version) };
    service.version = service.number;
    service.name = details.name;
    service.type = details.type;

    if (service.type !== 'vcl') {
      console.warn(`Warning: Service type is ${service.type}. This tool is only tested with 'vcl' services.`);
    }

    console.log(
      `- Version ${service.version} (active ${details.active_version?.number}, latest ${details.versions.at(-1).number})`,
    );

    // load acl entries
    console.log('- Loading ACLs...');
    for (const acl of service.acls) {
      const { id } = acl;
      acl.entries = await fastly.aclEntries(serviceId, id);
    }

    // load dictionary items
    console.log('- Loading dictionaries...');
    for (const dict of service.dictionaries) {
      const { id, write_only } = dict;
      dict.info = await fastly.dictionaryInfo(serviceId, service.version, id);
      if (write_only) {
        dict.items = [];
      } else {
        dict.items = await fastly.dictionaryItems(serviceId, id);
      }
    }

    // load products
    service.products = await fastly.enabledProducts(serviceId);

    // remove noisy and undesired fields
    for (const key in service) {
      if (['comment', 'number', 'deployed', 'staging', 'testing', 'deleted_at'].includes(key)) {
        delete service[key];
      }
    }

    this.#unsupportedCheck(service);

    return new FastlyService(service);
  }

  /**
   * Create a new Fastly service and upload configuration to initial version.
   *
   * @param {Object} opts with name, comment, service
   * @returns {String} new service id
   */
  async createService(opts) {
    const { name, comment, service } = opts;

    console.log(`\nCreating new service: '${name}'`);
    const newSvc = await this.#fastly.createService(name, service.type, comment);
    if (!newSvc.version) {
      newSvc.version = newSvc.versions[0].number;
    }

    console.log(`\n- New service ID: ${newSvc.id}`);
    console.log(`- New service version: ${newSvc.version}`);

    // enabling products
    console.log('\n- Enabling products');
    for (const product of Object.keys(service.products || {})) {
      if (service.products[product] === true) {
        console.log(`  ${product}`);
        await this.#fastly.enableProduct(newSvc.id, product);
      }
    }

    // upload service config to new service
    await this.#updateServiceVersion(newSvc.id, newSvc.version, service);

    console.log(`\nSuccessfully created service ${newSvc.id}:`);
    console.log(`\n  https://manage.fastly.com/configure/services/${newSvc.id}/versions/${newSvc.version}`);

    return newSvc.id;
  }

  /**
   * Update existing Fastly service with new configuration.
   * Add new version or update an existing version.
   *
   * @param {Object} opts with serviceId, service, version, activate
   * @returns {String} actual version updated
   */
  async updateServiceVersion(opts) {
    const { serviceId, service } = opts;

    let updatedVersion;

    if (opts.version) {
      // update existing service version with config
      await this.#updateServiceVersion(serviceId, opts.version, service);

      console.log(`\nSuccessfully updated version ${opts.version}:`);
      console.log(`\n  https://manage.fastly.com/configure/services/${serviceId}/versions/${opts.version}`);

      updatedVersion = opts.version;
    } else {
      // create fresh new version so we can safely
      // upload any possible changes without conflicts
      console.log(`Creating empty new version for Fastly service ${serviceId}...`);

      const newVersion = await this.#fastly.createVersion(serviceId);
      console.log(`\n- New service version: ${newVersion}`);

      // fill in new servic version with config
      await this.#updateServiceVersion(serviceId, newVersion, service);

      console.log(`\nSuccessfully created new version ${newVersion}:`);
      console.log(`\n  https://manage.fastly.com/configure/services/${serviceId}/versions/${newVersion}`);

      updatedVersion = newVersion;
    }

    if (opts.activate) {
      console.log(`\nActivating version ${updatedVersion}...`);

      await this.#fastly.activateVersion(serviceId, updatedVersion);

      console.log(`\nSuccessfully activated version ${updatedVersion}`);
    }
  }

  /**
   * Get the next version number for a Fastly service.
   * @param {String} serviceId service to get the next version for
   * @returns next version number
   */
  async getNextVersion(serviceId) {
    return (await this.#fastly.latestVersion(serviceId)) + 1;
  }

  /**
   * Upload service configuration to a Fastly service at a given version
   *
   * @param {string} serviceId Fastly service id
   * @param {number} version Fastly service version
   * @param {FastlyService} service Fastly service configuration
   */
  async #updateServiceVersion(serviceId, version, service) {
    const fastly = this.#fastly;

    console.log();
    console.log(`Updating Fastly service ${serviceId} at version ${version}...`);

    service.service_id = serviceId;

    if (service.comment) {
      console.log(`- Setting version comment: ${service.comment}`);
      await fastly.updateVersion(serviceId, version, {
        comment: service.comment,
      });
    }

    // add domains
    console.log('- Setting domains');
    for (const { name, comment } of service.domains) {
      console.log(`  ${name}`);
      await fastly.addDomain(serviceId, version, name, comment);
    }

    // create conditions
    console.log('- Setting conditions');
    for (const condition of service.conditions) {
      console.log(`  ${condition.name}`);
      await fastly.createCondition(serviceId, version, condition);
    }

    // create headers
    console.log('- Setting headers');
    for (const header of service.headers) {
      console.log(`  ${header.name}`);
      await fastly.createHeader(serviceId, version, header);
    }

    // create backends
    console.log('- Setting backends');
    for (const backend of service.backends) {
      console.log(`  ${backend.name}: ${backend.address}`);
      await fastly.createBackend(serviceId, version, backend);
    }

    // create and populate ACLs
    console.log('- Setting ACLs');
    for (const { name, entries } of service.acls) {
      console.log(`  ${name}`);
      await fastly.updateAcl(serviceId, version, name, entries);
    }

    // create and populate dictionaries
    console.log('- Setting dictionaries');
    for (const { name, items, write_only } of service.dictionaries) {
      console.log(`  ${name}`);
      const entries = items.reduce((target, { item_key, item_value }) => {
        // eslint-disable-next-line no-param-reassign
        target[item_key] = item_value;
        return target;
      }, {});
      await fastly.updateDict(serviceId, version, name, entries, write_only);
    }

    // create snippets
    console.log('- Setting VCL snippets');
    for (const snippet of service.snippets) {
      console.log(`  ${snippet.name}`);
      await fastly.createSnippet(serviceId, version, snippet);
    }

    // create vcls
    console.log('- Setting VCL files');
    for (const vcl of service.vcls) {
      console.log(`  ${vcl.name}`);
      await fastly.createVcl(serviceId, version, vcl.name, vcl.content, vcl.main);
    }

    // update request settings
    console.log('- Setting request settings');
    for (const rs of service.request_settings) {
      console.log(`  ${rs.name}`);
      await fastly.addRequestSetting(serviceId, version, rs);
    }

    // update general settings
    console.log('- Setting service settings');
    await fastly.updateSettings(serviceId, version, service.settings);

    // image optimizer settings
    if (service.io_settings?.length > 0) {
      console.log('- Setting image optimizer settings');
      await fastly.updateImageOptimizerSettings(serviceId, version, service.io_settings[0]);
    }

    // loggers
    console.log('- Setting loggers');
    // map from name in service detail response to name in Fastly API
    for (const type of Object.keys(LOG_TYPES)) {
      if (service[type]) {
        const { api } = LOG_TYPES[type];
        for (const logConfig of service[type]) {
          console.log(`  ${api}: ${logConfig.name}`);

          await fastly.addLogEndpoint(serviceId, version, api, logConfig.name, logConfig);
        }
      }
    }

    this.#unsupportedCheck(service);
  }

  /**
   * Warn about unsupported features in the service configuration.
   *
   * @param {FastlyService} service Fastly service configuration
   */
  #unsupportedCheck(service) {
    const unsupported = [];
    for (const key of Object.keys(service)) {
      const value = service[key];
      if ((Array.isArray(value) && value.length > 0) || (typeof value === 'object' && Object.keys(value).length > 0)) {
        if (!SUPPORTED_FEATURES.includes(key)) {
          unsupported.push(key);
        }
      }
    }
    if (unsupported.length > 0) {
      console.warn();
      console.warn('Warning: Unsupported features found:', unsupported.join(', '));
      console.warn('         These are not fully handled by fastly-dev.');
      console.warn();
    }
  }
}
