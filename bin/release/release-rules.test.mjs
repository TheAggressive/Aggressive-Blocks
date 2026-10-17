import assert from 'node:assert/strict';
import { readFileSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

// Run the committed .releaserc.json through the commit analyzer that release
// planning (bin/release/plan.mjs) uses, rather than restating its rules.
const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..'
);
const configuration = JSON.parse(
  readFileSync(path.join(repositoryRoot, '.releaserc.json'), 'utf8')
);
const [, analyzerOptions] = configuration.plugins.find(
  plugin =>
    Array.isArray(plugin) && plugin[0] === '@semantic-release/commit-analyzer'
);
// pnpm installs the analyzer as a dependency of semantic-release only.
const requireFromSemanticRelease = createRequire(
  realpathSync(
    path.join(repositoryRoot, 'node_modules/semantic-release/package.json')
  )
);
const { analyzeCommits } = await import(
  requireFromSemanticRelease.resolve('@semantic-release/commit-analyzer')
);

const [, notesOptions] = configuration.plugins.find(
  plugin =>
    Array.isArray(plugin) &&
    plugin[0] === '@semantic-release/release-notes-generator'
);
const { default: createPreset } =
  await import('conventional-changelog-conventionalcommits');
const { generateNotes } = await import(
  requireFromSemanticRelease.resolve(
    '@semantic-release/release-notes-generator'
  )
);

/** @param {string[]} messages */
function releaseType(messages) {
  return analyzeCommits(analyzerOptions, {
    commits: messages.map((message, index) => ({
      hash: String(index),
      message,
    })),
    cwd: repositoryRoot,
    logger: { log() {}, error() {} },
    options: {},
  });
}

describe('release rules', () => {
  it('releases plugin features and fixes as before', async () => {
    assert.equal(
      await releaseType(['feat(modal): add a close label']),
      'minor'
    );
    assert.equal(await releaseType(['fix: keep focus in the dialog']), 'patch');
    assert.equal(
      await releaseType(['perf(parallax): skip idle frames']),
      'patch'
    );
    assert.equal(
      await releaseType(['feat!: drop the 1.x block names']),
      'major'
    );
  });

  it('never releases for CI-scoped commits, whatever their type', async () => {
    for (const message of [
      'fix(ci): re-decide PRs whose branch the policy updated',
      'feat(ci): add a scheduled audit',
      'fix(ci)!: replace the release pipeline',
    ]) {
      assert.equal(await releaseType([message]), null, message);
    }
  });

  it('still releases when a CI change ships with a plugin fix', async () => {
    assert.equal(
      await releaseType([
        'fix(ci): retry the flaky lane',
        'fix: escape the label',
      ]),
      'patch'
    );
  });

  it('keeps maintenance types release-free', async () => {
    for (const message of [
      'chore(deps): bump the tooling',
      'ci: add a workflow',
      'test: raise the coverage floor',
      'docs: describe updates',
    ]) {
      assert.equal(await releaseType([message]), null, message);
    }
  });
});

describe('release notes', () => {
  it('renders the configured preset with the installed semantic-release writer', async () => {
    // Explicitly exercise the project's preset: stale local pnpm links can
    // otherwise resolve the generator's older development-only preset first.
    const preset = await createPreset();
    const notes = await generateNotes(
      { ...notesOptions, parserOpts: preset.parser, writerOpts: preset.writer },
      {
        cwd: repositoryRoot,
        options: {
          repositoryUrl:
            configuration.repositoryUrl ??
            'https://github.com/TheAggressive/Aggressive-Blocks.git',
        },
        commits: [
          {
            hash: 'a'.repeat(40),
            message: 'fix: keep carousel video paused (#65)',
          },
          { hash: 'b'.repeat(40), message: 'feat: add native editor controls' },
        ],
        lastRelease: { gitTag: 'v2.1.2', gitHead: 'c'.repeat(40) },
        nextRelease: {
          version: '2.2.0',
          gitTag: 'v2.2.0',
          gitHead: 'd'.repeat(40),
        },
        logger: { log() {}, error() {} },
      }
    );
    assert.match(notes, /Bug Fixes/);
    assert.match(notes, /keep carousel video paused/);
    assert.match(notes, /Features/);
    assert.match(notes, /add native editor controls/);
    assert.match(notes, /compare\/v2\.1\.2\.\.\.v2\.2\.0/);
  });
});
