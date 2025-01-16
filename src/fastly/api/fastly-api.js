/*
 * Copyright 2021 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */

import { fetch, reset } from '@adobe/fetch';
import { FormData } from 'formdata-node';

const PRODUCTS = [
  'brotli_compression',
  'domain_inspector',
  'fanout',
  'image_optimizer',
  'origin_inspector',
  'websockets',
  'bot_management',
  'ngwaf',
];

const removeProperties = (obj, toRemove) =>
  Object.keys(obj)
    .filter((key) => !toRemove.includes(key))
    .reduce((target, key) => {
      target[key] = obj[key];
      return target;
    }, {});

function removeEmptyStrings(properties, toRemove) {
  const result = {};
  for (const key of Object.keys(properties)) {
    if (properties[key] !== '' && !toRemove.includes(key)) {
      result[key] = properties[key];
    }
  }
  return result;
}

function toFormData(properties) {
  const body = new FormData();
  for (const key of Object.keys(properties)) {
    if (properties[key] !== null) {
      if (typeof properties[key] === 'string') {
        body.append(key, properties[key]);
      } else {
        body.append(key, String(properties[key]));
      }
    }
  }
  return body;
}

export class FastlyApi {
  constructor(authToken) {
    this.authToken = authToken;
    this.endpoint = 'https://api.fastly.com';
  }

  async dispose() {
    return await reset();
  }

  fetch(url, options) {
    const [method, path] = url.split(' ', 2);
    return fetch(`${this.endpoint}${path}`, {
      method,
      headers: { 'Fastly-Key': this.authToken },
      ...options,
    });
  }

  async latestVersion(serviceId) {
    // determine latest service version
    const resp = await this.fetch(`GET /service/${serviceId}/version`);
    if (!resp.ok) {
      throw new Error(`Failed to determine latest version of ${serviceId}: ${resp.status} - ${await resp.text()}`);
    }
    return (await resp.json()).map(({ number }) => number).pop();
  }

  async activeVersion(serviceId) {
    // determine active service version
    const resp = await this.fetch(`GET /service/${serviceId}/version`);
    if (!resp.ok) {
      throw new Error(`Failed to determine active version of ${serviceId}: ${resp.status} - ${await resp.text()}`);
    }
    return (await resp.json())
      .filter(({ active }) => active)
      .map(({ number }) => number)
      .pop();
  }

  async createVersion(serviceId) {
    const resp = await this.fetch(`POST /service/${serviceId}/version`);
    if (!resp.ok) {
      throw new Error(`Failed to create version: ${resp.status} - ${await resp.text()}`);
    }
    const { number: newVersionId } = await resp.json();
    return newVersionId;
  }

  async cloneVersion(serviceId, versionId) {
    const resp = await this.fetch(`PUT /service/${serviceId}/version/${versionId}/clone`);
    if (!resp.ok) {
      throw new Error(`Failed to clone version ${versionId}: ${resp.status} - ${await resp.text()}`);
    }
    const { number: newVersionId } = await resp.json();
    return newVersionId;
  }

  // options: https://github.com/fastly/fastly-js/blob/main/docs/VersionApi.md#updateServiceVersion
  async updateVersion(serviceId, versionId, options) {
    const http = `PUT /service/${serviceId}/version/${versionId}`;
    const body = toFormData(options);
    const resp = await this.fetch(http, { body });
    if (!resp.ok) {
      throw new Error(`Failed to update version ${versionId}: ${resp.status} - ${await resp.text()}`);
    }
    return resp.json();
  }

  async activateVersion(serviceId, versionId) {
    const resp = await this.fetch(`PUT /service/${serviceId}/version/${versionId}/activate`);
    if (!resp.ok) {
      throw new Error(`Failed to activate version ${versionId}: ${resp.status} - ${await resp.text()}`);
    }
    return resp.json();
  }

