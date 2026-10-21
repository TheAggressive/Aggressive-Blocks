import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { cleanup, stubCommand, workspace } from '../lib/script-harness.mjs';

const require = createRequire(import.meta.url);
const { wordpressDockerFileContents, cliDockerFileContents } = require(
  fileURLToPath(
    new URL(
      '../../node_modules/@wordpress/env/lib/runtime/docker/docker-config.js',
      import.meta.url
    )
  )
);

after(cleanup);

function dockerfiles({ phpVersion = '8.2', xdebug = 'coverage' } = {}) {
  const config = {
    xdebug,
    spx: 'off',
    env: {
      development: { port: 9930, phpVersion },
      tests: { port: 9931, phpVersion },
    },
  };
  return [wordpressDockerFileContents, cliDockerFileContents].flatMap(make =>
    ['development', 'tests'].map(env => make(env, config))
  );
}

function installation() {
  const [dockerfile] = dockerfiles();
  const command = dockerfile.match(/RUN (set -eu;[\s\S]*?)\nRUN /u)?.[1];
  assert.ok(command, 'PHP 8.2 must use the verified offline installer');
  return command;
}

test('all four PHP 8.2 containers install pinned Xdebug without REST metadata', () => {
  for (const dockerfile of dockerfiles()) {
    assert.match(
      dockerfile,
      /https:\/\/xdebug.org\/files\/xdebug-3\.5\.3\.tgz/u
    );
    assert.match(dockerfile, /sha256sum -c -/u);
    assert.match(
      dockerfile,
      /pecl install --offline \/tmp\/wp-env-xdebug.tgz/u
    );
    assert.doesNotMatch(dockerfile, /pecl install xdebug/u);
    assert.match(dockerfile, /docker-php-ext-enable xdebug/u);
    assert.match(dockerfile, /xdebug.mode=coverage/u);
  }
});

test('disabled Xdebug and other PHP versions keep upstream behavior', () => {
  for (const dockerfile of dockerfiles({ xdebug: 'off' })) {
    assert.doesNotMatch(dockerfile, /xdebug|pecl install/u);
  }
  for (const dockerfile of dockerfiles({ phpVersion: '7.4' })) {
    assert.match(dockerfile, /pecl install xdebug-3\.1\.6/u);
    assert.doesNotMatch(dockerfile, /xdebug.org\/files/u);
  }
});

function runInstallation({
  downloadStatus = 0,
  checksumStatus = 0,
  installStatus = 0,
} = {}) {
  const root = workspace('ab-xdebug');
  const log = path.join(root, 'commands');
  const archive = path.join(root, 'xdebug.tgz');
  stubCommand(
    root,
    'curl',
    `echo download >> '${log}'\ntouch '${archive}'\nexit ${downloadStatus}`
  );
  stubCommand(
    root,
    'sha256sum',
    `cat > '${root}/checksum'\necho checksum >> '${log}'\nexit ${checksumStatus}`
  );
  stubCommand(
    root,
    'pecl',
    `printf 'pecl %s\\n' "$*" >> '${log}'\nexit ${installStatus}`
  );
  const result = spawnSync(
    '/bin/sh',
    ['-c', installation().replaceAll('/tmp/wp-env-xdebug.tgz', archive)],
    {
      encoding: 'utf8',
      env: { ...process.env, PATH: `${root}:${process.env.PATH}` },
    }
  );
  return { ...result, log: fs.readFileSync(log, 'utf8'), archive };
}

test('download or checksum failure prevents installation', () => {
  for (const options of [{ downloadStatus: 22 }, { checksumStatus: 1 }]) {
    const result = runInstallation(options);
    assert.notEqual(result.status, 0);
    assert.doesNotMatch(result.log, /pecl/u);
  }
});

test('installation failure is not hidden by cleanup', () => {
  const result = runInstallation({ installStatus: 1 });
  assert.equal(result.status, 1);
  assert.match(result.log, /pecl install --offline/u);
});

test('successful installation checks the archive before installing and removes it', () => {
  const result = runInstallation();
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.log, /^download\nchecksum\npecl install --offline /u);
  assert.equal(fs.existsSync(result.archive), false);
});
