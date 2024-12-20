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

import fs from 'node:fs';
import path from 'node:path';
import { globSync } from 'glob';
import { Fastly } from './fastly.js';
import { detectSecrets, replaceSecretVars } from './secrets/secrets.js';

export const FILE_SERVICE = 'service.json';
const FILE_ACL = 'acl.json';

const DIR_VCLS = 'vcl';
const DIR_SNIPPETS = 'snippets';
const DIR_DICTIONARIES = 'dictionaries';

const DIVIDER = '# ===========================================================================';
const SUB_INDENT = '  ';

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

// alphabetically sort keys in JSON.stringify()
function jsonStringifySorted(obj, space) {
  return JSON.stringify(
    obj,
    (_key, value) =>
      value?.constructor === Object
        ? Object.keys(value)
            .sort()
            .reduce((sorted, key) => {
              sorted[key] = value[key];
              return sorted;
            }, {})
        : value,
    space,
  );
}

/**
 * Removes empty leading and trailing lines.
 *
 * @param {string} str multi-line string to trim
 * @returns {string} trimmed multiline string
 */
function trimEmptyLines(str) {
  const lines = str.split('\n');

  // remove leading empty lines
  while (lines.length > 0 && lines[0].trim().length === 0) {
    lines.shift();
  }
  // remove trailing empty lines
  while (lines.length > 0 && lines[lines.length - 1].trim().length === 0) {
    lines.pop();
  }

  return lines.join('\n');
}

/**
 * Remove a prefix from each line in a multi-line string.
 *
 * @param {string} str multi-line string to trim
 * @param {string} prefix line prefix to remove
 * @returns {string} trimmed multi-line string
 */
function removeLinePrefix(str, prefix) {
  return str
    .split('\n')
    .map((line) => (line.startsWith(prefix) ? line.slice(prefix.length) : line))
    .join('\n');
}

function openFile(file, mode) {
  const handle = fs.openSync(file, mode);

  return {
    write: (text = '') => fs.writeSync(handle, text),
    writeLn: (text = '') => fs.writeSync(handle, `${text}\n`),
    close: () => fs.closeSync(handle),
  };
}

function getSnippetsBySubroutine(snippets) {
  const subs = {};
  for (const snippet of snippets) {
    if (!subs[snippet.type]) {
      subs[snippet.type] = [];
    }
    subs[snippet.type].push(snippet);
  }

  // sort snippets by priority
  for (const type in subs) {
    subs[type].sort((a, b) => a.priority - b.priority);
  }

  return subs;
}

/**
 * Fastly service configuration
 */
export class FastlyService {
  #config;
  #fastly;
  #secretsMode;

  constructor(apiToken, secretsMode) {
    this.#fastly = new Fastly(apiToken);
    this.#secretsMode = secretsMode;
  }

  get service() {
    return this.#config;
  }

  get name() {
    return this.#config?.name;
  }

  get id() {
    return this.#config?.service_id;
  }

  get fastly() {
    return this.#fastly;
  }

  async dispose() {
    await this.#fastly.dispose();
  }

  #unsupportedCheck() {
    const unsupported = [];
    for (const key of Object.keys(this.#config)) {
      const value = this.#config[key];
      if (
        (Array.isArray(value) && value.length > 0) ||
        (typeof value === 'object' && Object.keys(value).length > 0)
      ) {
        if (!SUPPORTED_FEATURES.includes(key)) {
          unsupported.push(key);
        }
      }
    }
    if (unsupported.length > 0) {
      console.warn();
      console.warn('Warning: Unsupported features found:', unsupported.join(', '));
      console.warn('         These features are not re-created by fastly-dev push.');
      console.warn();
    }
  }