  async deactivateVersion(serviceId, versionId) {
    const resp = await this.fetch(`PUT /service/${serviceId}/version/${versionId}/deactivate`);
    if (!resp.ok) {
      throw new Error(`Failed to deactivate version ${versionId}: ${resp.status} - ${await resp.text()}`);
    }
    return resp.json();
  }

  async serviceDetails(serviceId, versionId) {
    const resp = await this.fetch(`GET /service/${serviceId}/details${versionId ? `?version=${versionId}` : ''}`);
    if (!resp.ok) {
      throw new Error(`Failed to retrieve details of service ${serviceId}: ${resp.status} - ${await resp.text()}`);
    }
    return resp.json();
  }

  async backends(serviceId, versionId) {
    const resp = await this.fetch(`GET /service/${serviceId}/version/${versionId}/backend`);
    if (!resp.ok) {
      throw new Error(
        `Failed to list backends of ${serviceId} version ${versionId}: ${resp.status} - ${await resp.text()}`,
      );
    }
    return (await resp.json()).map((backend) =>
      removeProperties(backend, [
        'created_at',
        'deleted_at',
        'updated_at',
        'service_id',
        'version',
        'client_cert',
        'locked',
      ]),
    );
  }

  async acls(serviceId, versionId) {
    // get ACL
    const resp = await this.fetch(`GET /service/${serviceId}/version/${versionId}/acl`);
    if (!resp.ok) {
      throw new Error(
        `Failed to list ACLs of ${serviceId} version ${versionId}: ${resp.status} - ${await resp.text()}`,
      );
    }
    return (await resp.json()).map((domain) =>
      removeProperties(domain, ['created_at', 'deleted_at', 'updated_at', 'service_id', 'version']),
    );
  }

  async domains(serviceId, versionId) {
    const resp = await this.fetch(`GET /service/${serviceId}/version/${versionId}/domain`);
    if (!resp.ok) {
      throw new Error(
        `Failed to list domains of ${serviceId} version ${versionId}: ${resp.status} - ${await resp.text()}`,
      );
    }
    return (await resp.json()).map((domain) =>
      removeProperties(domain, ['created_at', 'deleted_at', 'updated_at', 'service_id', 'version']),
    );
  }

  async conditions(serviceId, versionId) {
    const resp = await this.fetch(`GET /service/${serviceId}/version/${versionId}/condition`);
    if (!resp.ok) {
      throw new Error(
        `Failed to list conditions of ${serviceId} version ${versionId}: ${resp.status} - ${await resp.text()}`,
      );
    }
    return (await resp.json()).map((condition) =>
      removeProperties(condition, ['created_at', 'deleted_at', 'updated_at', 'service_id', 'version']),
    );
  }

  async dictionary(serviceId, versionId, dictName) {
    const resp = await this.fetch(`GET /service/${serviceId}/version/${versionId}/dictionary/${dictName}`);
    if (!resp.ok) {
      throw new Error(
        `Failed to get dictionary ${dictName} of ${serviceId} version ${versionId}: ${resp.status} - ${await resp.text()}`,
      );
    }
    const dict = await resp.json();
    return removeProperties(dict, ['created_at', 'deleted_at', 'updated_at', 'service_id', 'version']);
  }

  async dictionaryInfo(serviceId, versionId, dictionaryId) {
    const resp = await this.fetch(`GET /service/${serviceId}/version/${versionId}/dictionary/${dictionaryId}/info`);
    if (!resp.ok) {
      throw new Error(
        `Failed to get dictionary info for ${dictionaryId} of ${serviceId} version ${versionId}: ${resp.status} - ${await resp.text()}`,
      );
    }
    const dict = await resp.json();
    return removeProperties(dict, ['created_at', 'deleted_at', 'updated_at', 'service_id', 'version']);
  }

