import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  availableImageModels,
  imageGenerationBody,
  normalizeGeneratedImage,
  validateEditFile,
  imageEditFormData,
  MAX_EDIT_BYTES,
  imageArtifactUrl,
} from '../lib/fyt/images.mjs';

test('image capability keeps every image model the server reports, deduplicated', () => {
  assert.deepEqual(availableImageModels(['gpt-image-2','deepseek','gpt-image-2']), ['gpt-image-2','deepseek']);
  assert.deepEqual(availableImageModels([' flux-1.1 ', '']), ['flux-1.1']);
  assert.deepEqual(availableImageModels([]), []);
});
test('single image request excludes unknown model parameters and batch counts', () => {
  assert.deepEqual(imageGenerationBody({model:'flux-1.1',group:'default',prompt:' hello ',n:4,size:'4k'}),
    {model:'flux-1.1',group:'default',prompt:'hello',n:1,response_format:'b64_json',stream:false});
  for (const params of [{model:'',group:'default',prompt:'hi'},{model:'gpt-image-2',group:'',prompt:'hi'},{model:'gpt-image-2',group:'default',prompt:' '.repeat(5)}]) assert.throws(()=>imageGenerationBody(params));
});
test('image response accepts raster base64 and https artifact urls, rejects active payloads', () => {
  assert.equal(normalizeGeneratedImage({data:[{b64_json:'iVBORw0KGgo='}]}).mime,'image/png');
  const remote = normalizeGeneratedImage({data:[{url:'https://cdn.example.com/a.png'}]});
  assert.deepEqual(remote, {url:'https://cdn.example.com/a.png', mime:'image/*', external:true});
  for (const body of [{data:[]},{data:[{url:'http://cdn.example.com/a.png'}]},{data:[{url:'javascript:alert(1)'}]},{data:[{b64_json:'PHN2Zz4='}]},{data:[{b64_json:'data:image/png;base64,AAAA'}]}]) assert.throws(()=>normalizeGeneratedImage(body));
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

test('image edit only accepts raster images within the size limit', () => {
  assert.equal(validateEditFile({ type: 'image/png', size: 1024 }), 'image/png');
  assert.equal(validateEditFile({ type: 'IMAGE/JPEG', size: 1024 }), 'image/jpeg');
  for (const file of [
    { type: 'image/svg+xml', size: 1024 },
    { type: 'application/pdf', size: 1024 },
    { type: 'image/png', size: 0 },
    { type: 'image/png', size: MAX_EDIT_BYTES + 1 },
    {},
  ]) assert.throws(() => validateEditFile(file), /INVALID_EDIT_FILE/);
});

test('image edit form carries model, group, prompt and the file itself', () => {
  const file = new File([new Uint8Array([1, 2, 3])], 'ref.png', { type: 'image/png' });
  const form = imageEditFormData({ model: ' gpt-image-2.5-flare ', group: 'default', prompt: ' make it wood ', file });
  assert.equal(form.get('model'), 'gpt-image-2.5-flare');
  assert.equal(form.get('group'), 'default');
  assert.equal(form.get('prompt'), 'make it wood');
  assert.equal(form.get('n'), '1');
  assert.ok(form.get('image') instanceof File);
  for (const params of [
    { model: '', group: 'default', prompt: 'x', file },
    { model: 'm', group: '', prompt: 'x', file },
    { model: 'm', group: 'default', prompt: ' ', file },
    { model: 'm', group: 'default', prompt: 'x', file: { type: 'image/gif', size: 10 } },
  ]) assert.throws(() => imageEditFormData(params), /INVALID_IMAGE_REQUEST|INVALID_EDIT_FILE/);
});

test('external artifacts are rewritten to the same-origin proxy', () => {
  assert.equal(
    imageArtifactUrl('https://img.example.com/a b.png?x=1'),
    '/pg/images/artifact?url=https%3A%2F%2Fimg.example.com%2Fa%20b.png%3Fx%3D1',
  );
  // 非 https 与空值原样返回，交给调用方处理
  assert.equal(imageArtifactUrl('http://img.example.com/a.png'), 'http://img.example.com/a.png');
  assert.equal(imageArtifactUrl('data:image/png;base64,AAAA'), 'data:image/png;base64,AAAA');
  assert.equal(imageArtifactUrl(''), '');
  assert.equal(imageArtifactUrl(null), null);
});
