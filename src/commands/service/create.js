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

import { FastlyServiceManager } from '../../fastly/service-mgr.js';
import { readService } from '../../fastly/store.js';
import { SHARED_OPTS, override } from '../../opts.js';

export default {
  command: 'create',
  describe: 'Create new Fastly service from local configuration',

  builder: (yargs) => {
    // biome-ignore format: normal yargs style
    yargs
      .usage('$0 service create')
      .usage('')
      .usage('Create new service in Fastly based on service configuration from current folder.')
      .usage('Use to create different environments (specify -e) or copies of the service.');

    // biome-ignore format: normal yargs style
    yargs
      .options('name', {
        type: 'string',
        describe: 'Name for new service',
      })
      .options(SHARED_OPTS.apiToken)
      .options(override(SHARED_OPTS.env, {
        describe: 'Environment to create',
        default: 'production',
      }));
  },

  handler: async (argv) => {
    const { env } = argv;

    const service = readService(env);

    const id = global.config.env?.[env]?.id;

    const mgr = new FastlyServiceManager(argv.apiToken);

    if (id) {
      console.error(`Error: Cannot create new service for environment '${env}'.`);
      console.error(`       Existing service ID found for '${env}': ${id}.`);
      console.error('       To resolve, choose a different environment with --env');
      console.error(`       or remove env.${env}.id in config file.`);
      process.exit(1);
    }

    const name = argv.name || `${service.name} (${env})`;
    const comment = `Created by fastly-dev. Copy of ${service.service_id}`;

    if (argv.dryRun) {
      console.log('\nDry run. Not making changes. Would otherwise:');
      console.log(` - Create service '${name}' with comment '${comment}'`);
      console.log(' - Upload service configuration to version 1 of new service');
      return;
    }

    // set initial version comment
    service.comment = `Initial version, copy of ${service.service_id} at version ${service.version}`;

    const newId = await mgr.createService({
      name,
      comment,
      service,
    });

    // update config file with new service id for environment
    global.config.set(`env.${env}.id`, newId).write();
    console.debug(`\nUpdated ${global.config.file()} with service id for ${env}.`);
  },
};