  async dictionaries(serviceId, versionId) {
    const resp = await this.fetch(`GET /service/${serviceId}/version/${versionId}/dictionary`);
    if (!resp.ok) {
      throw new Error(
        `Failed to list dictionaries of ${serviceId} version ${versionId}: ${resp.status} - ${await resp.text()}`,
      );
    }
    return (await resp.json()).map((dict) =>
      removeProperties(dict, ['created_at', 'deleted_at', 'updated_at', 'service_id', 'version']),
    );
  }

  async aclEntries(serviceId, aclId) {
    const resp = await this.fetch(`GET /service/${serviceId}/acl/${aclId}/entries`);
    if (!resp.ok) {
      throw new Error(`Failed to list entries of ACL ${aclId} of ${serviceId}: ${resp.status} - ${await resp.text()}`);
    }
    return (await resp.json()).map((entry) =>
      removeProperties(entry, ['created_at', 'updated_at', 'service_id', 'acl_id']),
    );
  }

  async dictionaryItems(serviceId, dictionaryId, pageSize = 1000, page = 1) {
    const resp = await this.fetch(
      `GET /service/${serviceId}/dictionary/${dictionaryId}/items?per_page=${pageSize}&page=${page}`,
    );
    if (!resp.ok) {
      throw new Error(
        `Failed to list items of dictionary ${dictionaryId} of ${serviceId}: ${resp.status} - ${await resp.text()}`,
      );
    }
    return (await resp.json()).map((entry) =>
      removeProperties(entry, ['created_at', 'deleted_at', 'updated_at', 'service_id', 'dictionary_id']),
    );
  }

  async generatedVcl(serviceId, versionId) {
    const resp = await this.fetch(`GET /service/${serviceId}/version/${versionId}/generated_vcl`);
    if (!resp.ok) {
      throw new Error(`Failed to get generated VCL of ${serviceId}: ${resp.status} - ${await resp.text()}`);
    }
    return (await resp.json()).content;
  }

  async updateDict(serviceId, versionId, dictName, entries, writeOnly, batchSize = 500) {
    // get dict
    let resp = await this.fetch(`GET /service/${serviceId}/version/${versionId}/dictionary/${dictName}`);
    if (!resp.ok) {
      // create dict
      const body = toFormData({
        name: dictName,
        // biome-ignore lint/style/useNamingConvention: fastly json naming
        write_only: String(writeOnly),
      });
      resp = await this.fetch(`POST /service/${serviceId}/version/${versionId}/dictionary`, { body });
      if (!resp.ok) {
        throw new Error(`Failed to create dictionary '${dictName}': ${resp.status} - ${await resp.text()}`);
      }
    }
    const { id } = await resp.json();

    // biome-ignore lint/style/useNamingConvention: fastly json naming
    const items = Object.entries(entries).map(([key, value]) => ({ op: 'upsert', item_key: key, item_value: value }));

    while (items.length > 0) {
      const body = { items: items.splice(0, batchSize) };
      resp = await this.fetch(`PATCH /service/${serviceId}/dictionary/${id}/items`, { body });
      if (!resp.ok) {
        throw new Error(`Failed to patch dictionary '${dictName}': ${resp.status} - ${await resp.text()}`);
      }
    }
  }

  async purgeDict(serviceId, versionId, dictName, batchSize = 500) {
    // get dict
    let resp = await this.fetch(`GET /service/${serviceId}/version/${versionId}/dictionary/${dictName}`);
    if (!resp.ok) {
      throw new Error(`Failed to get dictionary '${dictName}': ${resp.status} - ${await resp.text()}`);
    }
    const { id } = await resp.json();
    const entries = await this.dictionaryItems(serviceId, id);

    const items = entries.map(({ item_key }) => ({ op: 'delete', item_key }));

    while (items.length > 0) {
      const body = { items: items.splice(0, batchSize) };
      resp = await this.fetch(`PATCH /service/${serviceId}/dictionary/${id}/items`, { body });
      if (!resp.ok) {
        throw new Error(`Failed to patch dictionary '${dictName}': ${resp.status} - ${await resp.text()}`);
      }
    }
  }

