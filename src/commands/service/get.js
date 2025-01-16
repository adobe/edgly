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
import { writeService } from '../../fastly/store.js';
import { SHARED_OPTS, override } from '../../opts.js';
import { detectSecrets } from '../../secrets/secrets.js';

export default {
  command: 'get',
  describe: 'Download Fastly service to local configuration',
  builder: (yargs) => {
    yargs
      .usage('$0 service get')
      .usage('')
      .usage('Retrieve service configuration from Fastly and write to current folder.');

    yargs
      .options(SHARED_OPTS.apiToken)
      .options(
        override(SHARED_OPTS.env, {
          describe: 'Environment to pull from',
        }),
      )
      .options(SHARED_OPTS.id)
      .options(
        override(SHARED_OPTS.version, {
          describe: 'Service version to retrieve. Defaults to latest version.  Use "active" for the active version.',
        }),
      )
      .options(SHARED_OPTS.secretsMode);
  },
  handler: async (argv) => {
    let id;

    if (argv.id) {
      // explicitly provided service id takes precedence
      if (argv.env) {
        console.warn('Warning: Ignoring --env when service ID is provided.');
      } else {
        const prodId = global.config.env?.production?.id;
        if (prodId && id !== prodId) {
          console.warn('Warning: Pulling from a different non-production service id.');
          console.warn(`         Production is ${prodId} (set in configuration).`);
        }
      }
      id = argv.id;
    } else {
      const env = argv.env || 'production';

      // lookup service id from environment in configuration file
      id = global.config.env?.[env]?.id;

      if (!id) {
        console.error(`Error: No service ID found for environment '${env}' in configuration file.`);
        process.exit(1);
      }
    }

    const mgr = new FastlyServiceManager(argv.apiToken);
    const service = await mgr.getService(id, argv.version);

    detectSecrets(service, argv.secretsMode);

    if (argv.dryRun) {
      console.log('\nDry run. Not writing service configuration to disk.');
      return;
    }

    writeService(service);

    console.debug(`\nSuccessfully written ${service.service_id} v${service.version}.`);
  },
};
