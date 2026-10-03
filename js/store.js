// Where files come from. The app only uses:
//   await store.all()                   -> { "path/to/note.md": "text", ... }
//   await store.update(path, fn, msg)   -> new text; fn(oldText or undefined) returns the new text
//                                          (return null from fn to cancel)
//
// DemoStore: made-up vault kept in this browser, for trying the app.
// GitHubStore: the real private vault repo. Reads with one GraphQL call, writes one
//              commit per change. The access key stays in this browser only.

import { demoFiles } from '../demo/vault.js';

const DEMO_KEY = 'hq-demo-files';
const CONFIG_KEY = 'hq-github';
const CACHE_KEY = 'hq-cache';

const storage = {
  get(key) {
    try {
      return JSON.parse(localStorage.getItem(key) || 'null');
    } catch {
      return null;
    }
  },
  set(key, value) {
    try {
      value === null ? localStorage.removeItem(key) : localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* storage blocked: fine for the demo, the GitHub key just won't be remembered */
    }
  },
};

export class DemoStore {
  constructor() {
    this.name = 'Demo data';
    this.demo = true;
    this.files = storage.get(DEMO_KEY) || demoFiles();
  }

  async all() {
    return { ...this.files };
  }

  async update(path, fn) {
    const next = fn(this.files[path]);
    if (next === null || next === undefined) return null;
    this.files[path] = next;
    storage.set(DEMO_KEY, this.files);
    return next;
  }

  reset() {
    storage.set(DEMO_KEY, null);
    this.files = demoFiles();
  }
}

// ---------- GitHub ----------

const API = 'https://api.github.com';

// utf-8 safe base64
const toBase64 = (text) => {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
};
const fromBase64 = (b64) => new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\n/g, '')), (c) => c.charCodeAt(0)));

// Folders nest at most ~5 deep in the vault; ask for 7 levels to be safe.
const treeFields = (depth) =>
  depth === 0
    ? 'name type'
    : `name type object { ... on Blob { oid text isBinary } ... on Tree { entries { ${treeFields(depth - 1)} } } }`;

const VAULT_QUERY = `query($owner: String!, $repo: String!) {
  repository(owner: $owner, name: $repo) {
    object(expression: "HEAD:") { ... on Tree { entries { ${treeFields(7)} } } }
  }
}`;

export const githubConfig = () => storage.get(CONFIG_KEY);
export const saveGithubConfig = (cfg) => {
  storage.set(CONFIG_KEY, cfg);
  if (!cfg) storage.set(CACHE_KEY, null);
};

export class GitHubStore {
  constructor({ repo, token }) {
    [this.owner, this.repo] = repo.split('/');
    this.token = token;
    this.name = repo;
    this.demo = false;
    this.files = {};
    this.shas = {};
  }

  async request(url, opts = {}) {
    const res = await fetch(url, {
      ...opts,
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(opts.headers || {}),
      },
    });
    if (!res.ok) {
      let detail = '';
      try {
        detail = (await res.json()).message || '';
      } catch {
        /* no JSON body */
      }
      const err = new Error(`GitHub ${res.status}${detail ? ': ' + detail : ''}`);
      err.status = res.status;
      throw err;
    }
    return res.json();
  }

  async all() {
    const data = await this.request(`${API}/graphql`, {
      method: 'POST',
      body: JSON.stringify({ query: VAULT_QUERY, variables: { owner: this.owner, repo: this.repo } }),
    });
    if (data.errors) throw new Error(data.errors[0].message);
    const root = data.data.repository?.object;
    if (!root) throw new Error('Repo is empty or not found');

    const files = {};
    const shas = {};
    const walk = (entries, prefix) => {
      for (const e of entries || []) {
        const path = prefix + e.name;
        if (e.type === 'tree' && e.object) walk(e.object.entries, path + '/');
        else if (e.type === 'blob' && e.object && !e.object.isBinary && path.endsWith('.md')) {
          files[path] = e.object.text;
          shas[path] = e.object.oid;
        }
      }
    };
    walk(root.entries, '');
    this.files = files;
    this.shas = shas;
    this.saveCache();
    return { ...files };
  }

  // last copy of the notes on this device, so the app opens instantly (and offline)
  cached() {
    const c = storage.get(CACHE_KEY);
    if (!c || c.repo !== this.name) return null;
    this.files = c.files;
    this.shas = c.shas;
    return { ...c.files };
  }

  saveCache() {
    storage.set(CACHE_KEY, { repo: this.name, files: this.files, shas: this.shas });
  }

  contentsUrl(path) {
    return `${API}/repos/${this.owner}/${this.repo}/contents/${path.split('/').map(encodeURIComponent).join('/')}`;
  }

  async refreshFile(path) {
    try {
      const f = await this.request(this.contentsUrl(path));
      this.files[path] = fromBase64(f.content);
      this.shas[path] = f.sha;
    } catch (e) {
      if (e.status !== 404) throw e;
      delete this.files[path];
      delete this.shas[path];
    }
  }

  // Apply fn to the latest text and commit. If the file changed on GitHub since we
  // loaded it (laptop push), fetch the new version and apply fn again.
  async update(path, fn, message = 'Update from HQ') {
    for (let attempt = 0; attempt < 3; attempt++) {
      const next = fn(this.files[path]);
      if (next === null || next === undefined) return null;
      try {
        const res = await this.request(this.contentsUrl(path), {
          method: 'PUT',
          body: JSON.stringify({ message: `HQ: ${message}`, content: toBase64(next), sha: this.shas[path] }),
        });
        this.files[path] = next;
        this.shas[path] = res.content.sha;
        this.saveCache();
        return next;
      } catch (e) {
        if (e.status !== 409 && e.status !== 422) throw e;
        await this.refreshFile(path);
      }
    }
    throw new Error('Could not save: the note keeps changing. Try again.');
  }
}
