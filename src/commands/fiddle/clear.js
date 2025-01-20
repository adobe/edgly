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

import { stdin, stdout } from 'node:process';
import { createInterface } from 'node:readline/promises';
import { FastlyFiddleApi } from '../../fastly/api/fiddle-api.js';
import { SHARED_OPTS } from '../../opts.js';

export default {
  command: 'clear <url>',
  describe: 'Clear fiddle (delete alternative)',
  builder: (yargs) => {
    // biome-ignore format: normal yargs style
    yargs
      .usage('$0 fiddle clear <url>')
      .usage('')
      .usage('Clears a Fastly VCL fiddle. Fiddles cannot be deleted, but all code removed.');

    // biome-ignore format: normal yargs style
    yargs
      .positional('url', {
        type: 'string',
        describe: 'URL or ID of Fastly Fiddle',
      })
      .options(SHARED_OPTS.force)
      .options(SHARED_OPTS.dryRun);
  },
  handler: async (argv) => {
    if (argv.dryRun) {
      console.log(`Dry run. Not deleting fiddle ${argv.url}`);
      return;
    }

    const emptyFiddle = {
      type: 'vcl',
      title: `CLEARED at ${new Date().toISOString()}`,
      origins: ['https://example.com'],
      src: {},
      requests: [{}],
    };

    const fiddleApi = new FastlyFiddleApi();

    if (!argv.force) {
      const response = await fiddleApi.get(argv.url);
      console.log(response.fiddle.title);

      const rl = createInterface({ input: stdin, output: stdout });
      const answer = await rl.question('\nDo you want to clear this Fiddle? [y/n] ');
      rl.close();
      if (!['y', 'Y'].includes(answer)) {
        process.exit(3);
      }
    }

    await fiddleApi.update(argv.url, emptyFiddle);

    if (!argv.force) {
      console.log(`\nCleared Fiddle: ${argv.url}`);
    }
  },
};
