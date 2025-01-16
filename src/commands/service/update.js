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

import { execSync } from 'node:child_process';
import { FastlyServiceManager } from '../../fastly/service-mgr.js';
import { readService } from '../../fastly/store.js';
import { SHARED_OPTS } from '../../opts.js';

function getLastGitCommit() {
  try {
    return execSync('git log -1 --pretty=%B').toString().trim();
  } catch (_ignore) {
    return undefined;
  }
}

export default {
  command: 'update',
  aliases: ['up'],
  describe: 'Update Fastly service with local configuration',
  builder: (yargs) => {
    // biome-ignore format: normal yargs style
    yargs
      .usage('$0 service update')
      .usage('')
      .usage('Update Fastly service with configuration from current folder.')
      .usage('This will create a new service version by default.')
      .usage('')
      .usage('Alias: up');

    // biome-ignore format: normal yargs style
    yargs
      .options(SHARED_OPTS.apiToken)
      .options(SHARED_OPTS.serviceId)
      .options({
        env: {
          alias: 'e',
          type: 'string',
          describe: 'Environment to update',
          default: 'production',
        },
        comment: {
          type: 'string',
          describe: 'Comment for version. Defaults to last git commit (if available) or a default message.',
        },
        version: {
          alias: 'V',
          type: 'string',
          describe: 'Service version to overwrite (must exist)',
        },
        activate: {
          alias: 'a',
          type: 'boolean',
          describe: 'Activate service version after update',
        }
      });
  },
  handler: async (argv) => {
    const { env } = argv;

    let serviceId;

    if (argv.serviceId) {
      // explicitly provided service id takes precedence
      serviceId = argv.serviceId;
    } else {
      // lookup service id from environment in configuration file
      serviceId = global.config.env?.[env]?.service_id;

      if (!serviceId) {
        console.error(`Error: No service ID found for environment '${env}' in configuration file.`);
        console.error("       Use 'fastly-dev service create' to create a new service or environment.");
        process.exit(1);
      }
    }

    const service = readService(env);

    const mgr = new FastlyServiceManager(argv.apiToken);

    // update existing service with new version
    // set new version comment
    service.comment =
      argv.comment ||
      getLastGitCommit() ||
      `Added by ${os.userInfo().username} via fastly-dev at ${new Date().toLocaleString('en-US')}`;

    if (argv.dryRun) {
      console.log('\nDry run. Not making changes. Would otherwise:');
      if (argv.version) {
        console.log(` - Update existing service version ${argv.version}`);
      } else {
        const newVersion = await mgr.getNextVersion(serviceId);
        console.log(` - Create new version ${newVersion} of service ${serviceId}`);
      }
      console.log(` - Set comment: '${service.comment}'`);
      return;
    }

    await mgr.updateServiceVersion({
      serviceId,
      service,
      version: argv.version,
      activate: argv.activate,
    });
  },
};
