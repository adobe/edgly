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

import fs from 'node:fs';
import path from 'node:path';
import { globSync } from 'glob';
import yaml from 'yaml';
import { asMap, openFile, removeLinePrefix, sortAlpha, toSortedJson, trimEmptyLines } from '../util.js';
import { FastlyService } from './service.js';

const FILE_SERVICE = 'service.json';
const FILE_ACL = 'acl.json';
const FILE_DOMAINS = 'domains.yaml';
const DIR_VCLS = 'vcl';
const DIR_SNIPPETS = 'snippets';
const DIR_DICTIONARIES = 'dictionaries';
const PRIVATE_DICT_PREFIX = 'private.';

const SUB_INDENT = '  ';
const DIVIDER = '# ===================================================================';

/**
 * Initializes a sub folder. Removes all files and ensures the folder exists.
 *
 * @param {String} dir path to the directory
 * @param {String} pattern file glob pattern
 * @param {Array} array array of objects to check for length
 * @returns {Boolean} true if objects are in array, false if not and nothing has to be written
 */
function initFolder(dir, pattern, array) {
  // delete all matching existing files in the folder
  for (const file of globSync(path.join(dir, pattern))) {
    fs.unlinkSync(file);
  }

  // if no new objects are present, we are done
  if (!Array.isArray(array) || array.length === 0) {
    return false;
  }

  // ensure the folder is present
  fs.mkdirSync(dir, { recursive: true });

  return true;
}

function writeAcls(acls) {
  if (Array.isArray(acls) && acls.length > 0) {
    fs.writeFileSync(FILE_ACL, toSortedJson(acls));
    console.debug(`- ACLs ${FILE_ACL}`);
  } else if (fs.existsSync(FILE_ACL)) {
    fs.unlinkSync(FILE_ACL);
  }
}

function readAcls(service) {
  if (fs.existsSync(FILE_ACL)) {
    console.debug(`- ACLs ${FILE_ACL}`);
    service.acls = JSON.parse(fs.readFileSync(FILE_ACL));
  } else {
    service.acls = [];
  }
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: prefer in one function for consistency
function writeSnippets(service) {
  const { snippets, backends, dictionaries } = service;

  if (!initFolder(DIR_SNIPPETS, '*.vcl', snippets)) {
    return;
  }

  const subs = service.snippetsBySubroutine();

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
      file.writeLn(`${indent}# name: ${snippet.name}`);
      file.writeLn(`${indent}# prio: ${snippet.priority}`);
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

    console.debug(`- Snippet ${snippetPath}`);
  }
}

function readSnippets(service) {
  service.snippets = [];

  for (const snippetPath of globSync(path.join(DIR_SNIPPETS, '*.vcl'))) {
    console.debug(`- Snippet file ${snippetPath}`);

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
          const key = m[1] === 'prio' ? 'priority' : m[1];
          const value = m[2];
          snippet[key] = value;
        }
      }

      snippet.content = trimEmptyLines(content);
      const needsSub = !['init', 'none'].includes(type);
      if (needsSub) {
        snippet.content = removeLinePrefix(snippet.content, SUB_INDENT);
      }

      service.snippets.push(snippet);
    }
  }
}

function writeVcls(vcls) {
  if (!initFolder(DIR_VCLS, '*.vcl', vcls)) {
    return;
  }

  for (const vcl of vcls) {
    if (!vcl.name.endsWith('.vcl')) {
      console.warn(`\nWarning: VCL ${vcl.name} does not end with .vcl`);
    }

    const vclPath = path.join(DIR_VCLS, `${vcl.name}`);

    const file = openFile(vclPath, 'w');
    file.writeLn(`# main: ${vcl.main}`);
    file.writeLn();
    file.write(trimEmptyLines(vcl.content));
    file.close();

    console.debug(`- VCL ${vclPath}`);
  }
}

