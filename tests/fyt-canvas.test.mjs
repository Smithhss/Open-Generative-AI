import {test} from 'node:test';
import assert from 'node:assert/strict';
import { localCanvasBounds, localCanvasFit, validateCanvasText, MAX_LOCAL_NODES } from '../packages/Open-AI-Design-Agent/packages/design-agent/src/localCanvas.js';
test('full canvas bounds include negative and off-screen rotated node rectangles',()=>{
  assert.deepEqual(localCanvasBounds([{x:-200,y:-100,width:300,height:200},{x:2000,y:1000,width:100,height:200}]),{x:-224,y:-124,width:2348,height:1348});
});
test('empty, invalid and excessively large exports are rejected without viewport fallback',()=>{
  assert.throws(()=>localCanvasBounds([]),/CANVAS_EMPTY/);
  for(const box of [{x:NaN,y:0,width:10,height:10},{x:0,y:0,width:9000,height:1},{x:0,y:0,width:5000,height:5000}]) assert.throws(()=>localCanvasBounds([box]));
});
test('canvas text remains bounded plain text; links are not treated as image sources',()=>{
  assert.equal(validateCanvasText('https://example.com/image.png'),'https://example.com/image.png');
  assert.throws(()=>validateCanvasText('x'.repeat(6001)),/CANVAS_TEXT_LIMIT/);
  assert.throws(()=>validateCanvasText('   '),/CANVAS_TEXT_EMPTY/);
  assert.equal(MAX_LOCAL_NODES,100);
});

test('real Konva geometry fits rotated nodes independently of old pan and zoom',async()=>{
  const {default:Konva}=await import('konva');
  const stageSpace=new Konva.Group({x:300,y:-250,scaleX:2,scaleY:2});
  const rect=new Konva.Rect({x:-100,y:-50,width:200,height:100,rotation:90});
  const text=new Konva.Rect({x:2000,y:1000,width:2000,height:1000});
  stageSpace.add(rect,text);
  const boxes=[rect,text].map(node=>node.getClientRect({relativeTo:stageSpace}));
  const fit=localCanvasFit(boxes,{width:800,height:600});
  for(const box of boxes){
    assert.ok(box.x*fit.zoom+fit.x >= -0.001);
    assert.ok(box.y*fit.zoom+fit.y >= -0.001);
    assert.ok((box.x+box.width)*fit.zoom+fit.x <= 800.001);
    assert.ok((box.y+box.height)*fit.zoom+fit.y <= 600.001);
  }
  stageSpace.destroy();
});
test('fit can zoom out for widely spaced content even when PNG size would exceed limits',()=>{
  const boxes=[{x:0,y:0,width:100,height:100},{x:30000,y:1000,width:500,height:500}];
  assert.throws(()=>localCanvasBounds(boxes),/CANVAS_EXPORT_TOO_LARGE/);
  assert.ok(localCanvasFit(boxes,{width:800,height:600}).zoom < 0.1);
});
