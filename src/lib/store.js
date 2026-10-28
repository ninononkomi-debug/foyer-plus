// Moteur de données : cache local (IndexedDB) + file d'attente hors ligne + synchro Supabase
import { get, set, del } from 'idb-keyval';
import { useSyncExternalStore } from 'react';
import { supabase } from './supabase.js';
import { LOCAL_MODE } from '../config.js';
import { uid as newId, today } from './format.js';
import { DEFAULT_CATEGORIES, DEFAULT_WALLETS } from './defaults.js';

const EPOCH = '1970-01-01T00:00:00Z';

class Store {
  constructor() {
    this.reset();
    this.listeners = new Set();
  }
  reset() {
    this.user = null;
    this.records = new Map();
    this.outbox = new Map();
    this.lastPull = EPOCH;
    this.households = [];
    this.members = [];
    this.profiles = {};
    this.version = 0;
    this.syncing = false;
    this.lastSyncAt = null;
    this.syncError = null;
    this.ready = false;
    this._timer = null;
    this._channel = null;
  }
  key(k) { return `fp:${this.user.id}:${k}`; }

  async init(user) {
    this.reset();
    this.user = user;
    const [recs, out, lp, meta] = await Promise.all([
      get(this.key('records')), get(this.key('outbox')), get(this.key('lastPull')), get(this.key('meta')),
    ]).catch(() => [null, null, null, null]);
    (recs || []).forEach((r) => this.records.set(r.id, r));
    (out || []).forEach((r) => this.outbox.set(r.id, r));
    this.lastPull = lp || EPOCH;
    if (meta) Object.assign(this, { households: meta.households || [], members: meta.members || [], profiles: meta.profiles || {} });
    this.ready = true;
    this.emit();
    if (LOCAL_MODE) {
      this.seedIfNeeded();
    } else {
      this.startRealtime();
      this.sync();
    }
  }

  async logoutClear(wipe = false) {
    if (this._channel) { try { supabase.removeChannel(this._channel); } catch (e) { /* */ } }
    if (wipe && this.user) {
      await Promise.all(['records', 'outbox', 'lastPull', 'meta'].map((k) => del(this.key(k)).catch(() => {})));
    }
    this.reset();
    this.emit();
  }

  subscribe = (fn) => { this.listeners.add(fn); return () => this.listeners.delete(fn); };
  getVersion = () => this.version;
  emit() { this.version++; this.listeners.forEach((f) => f()); }

  _persistTimer = null;
  persist() {
    clearTimeout(this._persistTimer);
    this._persistTimer = setTimeout(() => {
      if (!this.user) return;
      set(this.key('records'), [...this.records.values()]).catch(() => {});
      set(this.key('outbox'), [...this.outbox.values()]).catch(() => {});
      set(this.key('lastPull'), this.lastPull).catch(() => {});
      set(this.key('meta'), { households: this.households, members: this.members, profiles: this.profiles }).catch(() => {});
    }, 150);
  }

  // ---------- Lecture ----------
  get householdId() { return this.households[0]?.id || null; }
  get household() { return this.households[0] || null; }
  list(module) {
    const out = [];
    for (const r of this.records.values()) if (r.module === module && !r.deleted) out.push(r);
    return out;
  }
  getRec(id) { const r = this.records.get(id); return r && !r.deleted ? r : null; }
  nameOf(userId) {
    if (!userId) return '';
    if (userId === this.user?.id) return 'Moi';
    return this.profiles[userId]?.display_name || 'Conjoint';
  }

  // ---------- Écriture ----------
  save(module, data, opts = {}) {
    const now = new Date().toISOString();
    const existing = opts.id ? this.records.get(opts.id) : null;
    const household_id = opts.shared === undefined
      ? (existing ? existing.household_id : null)
      : (opts.shared ? this.householdId : null);
    const rec = existing
      ? { ...existing, data: { ...data }, household_id, updated_at: now }
      : { id: opts.id || newId(), owner_id: this.user.id, household_id, module, data: { ...data }, deleted: false, created_at: now, updated_at: now };
    this.records.set(rec.id, rec);
    if (!LOCAL_MODE) this.outbox.set(rec.id, rec);
    this.persist();
    this.emit();
    this.scheduleSync(800);
    return rec;
  }
  remove(id) {
    const r = this.records.get(id);
    if (!r) return;
    const rec = { ...r, deleted: true, updated_at: new Date().toISOString() };
    this.records.set(id, rec);
    if (!LOCAL_MODE) this.outbox.set(id, rec);
    this.persist();
    this.emit();
    this.scheduleSync(800);
  }

  // ---------- Synchro ----------
  scheduleSync(ms = 1000) {
    if (LOCAL_MODE) return;
    clearTimeout(this._timer);
    this._timer = setTimeout(() => this.sync(), ms);
  }

