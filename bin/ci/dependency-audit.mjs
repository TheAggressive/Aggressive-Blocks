#!/usr/bin/env node

/**
 * Weekly advisory audit of every locked dependency, development tools included.
 *
 * The PR gate audits production npm dependencies only, and the PHP lane's
 * `composer audit` is informational, so a newly published advisory never
 * blocks unrelated work. Dependabot fixes what it can on its own. This audit
 * surfaces the rest — advisories that need a parent major, an override, or a
 * fix that is not published yet — as one tracking issue that updates itself and
 * closes when the audit is clean. Advisories listed in ACCEPTED_ADVISORIES are
 * held out only while no published version fixes them.
 *
 * `node bin/ci/dependency-audit.mjs` prints the report and exits 1 when there
 * is anything to fix. `--sync-issue` (the scheduled workflow) manages the issue
 * instead and exits 0; a failed audit still fails the run, and never closes
 * the issue.
 */

import { execFileSync, spawnSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

export const ISSUE_LABEL = 'dependency-advisories';
export const ISSUE_TITLE = 'Dependency advisories need attention';
const ISSUE_AUTHOR = 'app/github-actions';
const MARKER = /<!-- dependency-audit: ([^>]*) -->/u;
const SEVERITY_RANK = ['critical', 'high', 'moderate', 'medium', 'low', 'info'];

/**
 * npm advisories that no published version fixes, each accepted for the reason
 * beside it. One stays out of the report only while that is still true, so it
 * comes back the week a fix ships. (pnpm's `auditConfig.ignoreGhsas` would hide
 * it for good.)
 */
export const ACCEPTED_ADVISORIES = {
  'GHSA-vfj7-8cjw-p6xm':
    'braces is locally patched to cap parser and AST walker nesting at 100; bin/dependency-patches.test.mjs tests the installed patch. Remove the patch when a fixed version ships.',
  'GHSA-hp3w-g68c-fv3c':
    'sprintf-js is locally patched to cap formatting width at 10000 and precision at 100; bin/dependency-patches.test.mjs tests the installed patch. Remove the patch when a fixed version ships.',
};

/** @param {RegExpExecArray} left @param {RegExpExecArray} right */
function compareVersions(left, right) {
  for (const index of [1, 2, 3]) {
    const difference = Number(left[index]) - Number(right[index]);
    if (difference !== 0) return difference;
  }
  return 0;
}

/**
 * Whether a published release satisfies a patched range. Ranges other than
 * `>=x.y.z` alternatives count as published, so the advisory stays reported.
 *
 * @param {string} range Patched range from the audit, such as `>=3.0.4`.
 * @param {string[]} versions Every published version of the package.
 */
export function fixPublished(range, versions) {
  if (range.trim() === '<0.0.0') return false;
  const floors = range
    .split('||')
    .map(part => /^\s*>=\s*(\d+)\.(\d+)\.(\d+)\s*$/u.exec(part));
  if (floors.some(floor => !floor)) return true;
  return versions.some(version => {
    const release = /^(\d+)\.(\d+)\.(\d+)$/u.exec(version);
    return (
      release && floors.some(floor => compareVersions(release, floor) >= 0)
    );
  });
}

/**
 * Split out accepted advisories that still have no published fix.
 *
 * @param {Finding[]} findings
 * @param {Record<string, string>} accepted Advisory id to reason.
 * @param {(name: string) => string[]} publishedVersions
 * @return {{open: Finding[], accepted: Finding[]}}
 */
export function partitionAccepted(findings, accepted, publishedVersions) {
  const result = { open: [], accepted: [] };
  for (const finding of findings) {
    const held =
      finding.ecosystem === 'npm' &&
      Object.hasOwn(accepted, finding.advisory) &&
      !fixPublished(finding.fixed, publishedVersions(finding.package));
    result[held ? 'accepted' : 'open'].push(finding);
  }
  return result;
}

/**
 * @typedef {object} Finding
 * @property {'npm' | 'composer'} ecosystem
 * @property {string} advisory
 * @property {string} package
 * @property {string} severity
 * @property {string} title
 * @property {string} url
 * @property {string[]} installed
 * @property {string} vulnerable
 * @property {string} fixed
 * @property {string[]} via
 */

/** @param {Finding} finding */
export function findingKey(finding) {
  return `${finding.ecosystem}:${finding.package}:${finding.advisory}`;
}

/**
 * @param {string} output `pnpm audit --json` stdout.
 * @return {Finding[]}
 */
export function parsePnpmAudit(output) {
  const report = JSON.parse(output);
  if (
    !report ||
    typeof report.advisories !== 'object' ||
    report.advisories === null ||
    typeof report.metadata?.vulnerabilities !== 'object'
  ) {
    throw new Error('pnpm audit did not return an advisory report.');
  }

  return Object.values(report.advisories).map(advisory => {
    const findings = advisory.findings ?? [];
    const via = findings
      .flatMap(finding => finding.paths ?? [])
      .map(chain => chain.split('>').slice(1, -1).join(' › ') || 'direct');
    return {
      ecosystem: 'npm',
      advisory: advisory.github_advisory_id || String(advisory.id),
      package: advisory.module_name,
      severity: advisory.severity ?? 'unknown',
      title: advisory.title ?? '',
      url: advisory.url ?? '',
      installed: unique(findings.map(finding => finding.version)),
      vulnerable: advisory.vulnerable_versions ?? '',
      fixed: advisory.patched_versions ?? '',
      via: unique(via),
    };
  });
}

/**
 * @param {string} output `composer audit --format=json` stdout.
 * @param {{ packages?: Array<{name: string, version: string}>,
 *   'packages-dev'?: Array<{name: string, version: string}> }} lock
 * @return {Finding[]}
 */
export function parseComposerAudit(output, lock) {
  const report = JSON.parse(output);
  if (!report || !('advisories' in report)) {
    throw new Error('composer audit did not return an advisory report.');
  }

  const locked = new Map(
    [...(lock.packages ?? []), ...(lock['packages-dev'] ?? [])].map(entry => [
      entry.name,
      entry.version,
    ])
  );
  // PHP encodes an empty map as [], and a populated one as an object.
  const byPackage = Array.isArray(report.advisories) ? {} : report.advisories;

  return Object.entries(byPackage).flatMap(([name, advisories]) =>
    Object.values(advisories).map(advisory => ({
      ecosystem: 'composer',
      advisory: advisory.cve || advisory.advisoryId,
      package: name,
      severity: advisory.severity ?? 'unknown',
      title: advisory.title ?? '',
      url: advisory.link ?? '',
      installed: locked.has(name) ? [locked.get(name)] : [],
      vulnerable: advisory.affectedVersions ?? '',
      fixed: '',
      via: [],
    }))
  );
}

/** @param {Finding[]} findings */
export function sortFindings(findings) {
  const rank = severity => {
    const index = SEVERITY_RANK.indexOf(severity);
    return index === -1 ? SEVERITY_RANK.length : index;
  };
  return [...findings].sort(
    (left, right) =>
      rank(left.severity) - rank(right.severity) ||
      left.package.localeCompare(right.package) ||
      left.advisory.localeCompare(right.advisory)
  );
}

/** @param {string} value */
function cell(value) {
  return value.replace(/\r?\n/gu, ' ').replace(/\|/gu, '\\|').trim() || '—';
}

/** @param {Finding[]} accepted */
export function renderAccepted(accepted) {
  if (accepted.length === 0) return '';
  const lines = sortFindings(accepted).map(
    finding =>
      `- ${finding.package} ${finding.installed.join(', ')}: [${finding.advisory}](${finding.url}). ${ACCEPTED_ADVISORIES[finding.advisory] ?? ''}`
  );
  return `\nAccepted while no published version fixes them; each is reported again once one does (\`ACCEPTED_ADVISORIES\` in \`bin/ci/dependency-audit.mjs\`):\n\n${lines.join('\n')}\n`;
}

/**
 * @param {Finding[]} findings
 * @param {string} runUrl
 * @param {Finding[]} [accepted]
 */
export function renderIssue(findings, runUrl, accepted = []) {
  const sorted = sortFindings(findings);
  const keys = sorted.map(findingKey).join(',');
  const rows = sorted.map(finding => {
    const advisory = finding.url
      ? `[${finding.advisory}](${finding.url})`
      : finding.advisory;
    const via =
      finding.via.length > 2
        ? `${finding.via.slice(0, 2).join('<br>')}<br>+${finding.via.length - 2} more`
        : finding.via.join('<br>');
    return `| ${cell(finding.severity)} | ${cell(`${finding.ecosystem}: ${finding.package}`)} | ${cell(finding.installed.join(', '))} | ${cell(finding.fixed)} | ${advisory}<br>${cell(finding.title)} | ${cell(via)} |`;
  });

  return `<!-- dependency-audit: ${keys} -->
The weekly audit of the locked npm and Composer dependencies, development tools included, found ${sorted.length} ${sorted.length === 1 ? 'advisory' : 'advisories'} that Dependabot has not fixed.

| Severity | Package | Installed | Fixed in | Advisory | Pulled in by |
| --- | --- | --- | --- | --- | --- |
${rows.join('\n')}

To resolve one, update the package that pulls it in; Dependabot opens those PRs for \`@wordpress/scripts\` and \`@wordpress/env\` majors. Where the parent still pins a vulnerable version, add a floor to \`overrides\` in \`pnpm-workspace.yaml\`. See [docs/ci.md](../blob/main/docs/ci.md#dependency-advisories).

${renderAccepted(accepted)}
This issue is managed by the Dependency Audit workflow. It updates weekly and closes itself when the audit is clean. Last run: ${runUrl}
`;
}

/**
 * @param {string} body
 * @return {Set<string>}
 */
export function recordedKeys(body) {
  const match = MARKER.exec(body ?? '');
  return new Set(match?.[1] ? match[1].split(',').filter(Boolean) : []);
}

/**
 * Decide what the tracking issue needs.
 *
 * @param {Finding[]} findings
 * @param {{number: number, body: string} | null} issue
 * @return {{action: 'none' | 'create' | 'update' | 'close',
 *   added: Finding[]}}
 */
export function planIssue(findings, issue) {
  if (findings.length === 0) {
    return { action: issue ? 'close' : 'none', added: [] };
  }
  if (!issue) return { action: 'create', added: sortFindings(findings) };

  const previous = recordedKeys(issue.body);
  return {
    action: 'update',
    added: sortFindings(
      findings.filter(finding => !previous.has(findingKey(finding)))
    ),
  };
}

/** @param {string[]} values */
function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function run(command, args) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  if (result.error) throw result.error;
  // Both tools exit non-zero when they find advisories; the parsers decide
  // whether the output is a real report.
  return result.stdout;
}