  /**
   * Download the active service configuration from Fastly.
   *
   * @param {string} serviceId Fastly service id
   * @param {string} version Fastly service version. Optional, defaults to latest version. Can also use 'active' to fetch active version.
   */
  async download(serviceId, version) {
    if (this.#config) {
      throw new Error('Service already loaded.');
    }

    console.log(
      `Fetching service ${serviceId} at ${version === undefined ? 'latest version' : version === 'active' ? 'active version' : `version ${version}`}...`,
    );

    const fastly = this.#fastly;

    try {
      const details = await fastly.serviceDetails(
        serviceId,
        version === 'active' ? undefined : version,
      );
      const config = { ...(version === 'active' ? details.active_version : details.version) };
      this.#config = config;
      config.version = config.number;
      config.name = details.name;
      config.type = details.type;

      if (config.type !== 'vcl') {
        console.warn(
          `Warning: Service type is ${config.type}. This tool is only tested with 'vcl' services.`,
        );
      }

      console.log(
        `- Version ${config.version} (active ${details.active_version?.number}, latest ${details.versions.at(-1).number})`,
      );

      // load acl entries
      console.log('- Loading ACLs...');
      for (const acl of config.acls) {
        const { id } = acl;
        acl.entries = await fastly.aclEntries(serviceId, id);
      }

      // load dictionary items
      console.log('- Loading dictionaries...');
      for (const dict of config.dictionaries) {
        const { id, write_only } = dict;
        if (write_only) {
          dict.info = await fastly.dictionaryInfo(serviceId, config.version, id);
          dict.items = [];
        } else {
          dict.items = await fastly.dictionaryItems(serviceId, id);
        }
      }

      // load products
      config.products = await fastly.enabledProducts(serviceId);

      // remove noisy and undesired fields
      for (const key in config) {
        if (['comment', 'number', 'deployed', 'staging', 'testing', 'deleted_at'].includes(key)) {
          delete config[key];
        }
      }

      this.#unsupportedCheck();
    } finally {
      await fastly.dispose();
    }
  }

  /**
   * Create a blank new Fastly service remotely.
   * Does not upload any configuration, but enables the necessary products
   * defined in the current config.products.
   *
   * @param {string} name Fastly service name
   * @param {string} comment Fastly service comment
   * @returns {object} with new service id ('id') and version ('version')
   */
  async create(name, comment) {
    const config = this.#config;
    const fastly = this.#fastly;

    console.log();
    console.log(`Creating new service: '${name}'`);
    const service = await fastly.createService(name, config.type, comment);
    if (!service.version) {
      service.version = service.versions[0].number;
    }

    console.log(`- New Service ID: ${service.id}`);
    console.log(`- New Service version: ${service.version}`);

    // enabling products
    console.log('- Enabling products');
    for (const product of Object.keys(config.products || {})) {
      if (config.products[product] === true) {
        console.log(`  ${product}`);
        await fastly.enableProduct(service.id, product);
      }
    }

    return {
      id: service.id,
      version: service.version,
    };
  }

  /**
   * Create a new version of the Fastly service remotely.
   * Does not upload any configuration.
   *
   * @param {string} serviceId Fastly service id
   * @returns {number} newly created version number
   */
  async newVersion(serviceId) {
    console.log(`Creating empty new version for Fastly service ${serviceId}...`);

    // create fresh new version so we can safely
    // upload any possible changes without conflicts
    return await this.#fastly.createVersion(serviceId);
  }

