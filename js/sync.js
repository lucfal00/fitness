// Encrypted, compressed sync through a secret GitHub Gist. No storage or DOM: callers own state.
import { mergeDocs, validateDoc } from './merge.js';
import {
  ITERATIONS, SyncError, deriveKey, exportKey, importKey, seal, unseal, parseEnvelope, randomBytes, fromB64, toB64,
} from './crypto.js';

export { SyncError };

const API = 'https://api.github.com';
const FILE = 'fitness-sync.json';
const BAD_DATA = 'Dati sincronizzati non validi.';

export function makeApi(token, fetchFn = (...a) => fetch(...a)) {
  async function call(method, path, body) {
    let res;
    try {
      res = await fetchFn(API + path, {
        method,
        cache: 'no-store',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw new SyncError('network', 'Offline: sincronizzo appena torna la rete.');
    }
    if (res.status === 401) throw new SyncError('token', 'Token GitHub non valido o scaduto.');
    if (res.status === 404) throw new SyncError('missing', 'Gist di sincronizzazione non trovato: scollega e ricollega.');
    if (!res.ok) throw new SyncError('http', `GitHub ha risposto con errore ${res.status}.`);
    return res.json();
  }

  return {
    async findGist() {
      const list = await call('GET', '/gists?per_page=100');
      return list.find((g) => g.files?.[FILE])?.id ?? null;
    },
    async read(id) {
      const f = (await call('GET', `/gists/${id}`)).files?.[FILE];
      if (!f) throw new SyncError('missing', 'Gist di sincronizzazione non trovato: scollega e ricollega.');
      if (f.truncated !== true) return f.content;
      // Truncated: fetch the full file from raw_url, never sending the token.
      try {
        return await (await fetchFn(f.raw_url, { cache: 'no-store' })).text();
      } catch {
        throw new SyncError('network', 'Offline: sincronizzo appena torna la rete.');
      }
    },
    async create(content) {
      const g = await call('POST', '/gists', {
        description: 'Fitness – dati sincronizzati (cifrati)', public: false, files: { [FILE]: { content } },
      });
      return g.id;
    },
    async write(id, content) {
      await call('PATCH', `/gists/${id}`, { files: { [FILE]: { content } } });
    },
  };
}

async function readEnvelope(api, gistId) {
  try {
    return parseEnvelope(await api.read(gistId));
  } catch (e) {
    if (e instanceof SyncError) throw e;
    throw new SyncError('format', BAD_DATA);
  }
}

async function readRemote(api, gistId, key, wrongKeyMsg) {
  const env = await readEnvelope(api, gistId);
  let remote;
  try {
    remote = await unseal(key, env);
  } catch (e) {
    if (e instanceof SyncError) throw e;
    throw new SyncError('password', wrongKeyMsg);
  }
  if (!validateDoc(remote)) throw new SyncError('format', BAD_DATA);
  return remote;
}

// mergeDocs throws on malformed elements: report them as invalid data.
function safeMerge(local, incoming) {
  try {
    return mergeDocs(local, incoming);
  } catch {
    throw new SyncError('format', BAD_DATA);
  }
}

const remoteIsBehind = (remote, local) => safeMerge(remote, local).count > 0;

/** Link this device: join the existing sync gist (merging data) or create it. */
export async function connect({
  token, password, local, fetchFn, api = makeApi(token, fetchFn), iterations = ITERATIONS,
}) {
  const gistId = await api.findGist();
  if (!gistId) {
    const salt = randomBytes(16);
    const key = await deriveKey(password, salt, iterations);
    const id = await api.create(await seal(key, salt, iterations, local));
    return { cfg: { token, gistId: id, salt: toB64(salt), iterations, key: await exportKey(key) }, doc: local };
  }
  const env = await readEnvelope(api, gistId);
  const salt = fromB64(env.kdf.salt);
  const key = await deriveKey(password, salt, env.kdf.iterations);
  const remote = await readRemote(api, gistId, key, 'Password errata: non riesco a decifrare i dati sincronizzati.');
  const { doc } = safeMerge(local, remote);
  if (remoteIsBehind(remote, doc)) await api.write(gistId, await seal(key, salt, env.kdf.iterations, doc));
  return {
    cfg: { token, gistId, salt: env.kdf.salt, iterations: env.kdf.iterations, key: await exportKey(key) },
    doc,
  };
}

/** Pull, merge, push if the remote lacks newer local changes. */
export async function syncOnce({ cfg, local, fetchFn, api = makeApi(cfg.token, fetchFn) }) {
  const key = await importKey(cfg.key);
  const remote = await readRemote(api, cfg.gistId, key,
    'La password è stata cambiata su un altro dispositivo: scollega e ricollega.');
  const { doc } = safeMerge(local, remote);
  const pushed = remoteIsBehind(remote, doc);
  if (pushed) await api.write(cfg.gistId, await seal(key, fromB64(cfg.salt), cfg.iterations, doc));
  return { doc, pushed };
}
