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

import { Config } from './config.js';

const DEFAULT_CONFIG_FILE = 'fastly-dev.yaml';

export const GLOBAL_OPTS = {
  config: {
    alias: 'c',
    type: 'string',
    default: DEFAULT_CONFIG_FILE,
    describe: 'Configuration file',
    coerce: (file) => {
      global.config = Config.read(file, file === DEFAULT_CONFIG_FILE);
      return global.config;
    },
  },
  'dry-run': {
    alias: 'd',
    type: 'boolean',
    describe: 'Do not make any actual changes',
  },
  'api-token': {
    alias: 't',
    type: 'string',
    describe: 'Fastly API Token',
  },
  verbose: {
    alias: 'v',
    type: 'boolean',
    describe: 'Verbose output',
    // biome-ignore lint/suspicious/noAssignInExpressions: smooth
    coerce: (v) => (global.verbose = v),
  },
};

export const SHARED_ARGS = {};

export const SHARED_OPTS = {
  apiToken: {
    'api-token': {
      demandOption:
        'You must provide a Fastly API Token with -t/--api-token or via the FASTLY_API_TOKEN environment variable.',
    },
  },
  serviceId: {
    'service-id': {
      alias: 's',
      type: 'string',
      describe: 'Fastly service ID',
    },
  },
  secretsMode: {
    'secrets-mode': {
      type: 'string',
      describe: "How to handle secrets: 'replace' or 'warn'.",
      default: 'replace',
    },
  },
  includeSecrets: {
    'include-secrets': {
      type: 'boolean',
      describe: 'Include private dictionary values',
    },
  },
};
