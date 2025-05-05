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

import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import { cp, mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { glob } from 'glob';
import { isFiddleTest, parseHttpTestFile, writeHttpTestFile } from './parser.js';

const TEST_DIR = 'tests';

class SourceFileError extends Error {
  constructor(msg, path, line) {
    super(msg);
    this.path = path;
    this.line = line;
  }
}

function removePrefix(str, prefix) {
  return str.startsWith(prefix) ? str.slice(prefix.length) : str;
}

async function createTempDir() {
  const tempDir = await mkdtemp(path.join(tmpdir(), 'tepi-'));
  console.debug(`Temporary directory: ${tempDir}`);

  // register process exit handler to cleanup temp dir
  process.on('exit', () => {
    if (tempDir) {
      console.debug('Deleting temp directory:', tempDir);
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  return tempDir;
}

function executableIsAvailable(name) {
  try {
    execSync(`which ${name}`);
    return true;
  } catch (_e) {
    return false;
  }
}

async function cmd(...command) {
  // if last element in command is an object
  const opts = typeof command[command.length - 1] === 'object' ? command.pop() : {};
  console.debug('Running', ...command);
  const p = spawn(command[0], command.slice(1), { cwd: opts.cwd || process.cwd() });
  return new Promise((resolve) => {
    p.stdout.on('data', (x) => {
      process.stdout.write(x.toString());
    });
    p.stderr.on('data', (x) => {
      process.stderr.write(x.toString());
    });
    p.on('exit', (code) => {
      resolve(code);
    });
  });
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: accepted for now
function rewriteTest(match, file, line) {
  const { label, target, comparison, value } = match.groups;

  if (target === 'clientFetch.status') {
    // clientFetch.status is 200
    if (comparison === 'is') {
      return `<% assertEquals(response.status, ${value}, '${label || 'Unexpected response status'}') %>`;
    }

    // clientFetch.status oneOf [200, 206]
    if (comparison === 'oneOf') {
      return `<% assertArrayIncludes(${value}, [response.status], '${label || 'Unexpected response status'}') %>`;
    }

    // clientFetch.status isAbove 100
    if (comparison === 'isAbove') {
      return `<% assert(response.status > ${value}, '${label || 'Unexpected response status'}') %>`;
    }

    // clientFetch.status isAtLeast 100
    if (comparison === 'isAtLeast') {
      return `<% assert(response.status >= ${value}, '${label || 'Unexpected response status'}') %>`;
    }

    // clientFetch.status isBelow 100
    if (comparison === 'isBelow') {
      return `<% assert(response.status < ${value}, '${label || 'Unexpected response status'}') %>`;
    }

    // clientFetch.status isAtMost 100
    if (comparison === 'isAtMost') {
      return `<% assert(response.status <= ${value}, '${label || 'Unexpected response status'}') %>`;
    }

    throw new SourceFileError(`Unsupported operation for clientFetch.status: ${match.input}`, file, line);
  }

  if (target === 'clientFetch.resp') {
    // clientFetch.resp includes "Content-Type: image/webp"
    if (comparison === 'includes') {
      const m = value.match(/^"(.*:.*)"$/);
      if (m) {
        return m[1];
      }
    }

    // clientFetch.resp notIncludes "server: "
    if (comparison === 'notIncludes') {
      const m = value.match(/^"(.*):.*"$/);
      if (m) {
        const header = m[1];
        return `<% assertFalse(response.headers.get('${header}'), '${label || `Unexpected response header: ${header}`}') %>`;
      }
    }

    // clientFetch.resp matches /fastly-io-info: .* odim=720x900 ofmt=webp/
    if (comparison === 'matches') {
      const m = value.match(/^\/(.+): (.*)\/$/);
      if (m) {
        const header = m[1];
        // if pattern ends with newline, we have to transform this into $ for matching end of header value
        // as below assertion only looks at the one header value and not the entire header stream
        const pattern = m[2].replace(/\\n$/, '$');
        return `<% assertMatch(response.headers.get('${header}'), /${pattern}/, '${label || `Unexpected pattern for response header: ${header}`}') %>`;
      }
    }

    // clientFetch.resp notMatches /x-amz-[^: \n]*: /
    if (comparison === 'notMatches') {
      return `<% response.headers.forEach((v, k) => assertNotMatch(k + ": " + v, ${value}, '${label ? `${label}'` : "Unexpected response header: ' + k"})) %>`;
    }
  }

  if (target === 'clientFetch.bodyPreview') {
    const body = "(await response.getBody() || '').toString()";

    if (comparison === 'is') {
      // clientFetch.bodyPreview is ""
      return `<% assertEquals(${body}, (${value}), '${label || `Response body does not equal ${value}`}') %>`;
    }

    if (comparison === 'includes') {
      // clientFetch.bodyPreview includes "foo"
      return `<% assertStringIncludes(${body}, (${value}), '${label || `Response body does not include ${value}`}') %>`;
    }

    if (comparison === 'matches') {
      // clientFetch.bodyPreview matches /foo/
      return `<% assertMatch(${body}, (${value}), '${label || `Response body does not match ${value}`}') %>`;
    }

    if (comparison === 'startsWith') {
      // clientFetch.bodyPreview startsWith "foo"
      return `<% assert(${body}.startsWith(${value}), '${label || `Response body does not start with ${value}`}') %>`;
    }

    if (comparison === 'endsWith') {
      // clientFetch.bodyPreview endsWith "foo"
      return `<% assert(${body}.endsWith(${value}), '${label || `Response body does not end with ${value}`}') %>`;
    }
  }

  throw new SourceFileError(`Unsupported Fiddle test: ${match.input}`, file, line);
}

async function rewriteTestsInFile(baseDir, filePath) {
  console.debug('--------------------------------------------------------------------------------');
  console.debug(`Rewriting file: ${filePath}`);

  const tmpFile = path.join(baseDir, filePath);
  const { tests, meta } = parseHttpTestFile(tmpFile);

  console.debug('✅ parsed tests:', { meta, tests });

  for (const test of tests) {
    const newAssertions = [];
    const assertions = test.assertions.split('\n');
    let httpLine = false;
    for (const assertion of assertions) {
      // ensure assertions start with a HTTP/* line (required by tepi)
      if (!httpLine) {
        if (assertion.startsWith('HTTP/')) {
          newAssertions.push(assertion);
        } else {
          newAssertions.push('HTTP/1.1');
        }
        httpLine = true;
        continue;
      }

      // rewrite any Fiddle assertions into tepi compatible expressions
      const match = isFiddleTest(assertion);
      if (match) {
        newAssertions.push(rewriteTest(match, tmpFile));
      } else {
        newAssertions.push(assertion);
      }
    }
    test.assertions = newAssertions.join('\n');
  }
  writeHttpTestFile(tmpFile, tests, meta);

  if (global.verbose) {
    // log tmpFile contents
    console.debug();
    console.debug(`✅ file rewritten for tepi: ${tmpFile}`);
    console.debug(await readFile(tmpFile, 'utf8'));
    console.debug('✅ EOF');
  }

  return;
}

export async function runTests(globs, tepiArgs = []) {
  // check if tepi is available
  if (!executableIsAvailable('tepi')) {
    console.error("Error: 'tepi' command not found. Please install it first:");
    console.error();
    console.error('1. Install deno: https://deno.land');
    console.error('2. Install tepi: https://github.com/jupegarnica/tepi');
    process.exit(1);
  }
  if (!fs.existsSync(TEST_DIR)) {
    console.error('Error: No tests found');
    process.exit(1);
  }

  // if absolute path is used (eg. by tepi VS Code extension), make it relative
  // biome-ignore lint/style/noParameterAssign: it's easier this way :)
  globs = globs.map((g) => removePrefix(g, `${process.cwd()}/`));

  try {
    const tempDir = await createTempDir();

    // (1) copy .http test files to temporary directory
    await cp(TEST_DIR, path.join(tempDir, TEST_DIR), { recursive: true });

    // remove any test number suffix
    const pathGlobs = globs.map((g) => g.split(':')[0]);
    const paths = await glob(pathGlobs, { cwd: tempDir });

    // (2) rewrite tests from Fastly Fiddle tests to tepi assertions
    for (const file of paths) {
      await rewriteTestsInFile(tempDir, file);
    }

    // (3) run tepi on the rewritten files in the temp directory
    const exitCode = await cmd('tepi', ...tepiArgs, '--no-animation', ...globs, { cwd: tempDir });
    // pass along the tepi exit code
    process.exit(exitCode);
  } catch (e) {
    if (e instanceof SourceFileError) {
      console.error(`ERROR: ${e.path}:${e.line} -- ${e.message}`);
    } else {
      console.error(e);
    }
  }
}
