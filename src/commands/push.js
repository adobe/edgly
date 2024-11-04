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

// import { Fastly } from '../fastly.js';
import { SHARED_ARGS, SHARED_OPTS } from '../opts.js';

export default {
  command: 'push <service-id>',
  describe: 'Upload service config',
  builder: (yargs) => {
    yargs.usage('$0 push <service-id>');
    yargs.usage('');
    yargs.usage('Push service config from current folder to Fastly.');

    yargs.positional('service-id', SHARED_ARGS.serviceId);
    yargs.options(SHARED_OPTS.environment);
  },
  handler: (argv) => {
    console.log(`Pushing service ${argv.serviceId}...`);

    // TODO: what to do with redacted log configs (https, bigqueries, splunks, newrelics)
    // TODO: what to do with other redacted stuff (if we support it)

    /*
      TODO: see README

      fastly-dev push stage

      # why would one use this?
      fastly-dev push <serviceId> -e stage

      # better have serviceId in config file and just do
      fastly-dev push stage
     */
  },
};
