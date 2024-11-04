## @adobe/fastly-dev

> CLI for working with Fastly services
---

TODO feature description

## Installation

```sh
npm install -g @adobe/fastly-dev
```

## Usage

TODO: this is work in progress

### Services

Download initial service configuration, for example into a new version controlled directory:

```sh
fastly-dev fetch <service-id>
```

Update service configuration:

```sh
fastly-dev fetch
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
   fastly-dev push -e stage --create
   ```

Deploy to stage (uses service id from stage in `fastly-dev.yaml`):

```sh
fastly-dev push -e stage
```

Deploy to production (uses service id from `service.json`):

```sh
fastly-dev push
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


### Contributing
Contributions are welcomed! Read the [Contributing Guide](./.github/CONTRIBUTING.md) for more information.

### Licensing
This project is licensed under the Apache V2 License. See [LICENSE](LICENSE) for more information.