function gh(args) {
  return execFileSync('gh', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  });
}

/** @param {string} name */
function publishedVersions(name) {
  const versions = JSON.parse(
    execFileSync(
      'npm',
      ['view', name, 'versions', '--json', '--loglevel=error'],
      {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'inherit'],
      }
    )
  );
  return Array.isArray(versions) ? versions : [versions];
}

function audit() {
  const lock = JSON.parse(readFileSync('composer.lock', 'utf8'));
  return [
    ...parsePnpmAudit(run('pnpm', ['audit', '--json'])),
    ...parseComposerAudit(
      run('composer', [
        'audit',
        '--locked',
        '--abandoned=ignore',
        '--format=json',
        '--no-interaction',
      ]),
      lock
    ),
  ];
}

/** @param {Finding[]} findings */
function summaryLine(findings) {
  return findings
    .map(
      finding => `- ${finding.severity} ${finding.package} ${finding.advisory}`
    )
    .join('\n');
}

function syncIssue(findings, runUrl, accepted) {
  gh([
    'label',
    'create',
    ISSUE_LABEL,
    '--color',
    'b60205',
    '--description',
    'Open advisories in locked dependencies; managed by Dependency Audit',
    '--force',
  ]);

  const [issue = null] = JSON.parse(
    gh([
      'issue',
      'list',
      '--label',
      ISSUE_LABEL,
      '--author',
      ISSUE_AUTHOR,
      '--state',
      'open',
      '--json',
      'number,body',
      '--limit',
      '1',
    ])
  );
  const plan = planIssue(findings, issue);

  if (plan.action === 'create') {
    const url = gh([
      'issue',
      'create',
      '--title',
      ISSUE_TITLE,
      '--label',
      ISSUE_LABEL,
      '--body',
      renderIssue(findings, runUrl, accepted),
    ]).trim();
    console.log(`Opened ${url}.`);
  } else if (plan.action === 'update') {
    // Editing the body does not notify anyone; a comment does, so only new
    // advisories get one.
    gh([
      'issue',
      'edit',
      String(issue.number),
      '--body',
      renderIssue(findings, runUrl, accepted),
    ]);
    if (plan.added.length > 0) {
      gh([
        'issue',
        'comment',
        String(issue.number),
        '--body',
        `New since the last audit:\n\n${summaryLine(plan.added)}`,
      ]);
    }
    console.log(
      `Updated #${issue.number}; ${plan.added.length} new ${plan.added.length === 1 ? 'advisory' : 'advisories'}.`
    );
  } else if (plan.action === 'close') {
    gh([
      'issue',
      'close',
      String(issue.number),
      '--reason',
      'completed',
      '--comment',
      `The audit is clean: ${runUrl}`,
    ]);
    console.log(`Closed #${issue.number}; the audit is clean.`);
  } else {
    console.log('The audit is clean; no tracking issue is open.');
  }
}

export function main(argv = process.argv.slice(2), environment = process.env) {
  const { open, accepted } = partitionAccepted(
    audit(),
    ACCEPTED_ADVISORIES,
    publishedVersions
  );
  const findings = sortFindings(open);
  const runUrl =
    environment.GITHUB_SERVER_URL &&
    environment.GITHUB_REPOSITORY &&
    environment.GITHUB_RUN_ID
      ? `${environment.GITHUB_SERVER_URL}/${environment.GITHUB_REPOSITORY}/actions/runs/${environment.GITHUB_RUN_ID}`
      : 'local run';
  const report =
    findings.length === 0
      ? `No open advisories in the locked npm or Composer dependencies.\n${renderAccepted(accepted)}`
      : renderIssue(findings, runUrl, accepted);

  if (environment.GITHUB_STEP_SUMMARY) {
    appendFileSync(environment.GITHUB_STEP_SUMMARY, report, 'utf8');
  }

  if (argv.includes('--sync-issue')) {
    syncIssue(findings, runUrl, accepted);
    return;
  }

  process.stdout.write(report);
  if (findings.length > 0) process.exitCode = 1;
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  main();
}
