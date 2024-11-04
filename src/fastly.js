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

/* eslint-disable no-console */
/* eslint-disable camelcase */

import { fetch, reset } from '@adobe/fetch';
import { FormData } from 'formdata-node';

const removeProperties = (obj, toRemove) => Object.keys(obj)
  .filter((key) => !toRemove.includes(key))
  .reduce((target, key) => {
    // eslint-disable-next-line no-param-reassign
    target[key] = obj[key];
    return target;
  }, {});

class Fastly {
  constructor(authToken) {
    this.authToken = authToken;
    this.endpoint = 'https://api.fastly.com';
  }

  // eslint-disable-next-line class-methods-use-this
  async dispose() {
    return reset();
  }

  async latestVersion(serviceId) {
    // determine latest service version
    const resp = await fetch(
      `${this.endpoint}/service/${serviceId}/version`,
      { headers: { 'Fastly-Key': this.authToken } },
    );
    if (!resp.ok) {
      throw new Error(`Failed to determine latest version of ${serviceId}: ${resp.status} - ${await resp.text()}`);
    }
    return (await resp.json())
      .map(({ number }) => number)
      .pop();
  }

  async activeVersion(serviceId) {
    // determine active service version
    const resp = await fetch(
      `${this.endpoint}/service/${serviceId}/version`,
      { headers: { 'Fastly-Key': this.authToken } },
    );
    if (!resp.ok) {
      throw new Error(`Failed to determine active version of ${serviceId}: ${resp.status} - ${await resp.text()}`);
    }
    return (await resp.json())
      .filter(({ active }) => active)
      .map(({ number }) => number)
      .pop();
  }

  async cloneVersion(serviceId, versionId, comment) {
    const method = 'PUT';
    let resp = await fetch(
      `${this.endpoint}/service/${serviceId}/version/${versionId}/clone`,
      { method, headers: { 'Fastly-Key': this.authToken } },
    );
    if (!resp.ok) {
      throw new Error(`Failed to clone version ${versionId}: ${resp.status} - ${await resp.text()}`);
    }
    const { number: newVersionId } = await resp.json();
    if (typeof comment === 'string' && comment.length) {
      const body = new FormData();
      body.append('comment', comment);
      resp = await fetch(
        `${this.endpoint}/service/${serviceId}/version/${newVersionId}`,
        { method, body, headers: { 'Fastly-Key': this.authToken } },
      );
      if (!resp.ok) {
        throw new Error(`Failed to set comment '${comment}' of cloned version ${newVersionId}: ${resp.status} - ${await resp.text()}`);
      }
    }
    return newVersionId;
  }

  async activateVersion(serviceId, versionId) {
    const method = 'PUT';
    const resp = await fetch(
      `${this.endpoint}/service/${serviceId}/version/${versionId}/activate`,
      { method, headers: { 'Fastly-Key': this.authToken } },
    );
    if (!resp.ok) {
      throw new Error(`Failed to activate version ${versionId}: ${resp.status} - ${await resp.text()}`);
    }
    return versionId;
  }

  async serviceDetails(serviceId) {
    const resp = await fetch(
      `${this.endpoint}/service/${serviceId}/details`,
      { headers: { 'Fastly-Key': this.authToken } },
    );
    if (!resp.ok) {
      throw new Error(`Failed to retrieve details of service ${serviceId}: ${resp.status} - ${await resp.text()}`);
    }
    return resp.json();
  }

  async backends(serviceId, versionId) {
    const resp = await fetch(
      `${this.endpoint}/service/${serviceId}/version/${versionId}/backend`,
      { headers: { 'Fastly-Key': this.authToken } },
    );
    if (!resp.ok) {
      throw new Error(`Failed to list backends of ${serviceId} version ${versionId}: ${resp.status} - ${await resp.text()}`);
    }
    return (await resp.json())
      .map((backend) => removeProperties(backend, ['created_at', 'deleted_at', 'updated_at', 'service_id', 'version', 'client_cert', 'locked']));
  }

  async acls(serviceId, versionId) {
    // get ACL
    const resp = await fetch(
      `${this.endpoint}/service/${serviceId}/version/${versionId}/acl`,
      { headers: { 'Fastly-Key': this.authToken } },
    );
    if (!resp.ok) {
      throw new Error(`Failed to list ACLs of ${serviceId} version ${versionId}: ${resp.status} - ${await resp.text()}`);
    }
    return (await resp.json())
      .map((domain) => removeProperties(domain, ['created_at', 'deleted_at', 'updated_at', 'service_id', 'version']));
  }

