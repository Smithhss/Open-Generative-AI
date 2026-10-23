import { test } from 'node:test';
import assert from 'node:assert/strict';
import { availableImageModels, imageGenerationBody, normalizeGeneratedImage } from '../lib/fyt/images.mjs';

test('image capability is limited to the supported model accessible in the selected group', () => {
  assert.deepEqual(availableImageModels(['gpt-image-2','deepseek','gpt-image-2']), ['gpt-image-2']);
  assert.deepEqual(availableImageModels(['deepseek']), []);
});
test('single image request excludes unknown model parameters and batch counts', () => {
  assert.deepEqual(imageGenerationBody({model:'gpt-image-2',group:'default',prompt:' hello ',n:4,size:'4k'}),
    {model:'gpt-image-2',group:'default',prompt:'hello',n:1,response_format:'b64_json',stream:false});
  for (const params of [{model:'other',group:'default',prompt:'hi'},{model:'gpt-image-2',group:'',prompt:'hi'},{model:'gpt-image-2',group:'default',prompt:' '.repeat(5)}]) assert.throws(()=>imageGenerationBody(params));
});
test('image response accepts raster base64 but rejects external URLs and active payloads', () => {
  assert.equal(normalizeGeneratedImage({data:[{b64_json:'iVBORw0KGgo='}]}).mime,'image/png');
  for (const body of [{data:[]},{data:[{url:'https://example.com/image.png'}]},{data:[{b64_json:'PHN2Zz4='}]},{data:[{b64_json:'data:image/png;base64,AAAA'}]}]) assert.throws(()=>normalizeGeneratedImage(body));
});

test('inline downloads decode locally without a fetch blocked by CSP', async () => {
  const { imageBlob } = await import('../packages/studio/src/utils/imageBlob.js');
  const original = globalThis.fetch;
  globalThis.fetch = () => { throw new Error('must not fetch inline media'); };
  try {
    const blob = await imageBlob('data:image/png;base64,iVBORw0KGgo=');
    assert.equal(blob.type,'image/png'); assert.equal(blob.size,8);
  } finally { globalThis.fetch = original; }
});

test('failed image POST is never retried and a late result cannot cross accounts', async () => {
  const { generateFytImage } = await import('../lib/fyt/images.mjs');
  const { acceptAuthBundle, clearSession } = await import('../lib/fyt/session.mjs');
  const bundle = id => ({ access_token:`fixture-${id}`, access_expires_at:Date.now()/1000+3600, user:{id}, session:{sid:`sid-${id}`} });
  const original=globalThis.fetch;
  const parameters={model:'gpt-image-2',group:'default',prompt:'cup'};
  try {
    let calls=0;
    acceptAuthBundle(bundle(1),{broadcast:false});
    globalThis.fetch=async()=>{calls++;throw new TypeError('network');};
    await assert.rejects(generateFytImage(parameters)); assert.equal(calls,1);
    let finish;
    globalThis.fetch=()=>new Promise(resolve=>{finish=resolve;});
    const pending=generateFytImage(parameters);
    await new Promise(resolve=>setImmediate(resolve));
    acceptAuthBundle(bundle(2),{broadcast:false});
    finish(Response.json({data:[{b64_json:'iVBORw0KGgo='}]}));
    await assert.rejects(pending,/SESSION_CHANGED/);
  } finally { globalThis.fetch=original;clearSession(); }
});

test('expired image session clears authentication without reissuing the POST', async () => {
  const { generateFytImage } = await import('../lib/fyt/images.mjs');
  const { acceptAuthBundle, clearSession, getSessionState } = await import('../lib/fyt/session.mjs');
  const original=globalThis.fetch; let calls=0;
  acceptAuthBundle({access_token:'fixture',access_expires_at:Date.now()/1000+3600,user:{id:1},session:{sid:'sid'}},{broadcast:false});
  globalThis.fetch=async()=>{calls++;return Response.json({},{status:401});};
  try {
    await assert.rejects(generateFytImage({model:'gpt-image-2',group:'default',prompt:'cup'}),/AUTH_REQUIRED/);
    assert.equal(calls,1);assert.equal(getSessionState().status,'anonymous');
  } finally { globalThis.fetch=original;clearSession(); }
});