function readVcls(service) {
  service.vcls = [];

  for (const vclPath of globSync(path.join(DIR_VCLS, '*.vcl'))) {
    console.debug(`- VCL ${vclPath}`);

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

    service.vcls.push(vcl);
  }
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: ok
function writeDictionaries(dictionaries) {
  const currentFiles = asMap(globSync(path.join(DIR_DICTIONARIES, '*.ini')), (f) => [f, {}]);

  if (dictionaries?.length > 0) {
    // ensure the folder is present
    fs.mkdirSync(DIR_DICTIONARIES, { recursive: true });
  }

  for (const dict of dictionaries) {
    const { write_only } = dict;
    const filename = write_only ? `${PRIVATE_DICT_PREFIX}${dict.name}.ini` : `${dict.name}.ini`;
    const dictPath = path.join(DIR_DICTIONARIES, filename);

    const isNew = !currentFiles[dictPath];

    // mark as handled (overwritten)
    delete currentFiles[dictPath];

    // private dictionaries
    if (write_only) {
      const storedDict = fs.existsSync(dictPath) ? readDictionary(dictPath) : null;

      // if exists locally & has custom items, don't overwrite
      if (storedDict?.items.length > 0) {
        console.debug(`- Dictionary ${dictPath} (private, NOT OVERWRITTEN)`);
        // TODO: compare dictionary digest to detect any changes.
        //       need to write digest locally on every 'service update' to keep track of it
        if (dict.info && storedDict.items.length !== dict.info.item_count) {
          console.warn(`\nWarning: Private dictionary '${dict.name}' seems to be modified on Fastly side,`);
          console.warn(
            `         found different number of entries: Local ${storedDict.items.length} vs. Fastly ${dict.info.item_count}.`,
          );
          console.warn('         However, the new/changed entries cannot be read back from Fastly.');
          if (dict.info?.last_updated) {
            console.warn(`         Last updated in Fastly: ${dict.info.last_updated}`);
          }
        }
        continue;
      }
      console.debug(`- Dictionary ${dictPath} (private)`);
    } else {
      console.debug(`- Dictionary ${dictPath}`);
    }

    const file = openFile(dictPath, 'w');
    if (write_only) {
      // private dicts get special handling because we can't read their items from Fastly
      file.writeLn(`# Private (write-only) dictionary '${dict.name}'`);
      if (dict.info?.last_updated) {
        file.writeLn(`# last_updated: ${dict.info.last_updated}`);
      }
      if (dict.info?.item_count) {
        file.writeLn(`# item_count: ${dict.info.item_count}`);
      }
      if (dict.info?.digest) {
        file.writeLn(`# digest: ${dict.info.digest}`);
      }
      file.writeLn();
      file.writeLn('# WHY IS THIS EMPTY?');
      file.writeLn('# This dictionary is write-only. Entries cannot be read back from Fastly.');
      file.writeLn('# Instead add the entries manually using environment variable replacement:');
      file.writeLn('#   KEY="${{ENV_VAR}}"');
      file.writeLn('# And ensure the variables are safely provided as secrets in your CI.');
      file.writeLn('# This will overwrite the Fastly dictionary with these entries on the');
      file.writeLn("# next deployment using e.g. 'fastly service update'.");

      if (isNew) {
        console.warn(`\nWarning: Private dictionary '${dict.name}' has ${dict.info?.item_count} unknown entries.`);
        console.warn('  Private entries cannot be read from Fastly. Please manually identify and add');
        console.warn('  the entries in the file using environment variable replacement: KEY="${{VAR}}"');
      }
    }

    // write items sorted by key (for stable roundtripping)
    for (const item of sortAlpha(dict.items, (a) => a.item_key)) {
      file.writeLn(`${item.item_key}="${item.item_value}"`);
    }
    file.close();
  }

  // remove any remaining dictionary files that no longer exist in Fastly
  for (const dictPath in currentFiles) {
    fs.unlinkSync(dictPath);
  }
}

function readDictionary(dictPath) {
  // biome-ignore lint/style/useNamingConvention: fastly json naming
  let write_only = false;
  let filename = path.basename(dictPath, '.ini');
  if (filename.startsWith(PRIVATE_DICT_PREFIX)) {
    write_only = true;
    filename = filename.slice(PRIVATE_DICT_PREFIX.length);
  }
  const dict = {
    name: filename,
    write_only,
    items: [],
    info: {},
  };

  const content = fs.readFileSync(dictPath).toString();

  for (const line of content.split('\n')) {
    const digestMatch = line.match(/# digest: (\S+)/);
    if (digestMatch) {
      dict.info.digest = digestMatch[1];
    } else if (!line.startsWith('#')) {
      const keyValueMatch = line.match(/([^=]+)="(.*)"/);
      if (keyValueMatch) {
        dict.items.push({
          // biome-ignore lint/style/useNamingConvention: fastly json naming
          item_key: keyValueMatch[1],
          // biome-ignore lint/style/useNamingConvention: fastly json naming
          item_value: keyValueMatch[2],
        });
      }
    }
  }

  dict.info.item_count = dict.items.length;

  return dict;
}

function readDictionaries(service) {
  service.dictionaries = [];

  for (const dictPath of sortAlpha(globSync(path.join(DIR_DICTIONARIES, '*.ini')))) {
    const dict = readDictionary(dictPath);

    console.debug(`- Dictionary ${dictPath} ${dict.write_only ? '(write-only)' : ''}`);
    service.dictionaries.push(dict);
  }
}

// legacy case: previously non-production domains were stored in edgly.yaml
// this migrates them to domains.yaml. only called if service env is 'production'
function migrateDomainsFromEdglyYaml(domainsYaml) {
  const envs = global.config.env;
  const domains = {};
  for (const env in envs) {
    if (env === 'production') {
      continue;
    }
    if (envs[env].domains) {
      // get values of domains object
      domains[env] = Object.values(envs[env].domains);
    }
  }
  if (Object.keys(domains).length > 0) {
    console.warn(`\nFound domains in edgly.yaml. Automatically migrating them to ${FILE_DOMAINS}.`);

    // put domains in domains.yaml
    for (const env in domains) {
      domainsYaml.setIn([env], domains[env]);
    }

    // remove domains from edgly.yaml
    for (const env in domains) {
      global.config.delete(`env.${env}.domains`);
    }
    global.config.write();
  }
}

// legacy case: previously non-production domains were stored in edgly.yaml
function readDomainsFromEdglyYaml(service, env) {
  if (env !== 'production') {
    console.warn(`Found domains in edgly.yaml. 'edgly service get' (production) will migrate them to ${FILE_DOMAINS}.`);

    const domainMap = global.config.env?.[env]?.domains;

    const unmappedDomains = [];

    for (const domain of service.domains) {
      const newDomain = domainMap?.[domain.name];
      if (newDomain && newDomain !== domain.name) {
        console.debug(`- ${domain.name} -> ${newDomain}`);
        domain.name = newDomain;
      } else {
        unmappedDomains.push(domain.name);
      }
    }

    if (unmappedDomains.length > 0) {
      console.error(`\nError: The following domains are not mapped in env.${env}.domains in configuration:\n`);
      for (const domain of unmappedDomains) {
        console.error(`       ${domain}`);
      }
      process.exit(1);
    }
  }
}

function writeDomains(domains, env) {
  const doc = fs.existsSync(FILE_DOMAINS)
    ? yaml.parseDocument(fs.readFileSync(FILE_DOMAINS, 'utf8'))
    : new yaml.Document({});

  const domainList = [];
  for (const domain of domains) {
    if (domain.comment && domain.comment.length > 0) {
      // child object if comment is present
      domainList.push({
        name: domain.name,
        comment: domain.comment,
      });
    } else {
      // shorter string only if no comment
      domainList.push(domain.name);
    }
  }
  doc.setIn([env], domainList);

  if (env === 'production') {
    migrateDomainsFromEdglyYaml(doc);
  }

  fs.writeFileSync(FILE_DOMAINS, doc.toString());
  console.debug(`- Domains ${FILE_DOMAINS}`);
}

function readDomains(service, env) {
  if (fs.existsSync(FILE_DOMAINS)) {
    const content = fs.readFileSync(FILE_DOMAINS, 'utf8');
    const doc = yaml.parse(content);

    const domains = doc[env];
    if (Array.isArray(domains)) {
      service.domains = [];
      for (let i = 0; i < domains.length; i++) {
        const domain = domains[i];
        if (typeof domain === 'string') {
          service.domains.push({
            name: domain,
            comment: '',
          });
        } else if (typeof domain === 'object') {
          service.domains.push({
            name: domain.name,
            comment: domain.comment,
          });
        } else {
          console.error(`Error: '${env}[${i}]' in ${FILE_DOMAINS} is not a string or object:`, domain);
          process.exit(1);
        }
      }
      console.debug(`- Domains ${FILE_DOMAINS} (${env})`);
    } else {
      console.error(`Error: '${env}' in ${FILE_DOMAINS} is not a list`);
      process.exit(1);
    }
  } else if (env !== 'production') {
    readDomainsFromEdglyYaml(service, env);
  }
}

/**
 * Write service configuration to current working directory
 *
 * @param {FastlyService} service Fastly service configuration
 * @param {String} env environment such as 'stage'. default is 'production'
 */
export function writeService(service, env = 'production') {
  console.debug();
  console.debug('Writing configuration to local folder:');

  writeAcls(service.acls);
  writeSnippets(service);
  writeVcls(service.vcls);
  writeDictionaries(service.dictionaries);
  writeDomains(service.domains, env);

  // main service config
  const slim = service.removeKeys(['acls', 'snippets', 'vcls', 'dictionaries', 'domains']);
  fs.writeFileSync(FILE_SERVICE, slim.toSortedJson());
  console.debug(`- Service config ${FILE_SERVICE}`);
}

/**
 * Read service configuration from current working directory
 *
 * @param {String} env environment such as 'stage'. default is 'production'
 * @returns {FastlyService} Fastly service read from disk
 */
export function readService(env = 'production') {
  if (!fs.existsSync(FILE_SERVICE)) {
    console.error('Error: No service configuration (service.json) found in local folder.');
    process.exit(1);
  }

  console.debug('Reading service config...');
  let service = FastlyService.fromJson(fs.readFileSync(FILE_SERVICE));
  readAcls(service);
  readSnippets(service);
  readVcls(service);
  readDictionaries(service);
  readDomains(service, env);

  service = service.replaceVariables();

  return service;
}