  async domains(serviceId, versionId) {
    const resp = await fetch(
      `${this.endpoint}/service/${serviceId}/version/${versionId}/domain`,
      { headers: { 'Fastly-Key': this.authToken } },
    );
    if (!resp.ok) {
      throw new Error(`Failed to list domains of ${serviceId} version ${versionId}: ${resp.status} - ${await resp.text()}`);
    }
    return (await resp.json())
      .map((domain) => removeProperties(domain, ['created_at', 'deleted_at', 'updated_at', 'service_id', 'version']));
  }

  async conditions(serviceId, versionId) {
    const resp = await fetch(
      `${this.endpoint}/service/${serviceId}/version/${versionId}/condition`,
      { headers: { 'Fastly-Key': this.authToken } },
    );
    if (!resp.ok) {
      throw new Error(`Failed to list conditions of ${serviceId} version ${versionId}: ${resp.status} - ${await resp.text()}`);
    }
    return (await resp.json())
      .map((condition) => removeProperties(condition, ['created_at', 'deleted_at', 'updated_at', 'service_id', 'version']));
  }

  async dictionary(serviceId, versionId, dictName) {
    const resp = await fetch(
      `${this.endpoint}/service/${serviceId}/version/${versionId}/dictionary/${dictName}`,
      { headers: { 'Fastly-Key': this.authToken } },
    );
    if (!resp.ok) {
      throw new Error(`Failed to get dictionary ${dictName} of ${serviceId} version ${versionId}: ${resp.status} - ${await resp.text()}`);
    }
    const dict = await resp.json();
    return removeProperties(dict, ['created_at', 'deleted_at', 'updated_at', 'service_id', 'version']);
  }

  async dictionaryInfo(serviceId, versionId, dictionaryId) {
    const resp = await fetch(
      `${this.endpoint}/service/${serviceId}/version/${versionId}/dictionary/${dictionaryId}/info`,
      { headers: { 'Fastly-Key': this.authToken } },
    );
    if (!resp.ok) {
      throw new Error(`Failed to get dictionary info for ${dictionaryId} of ${serviceId} version ${versionId}: ${resp.status} - ${await resp.text()}`);
    }
    const dict = await resp.json();
    return removeProperties(dict, ['created_at', 'deleted_at', 'updated_at', 'service_id', 'version']);
  }

  async dictionaries(serviceId, versionId) {
    const resp = await fetch(
      `${this.endpoint}/service/${serviceId}/version/${versionId}/dictionary`,
      { headers: { 'Fastly-Key': this.authToken } },
    );
    if (!resp.ok) {
      throw new Error(`Failed to list dictionaries of ${serviceId} version ${versionId}: ${resp.status} - ${await resp.text()}`);
    }
    return (await resp.json())
      .map((dict) => removeProperties(dict, ['created_at', 'deleted_at', 'updated_at', 'service_id', 'version']));
  }

  async aclEntries(serviceId, aclId) {
    const resp = await fetch(
      `${this.endpoint}/service/${serviceId}/acl/${aclId}/entries`,
      { headers: { 'Fastly-Key': this.authToken } },
    );
    if (!resp.ok) {
      throw new Error(`Failed to list entries of ACL ${aclId} of ${serviceId}: ${resp.status} - ${await resp.text()}`);
    }
    return (await resp.json())
      .map((entry) => removeProperties(entry, ['created_at', 'updated_at', 'service_id', 'acl_id']));
  }

  async dictionaryItems(serviceId, dictionaryId, pageSize = 1000, page = 1) {
    const resp = await fetch(
      `${this.endpoint}/service/${serviceId}/dictionary/${dictionaryId}/items?per_page=${pageSize}&page=${page}`,
      { headers: { 'Fastly-Key': this.authToken } },
    );
    if (!resp.ok) {
      throw new Error(`Failed to list items of dictionary ${dictionaryId} of ${serviceId}: ${resp.status} - ${await resp.text()}`);
    }
    return (await resp.json())
      .map((entry) => removeProperties(entry, ['created_at', 'deleted_at', 'updated_at', 'service_id', 'dictionary_id']));
  }

  async generatedVCL(serviceId, versionId) {
    const resp = await fetch(
      `${this.endpoint}/service/${serviceId}/version/${versionId}/generated_vcl`,
      { headers: { 'Fastly-Key': this.authToken } },
    );
    if (!resp.ok) {
      throw new Error(`Failed to get generated VCL of ${serviceId}: ${resp.status} - ${await resp.text()}`);
    }
    return (await resp.json()).content;
  }

