const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { mkdtempSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const test = require('node:test');

const lazyChangelog = require('../dist/index.js');
const AIChangelogRenderer = lazyChangelog.default;

const conventionalCommitsConfig = {
  types: {
    feat: {
      semverBump: 'minor',
      changelog: { title: '✨ Features', hidden: false },
    },
    fix: {
      semverBump: 'patch',
      changelog: { title: '🐛 Bug Fixes', hidden: false },
    },
  },
};

const remoteReleaseClient = {
  getRemoteRepoData: () => null,
  remoteReleaseProviderName: null,
};

function createRenderer(changes, aiBaseUrl, renderOptions = {}) {
  return new AIChangelogRenderer({
    changes,
    changelogEntryVersion: '1.128.0',
    project: null,
    entryWhenNoChanges: false,
    isVersionPlans: false,
    changelogRenderOptions: {
      aiProvider: 'openai',
      aiModel: 'test-model',
      aiBaseUrl,
      enableAISummary: true,
      includeDiffs: false,
      versionTitleDate: false,
      authors: false,
      ...renderOptions,
    },
    conventionalCommitsConfig,
    remoteReleaseClient,
  });
}

async function withDivergentReleaseBase(run) {
  const directory = mkdtempSync(join(tmpdir(), 'lazy-changelog-base-test-'));
  const originalCwd = process.cwd();
  const git = (...args) =>
    execFileSync('git', args, { cwd: directory, encoding: 'utf8' }).trim();

  try {
    git('init', '--quiet');
    git('config', 'user.name', 'Lazy Changelog Test');
    git('config', 'user.email', 'test@lazy-changelog.invalid');
    writeFileSync(join(directory, 'initial.txt'), 'initial\n');
    git('add', 'initial.txt');
    git('commit', '--message', 'chore: initial release');
    git('tag', 'v1.0.0');

    writeFileSync(join(directory, 'unrelated.txt'), 'STALE_DIFF_SENTINEL\n');
    git('add', 'unrelated.txt');
    git('commit', '--message', 'feat: unrelated historical dashboard work');
    const staleHash = git('rev-parse', '--short', 'HEAD');

    git('commit', '--allow-empty', '--message', 'chore(release): publish 1.1.0');
    git('branch', 'release-base');

    writeFileSync(join(directory, 'current.txt'), 'CURRENT_DIFF_SENTINEL\n');
    git('add', 'current.txt');
    git('commit', '--message', 'feat: current branch agent state stats');
    const currentHash = git('rev-parse', '--short', 'HEAD');

    process.chdir(directory);
    await run({ staleHash, currentHash });
  } finally {
    process.chdir(originalCwd);
    rmSync(directory, { recursive: true, force: true });
  }
}

async function withLargeDiffStat(run) {
  const directory = mkdtempSync(join(tmpdir(), 'lazy-changelog-stat-test-'));
  const originalCwd = process.cwd();
  const git = (...args) =>
    execFileSync('git', args, { cwd: directory, encoding: 'utf8' }).trim();

  try {
    git('init', '--quiet');
    git('config', 'user.name', 'Lazy Changelog Test');
    git('config', 'user.email', 'test@lazy-changelog.invalid');
    git('commit', '--allow-empty', '--message', 'chore: initial release');
    git('tag', 'v1.0.0');

    for (let index = 0; index < 200; index++) {
      const name = `long-release-stat-file-${index.toString().padStart(3, '0')}-${'x'.repeat(40)}.txt`;
      writeFileSync(join(directory, name), `change ${index}\n`);
    }
    git('add', '.');
    git('commit', '--message', 'feat: add many release files');
    const currentHash = git('rev-parse', '--short', 'HEAD');

    process.chdir(directory);
    await run({ currentHash });
  } finally {
    process.chdir(originalCwd);
    rmSync(directory, { recursive: true, force: true });
  }
}

async function withFakeOpenAI(content, run) {
  let receivedBody;
  const originalFetch = global.fetch;
  const originalApiKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = 'test-key';
  global.fetch = async (_input, init) => {
    receivedBody = JSON.parse(init.body);
    return new Response(
      JSON.stringify({
          id: 'response-test',
          created_at: 0,
          model: 'test-model',
          output: [
            {
              type: 'message',
              role: 'assistant',
              id: 'message-test',
              content: [
                { type: 'output_text', text: content, annotations: [] },
              ],
            },
          ],
          usage: { input_tokens: 10, output_tokens: 10 },
        }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  };

  try {
    await run({
      baseUrl: 'http://openai.test/v1',
      getReceivedBody: () => receivedBody,
    });
  } finally {
    global.fetch = originalFetch;
    if (originalApiKey === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = originalApiKey;
    }
  }
}

async function withGitRelease(run) {
  const directory = mkdtempSync(join(tmpdir(), 'lazy-changelog-test-'));
  const originalCwd = process.cwd();
  const git = (...args) =>
    execFileSync('git', args, { cwd: directory, encoding: 'utf8' }).trim();

  try {
    git('init', '--quiet');
    git('config', 'user.name', 'Lazy Changelog Test');
    git('config', 'user.email', 'test@lazy-changelog.invalid');
    git('commit', '--allow-empty', '--message', 'feat: stale historical feature');
    const staleHash = git('rev-parse', '--short', 'HEAD');
    git('tag', 'v1.0.0');
    git('commit', '--allow-empty', '--message', 'fix: current release fix');
    const currentHash = git('rev-parse', '--short', 'HEAD');
    process.chdir(directory);
    await run({ staleHash, currentHash });
  } finally {
    process.chdir(originalCwd);
    rmSync(directory, { recursive: true, force: true });
  }
}

test('Nx renderer summarizes the changes supplied by Nx', async () => {
  await withFakeOpenAI('### ✨ Features\n- Added canonical projections', async ({
    baseUrl,
    getReceivedBody,
  }) => {
    const renderer = createRenderer(
      [
        {
          type: 'feat',
          scope: 'data-store',
          description: 'NX_CANONICAL_CHANGE add current projections',
          affectedProjects: '*',
          shortHash: 'abc1234',
        },
      ],
      baseUrl,
    );

    const output = await renderer.render();
    const prompt = getReceivedBody().input[0].content[0].text;

    assert.match(prompt, /abc1234 feat\(data-store\): NX_CANONICAL_CHANGE add current projections/);
    assert.equal(
      output,
      '## 1.128.0\n\n### ✨ Features\n- Added canonical projections',
    );
  });
});

test('Nx renderer falls back to a non-empty changelog when AI returns blank text', async () => {
  await withFakeOpenAI('   ', async ({ baseUrl }) => {
    const renderer = createRenderer(
      [
        {
          type: 'feat',
          scope: 'data-store',
          description: 'NX_CANONICAL_CHANGE add current projections',
          affectedProjects: '*',
          shortHash: 'abc1234',
        },
      ],
      baseUrl,
    );

    const output = await renderer.render();

    assert.notEqual(output, '## 1.128.0');
    assert.match(output, /NX_CANONICAL_CHANGE add current projections/);
  });
});

test('Nx renderer removes an AI-generated release title', async () => {
  await withFakeOpenAI(
    '# Release Notes — 1.128.0\n\n### ✨ Features\n- Added canonical projections',
    async ({ baseUrl }) => {
      const renderer = createRenderer(
        [
          {
            type: 'feat',
            scope: 'data-store',
            description: 'add current projections',
            affectedProjects: '*',
            shortHash: 'abc1234',
          },
        ],
        baseUrl,
      );

      const output = await renderer.render();

      assert.equal(
        output,
        '## 1.128.0\n\n### ✨ Features\n- Added canonical projections',
      );
    },
  );
});

test('Nx renderer reports its canonical input and AI response diagnostics', async () => {
  await withFakeOpenAI('### ✨ Features\n- Added projections', async ({ baseUrl }) => {
    const renderer = createRenderer(
      [
        {
          type: 'feat',
          scope: 'data-store',
          description: 'add current projections',
          affectedProjects: '*',
          shortHash: 'abc1234',
        },
      ],
      baseUrl,
    );
    const messages = [];
    const originalLog = console.log;
    console.log = (...values) => messages.push(values.join(' '));

    try {
      await renderer.render();
    } finally {
      console.log = originalLog;
    }

    assert.ok(messages.some((message) =>
      message.includes('Changelog input: source=nx changes=1'),
    ));
    assert.ok(messages.some((message) =>
      /AI request: provider=openai model=test-model promptChars=\d+/.test(message),
    ));
    assert.ok(messages.some((message) =>
      /AI response: chars=\d+ finishReason=stop/.test(message),
    ));
  });
});

test('Nx renderer produces a deterministic fallback for change types Nx does not render', async () => {
  await withFakeOpenAI('   ', async ({ baseUrl }) => {
    const renderer = createRenderer(
      [
        {
          type: 'other',
          scope: '',
          description: 'Preserve this non-conventional change',
          affectedProjects: '*',
          shortHash: 'abc1234',
        },
      ],
      baseUrl,
    );

    const output = await renderer.render();

    assert.equal(
      output,
      '## 1.128.0\n\n### Changes\n\n- Preserve this non-conventional change',
    );
  });
});

test('Nx renderer honors Nx no-change behavior without calling AI', async () => {
  await withFakeOpenAI('Unexpected AI output', async ({
    baseUrl,
    getReceivedBody,
  }) => {
    const renderer = createRenderer([], baseUrl);

    const output = await renderer.render();

    assert.equal(output, '');
    assert.equal(getReceivedBody(), undefined);
  });
});

test('Nx renderer scopes Nx changes to commits after the previous release tag', async () => {
  await withGitRelease(async ({ staleHash, currentHash }) => {
    await withFakeOpenAI('### 🐛 Bug Fixes\n- Fixed current release', async ({
      baseUrl,
      getReceivedBody,
    }) => {
      const renderer = createRenderer(
        [
          {
            type: 'fix',
            scope: '',
            description: 'CURRENT_RELEASE_CHANGE',
            affectedProjects: '*',
            shortHash: currentHash,
          },
          {
            type: 'feat',
            scope: '',
            description: 'STALE_HISTORICAL_CHANGE',
            affectedProjects: '*',
            shortHash: staleHash,
          },
        ],
        baseUrl,
      );

      await renderer.render();
      const prompt = getReceivedBody().input[0].content[0].text;

      assert.match(prompt, /CURRENT_RELEASE_CHANGE/);
      assert.doesNotMatch(prompt, /STALE_HISTORICAL_CHANGE/);
    });
  });
});

test('Nx renderer fallback preserves the same release-scoped Nx changes', async () => {
  await withGitRelease(async ({ staleHash, currentHash }) => {
    await withFakeOpenAI('   ', async ({ baseUrl }) => {
      const renderer = createRenderer(
        [
          {
            type: 'fix',
            scope: '',
            description: 'CURRENT_RELEASE_FALLBACK_CHANGE',
            affectedProjects: '*',
            shortHash: currentHash,
          },
          {
            type: 'feat',
            scope: '',
            description: 'STALE_HISTORICAL_FALLBACK_CHANGE',
            affectedProjects: '*',
            shortHash: staleHash,
          },
        ],
        baseUrl,
      );

      const output = await renderer.render();

      assert.match(output, /CURRENT_RELEASE_FALLBACK_CHANGE/);
      assert.doesNotMatch(output, /STALE_HISTORICAL_FALLBACK_CHANGE/);
    });
  });
});

test('Nx renderer scopes changes and diffs to the configured branch base', async () => {
  await withDivergentReleaseBase(async ({ staleHash, currentHash }) => {
    await withFakeOpenAI('### ✨ Features\n- Added agent state stats', async ({
      baseUrl,
      getReceivedBody,
    }) => {
      const renderer = createRenderer(
        [
          {
            type: 'feat',
            scope: 'dashboards',
            description: 'CURRENT_BRANCH_CHANGE add agent state stats',
            affectedProjects: '*',
            shortHash: currentHash,
          },
          {
            type: 'feat',
            scope: 'dashboards',
            description: 'STALE_HISTORICAL_CHANGE add height controls',
            affectedProjects: '*',
            shortHash: staleHash,
          },
        ],
        baseUrl,
        {
          baseRef: 'release-base',
          includeDiffs: true,
        },
      );

      await renderer.render();
      const prompt = getReceivedBody().input[0].content[0].text;

      assert.match(prompt, /CURRENT_BRANCH_CHANGE/);
      assert.match(prompt, /CURRENT_DIFF_SENTINEL/);
      assert.doesNotMatch(prompt, /STALE_HISTORICAL_CHANGE/);
      assert.doesNotMatch(prompt, /STALE_DIFF_SENTINEL/);
    });
  });
});

test('Nx renderer bounds diff stats as part of the AI context budget', async () => {
  await withLargeDiffStat(async ({ currentHash }) => {
    await withFakeOpenAI('### ✨ Features\n- Added release files', async ({
      baseUrl,
      getReceivedBody,
    }) => {
      const renderer = createRenderer(
        [
          {
            type: 'feat',
            scope: '',
            description: 'add many release files',
            affectedProjects: '*',
            shortHash: currentHash,
          },
        ],
        baseUrl,
        {
          includeDiffs: { enabled: true, maxChars: 1000 },
        },
      );

      await renderer.render();
      const prompt = getReceivedBody().input[0].content[0].text;

      assert.match(prompt, /diff stat truncated/);
      assert.ok(prompt.length < 5000, `prompt was ${prompt.length} characters`);
    });
  });
});

test('Nx renderer bounds large change sets and reserves enough output tokens', async () => {
  const changes = Array.from({ length: 391 }, (_, index) => ({
    type: 'feat',
    scope: 'large-release',
    description: `Change ${index} ${'y'.repeat(300)}`,
    body: `${'x'.repeat(1800)} BODY_SHOULD_NOT_BE_SENT_${index}`,
    affectedProjects: '*',
    shortHash: `dead${index.toString(16).padStart(4, '0')}`,
  }));

  await withFakeOpenAI('### ✨ Features\n- Summarized large release', async ({
    baseUrl,
    getReceivedBody,
  }) => {
    const renderer = createRenderer(changes, baseUrl);

    await renderer.render();
    const request = getReceivedBody();
    const prompt = request.input[0].content[0].text;

    assert.ok(prompt.length <= 65_000, `prompt was ${prompt.length} characters`);
    assert.match(prompt, /changes truncated:/);
    assert.doesNotMatch(prompt, /BODY_SHOULD_NOT_BE_SENT/);
    assert.equal(request.max_output_tokens, 4096);
  });
});
