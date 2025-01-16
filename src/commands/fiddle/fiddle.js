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

import clear from './clear.js';
import create from './create.js';
import get from './get.js';
import update from './update.js';

export default {
  command: 'fiddle',
  describe: 'Fastly VCL fiddle commands',
  builder: (yargs) => {
    // biome-ignore format: normal yargs style
    yargs
      .command(create)
      .command(get)
      .command(update)
      .command(clear)
      .demandCommand(1)
      .usage('$0 fiddle')
      .usage('')
      .usage('Commands to sync a local service configuration with a Fastly VCL Fiddle');
  },
};
