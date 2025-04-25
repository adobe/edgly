/*
 * Copyright 2025 Adobe. All rights reserved.
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
   * @param {string} id Fastly service id
   * @param {string} version Fastly service version. Optional, defaults to latest version. Can also use 'active' to fetch active version.
   */
  async getService(id, version) {
    const versionType =
      version === undefined ? 'latest version' : version === 'active' ? 'active version' : `version ${version}`;
    console.debug(`Fetching service ${id} at ${versionType}...`);

    const fastly = this.#fastly;

    const details = await fastly.serviceDetails(id, version === 'active' ? undefined : version);
    const service = { ...(version === 'active' ? details.active_version : details.version) };
    service.version = service.number;
    service.name = details.name;
    service.type = details.type;

    if (service.type !== 'vcl') {
      console.warn(`\nWarning: Service type is ${service.type}. This tool is only tested with 'vcl' services.`);
    }

    const activeVersion = details.active_version?.number || 'n/a';
    const latestVersion = details.versions.at(-1).number;

    console.log(`Version: ${service.version} (active ${activeVersion}, latest ${latestVersion})`);

    // load acl entries
    console.debug('- Fetching ACLs...');
    for (const acl of service.acls) {
      const { id: aclId } = acl;
      acl.entries = await fastly.aclEntries(id, aclId);
    }

    // load dictionary items
    console.debug('- Fetching dictionaries...');
    for (const dict of service.dictionaries) {
      const { id: dictId, write_only } = dict;
      dict.info = await fastly.dictionaryInfo(id, service.version, dictId);
      if (write_only) {
        dict.items = [];
      } else {
        dict.items = await fastly.dictionaryItems(id, dictId);
      }
    }

    // load products
    service.products = await fastly.enabledProducts(id);

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

    console.debug(`\nCreating new service: '${name}'`);
    const newSvc = await this.#fastly.createService(name, service.type, comment);
    if (!newSvc.version) {
      newSvc.version = newSvc.versions[0].number;
    }

    console.log(`Service ID: ${newSvc.id}`);
    console.log(`Version: ${newSvc.version}`);

    // enabling products
    console.debug('\nEnabling products:');
    for (const product of Object.keys(service.products || {})) {
      if (service.products[product] === true) {
        console.debug(`- ${product}`);
        await this.#fastly.enableProduct(newSvc.id, product);
      }
    }

    // upload service config to new service
    await this.#updateServiceVersion(newSvc.id, newSvc.version, service);

    console.debug(`\nSuccessfully created service ${newSvc.id}:`);
    console.log(`https://manage.fastly.com/configure/services/${newSvc.id}/versions/${newSvc.version}`);

    return newSvc.id;
  }

  /**
   * Update existing Fastly service with new configuration.
   * Add new version or update an existing version.
   *
   * @param {Object} opts with id, service, version, activate
   * @returns {String} actual version updated
   */
  async updateServiceVersion(opts) {
    const { id, service } = opts;

    let updatedVersion;

    if (opts.version) {
      // update existing service version with config
      await this.#updateServiceVersion(id, opts.version, service);

      console.debug(`\nSuccessfully updated version ${opts.version}:`);

      updatedVersion = opts.version;
    } else {
      // create fresh new version so we can safely
      // upload any possible changes without conflicts
      console.debug(`Creating empty new version for Fastly service ${id}...`);

      const newVersion = await this.#fastly.createVersion(id);
      console.debug(`\n- New service version: ${newVersion}`);

      // fill in new servic version with config
      await this.#updateServiceVersion(id, newVersion, service);

      console.debug(`\nSuccessfully created new version ${newVersion}:`);

      updatedVersion = newVersion;
    }

    if (opts.activate) {
      console.debug(`\nActivating version ${updatedVersion}...`);

      await this.#fastly.activateVersion(id, updatedVersion);

      console.debug(`\nSuccessfully activated version ${updatedVersion}`);
    }

    console.log(`https://manage.fastly.com/configure/services/${id}/versions/${updatedVersion}`);
  }

  /**
   * Get the next version number for a Fastly service.
   * @param {String} id service id to get the next version for
   * @returns next version number
   */
  async getNextVersion(id) {
    return (await this.#fastly.latestVersion(id)) + 1;
  }

  /**
   * Upload service configuration to a Fastly service at a given version
   *
   * @param {string} id Fastly service id
   * @param {number} version Fastly service version
   * @param {FastlyService} service Fastly service configuration
   */
  async #updateServiceVersion(id, version, service) {
    const fastly = this.#fastly;

    console.debug();
    console.debug(`Updating Fastly service ${id} at version ${version}...`);

    service.service_id = id;

    if (service.comment) {
      console.debug(`- Setting version comment: ${service.comment}`);
      await fastly.updateVersion(id, version, {
        comment: service.comment,
      });
    }

    // add domains
    console.debug('- Setting domains');
    for (const { name, comment } of service.domains) {
      console.debug(`  ${name}`);
      await fastly.addDomain(id, version, name, comment);
    }

    // create conditions
    console.debug('- Setting conditions');
    for (const condition of service.conditions) {
      console.debug(`  ${condition.name}`);
      await fastly.createCondition(id, version, condition);
    }

    // create headers
    console.debug('- Setting headers');
    for (const header of service.headers) {
      console.debug(`  ${header.name}`);
      await fastly.createHeader(id, version, header);
    }

    // create backends
    console.debug('- Setting backends');
    for (const backend of service.backends) {
      console.debug(`  ${backend.name}: ${backend.address}`);
      await fastly.createBackend(id, version, backend);
    }

    // create and populate ACLs
    console.debug('- Setting ACLs');
    for (const { name, entries } of service.acls) {
      console.debug(`  ${name}`);
      await fastly.updateAcl(id, version, name, entries);
    }

    // create and populate dictionaries
    console.debug('- Setting dictionaries');
    for (const { name, items, write_only } of service.dictionaries) {
      console.debug(`  ${name}`);
      const entries = items.reduce((target, { item_key, item_value }) => {
        // eslint-disable-next-line no-param-reassign
        target[item_key] = item_value;
        return target;
      }, {});
      await fastly.updateDict(id, version, name, entries, write_only);
    }

    // create snippets
    console.debug('- Setting VCL snippets');
    for (const snippet of service.snippets) {
      console.debug(`  ${snippet.name}`);
      await fastly.createSnippet(id, version, snippet);
    }

    // create vcls
    console.debug('- Setting VCL files');
    for (const vcl of service.vcls) {
      console.debug(`  ${vcl.name}`);
      await fastly.createVcl(id, version, vcl.name, vcl.content, vcl.main);
    }

    // update request settings
    console.debug('- Setting request settings');
    for (const rs of service.request_settings) {
      console.debug(`  ${rs.name}`);
      await fastly.addRequestSetting(id, version, rs);
    }

    // update general settings
    console.debug('- Setting service settings');
    await fastly.updateSettings(id, version, service.settings);

    // image optimizer settings
    if (service.io_settings?.length > 0) {
      console.debug('- Setting image optimizer settings');
      await fastly.updateImageOptimizerSettings(id, version, service.io_settings[0]);
    }

    // loggers
    console.debug('- Setting loggers');
    // map from name in service detail response to name in Fastly API
    for (const type of Object.keys(LOG_TYPES)) {
      if (service[type]) {
        const { api } = LOG_TYPES[type];
        for (const logConfig of service[type]) {
          console.debug(`  ${api}: ${logConfig.name}`);

          await fastly.addLogEndpoint(id, version, api, logConfig.name, logConfig);
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
      console.warn('\nWarning: Unsupported features found:', unsupported.join(', '));
      console.warn('         These are not fully handled by edgly.');
    }
  }
}
