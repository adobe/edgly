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
import { readService } from '../../fastly/store.js';
import { SHARED_OPTS } from '../../opts.js';

export default {
  command: 'update <url>',
  aliases: ['up'],
  describe: 'Update fiddle',
  builder: (yargs) => {
    // biome-ignore format: normal yargs style
    yargs
      .usage(chalk.yellow('  $0 fiddle update [OPTS] <url>'))
      .usage('')
      .usage('Update a Fastly VCL fiddle with the local service configuration')
      .usage('')
      .usage('Alias: up');

    // biome-ignore format: normal yargs style
    yargs
      .positional('url', {
        type: 'string',
        describe: 'URL or ID of Fastly Fiddle',
      })
      .options(SHARED_OPTS.includeSecrets)
      .options(SHARED_OPTS.dryRun)
      .options(SHARED_OPTS.testFile);
  },
  handler: async (argv) => {
    const service = readService('production');

    const fiddleMgr = new FastlyFiddleManager();
    const fiddle = fiddleMgr.serviceToFiddle(service, { includeSecrets: argv.includeSecrets });
    fiddleMgr.readFiddleTests(argv.testFile, fiddle);

    if (argv.dryRun) {
      console.log('Dry run. Not updating fiddle.');
      console.debug('\nFiddle json:');
      console.debug(fiddle);
      return;
    }

    const fiddleApi = new FastlyFiddleApi();
    const result = await fiddleApi.update(argv.url, fiddle);

    console.log(`https://fiddle.fastly.dev/fiddle/${result.fiddle.id}`);
  },
};
