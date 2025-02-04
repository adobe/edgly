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
import chalk from 'chalk';
import { FastlyService } from '../../fastly/service.js';
import { writeService } from '../../fastly/store.js';
import { SHARED_OPTS } from '../../opts.js';
import { detectSecrets } from '../../secrets/secrets.js';

export default {
  command: 'import <source>',
  describe: 'Import Fastly service',
  builder: (yargs) => {
    yargs
      .usage(chalk.yellow('  $0 service import [OPTS] <source>'))
      .usage('')
      .usage('Import Fastly service from a service.json or other source.');

    yargs
      .options({
        type: {
          type: 'string',
          describe: 'Type of source. Supported options:\n- service-json\n',
          default: 'service-json',
        },
      })
      .options(SHARED_OPTS.secretsMode)
      .options(SHARED_OPTS.dryRun);
  },
  handler: (argv) => {
    let service;
    if (argv.type === 'service-json') {
      service = FastlyService.fromJson(fs.readFileSync(argv.source));
    } else {
      console.error(`Error: Unsupported source type: ${argv.type}`);
      process.exit(3);
    }

    detectSecrets(service, argv.secretsMode);

    if (argv.dryRun) {
      console.log('\nDry run. Not writing service configuration to disk.');
      return;
    }

    writeService(service);

    global.config.set('env.production.id', service.service_id).write();

    console.debug(`\nSuccessfully written ${service.service_id} v${service.version}.`);
  },
};