  async updateDict(serviceId, versionId, dictName, entries, writeOnly, batchSize = 500) {
    let method;
    let body;

    // get dict
    let resp = await fetch(
      `${this.endpoint}/service/${serviceId}/version/${versionId}/dictionary/${dictName}`,
      { headers: { 'Fastly-Key': this.authToken } },
    );
    if (!resp.ok) {
      // create dict
      method = 'POST';
      body = new FormData();
      body.append('name', dictName);
      body.append('write_only', String(writeOnly));
      resp = await fetch(
        `${this.endpoint}/service/${serviceId}/version/${versionId}/dictionary`,
        { method, body, headers: { 'Fastly-Key': this.authToken } },
      );
      if (!resp.ok) {
        throw new Error(`Failed to create dictionary '${dictName}': ${resp.status} - ${await resp.text()}`);
      }
    }
    const { id } = await resp.json();

    const items = Object.entries(entries).map(([key, value]) => ({ op: 'upsert', item_key: key, item_value: value }));

    while (items.length) {
      method = 'PATCH';
      body = { items: items.splice(0, batchSize) };
      // eslint-disable-next-line no-await-in-loop
      resp = await fetch(
        `${this.endpoint}/service/${serviceId}/dictionary/${id}/items`,
        { method, body, headers: { 'Fastly-Key': this.authToken } },
      );
      if (!resp.ok) {
        // eslint-disable-next-line no-await-in-loop
        throw new Error(`Failed to patch dictionary '${dictName}': ${resp.status} - ${await resp.text()}`);
      }
    }
  }

  async purgeDict(serviceId, versionId, dictName, batchSize = 500) {
    let method;
    let body;

    // get dict
    let resp = await fetch(
      `${this.endpoint}/service/${serviceId}/version/${versionId}/dictionary/${dictName}`,
      { headers: { 'Fastly-Key': this.authToken } },
    );
    if (!resp.ok) {
      throw new Error(`Failed to get dictionary '${dictName}': ${resp.status} - ${await resp.text()}`);
    }
    const { id } = await resp.json();
    const entries = await this.dictionaryItems(serviceId, id);

    const items = entries.map(({ item_key }) => ({ op: 'delete', item_key }));

    while (items.length) {
      method = 'PATCH';
      body = { items: items.splice(0, batchSize) };
      // eslint-disable-next-line no-await-in-loop
      resp = await fetch(
        `${this.endpoint}/service/${serviceId}/dictionary/${id}/items`,
        { method, body, headers: { 'Fastly-Key': this.authToken } },
      );
      if (!resp.ok) {
        // eslint-disable-next-line no-await-in-loop
        throw new Error(`Failed to patch dictionary '${dictName}': ${resp.status} - ${await resp.text()}`);
      }
    }
  }

  async createService(name, type = 'vcl', comment = '') {
    const method = 'POST';
    const body = new FormData();
    body.append('name', name);
    body.append('type', type);
    body.append('comment', comment);
    const resp = await fetch(
      `${this.endpoint}/service`,
      { method, body, headers: { 'Fastly-Key': this.authToken } },
    );
    if (!resp.ok) {
      throw new Error(`Failed to create service '${name}': ${resp.status} - ${await resp.text()}`);
    }
    return resp.json();
  }

  async addDomain(serviceId, versionId, name, comment) {
    const method = 'POST';
    const body = new FormData();
    body.append('name', name);
    body.append('comment', comment);
    const resp = await fetch(
      `${this.endpoint}/service/${serviceId}/version/${versionId}/domain`,
      { method, body, headers: { 'Fastly-Key': this.authToken } },
    );
    if (!resp.ok) {
      throw new Error(`Failed to add domain '${name}': ${resp.status} - ${await resp.text()}`);
    }
    return resp.json();
  }

  async createCondition(serviceId, versionId, condition) {
    const method = 'POST';
    const body = new FormData();
    Object.keys(condition).forEach((key) => {
      if (condition[key] !== null) {
        if (typeof condition[key] === 'string') {
          body.append(key, condition[key]);
        } else {
          body.append(key, String(condition[key]));
        }
      }
    });
    const resp = await fetch(
      `${this.endpoint}/service/${serviceId}/version/${versionId}/condition`,
      { method, body, headers: { 'Fastly-Key': this.authToken } },
    );
    if (!resp.ok) {
      throw new Error(`Failed to create condition '${condition.name}': ${resp.status} - ${await resp.text()}`);
    }
    return resp.json();
  }

  async createSnippet(serviceId, versionId, snippet) {
    const method = 'POST';
    const body = new FormData();
    Object.keys(snippet).forEach((key) => {
      if (snippet[key] !== null) {
        if (typeof snippet[key] === 'string') {
          body.append(key, snippet[key]);
        } else {
          body.append(key, String(snippet[key]));
        }
      }
    });
    const resp = await fetch(
      `${this.endpoint}/service/${serviceId}/version/${versionId}/snippet`,
      { method, body, headers: { 'Fastly-Key': this.authToken } },
    );
    if (!resp.ok) {
      throw new Error(`Failed to create snippet '${snippet.name}': ${resp.status} - ${await resp.text()}`);
    }
    return resp.json();
  }

