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

import { SHARED_ARGS } from '../opts.js';
import { detectSecrets } from '../secrets/secrets.js';
import { FastlyService, LOG_TYPES } from '../service.js';

function redactSecrets(fastlyService, config) {
  const service = fastlyService.service;
  // logging: redact sensitive data
  for (const type of Object.keys(LOG_TYPES)) {
    const { secretField } = LOG_TYPES[type];
    if (Array.isArray(service[type])) {
      for (const logConfig of service[type]) {
        // TODO: this overwrites any env vars set locally (see FastlyService.upload`
        logConfig[secretField] = '[REDACTED]';
        console.warn(
          `Warning: Redacted ${type} logging field '${secretField}'. Consider replacing with $ENV_VAR_SECRET.`,
        );
      }
    }
  }

  // TODO: remove configurable redaction feature?
  // redact configurable dictionary items
  for (const dict of service.dictionaries) {
    for (const item of dict.items) {
      // redact sensitive dictionary items
      if (config?.secrets?.redact?.dict_keys?.includes(item.item_key)) {
        console.warn(`- Redacting dictionary item ${item.item_key} = ${item.item_value}`);
        item.item_value = '[REDACTED]';
      }
    }
  }
}

export default {
  command: 'fetch [service-id]',
  describe: 'Download service config',
  builder: (yargs) => {
    yargs
      .usage('$0 fetch [service-id]')
      .usage('')
      .usage('Fetch service config from Fastly and write to current folder.');

    yargs.positional('service-id', SHARED_ARGS.serviceId);
  },
  handler: async (argv) => {
    const { config } = argv;

    const storedServiceId = config?.env?.production?.service_id;

    if (argv.serviceId && storedServiceId && argv.serviceId !== storedServiceId) {
      console.error(
        `Error: Service ID mismatch. Found ${storedServiceId} in fastly-dev.yaml, but provided ${argv.serviceId} as argument.`,
      );
      process.exit(1);
    }
    if (!(argv.serviceId || storedServiceId)) {
      console.error(
        'Error: No service ID provided as argument or found in env.production.service_id in fastly-dev.yaml.',
      );
      process.exit(1);
    }

    const serviceId = storedServiceId || argv.serviceId;

    const svc = new FastlyService(argv.apiToken);
    try {
      await svc.download(serviceId);

      redactSecrets(svc, config);
      detectSecrets(svc, config?.secrets);

      if (argv.dryRun) {
        console.log();
        console.log('Dry run. Not writing service config to disk.');
        return;
      }

      svc.write();

      // update config file with service id
      if (serviceId !== storedServiceId) {
        config.set('env.production.service_id', serviceId).write();
        console.log(`Updated ${config.file()} with service id for production.`);
      }
    } finally {
      await svc.dispose();
    }
  },
};
