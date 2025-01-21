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

import { createRequire } from 'node:module';
import chalk from 'chalk';

const require = createRequire(import.meta.url);
const pkgJson = require('../../package.json');

export default {
  command: 'version',
  describe: 'Show version info',
  builder: (yargs) => {
    // biome-ignore format: normal yargs style
    yargs
      .usage(chalk.yellow('  $0 version'))
      .usage('')
      .usage("Run HTTP request tests defined in *.http files.");
  },
  handler: () => {
    console.log('Version:', pkgJson.version);
    console.log('Node:', process.version);
  },
  getVersion: () => {
    return pkgJson.version;
  },
};
