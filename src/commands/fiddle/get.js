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

import chalk from 'chalk';
import { FastlyFiddleApi } from '../../fastly/api/fiddle-api.js';
import { FastlyFiddleManager } from '../../fastly/fiddle-mgr.js';
import { readService, writeService } from '../../fastly/store.js';
import { SHARED_OPTS } from '../../opts.js';
import { detectSecrets } from '../../secrets/secrets.js';

export default {
  command: 'get <url>',
  describe: 'Retrieve fiddle',
  builder: (yargs) => {
    // biome-ignore format: normal yargs style
    yargs
      .usage(chalk.yellow('  $0 fiddle get [OPTS] <url>'))
      .usage('')
      .usage('Download a Fastly VCL fiddle to local service configuration');

    // biome-ignore format: normal yargs style
    yargs
      .positional('url', {
        type: 'string',
        describe: 'URL or ID of Fastly Fiddle',
      })
      .options(SHARED_OPTS.secretsMode)
      .options(SHARED_OPTS.includeSecrets)
      .options(SHARED_OPTS.dryRun)
      .options(SHARED_OPTS.testFile);
  },
  handler: async (argv) => {
    const fiddleApi = new FastlyFiddleApi();
    const fiddle = await fiddleApi.get(argv.url);

    for (const type in fiddle.lintStatus) {
      if (fiddle.lintStatus[type]?.length > 0) {
        console.warn(`Warning: Lint errors in snippet '${type}':`);
        console.warn(fiddle.lintStatus[type]);
      }
    }

    const fiddleMgr = new FastlyFiddleManager();
    const service = readService();

    fiddleMgr.fiddleToService(fiddle.fiddle, service, { includeSecrets: argv.includeSecrets });

    detectSecrets(service, argv.secretsMode);

    if (argv.dryRun) {
      console.log('Dry run. Not writing service configuration to disk.');
      console.debug('\nService json:');
      console.debug(service);
      return;
    }

    writeService(service);

    fiddleMgr.writeFiddleTests(argv.testFile, fiddle.fiddle, service);

    console.debug('\nSuccessfully written latest Fiddle version.');

    // TODO: unnecessary when getting Fiddle: Warning: Environment variable not found: LOG_HTTPS_HEADER_VALUE
  },
};
