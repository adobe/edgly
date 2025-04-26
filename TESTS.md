# HTTP Tests

See [Test Framework section in README](README.md#test-framework) for general information on HTTP tests.

## Supported Fiddle Tests

Currently only a subset of [Fastly Fiddle Test](https://www.fastly.com/documentation/reference/tools/fiddle/testing/) options are supported.

### Comments

Prefix any assertion line with `[msg] ` to use a custom assertion message shown when the assertion fails. This is optional, useable defaults are provided.

* `[Reponse 200 OK] clientFetch.status is 200`

### Status

* `clientFetch.status is 200`

The [tepi](https://github.com/jupegarnica/tepi) framework used under the hood currently only supports [checking for an exact status code](https://github.com/jupegarnica/tepi/issues/2). Hence Fiddle status expressions with `oneOf`, `isAbove` or `isBelow` are not supported.

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
