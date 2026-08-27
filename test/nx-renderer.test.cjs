const assert = require('node:assert/strict');
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

function createRenderer(changes, aiBaseUrl) {
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
    },
    conventionalCommitsConfig,
    remoteReleaseClient,
  });
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