  /**
   * Upload service configuration to a Fastly service at a given version
   *
   * @param {string} serviceId Fastly service id
   * @param {number} version Fastly service version
   */
  async upload(serviceId, version) {
    if (!(serviceId && version)) {
      throw new Error('Missing required arguments in FastlyService.upload().');
    }
    if (!this.#config) {
      throw new Error('No service configuration loaded using read().');
    }

    const fastly = this.#fastly;
    const config = this.#config;

    console.log();
    console.log(`Updating Fastly service ${serviceId} at version ${version}...`);

    config.service_id = serviceId;

    if (config.comment) {
      console.log(`- Setting version comment: ${config.comment}`);
      fastly.updateVersion(serviceId, version, {
        comment: config.comment,
      });
    }

    // add domains
    console.log('- Setting domains');
    for (const { name, comment } of config.domains) {
      console.log(`  ${name}`);
      await fastly.addDomain(serviceId, version, name, comment);
    }

    // create conditions
    console.log('- Setting conditions');
    for (const condition of config.conditions) {
      console.log(`  ${condition.name}`);
      await fastly.createCondition(serviceId, version, condition);
    }

    // create headers
    console.log('- Setting headers');
    for (const header of config.headers) {
      console.log(`  ${header.name}`);
      await fastly.createHeader(serviceId, version, header);
    }

    // create backends
    console.log('- Setting backends');
    for (const backend of config.backends) {
      console.log(`  ${backend.name}: ${backend.address}`);
      await fastly.createBackend(serviceId, version, backend);
    }

    // create and populate ACLs
    console.log('- Setting ACLs');
    for (const { name, entries } of config.acls) {
      console.log(`  ${name}`);
      await fastly.updateACL(serviceId, version, name, entries);
    }

    // create and populate dictionaries
    console.log('- Setting dictionaries');
    for (const { name, items, write_only } of config.dictionaries) {
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
    for (const snippet of config.snippets) {
      console.log(`  ${snippet.name}`);
      await fastly.createSnippet(serviceId, version, snippet);
    }

    // create vcls
    console.log('- Setting VCL files');
    for (const vcl of config.vcls) {
      console.log(`  ${vcl.name}`);
      await fastly.createVCL(serviceId, version, vcl.name, vcl.content, vcl.main);
    }

    // update request settings
    console.log('- Setting request settings');
    for (const rs of config.request_settings) {
      console.log(`  ${rs.name}`);
      await fastly.addRequestSetting(serviceId, version, rs);
    }

    // update general settings
    console.log('- Setting service settings');
    await fastly.updateSettings(serviceId, version, config.settings);

    // image optimizer settings
    if (config.io_settings?.length > 0) {
      console.log('- Setting image optimizer settings');
      await fastly.updateImageOptimizerSettings(serviceId, version, config.io_settings[0]);
    }

    // loggers
    console.log('- Setting loggers');
    // map from name in service detail response to name in Fastly API
    for (const type of Object.keys(LOG_TYPES)) {
      if (config[type]) {
        const { api } = LOG_TYPES[type];
        for (const logConfig of config[type]) {
          console.log(`  ${api}: ${logConfig.name}`);

          await fastly.addLogEndpoint(serviceId, version, api, logConfig.name, logConfig);
        }
      }
    }

    this.#unsupportedCheck();

    console.log();
    console.log(
      `Successfully updated service v${version}: https://manage.fastly.com/configure/services/${serviceId}`,
    );
  }

  #writeAcls() {
    const { acls } = this.#config;

    if (Array.isArray(acls) && acls.length > 0) {
      fs.writeFileSync(FILE_ACL, jsonStringifySorted(acls, 2));
      console.log(`- ACLs ${FILE_ACL}`);
    } else if (fs.existsSync(FILE_ACL)) {
      fs.unlinkSync(FILE_ACL);
    }
    this.#config.acls = undefined;
  }