  async updateSettings(serviceId, versionId, settings) {
    const method = 'PUT';
    const body = new FormData();
    Object.keys(settings).forEach((key) => {
      if (settings[key] !== null) {
        if (['general.default_host', 'general.stale_if_error', 'general.default_ttl', 'general.stale_if_error_ttl']
          .includes(key)) {
          if (typeof settings[key] === 'string') {
            body.append(key, settings[key]);
          } else {
            body.append(key, String(settings[key]));
          }
        }
      }
    });
    const resp = await fetch(
      `${this.endpoint}/service/${serviceId}/version/${versionId}/settings`,
      { method, body, headers: { 'Fastly-Key': this.authToken } },
    );
    if (!resp.ok) {
      throw new Error(`Failed to update settings of ${serviceId} version ${versionId}: ${resp.status} - ${await resp.text()}`);
    }
    return resp.json();
  }

  async createBackend(serviceId, versionId, backend) {
    const method = 'POST';
    const body = new FormData();
    Object.keys(backend).forEach((key) => {
      if (backend[key] !== null) {
        if (typeof backend[key] === 'string') {
          body.append(key, backend[key]);
        } else {
          body.append(key, String(backend[key]));
        }
      }
    });
    const resp = await fetch(
      `${this.endpoint}/service/${serviceId}/version/${versionId}/backend`,
      { method, body, headers: { 'Fastly-Key': this.authToken } },
    );
    if (!resp.ok) {
      throw new Error(`Failed to create backend '${backend.name}': ${resp.status} - ${await resp.text()}`);
    }
    return resp.json();
  }

  async createACL(serviceId, versionId, aclName) {
    const method = 'POST';
    const body = new FormData();
    body.append('name', aclName);
    const resp = await fetch(
      `${this.endpoint}/service/${serviceId}/version/${versionId}/acl`,
      { method, body, headers: { 'Fastly-Key': this.authToken } },
    );
    if (!resp.ok) {
      throw new Error(`Failed to create ACL '${aclName}': ${resp.status} - ${await resp.text()}`);
    }
    return resp.json();
  }

  async updateACL(serviceId, versionId, aclName, entries, batchSize = 500) {
    let method;
    let body;

    // get ACL
    let resp = await fetch(
      `${this.endpoint}/service/${serviceId}/version/${versionId}/acl/${aclName}`,
      { headers: { 'Fastly-Key': this.authToken } },
    );
    if (!resp.ok) {
      // create ACL
      method = 'POST';
      body = new FormData();
      body.append('name', aclName);
      resp = await fetch(
        `${this.endpoint}/service/${serviceId}/version/${versionId}/acl`,
        { method, body, headers: { 'Fastly-Key': this.authToken } },
      );
      if (!resp.ok) {
        throw new Error(`Failed to create ACL '${aclName}': ${resp.status} - ${await resp.text()}`);
      }
    }
    const { id } = await resp.json();
    const items = entries.map(({
      ip, subnet, negated, comment,
    }) => ({
      op: 'create', ip, subnet, negated, comment,
    }));

    while (items.length) {
      method = 'PATCH';
      body = { entries: items.splice(0, batchSize) };
      // eslint-disable-next-line no-await-in-loop
      resp = await fetch(
        `${this.endpoint}/service/${serviceId}/acl/${id}/entries`,
        { method, body, headers: { 'Fastly-Key': this.authToken } },
      );
      if (!resp.ok) {
        // eslint-disable-next-line no-await-in-loop
        throw new Error(`Failed to patch ACL '${aclName}': ${resp.status} - ${await resp.text()}`);
      }
    }
  }

  async updateHttpsLogEndpoint(serviceId, versionId, name, properties) {
    const method = 'PUT';
    const body = new FormData();
    Object.keys(properties).forEach((key) => {
      if (typeof properties[key] === 'string') {
        body.append(key, properties[key]);
      } else {
        body.append(key, String(properties[key]));
      }
    });
    const resp = await fetch(
      `${this.endpoint}/service/${serviceId}/version/${versionId}/logging/https/${name}`,
      { method, body, headers: { 'Fastly-Key': this.authToken } },
    );
    if (!resp.ok) {
      throw new Error(`Failed to update https log endpoint ${name} of ${serviceId} version ${versionId}: ${resp.status} - ${await resp.text()}`);
    }
    return resp.json();
  }
}

// eslint-disable-next-line import/prefer-default-export
export { Fastly };