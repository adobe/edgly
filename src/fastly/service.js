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

import { removeKeys, toSortedJson } from '../util.js';

const VARIABLE_REGEX = /\$\{\{([A-Z0-9_]+)\}\}/g;

/**
 * Return the variable expression `${{varName}}`.
 * @param {String} varName name of the variable
 * @returns {String} variable expression
 */
export function getVariableExpression(varName) {
  return `\${{${varName}}}`;
}

export function isVariableExpression(str) {
  return str.startsWith('${{') && str.endsWith('}}');
}

/**
 * Data structure representing a complete Fastly service configuration
 * at a particular version.
 */
export class FastlyService {
  constructor(details) {
    // map all details to this instance
    Object.assign(this, details);
  }

  /**
   * Create FastlyService object from JSON string.
   * @param {String} json JSON string
   * @returns {FastlyService} FastlyService object
   */
  static fromJson(json) {
    return new FastlyService(JSON.parse(json));
  }

  /**
   * Serialize the object as JSON string for the Fastly API.
   * @param {String|Number} space indentation string or number of spaces for indentation.
   *                              defaults to 2.
   *
   * @returns {String} JSON string
   */
  toJson(space = 2) {
    return JSON.stringify(this, space);
  }

  /**
   * Serialize the service as JSON string with alphabetically sorted keys.
   * @param {String|Number} space indentation string or number of spaces for indentation.
   *                              defaults to 2.
   *
   * @returns {String} JSON string with alphabetically sorted keys
   */
  toSortedJson(space = 2) {
    return toSortedJson(this, space);
  }

  /**
   * Returns a copy of this service configuration with the specified keys removed.
   *
   * @param {Array} keysToRemove list of keys to remove
   * @returns {FastlyService} a new FastlyService with the specified keys removed (shallow copy)
   */
  removeKeys(keysToRemove) {
    return new FastlyService(removeKeys(this, keysToRemove));
  }

  /**
   * Return VCL snippets as an object map by subroutines (init, recv, etc.),
   * sorted by priority.
   * @returns {Object} snippets by subroutines
   */
  snippetsBySubroutine() {
    const subs = {};

    for (const snippet of this.snippets) {
      if (!subs[snippet.type]) {
        subs[snippet.type] = [];
      }
      subs[snippet.type].push(snippet);
    }

    // sort snippets by priority
    for (const type in subs) {
      subs[type].sort((a, b) => a.priority - b.priority);
    }

    return subs;
  }

  /**
   * Replaces the service domains
   *
   * @param {Object} domainMap object map containing domain changes
   * @returns {Array} list of unmapped domains (for reporting)
   */
  changeDomains(domainMap) {
    const unmappedDomains = [];

    for (const domain of this.domains) {
      const newDomain = domainMap?.[domain.name];
      if (newDomain && newDomain !== domain.name) {
        // console.log(`- ${domain.name} -> ${newDomain}`);
        domain.name = newDomain;
      } else {
        unmappedDomains.push(domain.name);
      }
    }

    return unmappedDomains;
  }

  /**
   * Replace variables of the form `${{NAME}}` with values from
   * corresponding environment variables and return a new FastlyService object.
   *
   * @returns {FastlyService} a new FastlyService object with variables replaced
   */
  replaceVariables() {
    const json = this.toJson();

    function envVarReplacer(match, varName) {
      if (process.env[varName]) {
        // console.debug(`Replacing ${match} with environment variable`);
        return process.env[varName];
      }

      console.warn(`Warning: Environment variable not found: ${varName}`);
      return match;
    }

    const rewritten = json.replaceAll(VARIABLE_REGEX, envVarReplacer);

    return new FastlyService(JSON.parse(rewritten));
  }
}
