import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../js/logic.js';
import { connect, syncOnce, makeApi, SyncError } from '../js/sync.js';
import { deriveKey, seal, unseal, parseEnvelope, gzip, gunzip, toB64, randomBytes } from '../js/crypto.js';

const IT = 1000;   // fast KDF for tests

// In-memory stand-in for the Gist API used by connect/syncOnce.
function fakeApi() {
  const gists = new Map();
  const calls = { create: 0, write: 0 };
  return {
    gists,
    calls,
    async findGist() { return gists.keys().next().value ?? null; },
    async read(id) {
      if (!gists.has(id)) throw new SyncError('missing', 'Gist non trovato');
      return gists.get(id);
    },
    async create(content) {
      const id = `g${gists.size + 1}`;
      gists.set(id, content);
      calls.create++;
      return id;
    },
    async write(id, content) {
      gists.set(id, content);
      calls.write++;
    },
  };
}

const exercise = (o = {}) => ({ id: 'a', name: 'Segreto', updatedAt: 1, ...o });
function docWith(exercises, body = {}) {
  const d = L.emptyDoc();
  d.exercises = exercises;
  d.body = body;
  return d;
}

test('first device creates an encrypted, compressed gist', async () => {
  const api = fakeApi();
  const local = docWith([exercise()], { '2026-10-27': { w: 70, t: 10 } });
  const { cfg, doc } = await connect({ token: 't', password: 'password1', local, api, iterations: IT });
  assert.equal(api.calls.create, 1);
  assert.equal(cfg.gistId, 'g1');
  assert.equal(cfg.token, 't');
  assert.equal('password' in cfg, false);
  assert.deepEqual(doc, local);
  const content = api.gists.get('g1');
  assert.equal(content.includes('Segreto'), false);
  const env = JSON.parse(content);
  assert.equal(env.app, 'fitness');
  assert.equal(env.z, 'gzip');
  assert.equal(env.v, 1);
});

test('second device merges remote data and uploads the union', async () => {
  const api = fakeApi();
  const a = await connect({ token: 't', password: 'password1', local: docWith([exercise()]), api, iterations: IT });
  const bLocal = docWith([exercise({ id: 'b', name: 'Altro' })], { '2026-10-27': { w: 71, t: 20 } });
  const b = await connect({ token: 't', password: 'password1', local: bLocal, api, iterations: IT });
  assert.equal(b.cfg.gistId, a.cfg.gistId);
  assert.deepEqual(b.doc.exercises.map((h) => h.id).sort(), ['a', 'b']);
  const r = await syncOnce({ cfg: a.cfg, local: a.doc, api });
  assert.deepEqual(r.doc.exercises.map((h) => h.id).sort(), ['a', 'b']);
  assert.equal(r.doc.body['2026-10-27'].w, 71);
});

test('wrong password is rejected on connect', async () => {
  const api = fakeApi();
  await connect({ token: 't', password: 'password1', local: docWith([exercise()]), api, iterations: IT });
  await assert.rejects(
    connect({ token: 't', password: 'sbagliata', local: L.emptyDoc(), api, iterations: IT }),
    (e) => e instanceof SyncError && e.code === 'password',
  );
});

test('syncOnce pulls changes and uploads only when local is newer', async () => {
  const api = fakeApi();
  const a = await connect({ token: 't', password: 'password1', local: docWith([exercise()]), api, iterations: IT });
  const b = await connect({ token: 't', password: 'password1', local: L.emptyDoc(), api, iterations: IT });
  const writes = api.calls.write;

  const aDoc = structuredClone(a.doc);
  aDoc.body['2026-10-27'] = { w: 70, t: 50 };
  const ra = await syncOnce({ cfg: a.cfg, local: aDoc, api });
  assert.equal(ra.pushed, true);
  assert.equal(api.calls.write, writes + 1);

  const rb = await syncOnce({ cfg: b.cfg, local: b.doc, api });
  assert.equal(rb.pushed, false);
  assert.equal(rb.doc.body['2026-10-27'].w, 70);

  const again = await syncOnce({ cfg: a.cfg, local: ra.doc, api });
  assert.equal(again.pushed, false);
  assert.equal(api.calls.write, writes + 1);
});

test('syncOnce reports a password changed elsewhere', async () => {
  const api = fakeApi();
  const a = await connect({ token: 't', password: 'password1', local: L.emptyDoc(), api, iterations: IT });
  const other = await connect({ token: 't', password: 'password1', local: L.emptyDoc(), api, iterations: IT });
  const wrongKey = { ...other.cfg, key: a.cfg.key.replace(/^./, (c) => (c === 'A' ? 'B' : 'A')) };
  await assert.rejects(syncOnce({ cfg: wrongKey, local: L.emptyDoc(), api }), (e) => e.code === 'password');
});

test('remote that is not a valid document is a format error', async () => {
  const api = fakeApi();
  const salt = randomBytes(16);
  const key = await deriveKey('password1', salt, IT);
  api.gists.set('g1', await seal(key, salt, IT, { version: 1, exercises: 'x' }));
  await assert.rejects(
    connect({ token: 't', password: 'password1', local: L.emptyDoc(), api, iterations: IT }),
    (e) => e.code === 'format',
  );
});

test('malformed elements make mergeDocs throw and map to a format error', async () => {
  const api = fakeApi();
  const salt = randomBytes(16);
  const key = await deriveKey('password1', salt, IT);
  const bad = L.emptyDoc();
  bad.exercises = [null];
  api.gists.set('g1', await seal(key, salt, IT, bad));
  await assert.rejects(
    connect({ token: 't', password: 'password1', local: L.emptyDoc(), api, iterations: IT }),
    (e) => e instanceof SyncError && e.code === 'format',
  );
});

