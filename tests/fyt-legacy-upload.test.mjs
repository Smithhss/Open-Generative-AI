import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const babel = require('@babel/core');

function loadSource(path, mocks = {}, globals = {}) {
  const code = babel.transformSync(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'), {
    configFile: false, babelrc: false,
    presets: [['@babel/preset-react', { runtime: 'automatic' }]],
    plugins: ['@babel/plugin-transform-modules-commonjs'],
  }).code;
  const module = { exports: {} };
  vm.runInNewContext(code, {
    module, exports: module.exports,
    require(name) {
      if (!(name in mocks)) throw new Error(`Unexpected import: ${name}`);
      return mocks[name];
    },
    URL, Request, Response, Headers, FormData, File, Blob, AbortController,
    process: { env: {} }, console, ...globals,
  }, { filename: path });
  return module.exports;
}
const NextResponse = Object.assign(class extends Response {}, {
  json: (body, init) => Response.json(body, init),
});
const routes = [
  ['app/api/v1/get_upload_url/route.js', 'GET'],
  ['app/api/v1/upload-binary/route.js', 'POST'],
  ['app/api/upload-binary/route.js', 'POST'],
];

for (const [path, method] of routes) {
  test(`FYT directly rejects ${path} before reading credentials/body or contacting upstream`, async () => {
    let touched = 0;
    const unexpected = () => { touched++; throw new Error('FYT upload must not read or send'); };
    const handler = loadSource(path, {
      'next/server': { NextResponse },
      '../../../../src/lib/uploadProxyTarget': { getApiKeyFromRequest: unexpected },
      '../../../src/lib/uploadProxyTarget': { getApiKeyFromRequest: unexpected },
    }, { process: { env: { NEXT_PUBLIC_STUDIO_MODE: 'fyt' } }, fetch: unexpected });
    const response = await handler[method]({ get headers() { return unexpected(); }, formData: unexpected });
    assert.equal(response.status, 404);
    assert.equal(touched, 0);
  });
}

test('existing middleware blocks legacy upload entry points in FYT mode', () => {
  const { middleware } = loadSource('middleware.js', {
    'next/server': { NextResponse }, './lib/locales': { getLocaleFromPathname: () => 'en' },
  }, { process: { env: { NEXT_PUBLIC_STUDIO_MODE: 'fyt' } } });
  for (const pathname of ['/api/v1/get_upload_url', '/api/v1/upload-binary', '/api/upload-binary']) {
    assert.equal(middleware({ nextUrl: { pathname } }).status, 404);
  }
});

test('non-FYT upload routes preserve BYOK signed URL and validated S3 upload behavior', async () => {
  const helper = loadSource('src/lib/uploadProxyTarget.js');
  for (const [path, method] of routes) {
    const requests = [];
    const handler = loadSource(path, {
      'next/server': { NextResponse },
      '../../../../src/lib/uploadProxyTarget': helper, '../../../src/lib/uploadProxyTarget': helper,
    }, { fetch: async (url, init) => {
      requests.push({ url, init });
      return method === 'GET' ? Response.json({ url: 'https://bucket.s3.amazonaws.com/' }) : new Response(null, { status: 204 });
    } });
    const form = new FormData();
    form.set('x-proxy-target-url', 'https://bucket.s3.amazonaws.com/');
    form.set('key', 'image.png');
    form.set('file', new File(['fixture'], 'image.png', { type: 'image/png' }));
    const request = new Request('https://example.invalid/api/v1/get_upload_url?filename=image.png', {
      method, headers: { Authorization: 'Bearer test-byok-key', Cookie: 'private=not-forwarded' },
      ...(method === 'POST' ? { body: form } : {}),
    });
    const response = await handler[method](request);
    assert.equal(response.status, method === 'GET' ? 200 : 204);
    assert.equal(requests.length, 1);
    if (method === 'GET') {
      assert.equal(requests[0].url, 'https://api.muapi.ai/app/get_file_upload_url?filename=image.png');
      assert.equal(requests[0].init.headers.get('x-api-key'), 'test-byok-key');
      assert.equal(requests[0].init.headers.get('cookie'), null);
    } else {
      assert.equal(requests[0].url, 'https://bucket.s3.amazonaws.com/');
      assert.equal(requests[0].init.body.get('x-proxy-target-url'), null);
      assert.equal(requests[0].init.body.get('file').name, 'image.png');
    }
  }
});

