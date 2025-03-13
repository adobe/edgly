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
import yaml from 'yaml';
import { getVariableExpression, isVariableExpression } from '../fastly/service.js';

const PATTERNS_YAML_URL = new URL('patterns.yaml', import.meta.url);
// lazy loaded
let patterns;
const ENTROPY_THRESHOLD = 4.5;
const SECRETS_FILE = '.secrets.env';

export const LOG_SECRET_FIELDS = {
  bigqueries: 'secret_key',
  // 'cloudfiles',
  // 'datadog',
  // 'digitalocean',
  // 'elasticsearch',
  // 'ftp',
  // 'gcs',
  // 'pubsub',
  // 'grafanacloudlogs',
  https: 'header_value',
  // 'heroku',
  // 'honeycomb',
  // 'kafka',
  // 'kinesis',
  // 'logshuttle',
  // 'loggly',
  // 'azureblob',
  newrelics: 'token',
  // 'newrelicotlp',
  // 'openstack',
  // 'papertrail',
  // 's3',
  // 'sftp',
  // 'scalyr',
  splunks: 'token',
  // 'sumologic',
  // 'syslog',
};

function truncate(str, n) {
  const re = new RegExp(`(.{${n}})..+`);
  return str.replace(re, '$1…');
}

function shannonEntropy(input) {
  function charFrequencies(input) {
    const h = {};
    for (let i = 0; i < input.length; i += 1) {
      const c = input.charAt(i);
      h[c] = h[c] ? h[c] + 1 : 1;
    }
    return h;
  }

  const freq = charFrequencies(input);

  let sum = 0;

  for (const key of Object.keys(freq)) {
    const score = freq[key] / input.length;
    sum -= score * Math.log2(score);
  }

  return sum;
}

function findHighEntropy(input, threshold = ENTROPY_THRESHOLD) {
  const entropy = shannonEntropy(input);

  if (entropy > threshold) {
    return {
      type: `High Entropy of ${entropy.toFixed(2)}`,
      secret: input,
    };
  }
}

function getPatterns() {
  if (!patterns) {
    patterns = yaml.parse(fs.readFileSync(PATTERNS_YAML_URL, 'utf8'));
  }
  // we only use high confidence patterns (for now)
  return patterns.patterns.filter((p) => p.pattern.confidence === 'high');
}

function findKnownSecretPatterns(input) {
  const hits = [];
  for (const p of getPatterns()) {
    const { name, regex } = p.pattern;

    const re = new RegExp(regex, 'g');
    for (const match of input.matchAll(re)) {
      hits.push({
        type: name,
        secret: match[0],
      });
    }
  }
  return hits;
}

