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

// turn off console.debug by default
// and only turn it on below if -v/--verbose is set
const consoleDebug = console.debug;
console.debug = () => ({});

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
  verbose: {
    alias: 'v',
    type: 'boolean',
    describe: 'Verbose output',
    coerce: (verbose) => {
      global.verbose = verbose;
      if (verbose) {
        console.debug = consoleDebug;
      }
      return verbose;
    },
  },
};

export const SHARED_ARGS = {};

export const SHARED_OPTS = {
  apiToken: {
    'api-token': {
      alias: 't',
      type: 'string',
      describe: 'Fastly API Token',
      demandOption: 'Set Fastly API Token using --api-token or FASTLY_DEV_API_TOKEN environment variable.',
    },
  },
  env: {
    env: {
      alias: 'e',
      type: 'string',
      describe: 'Environment',
    },
  },
  id: {
    id: {
      type: 'string',
      describe: 'Fastly service ID',
    },
  },
  version: {
    version: {
      alias: 'V',
      type: 'string',
      describe: 'Service version',
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
  force: {
    force: {
      alias: 'f',
      type: 'boolean',
      describe: 'Force operation without prompting for confirmation',
    },
  },
  dryRun: {
    'dry-run': {
      alias: 'd',
      type: 'boolean',
      describe: 'Do not make any changes',
    },
  },
  testFile: {
    'test-file': {
      type: 'string',
      describe: 'File with tests to sync',
      default: 'tests/fiddle.http',
    },
  },
};

export function override(opt, overrides) {
  const key = Object.keys(opt)[0];
  return {
    [key]: {
      ...opt[key],
      ...overrides,
    },
  };
}
