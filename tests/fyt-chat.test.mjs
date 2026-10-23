import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getChatGroups, getChatModels, selectChatModel, streamChat } from '../lib/fyt/chat.mjs';
import { acceptAuthBundle, clearSession } from '../lib/fyt/session.mjs';
const bundle = id => ({ access_token: `fixture-${id}`, access_expires_at: Date.now()/1000+3600, user: { id }, session: { sid: `sid-${id}` } });
const input = () => ({ model: 'chat', group: 'default', system: '', messages: [{ role: 'user', content: 'hello' }], signal: new AbortController().signal, onDelta() {} });
function response(parts) { return new Response(new ReadableStream({ start(c) { for (const part of parts) c.enqueue(part); c.close(); } }), { headers: { 'Content-Type': 'text/event-stream', 'X-Oneapi-Request-Id': 'req-1' } }); }
async function withFetch(fn, body) { const old=globalThis.fetch; acceptAuthBundle(bundle(1), { broadcast:false }); globalThis.fetch=fn; try { await body(); } finally { globalThis.fetch=old; clearSession(); } }
test('filters models by selected group and declared chat endpoint', async () => {
  await withFetch(async url => {
    if (url === '/api/pricing') return Response.json({ success:true, data:[{model_name:'chat',supported_endpoint_types:['openai']},{model_name:'image',supported_endpoint_types:['image']}], supported_endpoint:{openai:{path:'/v1/chat/completions',method:'POST'}} });
    assert.equal(url, '/api/user/models?group=vip');
    return Response.json({success:true,data:['chat','image','unknown']});
  }, async () => assert.deepEqual(await getChatModels({group:'vip'}), ['chat']));
});
test('anonymous sends no request', async () => { clearSession(); let calls=0; const old=globalThis.fetch; globalThis.fetch=()=>{calls++;}; try { await assert.rejects(streamChat(input()), /AUTH_REQUIRED/); assert.equal(calls,0); } finally { globalThis.fetch=old; } });
test('network failure and 401 never resubmit a chargeable POST', async () => {
  for (const fail of [()=>{throw new TypeError('network');},()=>Response.json({message:'expired'},{status:401})]) {
    let calls=0; await withFetch(async (_u,init)=>{ assert.equal(init.method,'POST'); calls++; return fail(); }, async ()=>{ await assert.rejects(streamChat(input())); assert.equal(calls,1); });
  }
});
test('decodes split Chinese bytes, CRLF, reasoning and terminal marker', async () => {
  const bytes=new TextEncoder().encode('data: {"choices":[{"delta":{"reasoning_content":"思","content":"你好"}}]}\r\n\r\ndata: [DONE]\r\n\r\n');
  const deltas=[];
  await withFetch(async ()=>response(Array.from(bytes,b=>new Uint8Array([b]))), async ()=>{
    const result=await streamChat({...input(),onDelta:d=>deltas.push(d)}); assert.equal(result.completed,true); assert.equal(result.requestId,'req-1'); assert.equal(deltas[0].content,'你好'); assert.equal(deltas[0].reasoning,'思');
  });
});
test('EOF without terminal signal is interrupted', async () => {
  await withFetch(async ()=>response([new TextEncoder().encode('data: {"choices":[{"delta":{"content":"partial"}}]}\n\n')]), async ()=>assert.equal((await streamChat(input())).completed,false));
});
test('stream errors and malformed data are not successful', async () => {
  for (const payload of ['{"error":{"message":"upstream error"}}','bad-json']) await withFetch(async ()=>response([new TextEncoder().encode(`data: ${payload}\n\n`)]),async ()=>assert.rejects(streamChat(input())));
});
test('late group response is rejected after account switch', async () => {
  let finish;
  await withFetch(()=>new Promise(r=>{finish=r;}),async ()=>{const pending=getChatGroups({}); await new Promise(r=>setImmediate(r)); acceptAuthBundle(bundle(2),{broadcast:false}); finish(Response.json({success:true,data:{vip:{desc:'VIP'}}})); await assert.rejects(pending,/SESSION_CHANGED/);});
});
test('account switch aborts the stream and ignores old chunks', async () => {
  let writer; let deltas=0;
  await withFetch(async ()=>new Response(new ReadableStream({start(c){writer=c;}}),{headers:{'Content-Type':'text/event-stream'}}),async ()=>{
    const pending=streamChat({...input(),onDelta:()=>deltas++}); await new Promise(r=>setImmediate(r)); acceptAuthBundle(bundle(2),{broadcast:false});
    writer.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"A"}}]}\n\n')); writer.close();
    await assert.rejects(pending,/SESSION_CHANGED/); assert.equal(deltas,0);
  });
});
test('a late 401 from A cannot sign out account B', async () => {
  let finish;
  await withFetch(()=>new Promise(r=>{finish=r;}),async ()=>{
    const pending=streamChat(input()); await new Promise(r=>setImmediate(r));
    acceptAuthBundle(bundle(2),{broadcast:false});
    finish(Response.json({message:'expired'},{status:401}));
    await assert.rejects(pending,/SESSION_CHANGED/);
    const {getSessionState}=await import('../lib/fyt/session.mjs'); assert.equal(getSessionState().user.id,2);
  });
});
test('a live 401 exposes sign-in controls and does not retry', async () => {
  let posts=0;
  await withFetch(async()=>{posts++;return Response.json({},{status:401});},async()=>{
    await assert.rejects(streamChat(input()));
    const {getSessionState}=await import('../lib/fyt/session.mjs'); assert.equal(getSessionState().status,'anonymous');assert.equal(posts,1);
  });
});
test('explicit finish_reason and JSON fallback are recognized', async () => {
  await withFetch(async()=>response([new TextEncoder().encode('data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n')]),async()=>assert.equal((await streamChat(input())).completed,true));
  let content='';
  await withFetch(async()=>Response.json({choices:[{message:{content:'fallback'}}]}),async()=>{assert.equal((await streamChat({...input(),onDelta:d=>content+=d.content})).completed,true);assert.equal(content,'fallback');});
});
test('same-user new sign-in during token acquisition cannot send an old bearer', async () => {
  let posts=0;
  await withFetch(async()=>{posts++;return Response.json({},{status:401});},async()=>{
    const pending=streamChat(input());
    acceptAuthBundle({...bundle(1),access_token:'new-bearer',session:{sid:'new-sid'}},{broadcast:false});
    await assert.rejects(pending,/SESSION_CHANGED/);
    const {getSessionState}=await import('../lib/fyt/session.mjs');
    assert.equal(getSessionState().accessToken,'new-bearer'); assert.equal(posts,0);
  });
});

test('unavailable historical models require explicit choice; fresh chats may default', () => {
  assert.equal(selectChatModel(['new'], {model:'old',group:'default',messages:[]}, 'default'), '');
  assert.equal(selectChatModel(['new'], {model:'new',group:'vip',messages:[]}, 'default'), '');
  assert.equal(selectChatModel(['new'], {model:'new',group:'default',messages:[]}, 'default'), 'new');
  assert.equal(selectChatModel(['new'], undefined, 'default'), 'new');
});