for (const ticket of [null, 'fixture-fyt-ticket']) test(`FYT chat picker/drop import locally with ${ticket ? 'valid ticket' : 'no ticket'} and zero upload requests`, async () => {
  const values = [];
  const effects = [];
  let cursor = 0;
  const calls = [];
  const imported = [];
  const react = {
    useState(initial) {
      const index = cursor++;
      if (!(index in values)) values[index] = typeof initial === 'function' ? initial() : initial;
      return [values[index], next => { values[index] = typeof next === 'function' ? next(values[index]) : next; }];
    },
    useRef(initial) { const index = cursor++; return values[index] ?? (values[index] = { current: initial }); },
    useCallback: fn => fn, useMemo: fn => fn(), useEffect: fn => { effects.push(fn); },
  };
  const jsx = (type, props) => ({ type, props });
  const inert = new Proxy(() => null, { get: (_, key) => key === '__esModule' ? true : () => null });
  const client = { interceptors: { request: { use() {} } } };
  for (const method of ['get', 'post', 'patch', 'delete']) client[method] = async (...args) => { calls.push(args); return { data: [] }; };
  const mocks = {
    react: { __esModule: true, default: react, ...react },
    'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'fragment' },
    axios: { __esModule: true, default: { create: () => client } },
    'next/navigation': { useRouter: () => ({}), useSearchParams: () => new URLSearchParams() },
    'next-themes': { useTheme: () => ({}) },
    'next/dynamic': { __esModule: true, default: () => () => null },
    'react-hot-toast': { __esModule: true, default: { error() {}, success() {} }, Toaster: () => null },
  };
  const source = readFileSync(new URL('../packages/Open-AI-Design-Agent/packages/design-agent/src/CreativeCanvas.jsx', import.meta.url), 'utf8');
  for (const item of babel.parseSync(source, { sourceType: 'module', configFile: false, babelrc: false, parserOpts: { plugins: ['jsx'] } }).program.body) {
    if (item.type === 'ImportDeclaration' && !(item.source.value in mocks)) mocks[item.source.value] = inert;
  }
  const { default: CreativeCanvas } = loadSource('packages/Open-AI-Design-Agent/packages/design-agent/src/CreativeCanvas.jsx', mocks, {
    window: { localStorage: { getItem: () => null } },
  });
  const props = { localCanvas: true, fytUserId: 1, fytTicket: ticket, fytTicketExpiresAt: Date.now() + 60000,
    onLocalFiles: async files => { imported.push(...files); } };
  CreativeCanvas(props);
  for (const effect of effects) effect();
  await new Promise(resolve => setImmediate(resolve));
  calls.length = 0;
  cursor = 0;
  const tree = CreativeCanvas(props);
  const nodes = [];
  const visit = node => {
    if (!node || typeof node !== 'object') return;
    nodes.push(node);
    const children = node.props?.children;
    for (const child of Array.isArray(children) ? children : [children]) visit(child);
  };
  visit(tree);
  const picker = nodes.find(node => node.type === 'input' && node.props.type === 'file' && node.props.onChange);
  const drop = nodes.find(node => node.props?.onDrop);
  assert.ok(picker);
  assert.ok(drop);
  const file = new File(['fixture'], 'image.png', { type: 'image/png' });
  picker.props.onChange({ target: { files: [file] } });
  drop.props.onDrop({ preventDefault() {}, dataTransfer: { files: [file] } });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(imported.length, 2);
  assert.ok(imported.every(item => item === file));
  assert.equal(calls.length, 0);
});
