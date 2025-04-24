#!/usr/bin/env node
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

import chalk from 'chalk';
import updateNotifier from 'tiny-update-notifier';
import packageJson from '../package.json' with { type: 'json' };
import fiddle from './commands/fiddle/fiddle.js';
import service from './commands/service/service.js';
import test from './commands/test.js';
import version from './commands/version.js';
import { GLOBAL_OPTS } from './opts.js';
import yargsAhoy from './yargs-ahoy.js';

// colorize console output
const wrapConsole =
  (original, fn) =>
  (...args) =>
    original(fn(...args));
console.warn = wrapConsole(console.warn, chalk.yellow);
console.error = wrapConsole(console.error, chalk.red);

let updateMsg;
try {
  const update = await updateNotifier({ pkg: packageJson });
  if (update) {
    updateMsg = '\n';
    updateMsg += '┌───────────────────────────────────────────────┐\n';
    updateMsg += ` New version available: ${update.latest}\n`;
    updateMsg += '\n';
    updateMsg += ` To update run: npm install -g ${packageJson.name}\n`;
    updateMsg += '└───────────────────────────────────────────────┘\n';
  }
} catch (e) {
  console.debug('Failed to check for updates:', e);
}

const yargs = yargsAhoy();
await yargs
  .command(service)
  .command(fiddle)
  .command(test)
  .command(version)
  .completion('shell-completion', 'Print completion script for .bashrc or .zshrc')
  .version(false)
  .demandCommand(1)
  .recommendCommands()
  .options(GLOBAL_OPTS)
  .env('EDGLY')
  // ascii font from https://patorjk.com/software/taag/#p=display&f=Standard&t=edgly
  .prologue('')
  .prologue(chalk.yellow('                             _       _       '))
  .prologue(chalk.yellow('                     ___  __| | __ _| |_   _ '))
  .prologue(chalk.yellow('                    / _ \\/ _` |/ _` | | | | |'))
  .prologue(chalk.yellow('                   |  __/ (_| | (_| | | |_| |'))
  .prologue(chalk.yellow('                    \\___|\\__,_|\\__, |_|\\__, |'))
  .prologue(chalk.yellow('                               |___/   |___/ '))
  .prologue('')
  .prologue(chalk.yellow('                  https://github.com/adobe/edgly'))
  .prologue('')
  .usage(chalk.yellow('  $0 <command> [OPTS]'))
  .usage('')
  .usage('Boost Fastly™️ VCL service development')
  .epilogue('  Options can also be set as environment variables prefixed with EDGLY_.')
  .epilogue('  Example: --api-token becomes EDGLY_API_TOKEN.')
  .epilogue('')
  .epilogue(`Version: ${version.getVersion()}`)
  .epilogue(updateMsg ? chalk.yellow(updateMsg) : '')
  .run();

// yargs and/or @adobe/fetch somehow hangs at the end, so we force quit as workaround
process.exit();
