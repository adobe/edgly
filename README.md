## @adobe/fastly-dev

> Tool enabling GitOps and CI/CD for Fastly VCL services
---

Enables version control for Fastly VCL services.

* Supports syncing between a local version controlled folder and a Fastly service.
* Supports syncing with Fiddles to develop VCL snippets
while still being a connected to version controlled configuration.
* File mapping:
  * Service configuration: `service.json`
  * VCL snippets: `snippets/*.vcl`
  * VCL files: `vcl/*.vcl`
  * Dictionaries: `dictionaries/*.ini`
  * Private dictionaries: `dictionaries/private.*.ini`
  * ACLs: `acl.json`
* Detects secrets to prevent accidental commits.
* Supports variable replacement for secrets and other dynamic configuration in all places: `${{VAR}}`

## Installation

```sh
npm install -g @adobe/fastly-dev
```

## Usage

```
   __           _   _                 _            
  / _| __ _ ___| |_| |_   _        __| | _____   __
 | |_ / _` / __| __| | | | |_____ / _` |/ _ \ \ / /
 |  _| (_| \__ \ |_| | |_| |_____| (_| |  __/\ V / 
 |_|  \__,_|___/\__|_|\__, |      \__,_|\___| \_/  
                      |___/                        

                https://github.com/adobe/fastly-dev

USAGE
fastly-dev <command> [flags]

Tool enabling GitOps and CI/CD for Fastly VCL services

COMMANDS
  service             Fastly VCL service commands
  fiddle              Fastly VCL fiddle commands
  version             Show version info
  shell-completion    Print completion script for .bashrc or .zshrc

GLOBAL FLAGS
  -c, --config     Configuration file      [string] [default: "fastly-dev.yaml"]
  -t, --api-token  Fastly API Token                                     [string]
  -d, --dry-run    Do not make any changes                             [boolean]
  -v, --verbose    Verbose output                                      [boolean]
  -h, --help       Show help                                           [boolean]

  Flags can be provided as environment variables prefixed with FASTLY_DEV_
  Example: --api-token becomes FASTLY_DEV_API_TOKEN.
```

### Initial setup for a Fastly service

1. Create new service or use existing service from [Fastly](https://manage.fastly.com)
2. Get the service id from the Fastly UI
3. Inside a git repo (one repo per Fastly service recommended)
4. Fetch the service configuration
   ```sh
   fastly-dev service get <service-id>
   ```
5. Review for any secrets detected
6. Commit the newly added files
7. Then follow with [Development workflow](#development-workflow)

### Create a stage environment

A stage environment allows to safely test changes in Fastly before deploying to the production service.

1. Add stage environment to `fastly-dev.yaml` and map the domain names to the ones to be used for stage:
   ```yaml
   env:
     stage:
      domains:
        example.com: "stage.example.com"
   ```
2. Create stage service:
   ```sh
   fastly-dev service create --env stage
   ```
3. This will store the new service id in `fastly-dev.yaml`. Commit this file.

### Develop changes using Fiddles

Developing with [Fastly Fiddles](https://fiddle.fastly.dev) is helpful as it allows to debug request handling in Fastly in depth. Note this will not work if the service uses entire VCL files, it only works with VCL snippets.

1. Create a new fiddle:
   ```sh
   fastly-dev fiddle create
   ```
2. Click the printed link to open the Fiddle
3. Develop the VCL code in the Fiddle
4. Copy any tests needed for the work into the Fiddle
5. When done, pull the changes from the Fiddle:
   ```sh
   fastly-dev fiddle get <fiddle-url>
   ```
6. Review the changes and commit

### Test changes in stage then deploy to production

1. Deploy to stage:
   ```sh
   fastly-dev service update --env stage --activate
   ```
3. Wait for Fastly changes to rollout, usually less than 30 seconds
2. Run any tests against stage
3. If successful, deploy to production:
   ```sh
   fastly-dev service update --activate
   ```
4. If something goes wrong, revert to old version using the Fastly UI

## Configuration

The tool uses a `fastly-dev.yaml` file in the current directory to store environment specific settings. The file is expected to be version controlled and shared with the team.

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
