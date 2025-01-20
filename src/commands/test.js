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

import { runTests } from '../test/runner.js';

export default {
  command: 'test [files...]',
  describe: 'Run HTTP request tests',
  builder: (yargs) => {
    // biome-ignore format: normal yargs style
    yargs
      .usage('$0 test [files...]')
      .usage('')
      .usage("Run HTTP request tests defined in *.http files.");

    // biome-ignore format: normal yargs style
    yargs
      .positional('files', {
        type: 'string',
        describe: 'Glob pattern for test files',
        default: 'tests/*.http',
      })
      // tepi options
      .options({
        display: {
          alias: 'd',
          type: 'string',
          description: "Set the display mode. (none, minimal, default, truncate, full and verbose). See 'tepi -h' for more details.",
        },
        watch: {
          alias: 'w',
          // TODO: --watch as array?
          type: 'string',
          description: 'Watch files for changes and rerun tests.',
        },
        timeout: {
          alias: 't',
          type: 'number',
          description: 'Set the timeout for each test in milliseconds. After the timeout, the test will fail.'
        },
        'fail-fast': {
          alias: 'f',
          type: 'boolean',
          description: 'Stop running tests after the first failure.',
        },
        'env-file': {
          alias: 'e',
          type: 'string',
          description: 'load environment variables from a .env file',
        },
        'dry-run': { hidden: true },
        'api-token': { hidden: true },
      });
  },
  handler: async (argv) => {
    // collect all tepi args to pass through
    const tepiArgs = [];
    for (const arg of ['d', 'w', 't', 'f', 'e']) {
      if (typeof argv[arg] === 'boolean') {
        tepiArgs.push(`-${arg}`);
      } else if (typeof argv[arg] === 'string') {
        tepiArgs.push(`-${arg}`, argv[arg]);
      } else if (Array.isArray(argv[arg])) {
        for (const value of argv[arg]) {
          tepiArgs.push(`-${arg}`, value);
        }
      }
    }

    await runTests(argv.files, tepiArgs);
  },
};