function findSecretsInString(input) {
  if (!input) {
    return [];
  }

  const cfg = global.config.secrets;
  const matches = [];

  // 1. find known secret patterns
  matches.push(...findKnownSecretPatterns(input));

  // 2. find high entropy strings. need to split into "words" first
  for (const word of input.split(/[\s:\/\.,&#'"=;]+/)) {
    // if (matches.length === 0) {
    const match = findHighEntropy(word, cfg?.entropy_threshold);
    if (match) {
      matches.push(match);
    }
    // }
  }

  // remove all configured ignoreValues
  return matches.filter((m) => !cfg?.ignore_values?.includes(m.secret));
}

function replaceSecrets(input, secret, variable) {
  return input.replaceAll(secret, getVariableExpression(variable));
}

function detectSecretsInDictionaries(service, mode) {
  const secrets = [];

  for (const dict of service.dictionaries) {
    let i = 0;
    for (const item of dict.items) {
      if (global.config.secrets?.ignore_keys?.includes(item.item_key)) {
        continue;
      }
      // check key because that might also contain a secret if used in some mapping
      for (const match of findSecretsInString(item.item_key)) {
        i++;
        const secret = {
          name: `Dict key in ${dict.name}`,
          value: match.secret,
          type: match.type,
          var: `DICT_KEY_${dict.name.toUpperCase()}_${i}`,
        };
        secrets.push(secret);

        if (mode === 'replace') {
          item.item_key = replaceSecrets(item.item_key, secret.value, secret.var);
        }
      }
      // check value
      for (const match of findSecretsInString(item.item_value)) {
        const secret = {
          name: `Dict value ${dict.name}.${item.item_key}`,
          value: match.secret,
          type: match.type,
          var: `DICT_${dict.name.toUpperCase()}_${item.item_key.toUpperCase()}`,
        };
        secrets.push(secret);

        if (mode === 'replace') {
          item.item_value = replaceSecrets(item.item_value, secret.value, secret.var);
        }
      }
    }
  }
  return secrets;
}

function detectSecretsInVcls(service, mode) {
  const secrets = [];

  for (const vcl of service.vcls) {
    const matches = findSecretsInString(vcl.content);
    if (matches.length > 0) {
      for (let i = 0; i < matches.length; i++) {
        const match = matches[i];
        const secret = {
          name: `VCL text ${vcl.name}`,
          value: match.secret,
          type: match.type,
          var: `VCL_${vcl.name.toUpperCase()}_${i}`,
        };
        secrets.push(secret);

        if (mode === 'replace') {
          vcl.content = replaceSecrets(vcl.content, secret.value, secret.var);
        }
      }
    }
  }
  return secrets;
}

function detectSecretsInSnippets(service, mode) {
  const secrets = [];

  for (const snippet of service.snippets) {
    const matches = findSecretsInString(snippet.content);
    if (matches.length > 0) {
      for (let i = 0; i < matches.length; i++) {
        const match = matches[i];
        const secret = {
          name: `Snippet text ${snippet.type}_${snippet.priority}`,
          value: match.secret,
          type: match.type,
          var: `SNIPPET_${snippet.type.toUpperCase()}_${snippet.priority.toUpperCase()}_${i + 1}`,
        };
        secrets.push(secret);

        if (mode === 'replace') {
          snippet.content = replaceSecrets(snippet.content, secret.value, secret.var);
        }
      }
    }
  }
  return secrets;
}

function detectSecretsInLogFields(service, mode) {
  const secrets = [];

  for (const logType of Object.keys(LOG_SECRET_FIELDS)) {
    const secretField = LOG_SECRET_FIELDS[logType];
    if (Array.isArray(service[logType])) {
      for (const logConfig of service[logType]) {
        if (logConfig[secretField]) {
          // ignore if already a variable
          if (isVariableExpression(logConfig[secretField])) {
            continue;
          }

          const secret = {
            name: `Log ${logType}.${secretField}`,
            value: logConfig[secretField],
            type: 'Log secret field',
            var: `LOG_${logType.toUpperCase()}_${secretField.toUpperCase()}`,
          };
          secrets.push(secret);

          if (mode === 'replace') {
            logConfig[secretField] = getVariableExpression(secret.var);
          }
        }
      }
    }
  }
  return secrets;
}

export function detectSecrets(service, mode) {
  // modes:
  //  warn: print warning
  //  replace: replace secrets with $ENV VAR (default)

  console.debug();
  console.debug(`Checking for secrets in service config (mode=${mode})...`);

  const secrets = [];
  secrets.push(...detectSecretsInDictionaries(service, mode));
  secrets.push(...detectSecretsInVcls(service, mode));
  secrets.push(...detectSecretsInSnippets(service, mode));
  secrets.push(...detectSecretsInLogFields(service, mode));

  if (secrets.length > 0) {
    if (mode === 'replace') {
      console.warn(`\nWarning: Replaced ${secrets.length} potential secrets with variables:`);
      for (const secret of secrets) {
        console.warn(`- ${secret.var} = ${truncate(secret.value, 40)} (${secret.type})`);
      }

      fs.writeFileSync(SECRETS_FILE, secrets.map((s) => `${s.var}="${s.value}"`).join('\n'));
    } else {
      console.warn(`\nWarning: Found ${secrets.length} potential secrets:`);
      for (const secret of secrets) {
        console.warn(`- ${secret.name}: ${truncate(secret.value, 40)} (${secret.type})`);
      }
    }
    console.warn();
    console.warn('Secret options:');
    if (mode === 'replace') {
      console.warn(`  1. Secrets have been replaced with \${{VAR}} variables, stored in ${SECRETS_FILE}.`);
      console.warn('     DO NOT commit this file to version control, but use CI secret store instead.');
    } else {
      console.warn('  1. Use built-in env var replacement using ${{VAR}}.');
      console.warn('     Run with --secrets-mode=replace to replace automatically.');
    }
    console.warn('  2. Consider using a Fastly write-only dictionary, and dict lookup where possible.');
    console.warn('  3. False positives: Ignore via secrets.ignore_keys or ignore_values config.');
  }
}
