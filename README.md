## @adobe/fastly-dev

> Tool for developing Fastly VCL services using CI/CD
---

TODO feature description

## Installation

```sh
npm install -g @adobe/fastly-dev
```

## Usage

TODO this is work in progress

### Services

Download initial service configuration, for example into a new version controlled directory:

```sh
fastly-dev service get <service-id>
```

Update service configuration:

```sh
fastly-dev service update
```

Create a new stage service copy:

1. edit `fastly-dev.yaml` and add stage domain names:
   ```yaml
   env:
     stage:
       domains:
         domain.com: "stage-domain.com"
         "*.domain.com": "*.stage.domain.com"
   ```
2. create new service for stage:
   ```sh
   fastly-dev service create -e stage
   ```

Deploy to stage (uses service id from stage in `fastly-dev.yaml`):

```sh
fastly-dev service update -e stage
```

Deploy to production (uses service id from `service.json`):

```sh
fastly-dev service update
```

### Fiddles

Create new fiddle:

```sh
fastly-dev fiddle push
```

Update fiddle:
```sh
fastly-dev fiddle push <fiddle-id>
```

Download changes from fiddle:

```sh
fastly-dev fiddle fetch <fiddle-id>
```

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
    service_id: abcd1234
  stage:
    service_id: efgh5678
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
