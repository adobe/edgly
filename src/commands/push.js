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
import chalk from 'chalk';
import { SHARED_OPTS } from '../opts.js';
import { FastlyService } from '../service.js';

function adjustServiceForEnvironment(fastlyService, env) {
  const { service } = fastlyService;

  console.log();
  console.log(`Adjusting domains for environment '${env}'...`);
  const unmappedDomains = [];
  const envDomains = global.config.env?.[env]?.domains;

  for (const domain of service.domains) {
    const newDomain = envDomains?.[domain.name];
    if (newDomain && newDomain !== domain.name) {
      console.log(`- ${domain.name} -> ${newDomain}`);
      domain.name = newDomain;
    } else {
      unmappedDomains.push(domain.name);
    }
  }

  if (unmappedDomains.length > 0) {
    console.error();
    console.error(
      chalk.red(
        `Error: The following domains are not mapped to a different domain in env.${env}.domains in fastly-dev.yaml:`,
      ),
    );
    console.error();
    for (const domain of unmappedDomains) {
      console.error(chalk.red(`       ${domain}`));
    }
    process.exit(1);
  }

  // TODO: replace domain in VCL snippets? service name? logging?
}

function getLastGitCommit() {
  try {
    return execSync('git log -1 --pretty=%B').toString().trim();
  } catch (_ignore) {
    return undefined;
  }
}

export default {
  command: 'push',
  describe: 'Upload service config',
  builder: (yargs) => {
    // biome-ignore format: normal yargs style
    yargs
      .usage('$0 push')
      .usage('')
      .usage('Push service configuration from current folder to Fastly.');

    // biome-ignore format: normal yargs style
    yargs
      .options(SHARED_OPTS.environment)
      .options({
        create: {
          type: 'boolean',
          describe: 'Create a new service',
        }
      })
      .options({
        name: {
          type: 'string',
          describe: 'Name for new service',
        }
      })
      .options({
        comment: {
          type: 'string',
          describe: 'Comment for new service version. Defaults to last git commit message (if available) or user and date.',
        }
      })
      .options({
        version: {
          alias: 'v',
          type: 'string',
          describe: 'Service version to overwrite',
        }
      });
  },
  handler: async (argv) => {
    const { env, create } = argv;

    const serviceId = global.config.env?.[env]?.service_id;

    if (create && serviceId) {
      console.error(
        `Error: Cannot create new service. Existing service ID found for env '${env}': ${serviceId}.`,
      );
      console.error(
        `       To force create a new service, remove env.${env}.service_id in fastly-dev.yaml.`,
      );
      process.exit(1);
    } else if (!(create || serviceId)) {
      console.error(
        `Error: No service ID for '${env}' found in env.${env}.service_id in fastly-dev.yaml.`,
      );
      console.error('       To create a new service add the --create option.');
      process.exit(1);
    }

    const svc = new FastlyService(argv.apiToken);
    try {
      svc.read();

      if (env !== 'production') {
        await adjustServiceForEnvironment(svc, env);
      }

      if (create) {
        // create new service
        const name = argv.name || `${svc.service.name} (${env})`;
        const serviceCommment = `Created by fastly-dev. Copy of ${svc.id}`;

        if (argv.dryRun) {
          console.log();
          console.log('Dry run. Not making changes. Would do:');
          console.log(` - Create service '${name}' with comment '${serviceCommment}'`);
          console.log(' - Upload service configuration to version 1 of new service');
          return;
        }

        svc.service.comment = `Initial version, copy of ${svc.id} at version ${svc.service.version}`;

        const { id, version } = await svc.create(name, serviceCommment);

        // update config file with new service id for environment
        global.config.set(`env.${env}.service_id`, id).write();
        console.log(`Updated ${global.config.file()} with service id for ${env}.`);

        // upload service config to new service
        await svc.upload(id, version);
      } else if (serviceId) {
        svc.service.comment =
          argv.comment ||
          getLastGitCommit() ||
          `fastly-dev push by ${os.userInfo().username} at ${new Date().toLocaleString('en-US')}`;

        if (argv.dryRun) {
          console.log();
          console.log('Dry run. Not making changes. Would otherwise:');
          if (argv.version) {
            console.log(` - Upload service configuration to version ${argv.version}`);
          } else {
            const newVersion = await svc.nextVersion(serviceId);
            console.log(` - Create empty new version ${newVersion} of service ${serviceId}`);
            console.log(` - Upload service configuration to version ${newVersion}`);
          }
          console.log(` - Set comment: '${svc.service.comment}'`);
          return;
        }

        const version = argv.version || (await svc.newVersion(serviceId));

        console.log(`New version: ${version}`);

        // update existing service id with config
        await svc.upload(serviceId, version);
      }
    } finally {
      await svc.dispose();
    }
  },
};
