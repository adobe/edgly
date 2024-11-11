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
import yaml from 'yaml';

const PATTERNS = new URL('patterns.yaml', import.meta.url);
const ENTROPY_THRESHOLD = 4.5;

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

function truncate(str, n) {
  const re = new RegExp(`(.{${n}})..+`);
  return str.replace(re, '$1…');
}

function matchKnownSecretPatterns(patterns, input) {
  const hits = [];
  for (const pattern of patterns.patterns) {
    const { name, regex, confidence } = pattern.pattern;

    if (confidence !== 'high') {
      continue;
    }

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

function checkHighEntropy(input, threshold = ENTROPY_THRESHOLD) {
  const entropy = shannonEntropy(input);

  if (entropy > threshold) {
    return {
      type: `High Entropy of ${entropy.toFixed(2)}`,
      secret: input,
    };
  }
}

function detectSecretsInString(input, patterns, config) {
  const matches = [];
  for (const word of input.split(/[\s:\/\.,&#'"=;]+/)) {
    if (config?.ignore_values?.includes(word)) {
      continue;
    }
    matches.push(...matchKnownSecretPatterns(patterns, word));

    if (matches.length === 0) {
      const match = checkHighEntropy(word, config?.entropy_threshold);
      if (match) {
        matches.push(match);
      }
    }
  }
  return matches;
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: still readable
export function detectSecrets(fastlyService, config) {
  console.log();
  console.log('Checking for secrets in service config...');
  const service = fastlyService.service;
  const patterns = yaml.parse(fs.readFileSync(PATTERNS, 'utf8'));

  let secretFound = false;

  for (const dict of service.dictionaries) {
    const matches = [];
    for (const item of dict.items) {
      if (config?.ignore_keys?.includes(item.item_key)) {
        continue;
      }
      // check key because that might also contain a secret if used in some mapping
      for (const match of detectSecretsInString(item.item_key, patterns, config)) {
        matches.push({
          key: item.item_key,
          type: match.type,
          secret: match.secret,
        });
      }
      // check value
      for (const match of detectSecretsInString(item.item_value, patterns, config)) {
        matches.push({
          key: item.item_key,
          type: match.type,
          secret: match.secret,
        });
      }
    }
    if (matches.length > 0) {
      secretFound = true;
      console.warn();
      console.warn(`Warning: Possible secrets found in dictionary '${dict.name}':`);
      for (const item of matches) {
        console.warn(`- ${item.key}: ${truncate(item.secret, 40)} (${item.type})`);
      }
    }
  }

  for (const vcl of service.vcls) {
    const matches = detectSecretsInString(vcl.content, patterns, config);
    if (matches.length > 0) {
      secretFound = true;
      console.warn();
      console.warn(`Possible secrets found in VCL '${vcl.name}':`);
      for (const item of matches) {
        console.warn(`- ${truncate(item.secret, 50)} (${item.type})`);
      }
    }
  }

  for (const snippet of service.snippets) {
    const matches = detectSecretsInString(snippet.content, patterns, config);
    if (matches.length > 0) {
      secretFound = true;
      console.warn();
      console.warn(`Possible secrets found in Snippet '${snippet.name}':`);
      for (const item of matches) {
        console.warn(`- ${truncate(item.secret, 50)} (${item.type})`);
      }
    }
  }

  if (secretFound) {
    console.warn();
    console.warn(
      'Warning: Please review for secrets above BEFORE committing code to version control.',
    );
    console.warn();
    console.warn('Actions:');
    console.warn('  SECRET: Consider moving it to a write-only dictionary.');
    console.warn('  NOPE: Ignore via config under secrets_detector.ignore_keys or ignore_values.');
  }
}