  #readAcls() {
    if (fs.existsSync(FILE_ACL)) {
      console.log(`- ACLs ${FILE_ACL}`);
      this.#config.acls = JSON.parse(fs.readFileSync(FILE_ACL));
    } else {
      this.#config.acls = [];
    }
  }

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: deemed ok
  #writeSnippets() {
    const { snippets, backends, dictionaries } = this.#config;

    // first reset: delete all existing snippet vcl files
    for (const file of globSync(path.join(DIR_SNIPPETS, '*.vcl'))) {
      fs.unlinkSync(file);
    }

    if (Array.isArray(snippets) && snippets.length > 0) {
      fs.mkdirSync(DIR_SNIPPETS, { recursive: true });

      const subs = getSnippetsBySubroutine(snippets);

      // we always need init.vcl for the context
      if (!subs.init) {
        subs.init = [];
      }

      for (const type in subs) {
        const snippetPath = path.join(DIR_SNIPPETS, `${type}.vcl`);
        const file = openFile(snippetPath, 'w');

        const needsSub = !['init', 'none'].includes(type);
        const indent = needsSub ? SUB_INDENT : '';

        // adding context for Fastly VS Code extension or other tools
        // - backends
        // - tables
        // - sub
        if (type === 'init') {
          file.writeLn('# Context for IDEs. Automatically generated.');
          for (const backend of backends) {
            file.writeLn(`backend F_${backend.name} {}`);
          }
          for (const dict of dictionaries) {
            file.writeLn(`table ${dict.name} {}`);
          }
        }

        if (needsSub) {
          file.writeLn('include "init.vcl";');
          file.writeLn();
          file.writeLn(`sub vcl_${type} {`);
          file.writeLn(`  #FASTLY ${type}`);
        }

        for (const snippet of subs[type]) {
          file.writeLn();
          file.writeLn(`${indent}${DIVIDER}`);
          for (const key of ['name', 'priority']) {
            file.writeLn(`${indent}# ${key}: ${snippet[key]}`);
          }
          file.writeLn(`${indent}${DIVIDER}`);
          file.writeLn();
          snippet.content = trimEmptyLines(snippet.content);
          for (let line of snippet.content.split('\n')) {
            line = line.trimEnd();
            if (line.length === 0) {
              file.writeLn();
            } else {
              file.writeLn(`${indent}${line}`);
            }
          }
        }

        file.writeLn();
        file.writeLn(`${indent}${DIVIDER}`);
        if (needsSub) {
          file.writeLn('}');
        }

        file.close();

        console.log(`- Snippet ${snippetPath}`);
      }

      this.#config.snippets = undefined;
    }
  }

  #readSnippets() {
    this.#config.snippets = [];

    for (const snippetPath of globSync(path.join(DIR_SNIPPETS, '*.vcl'))) {
      console.log(`- Snippet file ${snippetPath}`);

      const type = path.basename(snippetPath, '.vcl');

      const content = fs.readFileSync(snippetPath).toString();
      const blocks = content.split(DIVIDER);

      for (let i = 1; i < blocks.length - 1; i += 2) {
        const header = blocks[i];
        const content = blocks[i + 1];

        const snippet = {
          type,
          dynamic: '0',
        };

        // parse header - example:
        // # name: fetch 100 - handle S3 response
        // # priority: 100
        // # id: pprQ1f281DHOyTpK1OU7g7
        for (const line of header.split('\n')) {
          const m = line.match(/# ([^:]+): (.+)/);
          if (m) {
            const key = m[1];
            const value = m[2];
            snippet[key] = value;
          }
        }

        snippet.content = trimEmptyLines(content);
        const needsSub = !['init', 'none'].includes(type);
        if (needsSub) {
          snippet.content = removeLinePrefix(snippet.content, SUB_INDENT);
        }

        this.#config.snippets.push(snippet);
      }
    }
  }

  #writeVcls() {
    const { vcls } = this.#config;

    // reset: delete all existing vcl files
    for (const file of globSync(path.join(DIR_VCLS, '*.vcl'))) {
      fs.unlinkSync(file);
    }

    if (Array.isArray(vcls) && vcls.length > 0) {
      fs.mkdirSync(DIR_VCLS, { recursive: true });

      for (const vcl of vcls) {
        if (!vcl.name.endsWith('.vcl')) {
          console.warn(`Warning: VCL ${vcl.name} does not end with .vcl`);
        }

        const vclPath = path.join(DIR_VCLS, `${vcl.name}`);

        const file = openFile(vclPath, 'w');
        file.writeLn(`# main: ${vcl.main}`);
        file.writeLn();
        file.write(trimEmptyLines(vcl.content));
        file.close();

        console.log(`- VCL ${vclPath}`);
      }

      this.#config.vcls = undefined;
    }
  }

  #readVcls() {
    this.#config.vcls = [];

    for (const vclPath of globSync(path.join(DIR_VCLS, '*.vcl'))) {
      console.log(`- VCL ${vclPath}`);

      const vcl = {
        name: path.basename(vclPath),
        content: '',
        main: false,
      };

      const content = fs.readFileSync(vclPath).toString();

      let mainFound = false;

      for (const line of content.split('\n')) {
        if (mainFound) {
          vcl.content += `${line}\n`;
        } else {
          const m = line.match(/^\s*# main: (.*)/);
          if (m) {
            mainFound = true;
            vcl.main = m[1] === 'true';
          }
        }
      }
      vcl.content = trimEmptyLines(vcl.content);

      this.#config.vcls.push(vcl);
    }
  }

  #writeDictionaries() {
    const { dictionaries } = this.#config;

    // reset: delete all existing ini files
    for (const file of globSync(path.join(DIR_DICTIONARIES, '*.ini'))) {
      fs.unlinkSync(file);
    }

    if (!Array.isArray(dictionaries) || dictionaries.length === 0) {
      return;
    }

    fs.mkdirSync(DIR_DICTIONARIES, { recursive: true });

    for (const dict of dictionaries) {
      const dictPath = path.join(DIR_DICTIONARIES, `${dict.name}.ini`);
      const { write_only } = dict;

      const file = openFile(dictPath, 'w');
      if (write_only) {
        file.writeLn('# write_only: true');
        if (dict.info.last_updated) {
          file.writeLn(`# last_updated: ${dict.info.last_updated}`);
        }
        file.writeLn(`# item_count: ${dict.info.item_count}`);
        // TODO: how to handle file with env vars from being overwritten?
        //       see below in #readDictionary()
        //       - read local ini file
        //       - compare count, warn if different (show last_updated)
        //       - do not overwrite local file to keep env vars
      }
      file.writeLn();
      // write items sorted by key (for stable roundtripping)
      for (const item of dict.items.sort((a, b) => `${a.item_key}`.localeCompare(b.item_key))) {
        file.writeLn(`${item.item_key}="${item.item_value}"`);
      }
      file.close();

      console.log(`- Dictionary ${dictPath}${write_only ? ' (write-only)' : ''}`);
    }

    this.#config.dictionaries = undefined;
  }

  #readDictionary(dictPath) {
    const dict = {
      name: path.basename(dictPath, '.ini'),
      write_only: false,
      items: [],
    };

    const content = fs.readFileSync(dictPath).toString();

    for (const line of content.split('\n')) {
      if (line.startsWith('# write_only: true')) {
        dict.write_only = true;
      } else if (!line.startsWith('#')) {
        const keyValueMatch = line.match(/([^=]+)="(.*)"/);
        if (keyValueMatch) {
          dict.items.push({
            item_key: keyValueMatch[1],
            item_value: keyValueMatch[2],
          });
          // } else {
          //   // TODO: env vars in write-only dictionary ini files
          //   const keyVarMatch = line.match(/([^=]+)=\$\{\{(.*)\}\}/);
          //   if (keyVarMatch) {
          //     dict.items.push({
          //       item_key: keyVarMatch[1],
          //       item_value: process.env[keyVarMatch[2]] || '',
          //     });
          //   }
        }
      }
    }

    return dict;
  }

  #readDictionaries() {
    this.#config.dictionaries = [];
    const { dictionaries } = this.#config;

    for (const dictPath of globSync(path.join(DIR_DICTIONARIES, '*.ini'))) {
      const dict = this.#readDictionary(dictPath);

      console.log(`- Dictionary ${dictPath} ${dict.write_only ? '(write-only)' : ''}`);
      dictionaries.push(dict);
    }
  }

  /**
   * Write service configuration to current working directory
   */
  write() {
    detectSecrets(this.#config, this.#secretsMode);

    console.log();
    console.log('Writing configuration to local folder:');

    this.#writeAcls();
    this.#writeSnippets();
    this.#writeVcls();
    this.#writeDictionaries();

    // main service config
    fs.writeFileSync(FILE_SERVICE, jsonStringifySorted(this.#config, 2));
    console.log(`- Config ${FILE_SERVICE}`);

    console.log();
    console.log(`Successfully written ${this.#config.service_id} v${this.#config.version}.`);
  }

  /**
   * Read service configuration from current working directory
   */
  read() {
    if (this.#config) {
      throw new Error('Service already loaded.');
    }

    console.log('Reading config...');
    this.#config = JSON.parse(fs.readFileSync(FILE_SERVICE));
    this.#readAcls();
    this.#readSnippets();
    this.#readVcls();
    this.#readDictionaries();

    this.#config = replaceSecretVars(this.#config);
  }
}
