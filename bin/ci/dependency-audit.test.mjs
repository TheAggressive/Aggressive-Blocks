import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  findingKey,
  parseComposerAudit,
  parsePnpmAudit,
  planIssue,
  recordedKeys,
  renderIssue,
} from './dependency-audit.mjs';

const CLEAN_PNPM = JSON.stringify({
  advisories: {},
  metadata: {
    vulnerabilities: { info: 0, low: 0, moderate: 0, high: 0, critical: 0 },
  },
});

// Shape recorded from `pnpm audit --json` (pnpm 11) against uuid@8.3.2.
const VULNERABLE_PNPM = JSON.stringify({
  advisories: {
    1116970: {
      findings: [
        {
          version: '8.3.2',
          paths: [
            '.>@wordpress/scripts>webpack-dev-server>sockjs>uuid',
            '.>webpack-cli>webpack-dev-server>sockjs>uuid',
            '.>webpack-dev-server>sockjs>uuid',
          ],
        },
      ],
      id: 1116970,
      title: 'uuid: Missing buffer bounds check | in v3/v5/v6',
      module_name: 'uuid',
      vulnerable_versions: '<11.1.1',
      patched_versions: '>=11.1.1',
      severity: 'moderate',
      github_advisory_id: 'GHSA-w5hq-g745-h8pq',
      url: 'https://github.com/advisories/GHSA-w5hq-g745-h8pq',
    },
    1117000: {
      findings: [{ version: '6.0.2', paths: ['.>serialize-javascript'] }],
      id: 1117000,
      title: 'RCE via RegExp.flags',
      module_name: 'serialize-javascript',
      vulnerable_versions: '<=7.0.2',
      patched_versions: '>=7.0.3',
      severity: 'high',
      github_advisory_id: 'GHSA-5c6j-r48x-rmvq',
      url: 'https://github.com/advisories/GHSA-5c6j-r48x-rmvq',
    },
  },
  metadata: {
    vulnerabilities: { info: 0, low: 0, moderate: 1, high: 1, critical: 0 },
  },
});

const LOCK = {
  packages: [],
  'packages-dev': [{ name: 'phpunit/phpunit', version: '11.5.1' }],
};

const VULNERABLE_COMPOSER = JSON.stringify({
  advisories: {
    'phpunit/phpunit': [
      {
        advisoryId: 'PKSA-z3gr-8qht-p93v',
        packageName: 'phpunit/phpunit',
        affectedVersions: '>=11.0.0,<11.5.50',
        title: 'Unsafe deserialization in PHPT code coverage',
        cve: 'CVE-2026-24765',
        link: 'https://github.com/advisories/GHSA-vvj3-c3rp-c85p',
        severity: 'high',
      },
    ],
  },
  abandoned: [],
});

describe('dependency audit parsing', () => {
  it('reads a clean pnpm report', () => {
    assert.deepEqual(parsePnpmAudit(CLEAN_PNPM), []);
  });

  it('reads pnpm advisories with installed versions and parent chains', () => {
    const [uuid] = parsePnpmAudit(VULNERABLE_PNPM).filter(
      finding => finding.package === 'uuid'
    );

    assert.equal(uuid.advisory, 'GHSA-w5hq-g745-h8pq');
    assert.deepEqual(uuid.installed, ['8.3.2']);
    assert.equal(uuid.fixed, '>=11.1.1');
    assert.deepEqual(uuid.via, [
      '@wordpress/scripts › webpack-dev-server › sockjs',
      'webpack-cli › webpack-dev-server › sockjs',
      'webpack-dev-server › sockjs',
    ]);
  });

  it('marks a top-level dependency as direct', () => {
    const [direct] = parsePnpmAudit(VULNERABLE_PNPM).filter(
      finding => finding.package === 'serialize-javascript'
    );
    assert.deepEqual(direct.via, ['direct']);
  });

  it('refuses output that is not an advisory report', () => {
    assert.throws(() => parsePnpmAudit('{"error":{"code":"ERR_PNPM_AUDIT"}}'));
    assert.throws(() => parsePnpmAudit('ECONNRESET'));
    assert.throws(() => parseComposerAudit('{}', LOCK));
  });

  it('reads the empty Composer report PHP encodes as a list', () => {
    assert.deepEqual(
      parseComposerAudit('{"advisories":[],"abandoned":[]}', LOCK),
      []
    );
  });

  it('reads Composer advisories with the locked version', () => {
    const [finding] = parseComposerAudit(VULNERABLE_COMPOSER, LOCK);

    assert.equal(finding.ecosystem, 'composer');
    assert.equal(finding.advisory, 'CVE-2026-24765');
    assert.deepEqual(finding.installed, ['11.5.1']);
    assert.equal(finding.vulnerable, '>=11.0.0,<11.5.50');
  });
});

describe('dependency audit issue', () => {
  const findings = [
    ...parsePnpmAudit(VULNERABLE_PNPM),
    ...parseComposerAudit(VULNERABLE_COMPOSER, LOCK),
  ];

  it('orders by severity, records every key, and escapes table cells', () => {
    const body = renderIssue(findings, 'https://example.test/run');
    const rows = body.split('\n').filter(line => line.startsWith('| high'));

    assert.equal(rows.length, 2);
    assert.ok(body.indexOf('| high') < body.indexOf('| moderate'));
    assert.match(body, /Missing buffer bounds check \\\| in v3/u);
    assert.match(body, /\+1 more/u);
    assert.deepEqual(recordedKeys(body), new Set(findings.map(findingKey)));
  });

  it('opens an issue for the first findings', () => {
    const plan = planIssue(findings, null);
    assert.equal(plan.action, 'create');
    assert.equal(plan.added.length, 3);
  });

  it('updates quietly when nothing is new', () => {
    const issue = { number: 7, body: renderIssue(findings, 'run') };
    assert.deepEqual(planIssue(findings, issue), {
      action: 'update',
      added: [],
    });
  });

  it('reports only the advisories added since the last run', () => {
    const issue = { number: 7, body: renderIssue(findings.slice(1), 'run') };
    const plan = planIssue(findings, issue);

    assert.equal(plan.action, 'update');
    assert.deepEqual(plan.added.map(findingKey), [findingKey(findings[0])]);
  });

  it('closes the issue once the audit is clean, and otherwise does nothing', () => {
    assert.equal(planIssue([], { number: 7, body: '' }).action, 'close');
    assert.equal(planIssue([], null).action, 'none');
  });
});
