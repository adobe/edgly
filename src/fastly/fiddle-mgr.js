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
import { HttpTest, parseHttpTestFile, writeHttpTestFile } from '../test/parser.js';
import { asMap, sortAlpha } from '../util.js';

const DIVIDER = '# ===================================================================';

function snippetsToFiddleSrc(snippets) {
  return snippets
    .map(
      (snippet) =>
        `${DIVIDER}
# name: ${snippet.name}
# prio: ${snippet.priority}
${DIVIDER}

${snippet.content}

`,
    )
    .join('\n');
}

function fiddleSrcToSnippets(src, type) {
  const snippets = [];

  const lines = src.split('\n');

  let snippet = {
    content: '',
  };

  for (const line of lines) {
    if (line.startsWith('# name: ')) {
      if (snippet.content.trim()) {
        snippets.push(snippet);
      }
      snippet = {
        type,
        name: line.substr('# name: '.length),
        priority: 100,
        content: '',
      };
    } else if (line.startsWith('# prio: ')) {
      snippet.priority = line.substr('# prio: '.length);
    } else if (line === DIVIDER) {
      // skip
    } else if (snippet.name) {
      snippet.content += `${line}\n`;
    }
  }

  if (snippet.content.trim()) {
    snippets.push(snippet);
  }

  return snippets;
}

function dictionariesToTables(dictionaries, opts) {
  let tables = '';
  for (const dict of dictionaries) {
    tables += `table ${dict.name} {\n`;

    for (const item of dict.items) {
      let value = item.item_value;
      if (dict.write_only && !opts.includeSecrets) {
        value = '[REDACTED]';
      }
      tables += `  "${item.item_key}": "${value}",\n`;
    }

    tables += '}\n\n';
  }
  return tables;
}

