import * as assert from 'assert';

import { normalizeCopilotModels } from '../../models';

suite('fetchCopilotModels - unit contract', () => {
  test('filters models missing capabilities.type', () => {
    const rawModels = [
      { id: 'gpt-4o', capabilities: { type: 'chat' } },
      { id: 'ada-embed', capabilities: { type: 'embeddings' } },
      { id: 'unknown-model' },
    ];

    const chatModels = normalizeCopilotModels(rawModels);

    assert.strictEqual(chatModels.length, 2);
    assert.ok(chatModels.some((model) => model.id === 'gpt-4o'));
    assert.ok(chatModels.some((model) => model.id === 'unknown-model'));
  });
});
