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

/**
 * This is a micro lib to improve the yargs cli library.
 */

import { statSync } from 'node:fs';
import path from 'node:path';
import chalk from 'chalk';
import _yargs from 'yargs';

function isFile(path) {
  try {
    return statSync(path).isFile();
  } catch (err) {
    if (err.code === 'ENOENT') {
      return false; // File doesn't exist
      // biome-ignore lint/style/noUselessElse: mistakenly flagged
    } else {
      throw err; // Other errors
    }
  }
}

function isDirectory(path) {
  try {
    return statSync(path).isDirectory();
  } catch (err) {
    if (err.code === 'ENOENT') {
      return false; // Directory doesn't exist
      // biome-ignore lint/style/noUselessElse: mistakenly flagged
    } else {
      throw err; // Other errors
    }
  }
}

const BETTER_FAIL_MESSAGES = {
  'Not enough arguments:': 'Not enough non-option arguments:',
  'Too many arguments:': 'Too many non-option arguments:',
  'Missing command or required arguments.': /Not enough arguments: .*/,
  'Options $1 are mutually exclusive': /Arguments (.+) are mutually exclusive/,
};

const COMMANDS = chalk.bold('COMMANDS');
const COMMAND_OPTIONS_GROUP = chalk.bold('OPTIONS');

const ADDITIONAL_TYPES = {
  // path to file or folder. does not have to exist
  path: {
    type: 'string',
    // coerce: (arg) => path.resolve(arg),
  },

  // path to file. must exist and be a file
  file: {
    type: 'string',
    coerce: (arg) => {
      if (!isFile(arg)) {
        throw new Error(`Not a file: ${arg}`);
      }
      return path.resolve(arg);
    },
  },

  // path to directory. must exist and be a directory
  dir: {
    type: 'string',
    coerce: (arg) => {
      if (!isDirectory(arg)) {
        throw new Error(`Not a directory: ${arg}`);
      }
      return path.resolve(arg);
    },
  },
};

function onFail(msg, err, yargs) {
  if (err) {
    // errors thrown from code
    if (global.verbose) {
      console.error(chalk.red(err.stack));
    } else {
      console.error(chalk.red('Error:', err.message));
    }
    process.exit(2);
  } else {
    // yargs validation errors (only message, no err)
    for (const [newMsg, oldMsg] of Object.entries(BETTER_FAIL_MESSAGES)) {
      // biome-ignore lint/style/noParameterAssign: it's easier this way :)
      msg = msg.replace(oldMsg, newMsg);
    }

    yargs.showHelp('log');
    console.log();

    console.error(chalk.red('Error:', msg));
    process.exit(1);
  }
}

function adjustOptions(yargs, opt) {
  handleCommandOptionsGroup(yargs, opt);
  handleAdditionalTypes(yargs, opt);
}

function handleCommandOptionsGroup(yargs, opt) {
  // HACK to detect whether this option is part of a command or global
  // "frozens" is set when inside a command
  const isCommand = yargs.getInternalMethods()?.getCommandInstance()?.frozens?.length > 0;
  if (isCommand) {
    // group command specific options under OPTIONS
    opt.group = opt.group || COMMAND_OPTIONS_GROUP;
  }
}

function handleAdditionalTypes(_yargs, opt) {
  if (opt.type in ADDITIONAL_TYPES) {
    const type = ADDITIONAL_TYPES[opt.type];
    opt.type = type.type;
    opt.coerce = type.coerce;
  }
}

/**
 * An improved yargs.
 *
 * Usage:
 * ```js
 * import yargsAhoy from './yargs-ahoy.js';
 *
 * const yargs = yargsAhoy();
 * await yargs
 *   .options(..)
 *   .run();
 * ```
 *
 * Features:
 * - better fail handler:
 *   - red error output
 *   - better messages for common validation errors
 *   - show help on argument validation errors
 *   - if global.verbose is set, show full stack trace on application errors
 *   - exit with code 1 on validation errors
 *   - exit with code 2 on application errors
 * - TODO: document other stuff
 */
// biome-ignore lint/style/noDefaultExport: we mimic yargs here
export default function yargsAhoy(processArgs, cwd, parentRequire) {
  const yargs = _yargs(processArgs, cwd, parentRequire);

  // additional features on options
  yargs.__options = yargs.options;
  yargs.options = function (key, opt) {
    if (opt) {
      adjustOptions(this, opt);
    } else {
      for (const o of Object.keys(key)) {
        adjustOptions(this, key[o]);
      }
    }
    return this.__options(key, opt);
  };

  // support adding content to help output at the top (before the usage section)
  yargs._prologues = [];
  yargs.prologue = function (msg) {
    this._prologues.push(msg);
    return this;
  };

  // rewrite help output
  // - support prologue handling
  // - command list: only list commands (not prefix script name, nor list positionals)
  const usage = yargs.getInternalMethods().getUsageInstance();
  usage._help = usage.help;
  usage.help = function () {
    const lines = [];
    lines.push(...yargs._prologues);
    lines.push(chalk.bold('USAGE'));

    const help = this._help();

    const commands = yargs.getInternalMethods().getCommandInstance().handlers;
    const maxCmdLen = Math.max(...Object.keys(commands).map((c) => c.length));

    let inCommandsList = false;
    for (const line of help.split('\n')) {
      if (line === COMMANDS) {
        inCommandsList = true;
        lines.push(line);
        // custom command listing
        for (const command of Object.keys(commands)) {
          lines.push(`  ${command.padEnd(maxCmdLen)}    ${commands[command].description}`);
        }
      } else if (inCommandsList && line === '') {
        inCommandsList = false;
        lines.push(line);
      } else if (!inCommandsList) {
        lines.push(line);
      }
    }

    return lines.join('\n');
  };

  // make yargs automatic version detection available to clients
  yargs.getVersion = () => {
    let version;
    usage.showVersion((ver) => {
      version = ver;
    });
    return version;
  };

  yargs.run = function (args) {
    return this.parseAsync(args || process.argv.slice(2));
  };

  return yargs
    .updateStrings({
      'Commands:': COMMANDS,
      'Options:': chalk.bold('GLOBAL FLAGS'),
      'Positionals:': chalk.bold('ARGUMENTS'),
    })
    .fail(onFail)
    .help()
    .alias('h', 'help');
}
