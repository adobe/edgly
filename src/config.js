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

import fs from 'node:fs';
import yaml from 'yaml';

export class Config {
  #file;
  #doc;

  constructor(file, doc) {
    Object.assign(this, doc.toJS());
    this.#file = file;
    this.#doc = doc;
  }

  static read(file, isDefault = false) {
    if (fs.existsSync(file)) {
      const content = fs.readFileSync(file, 'utf8');
      const doc = yaml.parseDocument(content);
      return new Config(file, doc);
    }

    if (!isDefault) {
      console.warn(`Warning: Configuration file not found: ${file}`);
    }
    return new Config(file, new yaml.Document({}));
  }

  file() {
    return this.#file;
  }

  write() {
    fs.writeFileSync(this.#file, this.#doc.toString());
  }

  get(keyPath) {
    return this.#doc.getIn(keyPath.split('.'));
  }

  set(keyPath, value) {
    this.#doc.setIn(keyPath.split('.'), value);
    return this;
  }

  delete(keyPath) {
    this.#doc.deleteIn(keyPath.split('.'));
    return this;
  }
}