  async createService(name, type = 'vcl', comment = '') {
    const body = toFormData({ name, type, comment });
    const resp = await this.fetch('POST /service', { body });
    if (!resp.ok) {
      throw new Error(`Failed to create service '${name}': ${resp.status} - ${await resp.text()}`);
    }
    return resp.json();
  }

  async addDomain(serviceId, versionId, name, comment) {
    const body = toFormData({ name, comment });
    const resp = await this.fetch(`POST /service/${serviceId}/version/${versionId}/domain`, { body });
    if (!resp.ok) {
      throw new Error(`Failed to add domain '${name}': ${resp.status} - ${await resp.text()}`);
    }
    return resp.json();
  }

  async createCondition(serviceId, versionId, condition) {
    const body = toFormData(condition);
    const resp = await this.fetch(`POST /service/${serviceId}/version/${versionId}/condition`, { body });
    if (!resp.ok) {
      throw new Error(`Failed to create condition '${condition.name}': ${resp.status} - ${await resp.text()}`);
    }
    return resp.json();
  }

  async createSnippet(serviceId, versionId, snippet) {
    const body = toFormData(snippet);
    const resp = await this.fetch(`POST /service/${serviceId}/version/${versionId}/snippet`, { body });
    if (!resp.ok) {
      throw new Error(`Failed to create snippet '${snippet.name}': ${resp.status} - ${await resp.text()}`);
    }
    return resp.json();
  }

  async updateSettings(serviceId, versionId, settings) {
    const http = `PUT /service/${serviceId}/version/${versionId}/settings`;
    const body = toFormData(removeEmptyStrings(settings, ['general.default_pci']));
    const resp = await this.fetch(http, { body });
    if (!resp.ok) {
      throw new Error(
        `Failed to update settings of ${serviceId} version ${versionId}: ${resp.status} - ${await resp.text()}`,
      );
    }
    return resp.json();
  }

  async createBackend(serviceId, versionId, backend) {
    const http = `POST /service/${serviceId}/version/${versionId}/backend`;
    const resp = await this.fetch(http, { body: toFormData(backend) });
    if (!resp.ok) {
      throw new Error(`Failed to create backend '${backend.name}': ${resp.status} - ${await resp.text()}`);
    }
    return resp.json();
  }

  async createAcl(serviceId, versionId, aclName) {
    const http = `POST /service/${serviceId}/version/${versionId}/acl`;
    const resp = await this.fetch(http, { body: toFormData({ name: aclName }) });
    if (!resp.ok) {
      throw new Error(`Failed to create ACL '${aclName}': ${resp.status} - ${await resp.text()}`);
    }
    return resp.json();
  }

  async updateAcl(serviceId, versionId, aclName, entries, batchSize = 500) {
    // get ACL
    let resp = await this.fetch(`GET /service/${serviceId}/version/${versionId}/acl/${aclName}`);
    if (!resp.ok) {
      // create ACL
      resp = await this.fetch(`POST /service/${serviceId}/version/${versionId}/acl`, {
        body: toFormData({ name: aclName }),
      });
      if (!resp.ok) {
        throw new Error(`Failed to create ACL '${aclName}': ${resp.status} - ${await resp.text()}`);
      }
    }
    const { id } = await resp.json();
    const items = entries.map(({ ip, subnet, negated, comment }) => ({
      op: 'create',
      ip,
      subnet,
      negated,
      comment,
    }));

    while (items.length > 0) {
      const body = { entries: items.splice(0, batchSize) };
      resp = await this.fetch(`PATCH /service/${serviceId}/acl/${id}/entries`, { body });
      if (!resp.ok) {
        throw new Error(`Failed to patch ACL '${aclName}': ${resp.status} - ${await resp.text()}`);
      }
    }
  }