function tablesToDictionaries(init, service, opts) {
  if (!init) {
    return;
  }

  const currentDicts = asMap(service.dictionaries, (d) => [d.name, d]);

  const dicts = [];

  const tablesRegex = /table (\w+) \{[^\}]*\}/gm;
  const entriesRegex = /^\s*"([^"]*)"\s*:\s*"([^"]*)"\s*,.*$/gm;

  for (const table of init.matchAll(tablesRegex)) {
    const name = table[1];
    const dict = {
      name,
      // biome-ignore lint/style/useNamingConvention: fastly json schema
      write_only: currentDicts[name]?.write_only,
      items: [],
      info: {},
    };

    // if private dicts should be skipped, we keep the previous one
    if (dict.write_only && !opts.includeSecrets) {
      dicts.push(currentDicts[name]);
      continue;
    }

    const entries = table[0].matchAll(entriesRegex);
    for (const entry of entries) {
      dict.items.push({
        // biome-ignore lint/style/useNamingConvention: fastly json schema
        item_key: entry[1],
        // biome-ignore lint/style/useNamingConvention: fastly json schema
        item_value: entry[2],
      });
    }

    dicts.push(dict);
  }

  service.dictionaries = sortAlpha(dicts, (d) => d.name);
}

function getHostname(backend) {
  if (backend.port === 443) {
    return `https://${backend.address}`;
  }
  if (backend.port === 80) {
    return `http://${backend.address}`;
  }
  return `http://${backend.address}:${backend.port}`;
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: ok
function fiddleOriginsToBackends(fiddle, service) {
  const delta = fiddle.origins.length - service.backends.length;
  if (delta > 0) {
    console.warn(`\nWarning: Fiddle added ${delta} new backends. Please rename as needed:`);
    for (let i = service.backends.length; i < fiddle.origins.length; i++) {
      console.warn(`- F_origin_${i} = ${fiddle.origins[i]} (new)`);
    }
  } else if (delta < 0) {
    console.warn(`\nWarning: Fiddle removed ${-delta} backend. Please check:`);
    for (let i = fiddle.origins.length; i < service.backends.length; i++) {
      const backend = service.backends[i];
      console.warn(`- ${backend.name} = ${getHostname(backend)} (removed)`);
    }
  }

  service.backends = service.backends.slice(0, fiddle.origins.length);

  for (let i = 0; i < fiddle.origins.length; i++) {
    const origin = new URL(fiddle.origins[i]);
    const name = `origin_${i}`;

    if (i < service.backends.length) {
      // replace F_origin_N with existing backend name
      const reg = new RegExp(`\\bF_${name}\\b`, 'g');
      for (const snippet of service.snippets) {
        snippet.content = snippet.content.replaceAll(reg, `F_${service.backends[i].name}`);
      }
    } else {
      // add new backend but keep name F_origin_N
      service.backends.push({
        name,
        address: origin.hostname,
        hostname: origin.hostname,
        port: origin.port === '' ? (origin.protocol === 'https:' ? 443 : 80) : Number.parseInt(origin.port),
        // biome-ignore lint/style/useNamingConvention: fastly json schema
        use_ssl: origin.protocol === 'https:',
        // biome-ignore lint/style/useNamingConvention: fastly json schema
        ssl_cert_hostname: origin.protocol === 'https:' ? origin.hostname : null,
        // biome-ignore lint/style/useNamingConvention: fastly json schema
        ssl_sni_hostname: origin.protocol === 'https:' ? origin.hostname : null,
      });
    }
  }
}

export class FastlyFiddleManager {
  validate(service) {
    if (Array.isArray(service.vcls) && service.vcls.length > 0) {
      throw new Error('Service has VCL files which are not supported in Fiddles. Use Snippets instead.');
    }
  }

  serviceToFiddle(service, opts) {
    this.validate(service);

    const fiddle = {
      type: 'vcl',
      title: `${service.name} version ${service.version}`,
      origins: [],
      src: {},
    };

    // map snippets
    const { src } = fiddle;

    const subs = service.snippetsBySubroutine();
    for (const type in subs) {
      fiddle.src[type] = snippetsToFiddleSrc(subs[type]);
    }

    // map backends/origins
    const fiddleBackends = global.config.fiddle?.backends;

    const backendMapping = [];
    backendMapping.push('# Backends:');

    for (let i = 0; i < service.backends.length; i++) {
      const backend = service.backends[i];
      fiddle.origins.push(fiddleBackends?.[backend.name] || getHostname(backend));

      // replace occurrences of F_backend with F_0, F_1, ...
      const reg = new RegExp(`\\bF_${backend.name}\\b`, 'g');
      for (const type in src) {
        src[type] = src[type].replaceAll(reg, `F_origin_${i}`);
      }

      backendMapping.push(`# F_origin_${i} => F_${backend.name}`);
    }

    const comments = `${backendMapping.join('\n')}\n\n`;
    const tables = dictionariesToTables(service.dictionaries, opts);
    fiddle.src.init = comments + tables + (fiddle.src.init || '');

    return fiddle;
  }

  fiddleToService(fiddle, service, opts) {
    service.snippets = [];

    // map tables to dictionaries
    tablesToDictionaries(fiddle.src.init, service, opts);

    // map snippets
    for (const type in fiddle.src) {
      service.snippets.push(...fiddleSrcToSnippets(fiddle.src[type], type));
    }

    // map backends/origins
    fiddleOriginsToBackends(fiddle, service);

    return service;
  }

  readFiddleTests(file, fiddle) {
    if (fs.existsSync(file)) {
      const { tests } = parseHttpTestFile(file);
      fiddle.requests = tests.map((t) => t.toFiddleTest(t));
    }
  }

  writeFiddleTests(file, fiddle, service) {
    if (!Array.isArray(fiddle.requests)) {
      return;
    }

    // ensure intermediary folders are present
    fs.mkdirSync(path.dirname(file), { recursive: true });

    const httpTests = fiddle.requests.map((req) => HttpTest.fromFiddleTest(req));

    const domain = service.domains[0]?.name;
    const meta = `host: <%= Deno.env.get('HOST') || 'https://${domain}' %>`;

    writeHttpTestFile(file, httpTests, meta);
  }
}
