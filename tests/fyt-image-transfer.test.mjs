import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generatedImageFile } from '../lib/fyt/image-transfer.mjs';

test('generated image transfer preserves original bytes without network or credentials', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = () => { throw new Error('Local transfer must not fetch'); };
  try {
    const file = await generatedImageFile({ url: 'data:image/png;base64,iVBORw0KGgo=', token: 'not-used' });
    assert.equal(file.type, 'image/png'); assert.equal(file.size, 8);
    assert.deepEqual([...new Uint8Array(await file.arrayBuffer())], [137,80,78,71,13,10,26,10]);
    assert.match(file.name, /^fyt-image-\d+\.png$/);
  } finally { globalThis.fetch = original; }
});
test('transfer rejects remote sources, SVG, malformed data and images above editor budget', async () => {
  for (const url of ['https://example.com/image.png', 'blob:other', 'data:image/svg+xml;base64,PHN2Zz4=', 'data:image/png;base64,!?']) await assert.rejects(generatedImageFile({url}));
  const data = Buffer.alloc(10 * 1024 * 1024 + 1).toString('base64');
  await assert.rejects(generatedImageFile({ url: `data:image/png;base64,${data}` }), /LOCAL_IMAGE_SIZE/);
});