  async uploadPhoto(rec) {
    const dataUrl = rec.data._photo_pending;
    const blob = await (await fetch(dataUrl)).blob();
    const folder = rec.household_id || rec.owner_id;
    const path = `${folder}/${rec.id}-${Date.now()}.jpg`;
    const { error } = await supabase.storage.from('recus').upload(path, blob, { contentType: 'image/jpeg', upsert: true });
    if (error) throw error;
    const data = { ...rec.data, photo: path };
    delete data._photo_pending;
    const updated = { ...rec, data };
    this.records.set(rec.id, updated);
    return updated;
  }

  async sync() {
    if (LOCAL_MODE || !this.user || this.syncing) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) { this.syncError = 'hors ligne'; this.emit(); return; }
    this.syncing = true;
    this.emit();
    try {
      // 1. Envoi des modifications locales
      if (this.outbox.size) {
        const batch = [];
        for (let rec of [...this.outbox.values()]) {
          if (rec.data && rec.data._photo_pending && !rec.deleted) rec = await this.uploadPhoto(rec);
          const { server_updated_at, ...row } = rec; // eslint-disable-line no-unused-vars
          batch.push(row);
        }
        for (let i = 0; i < batch.length; i += 200) {
          const chunk = batch.slice(i, i + 200);
          const { error } = await supabase.from('records').upsert(chunk, { onConflict: 'id' });
          if (error) throw error;
          chunk.forEach((r) => { if (this.outbox.get(r.id)?.updated_at === r.updated_at) this.outbox.delete(r.id); });
        }
      }
      // 2. Foyer, membres, profils
      const [{ data: hh }, { data: mm }, { data: pp }] = await Promise.all([
        supabase.from('households').select('*').order('created_at'),
        supabase.from('household_members').select('*'),
        supabase.from('profiles').select('*'),
      ]);
      const hadHousehold = this.householdId;
      this.households = hh || [];
      this.members = mm || [];
      this.profiles = Object.fromEntries((pp || []).map((p) => [p.id, p]));
      if (this.householdId && this.householdId !== hadHousehold) this.lastPull = EPOCH; // nouveau foyer : tout recharger
      // 3. Réception des nouveautés
      const since = new Date(new Date(this.lastPull).getTime() - 3000).toISOString();
      let from = 0;
      for (;;) {
        const { data, error } = await supabase.from('records').select('*')
          .gt('server_updated_at', since).order('server_updated_at').range(from, from + 999);
        if (error) throw error;
        for (const r of data) {
          if (!this.outbox.has(r.id)) this.records.set(r.id, r);
          if (r.server_updated_at > this.lastPull) this.lastPull = r.server_updated_at;
        }
        if (data.length < 1000) break;
        from += 1000;
      }
      // enregistrements d'un foyer quitté
      const myHh = new Set(this.households.map((h) => h.id));
      for (const [id, r] of this.records) if (r.household_id && !myHh.has(r.household_id) && r.owner_id !== this.user.id) this.records.delete(id);
      this.syncError = null;
      this.lastSyncAt = new Date();
      this.persist();
      this.seedIfNeeded();
    } catch (e) {
      this.syncError = e?.message || String(e);
      console.warn('sync', e);
    } finally {
      this.syncing = false;
      this.emit();
      if (this.outbox.size && !this.syncError) this.scheduleSync(2000);
    }
  }

  async fullResync() {
    this.lastPull = EPOCH;
    for (const id of [...this.records.keys()]) if (!this.outbox.has(id)) this.records.delete(id);
    await this.sync();
  }

  startRealtime() {
    try {
      this._channel = supabase.channel('records-' + this.user.id)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'records' }, () => this.scheduleSync(400))
        .subscribe();
    } catch (e) { /* le temps réel est un bonus */ }
  }

  seededDone = false;
  seedIfNeeded() {
    if (this.seededDone) return;
    this.seededDone = true;
    const mine = (m) => this.list(m).some((r) => r.owner_id === this.user.id && !r.household_id);
    if (!mine('categorie')) DEFAULT_CATEGORIES.forEach((c) => this.save('categorie', c));
    if (!mine('portefeuille')) DEFAULT_WALLETS.forEach((w) => this.save('portefeuille', { ...w, date: today() }));
  }

  // ---------- Foyer ----------
  async createHousehold(name) {
    const { data, error } = await supabase.rpc('create_household', { p_name: name });
    if (error) throw error;
    await this.sync();
    this.save('portefeuille', { nom: 'Caisse du foyer', type: 'especes', solde_initial: 0, date: today() }, { shared: true });
    return data;
  }
  async joinHousehold(code) {
    const { data, error } = await supabase.rpc('join_household', { p_code: code });
    if (error) throw error;
    this.lastPull = EPOCH;
    await this.sync();
    return data;
  }
  async leaveHousehold() {
    const id = this.householdId;
    if (!id) return;
    const { error } = await supabase.rpc('leave_household', { p_id: id });
    if (error) throw error;
    await this.sync();
  }
  async renewCode() {
    const { data, error } = await supabase.rpc('renew_invite_code', { p_id: this.householdId });
    if (error) throw error;
    await this.sync();
    return data;
  }
}

export const store = new Store();

export function useStore() {
  useSyncExternalStore(store.subscribe, store.getVersion);
  return store;
}
