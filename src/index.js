#!/usr/bin/env node
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

import fetch from './commands/fetch.js';
import push from './commands/push.js';
import { GLOBAL_OPTS } from './opts.js';
import yargsAhoy from './yargs-ahoy.js';

const yargs = yargsAhoy();
await yargs
  .command(fetch)
  .command(push)
  .demandCommand(1)
  .recommendCommands()
  .strict()
  .options(GLOBAL_OPTS)
  .env('FASTLY')
  .version()
  // ascii font from https://patorjk.com/software/taag/#p=display&f=Standard&t=fastly-svc
  .prologue('')
  .prologue('  __           _   _                           ')
  .prologue(' / _| __ _ ___| |_| |_   _       _____   _____ ')
  .prologue('| |_ / _` / __| __| | | | |_____/ __\\ \\ / / __|')
  .prologue('|  _| (_| \\__ \\ |_| | |_| |_____\\__ \\\\ V / (__ ')
  .prologue('|_|  \\__,_|___/\\__|_|\\__, |     |___/ \\_/ \\___|')
  .prologue('                     |___/                     ')
  .prologue('')
  .usage('$0 [<flags>] <command> [<args> ...]')
  .usage('')
  .usage('Tool for developing Fastly services using CI/CD')
  .epilogue(`Version: ${yargs.getVersion()}`)
  .run();

// yargs or adobe/fetch hangs at the end, so we have to force quit
process.exit();
