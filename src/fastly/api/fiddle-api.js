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

export class FastlyFiddleApi {
  constructor() {
    this.endpoint = 'https://fiddle.fastly.dev';
  }

  fetch(url, options) {
    const [method, path] = url.split(' ', 2);
    return fetch(`${this.endpoint}${path}`, {
      method,
      ...options,
    });
  }

  shortId(id) {
    if (id.startsWith(`${this.endpoint}/fiddle/`)) {
      return id.substr(`${this.endpoint}/fiddle/`.length);
    }
    return id;
  }

  async create(fiddle) {
    const resp = await this.fetch('POST /fiddle', {
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(fiddle),
    });
    if (!resp.ok) {
      throw new Error(`Failed to create fiddle: ${resp.status} - ${await resp.text()}`);
    }
    return await resp.json();
  }

  async update(id, fiddle) {
    const resp = await this.fetch(`PUT /fiddle/${this.shortId(id)}`, {
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(fiddle),
    });
    if (!resp.ok) {
      throw new Error(`Failed to update fiddle: ${resp.status} - ${await resp.text()}`);
    }
    return await resp.json();
  }

  async get(id) {
    const resp = await this.fetch(`GET /fiddle/${this.shortId(id)}`, {
      headers: {
        accept: 'application/json',
      },
    });
    if (!resp.ok) {
      throw new Error(`Failed to read fiddle: ${resp.status} - ${await resp.text()}`);
    }
    return await resp.json();
  }
}
