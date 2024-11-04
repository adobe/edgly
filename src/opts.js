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

export const GLOBAL_OPTS = {
  t: {
    alias: 'api-token',
    type: 'string',
    describe: 'Fastly API Token',
    demandOption:
      'You must provide a Fastly API Token with -t/--api-token or via the FASTLY_API_TOKEN environment variable.',
  },
  c: {
    alias: 'config',
    type: 'string',
    default: 'fastly-svc.yaml',
    describe: 'Config file (YAML)',
    coerce: (file) => {
      if (fs.existsSync(file)) {
        return yaml.parse(fs.readFileSync(file, 'utf8'));
      }
      return {};
    },
  },
};

export const SHARED_ARGS = {
  serviceId: {
    type: 'string',
    describe: 'Fastly service ID',
  },
};

export const SHARED_OPTS = {
  environment: {
    e: {
      alias: 'env',
      type: 'string',
      describe: 'Environment',
      default: 'production',
    },
  },
  // serviceId: {
  //   s: {
  //     alias: 'service-id',
  //     ...SHARED_ARGS.serviceId,
  //   },
  // },
  // serviceFile: {
  //   f: {
  //     alias: 'service-file',
  //     type: 'path',
  //     default: 'service.json',
  //     describe: 'Write service configuration into this file',
  //   },
  // },
};
