/* Questline — data store.

   Local-first, structured so cloud sync can be added later without a rewrite:
   - every record has id, createdAt, updatedAt and deletedAt (a tombstone, never a hard delete)
   - all reads/writes go through QL.store, which persists through a swappable adapter
   - changesSince(timestamp) returns exactly what a sync client would need to push

   To add sync: write an adapter with the same load()/save() shape, or keep this
   adapter and push changesSince(lastSync) to a server, merging by updatedAt. */
(function (g) {
  const QL = (g.QL = g.QL || {});
  const U = QL.util;
  const KEY = 'questline.v1';
  const COLLECTIONS = ['goals', 'quests', 'metrics', 'datapoints'];

  const localAdapter = {
    load() {
      try { const raw = g.localStorage.getItem(KEY); return raw ? JSON.parse(raw) : null; }
      catch (e) { return null; }
    },
    save(state) {
      try { g.localStorage.setItem(KEY, JSON.stringify(state)); return true; }
      catch (e) { return false; }
    }
  };

  function blank() {
    return {
      schemaVersion: 1,
      deviceId: U.uid(),
      profile: { name: '' },
      settings: {
        maxQuestsPerDay: 6,
        questsPerGoal: 2,
        currency: '₹',
        ai: { apiKey: '', model: 'claude-sonnet-5-5' },
        google: { clientId: '' },
        updatedAt: U.now()
      },
      goals: [], quests: [], metrics: [], datapoints: []
    };
  }

  let state = blank();
  const listeners = [];
  let saveOk = true;

  const store = {
    adapter: localAdapter,
    COLLECTIONS,

    init() {
      const loaded = store.adapter.load();
      state = blank();
      if (loaded && typeof loaded === 'object') {
        const base = blank();
        state = Object.assign(base, loaded);
        state.settings = Object.assign(base.settings, loaded.settings || {});
        state.settings.ai = Object.assign({ apiKey: '', model: 'claude-sonnet-5-5' }, (loaded.settings || {}).ai || {});
        state.settings.google = Object.assign({ clientId: '' }, (loaded.settings || {}).google || {});
        state.profile = Object.assign({ name: '' }, loaded.profile || {});
        COLLECTIONS.forEach(c => { if (!Array.isArray(state[c])) state[c] = []; });
      }
      return state;
    },

    get state() { return state; },
    get settings() { return state.settings; },
    get saveOk() { return saveOk; },

    all(coll) { return state[coll].filter(r => !r.deletedAt); },
    byId(coll, id) { return state[coll].find(r => r.id === id && !r.deletedAt) || null; },

    put(coll, rec, silent) {
      const t = U.now();
      if (!rec.id) rec.id = U.uid();
      if (!rec.createdAt) rec.createdAt = t;
      rec.updatedAt = t;
      const i = state[coll].findIndex(r => r.id === rec.id);
      if (i >= 0) state[coll][i] = rec; else state[coll].push(rec);
      if (!silent) store.commit();
      return rec;
    },

    remove(coll, id, silent) {
      const rec = state[coll].find(r => r.id === id);
      if (rec) { rec.deletedAt = U.now(); rec.updatedAt = rec.deletedAt; }
      if (!silent) store.commit();
    },

    updateSettings(patch) {
      Object.assign(state.settings, patch, { updatedAt: U.now() });
      store.commit();
    },

    commit() {
      saveOk = store.adapter.save(state);
      listeners.forEach(fn => fn(state));
    },
    subscribe(fn) { listeners.push(fn); },

    /* What a future sync client would upload. */
    changesSince(iso) {
      const out = {};
      COLLECTIONS.forEach(c => { out[c] = state[c].filter(r => !iso || r.updatedAt > iso); });
      return out;
    },

    /* Backup. Keys and tokens are left out on purpose. */
    exportJSON() {
      const copy = JSON.parse(JSON.stringify(state));
      copy.settings.ai.apiKey = '';
      copy.exportedAt = U.now();
      copy.app = 'questline';
      return JSON.stringify(copy, null, 2);
    },
    importJSON(text) {
      const data = JSON.parse(text);
      if (!data || data.app !== 'questline' || !Array.isArray(data.goals)) {
        throw new Error('This file is not a Questline backup.');
      }
      const keepKey = state.settings.ai.apiKey;
      delete data.app; delete data.exportedAt;
      store.adapter.save(data);
      store.init();
      if (keepKey && !state.settings.ai.apiKey) state.settings.ai.apiKey = keepKey;
      store.commit();
    },
    reset() { state = blank(); store.commit(); }
  };

  QL.store = store;
})(typeof window !== 'undefined' ? window : globalThis);
