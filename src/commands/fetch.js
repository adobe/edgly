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
import { Fastly } from '../fastly.js';
import { SHARED_ARGS } from '../opts.js';
import { detectSecrets } from '../secrets/secrets.js';

const DIR_SNIPPETS = 'snippets';
const DIR_VCLS = 'vcl';
const DIR_DICTIONARIES = 'dictionaries';

const FILE_SERVICE = 'service.json';
const FILE_ACL = 'acl.json';

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

function openFile(file, mode) {
  const handle = fs.openSync(file, mode);

  return {
    write: (text = '') => fs.writeSync(handle, text),
    writeLn: (text = '') => fs.writeSync(handle, `${text}\n`),
    close: () => fs.closeSync(handle),
  };
}

async function fetchService(apiToken, serviceId) {
  console.log(`Fetching service ${serviceId}...`);
  const fastly = new Fastly(apiToken);

  try {
    const details = await fastly.serviceDetails(serviceId);
    const service = { ...(details.active_version || details.version) };
    service.version = service.number;
    service.name = details.name;
    service.type = details.type;

    if (service.type !== 'vcl') {
      console.warn(
        `Warning: Service type is ${service.type}. This tool is only tested with 'vcl' services.`,
      );
    }

    console.log(`- Active version ${service.version}`);

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
      if (write_only) {
        dict.info = await fastly.dictionaryInfo(serviceId, service.version, id);
        dict.items = [];
      } else {
        dict.items = await fastly.dictionaryItems(serviceId, id);
      }
    }

    return service;
  } finally {
    await fastly.dispose();
  }
}

function writeAcls(service) {
  if (Array.isArray(service.acls) && service.acls.length > 0) {
    fs.writeFileSync(FILE_ACL, jsonStringifySorted(service.acls, 2));
    console.log(`- ACLs ${FILE_ACL}`);
  } else if (fs.existsSync(FILE_ACL)) {
    fs.unlinkSync(FILE_ACL);
  }
  service.acls = undefined;
}

