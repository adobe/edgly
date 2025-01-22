## @adobe/edgly

> Command line tool to boost Fastly VCL service development

[![NPM Version](https://img.shields.io/npm/v/%40adobe%2Fedgly)](https://www.npmjs.com/package/@adobe/edgly)
[![GitHub license](https://img.shields.io/github/license/adobe/edgly.svg)](https://github.com/adobe/edgly/blob/main/LICENSE)
[![GitHub issues](https://img.shields.io/github/issues/adobe/edgly.svg)](https://github.com/adobe/edgly/issues)
[![GitHub Actions Workflow Status](https://img.shields.io/github/actions/workflow/status/adobe/edgly/main.yml)](https://github.com/adobe/edgly/actions/workflows/main.yml)

---

Enables version control for [Fastly™️ VCL services](https://www.fastly.com/documentation/guides/vcl/) with these features:

* Syncing between a local version controlled folder and a [Fastly™️ VCL service](https://www.fastly.com/documentation/guides/vcl/)
* Syncing with [Fiddles](https://fiddle.fastly.dev) to develop VCL snippets
while still being a connected to version controlled configuration.
* File mapping:
  * Service configuration: `service.json`
  * VCL snippets: `snippets/*.vcl`
  * VCL files: `vcl/*.vcl`
  * Dictionaries: `dictionaries/*.ini`
  * Private dictionaries: `dictionaries/private.*.ini`
  * ACLs: `acl.json`
* Detects secrets to prevent accidental commits.
* Variable replacement for secrets and other dynamic configuration in all places: `${{VAR}}`
* Automatic testing of services using HTTP test framework leveraging `*.http` files.

Fastly is a service and trademark by [Fastly, Inc.](https://www.fastly.com)

## Installation

```sh
npm install -g @adobe/edgly
```

## Usage

```
                             _       _       
                     ___  __| | __ _| |_   _ 
                    / _ \/ _` |/ _` | | | | |
                   |  __/ (_| | (_| | | |_| |
                    \___|\__,_|\__, |_|\__, |
                               |___/   |___/ 

                  https://github.com/adobe/edgly

USAGE
  edgly <command> [OPTS]

Boost Fastly™️ VCL service development

COMMANDS
  service             Fastly VCL service commands
  fiddle              Fastly VCL fiddle commands
  test                Run HTTP request tests
  version             Show version info
  shell-completion    Print completion script for .bashrc or .zshrc

GLOBAL OPTIONS
  -c, --config   Configuration file             [string] [default: "edgly.yaml"]
  -v, --verbose  Verbose output                                        [boolean]
  -h, --help     Show help                                             [boolean]

  Options can also be set as environment variables prefixed with EDGLY_.
  Example: --api-token becomes EDGLY_API_TOKEN.
```

### Initial setup for a Fastly service

1. Create new service or use existing service from [Fastly](https://manage.fastly.com)
2. Get the service id from the Fastly UI
3. Inside a git repo (one repo per Fastly service recommended)
4. Fetch the service configuration
   ```sh
   edgly service get <service-id>
   ```
5. Review for any secrets detected
6. Commit the newly added files

### Create a stage environment

A stage environment allows to safely test changes in Fastly before deploying to the production service.

1. Add stage environment to `edgly.yaml` and map the domain names to the ones to be used for stage:
   ```yaml
   env:
     stage:
      domains:
        example.com: "stage.example.com"
   ```
2. Create stage service:
   ```sh
   edgly service create --env stage
   ```
3. This will store the new service id in `edgly.yaml`. Commit this file.

### Develop changes using Fiddles

Developing with [Fastly Fiddles](https://fiddle.fastly.dev) is helpful as it allows to debug request handling in Fastly in depth. Note this will not work if the service uses entire VCL files, it only works with VCL snippets.

1. Create a new fiddle:
   ```sh
   edgly fiddle create
   ```
2. Click the printed link to open the Fiddle
3. Develop the VCL code in the Fiddle
4. Copy any tests needed for the work into the Fiddle
5. When done, pull the changes from the Fiddle:
   ```sh
   edgly fiddle get <fiddle-url>
   ```
6. Review the changes and commit

### Test changes in stage then deploy to production

1. Deploy to stage:
   ```sh
   edgly service update --env stage --activate
   ```
3. Wait for Fastly changes to rollout, usually less than 30 seconds
2. Run any tests against stage
3. If successful, deploy to production:
   ```sh
   edgly service update --activate
   ```
4. If something goes wrong, revert to old version using the Fastly UI

## Test framework

The test framework supports running HTTP requests against your domain (Fastly service) and is compatible with Fastly Fiddle Tests. This allows sync and copy-and-paste between automated tests and Fastly Fiddles. It requires separate installation of the [tepi](https://tepi.deno.dev/) test tool, which is [Deno](https://deno.land/) based.

### Install tepi

Test execution requires installation of [tepi](https://tepi.deno.dev/):
1. Install [deno](https://deno.land/)
2. Install [tepi](https://tepi.deno.dev/)

   ```
   deno install --reload  --allow-read --allow-env --allow-net --allow-run -f -n tepi https://tepi.deno.dev/src/cli.ts
   ```

### Test case syntax

1. Tests are defined in `*.http` files in the [tests](tests/) folder
2. Each file can have multiple tests
3. Test format is the [tepi](https://tepi.deno.dev/) one, but supporting [Fastly Fiddle Tests](https://www.fastly.com/documentation/reference/tools/fiddle/testing/) in the response assertions
4. Supported Fiddle test assertions are documented in [TESTS.md](TESTS.md)
   - Note: Technically the Tepi assertions are also supported. However, it is recommended to stick to Fastly Fiddle Tests only.
5. Syntax
   ```
   ---
   <file metadata> (optional)
   ---

   ###
   ---
   <test metadata> (optional)
   ---
   POST /path
   <headers>  (optional)

   <body> (optional)

   <assertions>

   ###
   ```

#### Example test file

Example `*.http` file with two tests:

```
---
host: <%= Deno.env.get('HOST') || 'https://example.com' %>
---

###
GET /status=200

clientFetch.status is 200
clientFetch.bodyPreview is ""


###
---
id: example
---
POST /status=200
Header: value

{"request": "body"}

clientFetch.status is 200
```

### Run tests

Run tests against production:
```
edgly test
```

Custom host:
```
HOST=https://thumbnails.findmy.media  edgly test
```

Run specific test file:
```
edgly test tests/image.http
```

Run individual test:
```
# :5 = line number where test starts, the ### line
edgly test tests/image.http:5
```

### Visual Studio Code test support

The [tepi VS Code extension](https://marketplace.visualstudio.com/items?itemName=jupegarnica.tepi) can be supported, for syntax highlighting and test execution within the IDE.

#### VS Code setup

1. Add a file named `tepi` in the root of your VS Code workspace
   ```sh
   #!/bin/sh
   edgly test "$@"
   ```
2. Ensure the file is executable
   ```sh
   chmod u+x tepi
   ```
3. Add this to the VS Code workspace settings to prefer it to use this executable (come first on PATH):
   ```json
     "terminal.integrated.env.osx": {
       "PATH": ".:${env:PATH}"
     }
   ```
4. Reload window or restart VS Code to apply PATH change
5. Commit both `tepi` and `.vscode/settings.json` files to version control

#### VS Code test development flow

Inside VS Code you can now run tests individually:

1. Install [tepi extension for VS Code](https://marketplace.visualstudio.com/items?itemName=jupegarnica.tepi)
2. Open `tests/*.http` files in VS Code
3. Edit tests
4. Run test using the extension
   1. Run single test: click `run` above test case
   2. Run single test with full request/response output: click `run -d`
   3. Run all tests in file: click `run file`
   4. Run all tests: run `tepi` in terminal

## Configuration

The tool uses a `edgly.yaml` file in the current directory to store environment specific settings. The file is expected to be version controlled and shared with the team.

Full configuration file example:

```yaml
# environment specific settings
# 'production' is the default and service.json is expected to be from production env
# other environment names can be custom and used with '-e <env>' on the cli
env:
  production:
    # fastly service id
    id: abcd1234
  stage:
    # stage service id
    id: efgh5678
    # different domain names for stage env
    # map from the production domain name (in service.json)
    domains:
      example.com: "stage.example.com"
  dev:
    service_id: ijkl9012
    # different domain names for dev env
    domains:
      example.com: "dev.example.com"

# settings for fiddle sub commands
fiddle:
  # use different backends in fiddles
  backends:
    S3: "https://safe-s3.aws.com"

# settings for secret detection
secrets:
  # custom threshold for entropy to consider something a secret
  # default is 4.5 and should normally be not changed 
  entropy_threshold: 3.8
```


## Contributing
Contributions are welcomed! Read the [Contributing Guide](./.github/CONTRIBUTING.md) for more information.

## Licensing
This project is licensed under the Apache V2 License. See [LICENSE](LICENSE) for more information.