// ---- crypto: gzip -------------------------------------------------------

test('gzip round trip', async () => {
  const src = new TextEncoder().encode('ciao '.repeat(500));
  const z = await gzip(src);
  assert.ok(z.length < src.length);
  assert.deepEqual(await gunzip(z), src);
});

test('seal/unseal round trip with gzip envelope and unreadable data', async () => {
  const salt = randomBytes(16);
  const key = await deriveKey('pw', salt, IT);
  const obj = { nota: 'SegretoSegretoSegreto', n: [1, 2, 3] };
  const text = await seal(key, salt, IT, obj);
  const env = parseEnvelope(text);
  assert.equal(env.app, 'fitness');
  assert.equal(env.z, 'gzip');
  assert.equal(text.includes('Segreto'), false);
  assert.equal(atob(env.data).includes('Segreto'), false);
  assert.deepEqual(await unseal(key, env), obj);
});

test('unseal accepts legacy envelope without z and rejects unknown z', async () => {
  const salt = randomBytes(16);
  const key = await deriveKey('pw', salt, IT);
  const obj = { a: 1 };
  const iv = randomBytes(12);
  const data = await globalThis.crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(obj)));
  const legacy = { app: 'fitness', v: 1, kdf: { salt: toB64(salt) }, iv: toB64(iv), data: toB64(data) };
  assert.deepEqual(await unseal(key, legacy), obj);
  await assert.rejects(unseal(key, { ...legacy, z: 'br' }), (e) => e instanceof SyncError && e.code === 'format');
});

test('missing CompressionStream gives an unsupported-browser error', async () => {
  const salt = randomBytes(16);
  const key = await deriveKey('pw', salt, IT);
  const text = await seal(key, salt, IT, { a: 1 });
  const saved = globalThis.CompressionStream;
  const savedD = globalThis.DecompressionStream;
  try {
    delete globalThis.CompressionStream;
    delete globalThis.DecompressionStream;
    const check = (e) => e instanceof SyncError && e.code === 'format'
      && e.message === 'Browser non supportato per la sincronizzazione.';
    await assert.rejects(seal(key, salt, IT, { a: 1 }), check);
    await assert.rejects(unseal(key, parseEnvelope(text)), check);
  } finally {
    globalThis.CompressionStream = saved;
    globalThis.DecompressionStream = savedD;
  }
});

// ---- makeApi against a fake fetch -------------------------------------

const res = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
  text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
});

test('makeApi finds the sync gist and reads its content', async () => {
  const seen = [];
  const fetchFn = async (url, opts) => {
    seen.push([opts.method, url, opts.headers.Authorization, opts.cache]);
    if (url.includes('/gists?')) return res(200, [{ id: 'x', files: { 'note.md': {} } }, { id: 'y', files: { 'fitness-sync.json': {} } }]);
    if (url.endsWith('/gists/y')) return res(200, { files: { 'fitness-sync.json': { content: 'CIPHER', truncated: false } } });
    return res(500, {});
  };
  const api = makeApi('tok', fetchFn);
  assert.equal(await api.findGist(), 'y');
  assert.equal(await api.read('y'), 'CIPHER');
  assert.deepEqual(seen[0].slice(2), ['Bearer tok', 'no-store']);
});

test('makeApi reads a truncated file from raw_url without Authorization', async () => {
  const raw = 'https://gist.githubusercontent.com/u/y/raw/fitness-sync.json';
  const seen = [];
  const fetchFn = async (url, opts = {}) => {
    seen.push({ url, headers: opts.headers, cache: opts.cache });
    if (url === raw) return res(200, 'FULLCIPHER');
    return res(200, { files: { 'fitness-sync.json': { content: 'PART', truncated: true, raw_url: raw } } });
  };
  const api = makeApi('tok', fetchFn);
  assert.equal(await api.read('y'), 'FULLCIPHER');
  const rawReq = seen.find((s) => s.url === raw);
  assert.ok(rawReq);
  assert.equal(rawReq.cache, 'no-store');
  assert.equal(rawReq.headers?.Authorization, undefined);
  assert.equal(JSON.stringify(rawReq.headers ?? {}).includes('tok'), false);
});

test('connect and syncOnce work end to end through makeApi with a fetchFn', async () => {
  let stored = null;
  const fetchFn = async (url, opts) => {
    if (opts.method === 'GET' && url.includes('/gists?')) {
      return res(200, stored ? [{ id: 'g9', files: { 'fitness-sync.json': {} } }] : []);
    }
    if (opts.method === 'POST') {
      stored = JSON.parse(opts.body).files['fitness-sync.json'].content;
      return res(201, { id: 'g9' });
    }
    if (opts.method === 'GET') return res(200, { files: { 'fitness-sync.json': { content: stored, truncated: false } } });
    return res(200, {});
  };
  const local = docWith([exercise()]);
  const a = await connect({ token: 't', password: 'password1', local, fetchFn, iterations: IT });
  assert.equal(a.cfg.gistId, 'g9');
  const r = await syncOnce({ cfg: a.cfg, local, fetchFn });
  assert.equal(r.pushed, false);
});

test('makeApi maps HTTP and network failures', async () => {
  const code = async (fetchFn, fn = (api) => api.findGist()) => {
    try {
      await fn(makeApi('tok', fetchFn));
      return 'ok';
    } catch (e) {
      return e.code;
    }
  };
  assert.equal(await code(async () => res(401, {})), 'token');
  assert.equal(await code(async () => res(404, {}), (api) => api.read('z')), 'missing');
  assert.equal(await code(async () => res(500, {})), 'http');
  assert.equal(await code(async () => { throw new TypeError('Failed to fetch'); }), 'network');
});
