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

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { detectSecrets, LOG_SECRET_FIELDS } from '../src/secrets/secrets.js';

// silence debug/warn output for these tests
console.debug = () => ({});
console.warn = () => ({});

global.config = { secrets: {} };

const SECRETS_FILE = '.secrets.env';

// Fixtures use JSON.parse so that Fastly's snake_case API field names
// (`secret_key`, `tls_client_key`, etc.) live inside a string template and
// don't trip biome's camelCase object-property naming rule.
function service(logBlocksJson = '{}') {
  return {
    dictionaries: [],
    vcls: [],
    snippets: [],
    ...JSON.parse(logBlocksJson),
  };
}

describe('secrets', () => {
  let tmpDir;
  let originalCwd;

  beforeEach(() => {
    originalCwd = process.cwd();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'edgly-secrets-test-'));
    process.chdir(tmpDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('LOG_SECRET_FIELDS', () => {
    it('covers all 26 supported Fastly logging integrations (papertrail excluded)', () => {
      // papertrail intentionally omitted: it has no credential field (auth by source IP)
      const expected = [
        'azureblob',
        'bigqueries',
        'cloudfiles',
        'datadog',
        'digitalocean',
        'elasticsearch',
        'ftp',
        'gcs',
        'grafanacloudlogs',
        'heroku',
        'honeycomb',
        'https',
        'kafka',
        'kinesis',
        'loggly',
        'logshuttle',
        'newrelicotlp',
        'newrelics',
        'openstack',
        'pubsub',
        's3',
        'scalyr',
        'sftp',
        'splunks',
        'sumologic',
        'syslog',
      ];
      const actual = Object.keys(LOG_SECRET_FIELDS).sort();
      assert.deepEqual(actual, expected);
    });

    it('uses arrays for multi-field types (elasticsearch, kafka, sftp)', () => {
      assert.deepEqual(LOG_SECRET_FIELDS.elasticsearch, ['password', 'tls_client_key']);
      assert.deepEqual(LOG_SECRET_FIELDS.kafka, ['password', 'tls_client_key']);
      assert.deepEqual(LOG_SECRET_FIELDS.sftp, ['secret_key', 'password']);
    });
  });

  describe('detectSecrets - log fields', () => {
    it('detects every supported log type and replaces the secret with a variable', () => {
      // one log block per single-field integration; multi-field types get a separate test
      const svc = service(`{
        "bigqueries":       [{ "name": "b", "secret_key": "SECRET-BQ" }],
        "cloudfiles":       [{ "name": "c", "access_key": "SECRET-CF" }],
        "datadog":          [{ "name": "d", "token": "SECRET-DD" }],
        "digitalocean":     [{ "name": "do", "secret_key": "SECRET-DO", "access_key": "PUBLIC" }],
        "ftp":              [{ "name": "f", "password": "SECRET-FTP" }],
        "gcs":              [{ "name": "g", "secret_key": "SECRET-GCS" }],
        "pubsub":           [{ "name": "p", "secret_key": "SECRET-PS" }],
        "grafanacloudlogs": [{ "name": "g", "token": "SECRET-GR" }],
        "https":            [{ "name": "h", "header_value": "SECRET-HTTPS" }],
        "heroku":           [{ "name": "h", "token": "SECRET-HK" }],
        "honeycomb":        [{ "name": "h", "token": "SECRET-HC" }],
        "kinesis":          [{ "name": "k", "secret_key": "SECRET-KN", "access_key": "PUBLIC" }],
        "logshuttle":       [{ "name": "l", "token": "SECRET-LS" }],
        "loggly":           [{ "name": "l", "token": "SECRET-LG" }],
        "azureblob":        [{ "name": "a", "sas_token": "SECRET-AZ" }],
        "newrelics":        [{ "name": "n", "token": "SECRET-NR" }],
        "newrelicotlp":     [{ "name": "n", "token": "SECRET-NO" }],
        "openstack":        [{ "name": "o", "access_key": "SECRET-OS" }],
        "s3":               [{ "name": "s", "secret_key": "SECRET-S3", "access_key": "PUBLIC" }],
        "scalyr":           [{ "name": "s", "token": "SECRET-SC" }],
        "splunks":          [{ "name": "s", "token": "SECRET-SP" }],
        "syslog":           [{ "name": "s", "tls_client_key": "SECRET-SL" }]
      }`);

      detectSecrets(svc, 'replace');

      assert.equal(svc.bigqueries[0].secret_key, '${{LOG_BIGQUERIES_SECRET_KEY}}');
      assert.equal(svc.cloudfiles[0].access_key, '${{LOG_CLOUDFILES_ACCESS_KEY}}');
      assert.equal(svc.datadog[0].token, '${{LOG_DATADOG_TOKEN}}');
      assert.equal(svc.digitalocean[0].secret_key, '${{LOG_DIGITALOCEAN_SECRET_KEY}}');
      assert.equal(svc.digitalocean[0].access_key, 'PUBLIC');
      assert.equal(svc.ftp[0].password, '${{LOG_FTP_PASSWORD}}');
      assert.equal(svc.gcs[0].secret_key, '${{LOG_GCS_SECRET_KEY}}');
      assert.equal(svc.pubsub[0].secret_key, '${{LOG_PUBSUB_SECRET_KEY}}');
      assert.equal(svc.grafanacloudlogs[0].token, '${{LOG_GRAFANACLOUDLOGS_TOKEN}}');
      assert.equal(svc.https[0].header_value, '${{LOG_HTTPS_HEADER_VALUE}}');
      assert.equal(svc.heroku[0].token, '${{LOG_HEROKU_TOKEN}}');
      assert.equal(svc.honeycomb[0].token, '${{LOG_HONEYCOMB_TOKEN}}');
      assert.equal(svc.kinesis[0].secret_key, '${{LOG_KINESIS_SECRET_KEY}}');
      assert.equal(svc.kinesis[0].access_key, 'PUBLIC');
      assert.equal(svc.logshuttle[0].token, '${{LOG_LOGSHUTTLE_TOKEN}}');
      assert.equal(svc.loggly[0].token, '${{LOG_LOGGLY_TOKEN}}');
      assert.equal(svc.azureblob[0].sas_token, '${{LOG_AZUREBLOB_SAS_TOKEN}}');
      assert.equal(svc.newrelics[0].token, '${{LOG_NEWRELICS_TOKEN}}');
      assert.equal(svc.newrelicotlp[0].token, '${{LOG_NEWRELICOTLP_TOKEN}}');
      assert.equal(svc.openstack[0].access_key, '${{LOG_OPENSTACK_ACCESS_KEY}}');
      assert.equal(svc.s3[0].secret_key, '${{LOG_S3_SECRET_KEY}}');
      assert.equal(svc.s3[0].access_key, 'PUBLIC');
      assert.equal(svc.scalyr[0].token, '${{LOG_SCALYR_TOKEN}}');
      assert.equal(svc.splunks[0].token, '${{LOG_SPLUNKS_TOKEN}}');
      assert.equal(svc.syslog[0].tls_client_key, '${{LOG_SYSLOG_TLS_CLIENT_KEY}}');
    });

    it('detects both fields on multi-field types (elasticsearch, kafka)', () => {
      const svc = service(`{
        "elasticsearch": [{ "name": "e", "password": "PWD-ES", "tls_client_key": "KEY-ES" }],
        "kafka":         [{ "name": "k", "password": "PWD-K",  "tls_client_key": "KEY-K"  }]
      }`);

      detectSecrets(svc, 'replace');

      assert.equal(svc.elasticsearch[0].password, '${{LOG_ELASTICSEARCH_PASSWORD}}');
      assert.equal(svc.elasticsearch[0].tls_client_key, '${{LOG_ELASTICSEARCH_TLS_CLIENT_KEY}}');
      assert.equal(svc.kafka[0].password, '${{LOG_KAFKA_PASSWORD}}');
      assert.equal(svc.kafka[0].tls_client_key, '${{LOG_KAFKA_TLS_CLIENT_KEY}}');
    });

    it('handles partially-set multi-field types (sftp with secret_key only, sftp with password only)', () => {
      const svc = service(`{
        "sftp": [
          { "name": "a", "secret_key": "KEY-A", "password": "PWD-A" },
          { "name": "b", "password": "PWD-B" },
          { "name": "c", "secret_key": "KEY-C" }
        ]
      }`);

      detectSecrets(svc, 'replace');

      assert.equal(svc.sftp[0].secret_key, '${{LOG_SFTP_SECRET_KEY}}');
      assert.equal(svc.sftp[0].password, '${{LOG_SFTP_PASSWORD}}');
      assert.equal(svc.sftp[1].password, '${{LOG_SFTP_PASSWORD}}');
      assert.equal(svc.sftp[1].secret_key, undefined);
      assert.equal(svc.sftp[2].secret_key, '${{LOG_SFTP_SECRET_KEY}}');
      assert.equal(svc.sftp[2].password, undefined);
    });

    it('treats sumologic url as the secret', () => {
      const svc = service(`{
        "sumologic": [{ "name": "s", "url": "https://endpoint.sumologic.com/receiver/v1/http/COLLECTOR-TOKEN" }]
      }`);

      detectSecrets(svc, 'replace');

      assert.equal(svc.sumologic[0].url, '${{LOG_SUMOLOGIC_URL}}');
    });

    it('skips values that are already templated variables', () => {
      const svc = service(`{
        "datadog": [{ "name": "d", "token": "\${{EXISTING_VAR}}" }],
        "kafka":   [{ "name": "k", "password": "\${{EXISTING_PWD}}", "tls_client_key": "NEW-KEY" }]
      }`);

      detectSecrets(svc, 'replace');

      assert.equal(svc.datadog[0].token, '${{EXISTING_VAR}}');
      assert.equal(svc.kafka[0].password, '${{EXISTING_PWD}}');
      assert.equal(svc.kafka[0].tls_client_key, '${{LOG_KAFKA_TLS_CLIENT_KEY}}');
    });

    it('skips empty / missing fields', () => {
      const svc = service(`{
        "datadog": [{ "name": "d", "token": "" }],
        "kafka":   [{ "name": "k" }]
      }`);

      detectSecrets(svc, 'replace');

      assert.equal(svc.datadog[0].token, '');
      assert.equal(svc.kafka[0].password, undefined);
      assert.ok(!fs.existsSync(SECRETS_FILE), '.secrets.env should not be created when nothing was found');
    });

    it('does not modify values in warn mode', () => {
      const svc = service(`{
        "datadog": [{ "name": "d", "token": "PLAIN-TOKEN" }],
        "kafka":   [{ "name": "k", "password": "PLAIN-PWD", "tls_client_key": "PLAIN-KEY" }]
      }`);

      detectSecrets(svc, 'warn');

      assert.equal(svc.datadog[0].token, 'PLAIN-TOKEN');
      assert.equal(svc.kafka[0].password, 'PLAIN-PWD');
      assert.equal(svc.kafka[0].tls_client_key, 'PLAIN-KEY');
      assert.ok(!fs.existsSync(SECRETS_FILE), '.secrets.env should not be written in warn mode');
    });

    it('does nothing when the log type array is missing or not an array', () => {
      const svc = { dictionaries: [], vcls: [], snippets: [], datadog: undefined, kafka: 'not-an-array' };

      // should not throw
      detectSecrets(svc, 'replace');
    });
  });

  describe('.secrets.env file output', () => {
    it('writes one entry per detected secret with a trailing newline', () => {
      const svc = service(`{
        "datadog": [{ "name": "d", "token": "TOKEN-A" }],
        "splunks": [{ "name": "s", "token": "TOKEN-B" }]
      }`);

      detectSecrets(svc, 'replace');

      const content = fs.readFileSync(SECRETS_FILE, 'utf8');
      assert.ok(content.endsWith('\n'), 'file must end with a trailing newline');
      const lines = content.trimEnd().split('\n');
      assert.deepEqual(lines.sort(), ['LOG_DATADOG_TOKEN="TOKEN-A"', 'LOG_SPLUNKS_TOKEN="TOKEN-B"']);
    });

    it('escapes newlines and carriage returns so multi-line PEM keys round-trip via dotenv', () => {
      const pem = '-----BEGIN PRIVATE KEY-----\nMIIEvQ\nABC\n-----END PRIVATE KEY-----\n';
      const svc = service(`{
        "gcs":   [{ "name": "g", "secret_key":   ${JSON.stringify(pem)} }],
        "https": [{ "name": "h", "header_value": ${JSON.stringify('crlf:\r\n')} }]
      }`);

      detectSecrets(svc, 'replace');

      const content = fs.readFileSync(SECRETS_FILE, 'utf8');
      assert.ok(
        content.includes(
          'LOG_GCS_SECRET_KEY="-----BEGIN PRIVATE KEY-----\\nMIIEvQ\\nABC\\n-----END PRIVATE KEY-----\\n"',
        ),
        `unexpected gcs line in: ${content}`,
      );
      assert.ok(content.includes('LOG_HTTPS_HEADER_VALUE="crlf:\\r\\n"'), `unexpected https line in: ${content}`);
      // the file should be a single line per secret (no real newlines inside values)
      const lines = content.trimEnd().split('\n');
      assert.equal(lines.length, 2);
    });

    it('escapes embedded double quotes', () => {
      const svc = service(`{
        "https": [{ "name": "h", "header_value": ${JSON.stringify('has "quoted" word')} }]
      }`);

      detectSecrets(svc, 'replace');

      const content = fs.readFileSync(SECRETS_FILE, 'utf8');
      assert.ok(content.includes('LOG_HTTPS_HEADER_VALUE="has \\"quoted\\" word"'), `unexpected escape in: ${content}`);
    });
  });
});