function getSnippetsBySubroutine(service) {
  const subs = {};
  for (const snippet of service.snippets) {
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

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: deemed ok
function writeSnippets(service) {
  // reset snippets: delete all snippet vcl files
  for (const file of globSync(path.join(DIR_SNIPPETS, '*.vcl'))) {
    fs.unlinkSync(file);
  }

  if (Array.isArray(service.snippets) && service.snippets.length > 0) {
    fs.mkdirSync(DIR_SNIPPETS, { recursive: true });

    const subs = getSnippetsBySubroutine(service);

    // we always need init.vcl for the context
    if (!subs.init) {
      subs.init = [];
    }

    for (const type in subs) {
      const snippetPath = path.join(DIR_SNIPPETS, `${type}.vcl`);
      const file = openFile(snippetPath, 'w');

      const needsSub = !['init', 'none'].includes(type);
      const indent = needsSub ? '  ' : '';

      // adding context for Fastly VS Code extension or other tools
      // - backends
      // - tables
      // - sub
      if (type === 'init') {
        file.writeLn('# Context for IDEs. Automatically generated.');
        for (const backends of service.backends) {
          file.writeLn(`backend F_${backends.name} {}`);
        }
        for (const dict of service.dictionaries) {
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
        file.writeLn(
          `${indent}# ===========================================================================`,
        );
        file.writeLn(`${indent}# ${snippet.name}`);
        file.writeLn(`${indent}# priority: ${snippet.priority}`);
        file.writeLn(`${indent}# id: ${snippet.id}`);
        file.writeLn(
          `${indent}# ===========================================================================`,
        );
        file.writeLn();
        for (let line of snippet.content.split('\n')) {
          line = line.trimEnd();
          if (line.length === 0) {
            file.writeLn();
          } else {
            file.writeLn(`${indent}${line}`);
          }
        }
      }

      file.writeLn(
        `${indent}# ===========================================================================`,
      );
      if (needsSub) {
        file.writeLn('}');
      }

      file.close();

      console.log(`- Snippet ${snippetPath}`);
    }

    service.snippets = undefined;
  }
}

function writeVcls(service) {
  // reset snippets: delete all vcl files
  for (const file of globSync(path.join(DIR_VCLS, '*.vcl'))) {
    fs.unlinkSync(file);
  }

  if (Array.isArray(service.vcls) && service.vcls.length > 0) {
    fs.mkdirSync(DIR_VCLS, { recursive: true });

    for (const vcl of service.vcls) {
      if (!vcl.name.endsWith('.vcl')) {
        console.warn(`Warning: VCL ${vcl.name} does not end with .vcl`);
      }

      const vclPath = path.join(DIR_VCLS, `${vcl.name}`);

      const file = openFile(vclPath, 'w');
      file.writeLn(`# main: ${vcl.main}`);
      file.writeLn();
      file.write(vcl.content);
      file.close();

      console.log(`- VCL ${vclPath}`);
    }

    service.vcls = undefined;
  }
}

function writeDictionaries(service) {
  // reset dictionaries: delete all ini files
  for (const file of globSync(path.join(DIR_DICTIONARIES, '*.ini'))) {
    fs.unlinkSync(file);
  }

  if (!Array.isArray(service.dictionaries) || service.dictionaries.length === 0) {
    return;
  }

  fs.mkdirSync(DIR_DICTIONARIES, { recursive: true });

  for (const dict of service.dictionaries) {
    const dictPath = path.join(DIR_DICTIONARIES, `${dict.name}.ini`);
    const { write_only } = dict;

    const file = openFile(dictPath, 'w');
    file.writeLn(`# id: ${dict.id}`);
    if (write_only) {
      file.writeLn('# write_only: true');
      file.writeLn(`# last_updated: ${dict.info.last_updated}`);
      file.writeLn(`# item_count: ${dict.info.item_count}`);
    }
    file.writeLn();
    for (const item of dict.items) {
      file.writeLn(`${item.item_key}="${item.item_value}"`);
    }
    file.close();

    console.log(`- Dictionary ${dictPath}${write_only ? ' (write-only)' : ''}`);
  }

  service.dictionaries = undefined;
}

function cleanup(service, config) {
  // logging: redact sensitive data
  if (service.https?.length > 0) {
    service.https[0].header_value = '[REDACTED]';
  }
  if (service.bigqueries?.length > 0) {
    service.bigqueries[0].secret_key = '[REDACTED]';
  }
  if (service.splunks?.length > 0) {
    service.splunks[0].token = '[REDACTED]';
  }
  if (service.newrelics?.length > 0) {
    service.newrelics[0].token = '[REDACTED]';
  }

  // redact configurable dictionary items
  for (const dict of service.dictionaries) {
    for (const item of dict.items) {
      // redact sensitive dictionary items
      if (config?.secrets?.redact?.dict_keys?.includes(item.item_key)) {
        console.warn(`- Redacting dictionary item ${item.item_key} = ${item.item_value}`);
        item.item_value = '[REDACTED]';
      }
    }
  }

  // remove noisy fields
  for (const key in service) {
    if (['number', 'deployed', 'staging', 'testing', 'deleted_at'].includes(key)) {
      delete service[key];
    }
  }
}

function writeServiceConfig(service) {
  console.log();
  console.log('Writing configuration to local folder:');

  writeAcls(service);
  writeSnippets(service);
  writeVcls(service);
  writeDictionaries(service);

  // MAIN SERVICE CONFIG
  fs.writeFileSync(FILE_SERVICE, jsonStringifySorted(service, 2));
  console.log(`- Config ${FILE_SERVICE}`);

  console.log();
  console.log(`Successfully written ${service.service_id} v${service.version}.`);
}

function getStoredServiceId() {
  if (fs.existsSync(FILE_SERVICE)) {
    try {
      return JSON.parse(fs.readFileSync(FILE_SERVICE, 'utf8'))?.service_id;
    } catch (_ignore) {
      // ignore
    }
  }
}

export default {
  command: 'fetch [service-id]',
  describe: 'Download service config',
  builder: (yargs) => {
    yargs.usage('$0 fetch [service-id]');
    yargs.usage('');
    yargs.usage('Fetch service config from Fastly and write to current folder.');

    yargs.positional('service-id', SHARED_ARGS.serviceId);
  },
  handler: async (argv) => {
    const serviceId = getStoredServiceId() || argv.serviceId;
    if (!serviceId) {
      console.error('Error: No service ID provided.');
      process.exit(1);
    }

    const service = await fetchService(argv.apiToken, serviceId);

    cleanup(service, argv.config);
    detectSecrets(service, argv.config?.secrets);

    writeServiceConfig(service, argv.config);
  },
};