  async addLogEndpoint(serviceId, versionId, type, name, properties) {
    const http = `POST /service/${serviceId}/version/${versionId}/logging/${type}`;
    const body = toFormData(removeEmptyStrings(properties, ['response_condition']));
    const resp = await this.fetch(http, { body });
    if (!resp.ok) {
      throw new Error(
        `Failed to add ${type} log endpoint ${name} of ${serviceId} version ${versionId}: ${resp.status} - ${await resp.text()}`,
      );
    }
    return resp.json();
  }

  async updateLogEndpoint(serviceId, versionId, type, name, properties) {
    const http = `PUT /service/${serviceId}/version/${versionId}/logging/${type}/${name}`;
    const body = toFormData(removeEmptyStrings(properties, ['response_condition']));
    const resp = await this.fetch(http, { body });
    if (!resp.ok) {
      throw new Error(
        `Failed to update ${type} log endpoint ${name} of ${serviceId} version ${versionId}: ${resp.status} - ${await resp.text()}`,
      );
    }
    return resp.json();
  }

  async enabledProducts(serviceId) {
    const products = {};
    for (const product of PRODUCTS) {
      const http = `GET /enabled-products/v1/${product}/services/${serviceId}`;
      const resp = await this.fetch(http);
      if (resp.status !== 200 && resp.status !== 400) {
        throw new Error(
          `Failed to retrieve product status for ${product} on service ${serviceId}: ${resp.status} - ${await resp.text()}`,
        );
      }
      const result = await resp.json();
      products[product] = result?.product?.id === product;
    }
    return products;
  }

  async enableProduct(serviceId, product) {
    const http = `PUT /enabled-products/v1/${product}/services/${serviceId}`;
    const resp = await this.fetch(http);
    if (!resp.ok) {
      throw new Error(
        `Failed to enable product ${product} on service ${serviceId}: ${resp.status} - ${await resp.text()}`,
      );
    }
    return resp.json();
  }

  async updateImageOptimizerSettings(serviceId, versionId, settings) {
    const http = `PATCH /service/${serviceId}/version/${versionId}/image_optimizer_default_settings`;
    const resp = await this.fetch(http, { body: settings });
    if (!resp.ok) {
      throw new Error(
        `Failed to update Image Optimizer settings on service ${serviceId} version ${versionId}: ${resp.status} - ${await resp.text()}`,
      );
    }
    return resp.json();
  }

  async createVcl(serviceId, versionId, name, content, main = false) {
    const http = `POST /service/${serviceId}/version/${versionId}/vcl`;
    const body = toFormData({ name, content, main });
    const resp = await this.fetch(http, { body });
    if (!resp.ok) {
      throw new Error(
        `Failed to create VCL ${name} on service ${serviceId} version ${versionId}: ${resp.status} - ${await resp.text()}`,
      );
    }
    return resp.json();
  }

  async updateVcl(serviceId, versionId, name, content, main = false) {
    const http = `PUT /service/${serviceId}/version/${versionId}/vcl/${name}`;
    const body = toFormData({ content, main });
    const resp = await this.fetch(http, { body });
    if (!resp.ok) {
      throw new Error(
        `Failed to update VCL ${name} on service ${serviceId} version ${versionId}: ${resp.status} - ${await resp.text()}`,
      );
    }
    return resp.json();
  }

  async createHeader(serviceId, versionId, header) {
    const http = `POST /service/${serviceId}/version/${versionId}/header`;
    const resp = await this.fetch(http, { body: toFormData(header) });
    if (!resp.ok) {
      throw new Error(
        `Failed to create header ${header.name} on service ${serviceId} version ${versionId}: ${resp.status} - ${await resp.text()}`,
      );
    }
    return resp.json();
  }

  async addRequestSetting(serviceId, versionId, requestSetting) {
    const http = `POST /service/${serviceId}/version/${versionId}/request_settings`;
    const resp = await this.fetch(http, { body: toFormData(requestSetting) });
    if (!resp.ok) {
      throw new Error(
        `Failed to add request setting ${requestSetting.name} on service ${serviceId} version ${versionId}: ${resp.status} - ${await resp.text()}`,
      );
    }
    return resp.json();
  }
}
