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

import assert from 'node:assert/strict';
import { exec } from 'node:child_process';

describe('index', () => {
  it('edgly -h', (done) => {
    exec('node src/index.js -h', (err, stdout, _stderr) => {
      assert.ok(!err, err?.message);
      assert.ok(stdout.includes('Boost Fastly™️ VCL service development'));
      done();
    });
  });
});
