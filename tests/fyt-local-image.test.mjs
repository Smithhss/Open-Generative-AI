import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateLocalImageFile, validateLocalImageDimensions, limitDrawingHistory, loadLocalImage } from '../packages/studio/src/localImage.js';
test('local editor accepts only nonempty bounded PNG/JPEG/WebP',()=>{
  for(const type of ['image/png','image/jpeg','image/webp']) assert.doesNotThrow(()=>validateLocalImageFile({type,size:100}));
  for(const file of [{type:'image/svg+xml',size:100},{type:'image/gif',size:100},{type:'image/png',size:0},{type:'image/png',size:10*1024*1024+1}]) assert.throws(()=>validateLocalImageFile(file));
});
test('decoded image must have finite bounded dimensions and pixel count',()=>{
  assert.doesNotThrow(()=>validateLocalImageDimensions(4000,4000));
  for(const [w,h] of [[0,1],[Infinity,2],[9000,1],[5000,4000],[-1,1],[1.5,1]]) assert.throws(()=>validateLocalImageDimensions(w,h));
});
test('drawing history truncates redo branch and caps steps and byte budget',()=>{
  assert.deepEqual(limitDrawingHistory(['a','b','c'],0,'x'),['a','x']);
  assert.equal(limitDrawingHistory(Array(20).fill('a'),19,'b').length,20);
  assert.deepEqual(limitDrawingHistory(['a'.repeat(9*1024*1024)],0,'b'.repeat(9*1024*1024)),['b'.repeat(9*1024*1024)]);
  assert.deepEqual(limitDrawingHistory([], -1, 'x'.repeat(16*1024*1024+1)),[]);
});

async function loaderFixture(run) {
  const originalImage=globalThis.Image, create=URL.createObjectURL, revoke=URL.revokeObjectURL;
  const images=[];let releases=0;
  globalThis.Image=class { constructor(){this.naturalWidth=100;this.naturalHeight=100;images.push(this);} set src(value){this.value=value;} };
  URL.createObjectURL=()=> 'blob:local-fixture'; URL.revokeObjectURL=()=>{releases++;};
  try {await run(images,()=>releases);} finally {globalThis.Image=originalImage;URL.createObjectURL=create;URL.revokeObjectURL=revoke;}
}
test('successful local decode retains its URL until released exactly once',async()=>{
  await loaderFixture(async(images,releases)=>{const pending=loadLocalImage({type:'image/png',size:10});images[0].onload();const loaded=await pending;assert.equal(loaded.url,'blob:local-fixture');assert.equal(releases(),0);loaded.release();loaded.release();assert.equal(releases(),1);});
});
test('cancelled or oversized decodes release the URL and never return an image',async()=>{
  await loaderFixture(async(images,releases)=>{const abort=new AbortController();const pending=loadLocalImage({type:'image/png',size:10},{signal:abort.signal});abort.abort();await assert.rejects(pending,{name:'AbortError'});assert.equal(releases(),1);assert.equal(images[0].onload,null);});
  await loaderFixture(async(images,releases)=>{const pending=loadLocalImage({type:'image/png',size:10});images[0].naturalWidth=99999;images[0].onload();await assert.rejects(pending,/LOCAL_IMAGE_DIMENSIONS/);assert.equal(releases(),1);});
});
test('broken image decode releases the URL without a network fallback',async()=>{
  await loaderFixture(async(images,releases)=>{const pending=loadLocalImage({type:'image/png',size:10});images[0].onerror();await assert.rejects(pending,/LOCAL_IMAGE_DECODE/);assert.equal(releases(),1);});
});
