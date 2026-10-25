import {test} from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCanvasProject, parseCanvasProject, projectAssetBlob, buildCanvasProject, prepareCanvasProject } from '../packages/Open-AI-Design-Agent/packages/design-agent/src/localCanvasProject.js';
const png='iVBORw0KGgo=';
const image={id:'img-a',kind:'image',assetId:'asset-a',x:-100,y:50,width:400,height:300,rotation:45,scaleX:-1,scaleY:1,offsetX:400,offsetY:0,zIndex:3,hidden:false,locked:true};
const text={id:'txt-a',kind:'text',text:'第一行\n第二行',fontSize:24,fill:'white',x:100,y:200,width:240,height:100,rotation:-30,zIndex:-1,hidden:false,locked:false};
const fixture=()=>({format:'fyt-canvas',version:1,assets:[{id:'asset-a',mime:'image/png',data:png}],nodes:[{...image},{...text}],viewport:{x:100,y:-200,zoom:0.05}});
test('project roundtrip preserves editable state and references shared assets',()=>{
  const p=fixture();p.nodes.push({...image,id:'img-b'});
  const restored=parseCanvasProject(JSON.stringify(normalizeCanvasProject(p)));
  assert.equal(restored.assets.length,1);assert.equal(restored.nodes[0].scaleX,-1);assert.equal(restored.nodes[1].text,'第一行\n第二行');assert.equal(restored.nodes[1].zIndex,-1);assert.deepEqual(restored.viewport,p.viewport);
  assert.equal(projectAssetBlob(restored.assets[0]).type,'image/png');
});
test('wrong format/version, unknown secret fields, duplicates and broken references are rejected',()=>{
  for(const change of [p=>p.version=2,p=>p.format='foreign',p=>p.token='secret',p=>p.nodes.push({...image}),p=>p.nodes[0]={...image,assetId:'missing'},p=>p.assets.push({...p.assets[0]})]) {const p=fixture();change(p);assert.throws(()=>normalizeCanvasProject(p));}
});
test('remote URLs, SVG payloads, malformed base64 and wrong raster headers cannot load',()=>{
  for(const change of [p=>p.assets[0].url='https://example.com/x',p=>p.assets[0].mime='image/svg+xml',p=>p.assets[0].data='https://example.com/x',p=>p.assets[0].data='YWJjZA==',p=>p.nodes[0].src='blob:other']) {const p=fixture();change(p);assert.throws(()=>normalizeCanvasProject(p));}
});
test('invalid numeric state, excess nodes/text and prototype-style metadata are rejected',()=>{
  for(const change of [p=>p.nodes[0].x=Infinity,p=>p.nodes[0].width=-1,p=>p.viewport.zoom=0,p=>p.nodes[1].text='x'.repeat(6001),p=>p.nodes=Array.from({length:101},(_,i)=>({...text,id:`txt-${i}`}))]) {const p=fixture();change(p);assert.throws(()=>normalizeCanvasProject(p));}
  assert.throws(()=>parseCanvasProject('{"format":"fyt-canvas","version":1,"__proto__":{},"assets":[],"nodes":[],"viewport":{"x":0,"y":0,"zoom":1}}'));
});
test('saving uses only referenced original image bytes and omits runtime objects',async()=>{
  const source={file:new Blob([Uint8Array.from([137,80,78,71,13,10,26,10])],{type:'image/png'})};
  const snapshot={nodes:[{...image,src:'blob:owned',assetId:undefined,image:{secret:'runtime'}}],viewport:{x:0,y:0,zoom:1},token:'private-runtime'};
  const p=await buildCanvasProject(snapshot,new Map([['blob:owned',source],['blob:unused',source]]));
  assert.equal(p.assets.length,1);assert.equal(p.nodes[0].src,undefined);assert.equal(p.nodes[0].image,undefined);assert.equal(p.token,undefined);
});

function twoAssets() {
  const p=fixture(); p.assets.push({...p.assets[0],id:'asset-b'});
  p.nodes.push({...p.nodes[0],id:'img-b',assetId:'asset-b'}); return p;
}
test('decode failure releases already prepared assets',async()=>{
  let calls=0,released=0;
  await assert.rejects(prepareCanvasProject(twoAssets(),async()=>{
    if (++calls===2) throw new Error('decode');
    return {image:{naturalWidth:100,naturalHeight:100},url:'blob:a',release:()=>released++};
  }),/decode/);
  assert.equal(released,1);
});
test('decoded pixel budget and cancellation release all prepared URLs',async()=>{
  let released=0;
  await assert.rejects(prepareCanvasProject(twoAssets(),async()=>({
    image:{naturalWidth:4001,naturalHeight:4000},url:'blob:a',release:()=>released++,
  })),/CANVAS_PROJECT_PIXELS/);
  assert.equal(released,2);
  released=0; const controller=new AbortController();
  await assert.rejects(prepareCanvasProject(fixture(),async()=>{
    controller.abort();
    return {image:{naturalWidth:100,naturalHeight:100},url:'blob:a',release:()=>released++};
  },{signal:controller.signal}),{name:'AbortError'});
  assert.equal(released,1);
});
test('valid prepared project retains original bytes and releases nothing before commit',async()=>{
  let released=0;
  const prepared=await prepareCanvasProject(fixture(),async()=>({image:{naturalWidth:1,naturalHeight:1},url:'blob:ready',release:()=>released++}));
  assert.equal(prepared.assets.get('asset-a').file.size,8); assert.equal(released,0);
});

test('flipped and rotated geometry keeps its original pivot after save and restore',async()=>{
  const {default:Konva}=await import('konva');
  const {zIndex,...geometry}=image;
  const original=new Konva.Rect(geometry);
  const project=await buildCanvasProject({nodes:[{...image,src:'blob:a'}],viewport:{x:0,y:0,zoom:1}},new Map([['blob:a',{file:projectAssetBlob(fixture().assets[0])}]]));
  const {zIndex:restoredZ,...restoredGeometry}=parseCanvasProject(JSON.stringify(project)).nodes[0];
  const restored=new Konva.Rect(restoredGeometry);
  assert.deepEqual(restored.getClientRect(),original.getClientRect());
  original.destroy();restored.destroy();
});
