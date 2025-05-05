# HTTP Tests

See [Test Framework section in README](README.md#test-framework) for general information on HTTP tests.

## Supported Fiddle Tests

Currently only a subset of [Fastly Fiddle Test](https://www.fastly.com/documentation/reference/tools/fiddle/testing/) options are supported.

Tepi requires tests to start with a `HTTP/*` line, at minimum `HTTP/<version>`. `edgly test` will auto-insert `HTTP/1.1` if no status line is found.

### Comments

Prefix any assertion line with `[msg] ` to use a custom assertion message shown when the assertion fails. This is optional, useable defaults are provided.

* `[Reponse 200 OK] clientFetch.status is 200`

### Status

* `clientFetch.status is 200`
* `clientFetch.status oneOf [301, 308]`
* `clientFetch.status isAbove 100`
* `clientFetch.status isAtLeast 200`
* `clientFetch.status isBelow 300`
* `clientFetch.status isAtMost 200`

You can have multiple assertions to specify a range:
```
# check for 2xx response
clientFetch.status isAtLeast 200
clientFetch.status isBelow 300
```

### Headers

Includes/matching:
* `clientFetch.resp includes "content-type: image/webp"`
* `clientFetch.resp matches /x-cache: .*HIT\n/`
  * testing header value ends with a certain value, using newline at end of regex
* `clientFetch.resp matches /fastly-io-info: ifsz=20262 .* ofmt=webp/`

Does not include/match:
* `clientFetch.resp notIncludes "server: "`
* `clientFetch.resp notMatches /x-amz-[^: \n]*: /`

### Body

* `clientFetch.bodyPreview is ""`
* `clientFetch.bodyPreview includes "<html>"`
* `clientFetch.bodyPreview matches /html/`
* `clientFetch.bodyPreview startsWith "<!doctype html>"`
* `clientFetch.bodyPreview endsWith "html>\n"`
