/**
 * MDM Application - Google Firebase Realtime Database Live Multi-Device Cloud Sync Engine
 * 
 * Exclusively powered by Google Firebase Realtime Database (REST API)
 * Features:
 * 1. Live 2-Way REST Synchronization across PC, Laptop & Mobile devices
 * 2. Smart Conflict-Free Merge (Never loses dates or stock records from either device)
 * 3. Empty Device Safeguard (Blocks blank local state from wiping populated cloud databases)
 * 4. Automatic Cloud Safety Snapshot Backups before every overwrite
 * 5. Automatic Debounced Background Push on every save
 * 6. Non-blocking Timeout Protection with AbortController
 * 7. Live Online/Offline Network Resilience
 */

const DEFAULT_FIREBASE_URL = 'https://gvp-pm-poshan-f390e-default-rtdb.firebaseio.com';

const cloudSync = {
  DEFAULT_URL: DEFAULT_FIREBASE_URL,
  config: {
    enabled: true,
    autoSync: true,
    schoolCode: '',             // School UDISE (e.g. 27240801201)
    secretPin: 'Ican@123',      // Security PIN
    firebaseUrl: DEFAULT_FIREBASE_URL, // Google Firebase Realtime Database URL
    lastSyncTime: null,
    status: 'idle',             // 'idle', 'syncing', 'synced', 'error', 'offline'
    lastError: ''
  },

  isSyncing: false,
  hasPendingPush: false,
  debounceTimer: null,
  SYNC_STORAGE_KEY: 'MDM_CLOUD_SYNC_CONFIG',

  /**
   * Helper: Normalize & sanitize Firebase RTDB URL
   */
  normalizeFirebaseUrl(url) {
    if (!url || typeof url !== 'string') return '';
    let clean = url.trim();
    // If user accidentally copied the Firebase Console page URL:
    // e.g. https://console.firebase.google.com/project/<project-id>/database/<database-name>/data
    if (clean.includes('console.firebase.google.com')) {
      const match = clean.match(/database\/([^/?#]+)/);
      if (match && match[1]) {
        clean = `https://${match[1]}.firebaseio.com`;
      }
    }
    if (!clean.startsWith('http://') && !clean.startsWith('https://')) {
      clean = 'https://' + clean;
    }
    // Remove trailing slashes, /data, and .json
    clean = clean.replace(/\.json$/, '').replace(/\/data$/, '').replace(/\/+$/, '');
    return clean;
  },

  /**
   * Helper: Fetch with timeout via AbortController
   */
  async fetchWithTimeout(url, options = {}, timeoutMs = 12000) {
    if (typeof AbortController === 'undefined') {
      return fetch(url, options);
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timer);
      return res;
    } catch (err) {
      clearTimeout(timer);
      if (err.name === 'AbortError') {
        throw new Error('कनेक्शन टाईमआऊट (12 सेकंद). कृपया इंटरनेट कनेक्शन तपासा.');
      }
      throw err;
    }
  },

  /**
   * Helper: Get effective Firebase URL (GitHub firebase-config.js takes 100% priority, with permanent default fallback)
   */
  getEffectiveFirebaseUrl() {
    if (typeof window !== 'undefined' && window.MDM_CONFIG && window.MDM_CONFIG.firebaseUrl && typeof window.MDM_CONFIG.firebaseUrl === 'string') {
      const trimmed = window.MDM_CONFIG.firebaseUrl.trim();
      if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
        return this.normalizeFirebaseUrl(trimmed);
      }
    }
    if (this.config && this.config.firebaseUrl) {
      const clean = this.normalizeFirebaseUrl(this.config.firebaseUrl);
      if (clean) return clean;
    }
    return this.DEFAULT_URL;
  },

  /**
   * Helper: Pre-fill input elements in DOM if they exist
   */
  populateFormInputs() {
    if (typeof document === 'undefined') return;
    const effectiveUrl = this.getEffectiveFirebaseUrl();
    const adminInp = document.getElementById('adminFirebaseUrlInput');
    if (adminInp && (!adminInp.value || !adminInp.value.trim())) {
      adminInp.value = effectiveUrl;
    }
    const cloudInp = document.getElementById('cloudFirebaseUrl');
    if (cloudInp && (!cloudInp.value || !cloudInp.value.trim())) {
      cloudInp.value = effectiveUrl;
    }
  },

  /**
   * Initialize Cloud Sync
   */
  init() {
    this.loadConfig();
    this.applyGlobalConfig();
    this.bindOnlineEvents();

    const activeUdise = this.getSchoolUdise();
    const effectiveUrl = this.getEffectiveFirebaseUrl();

    // Auto-fill DOM inputs
    this.populateFormInputs();

    // Auto pull on startup ONLY IF Firebase is enabled, URL exists, AND a school is authenticated & logged in
    if (this.config.enabled && effectiveUrl && activeUdise && activeUdise.length === 11) {
      setTimeout(() => {
        this.pullFromCloud(true);
      }, 700);
    }

    this.updateUIStatus();
  },

  /**
   * Auto-apply configuration from window.MDM_CONFIG (e.g. from firebase-config.js in GitHub repository)
   * The Firebase URL in firebase-config.js ALWAYS takes 100% priority over any stale localStorage URL.
   */
  applyGlobalConfig() {
    if (typeof window !== 'undefined' && window.MDM_CONFIG) {
      const cfg = window.MDM_CONFIG;
      if (cfg.firebaseUrl && typeof cfg.firebaseUrl === 'string' && cfg.firebaseUrl.trim()) {
        const cleanUrl = this.normalizeFirebaseUrl(cfg.firebaseUrl.trim());
        if (cleanUrl && (cleanUrl.startsWith('http://') || cleanUrl.startsWith('https://'))) {
          this.config.firebaseUrl = cleanUrl;
          this.config.enabled = true;
          this.saveConfig();
        }
      } else if (!this.config.firebaseUrl) {
        this.config.firebaseUrl = this.DEFAULT_URL;
        this.config.enabled = true;
      }
      if (cfg.singleSchoolMode === true && cfg.schoolUdise && /^\d{11}$/.test(String(cfg.schoolUdise).trim())) {
        this.config.schoolCode = String(cfg.schoolUdise).trim();
      }
      if (cfg.autoSync !== undefined) {
        this.config.autoSync = !!cfg.autoSync;
      }
    }
    this.populateFormInputs();
  },

  loadConfig() {
    try {
      if (typeof localStorage === 'undefined') return;
      const saved = localStorage.getItem(this.SYNC_STORAGE_KEY);
      if (saved) {
        this.config = Object.assign({}, this.config, JSON.parse(saved));
        if (this.config.firebaseUrl) {
          this.config.firebaseUrl = this.normalizeFirebaseUrl(this.config.firebaseUrl);
        }
      }
      // Ensure cloud sync is always enabled and autoSync is true by default
      this.config.enabled = true;
      this.config.autoSync = true;
      if (!this.config.firebaseUrl) {
        this.config.firebaseUrl = this.DEFAULT_URL;
      }
    } catch (e) {
      console.warn("Could not load cloud sync config:", e);
    }
  },

  saveConfig() {
    try {
      if (typeof localStorage === 'undefined') return;
      localStorage.setItem(this.SYNC_STORAGE_KEY, JSON.stringify(this.config));
      this.updateUIStatus();
    } catch (e) {
      console.warn("Could not save cloud sync config:", e);
    }
  },

  bindOnlineEvents() {
    if (typeof window === 'undefined') return;

    window.addEventListener('online', () => {
      this.config.lastError = '';
      this.updateUIStatus();
      if (this.config.enabled && this.getEffectiveFirebaseUrl() && this.config.autoSync && this.getSchoolUdise()) {
        this.scheduleDebouncedPush(true);
      }
    });

    window.addEventListener('offline', () => {
      this.config.status = 'offline';
      this.updateUIStatus();
    });

    // Mobile backgrounding & screen lock protection
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
          this.flushPendingPush();
        } else if (document.visibilityState === 'visible') {
          // User returned to tab / unlocked phone: pull fresh changes from other devices
          const activeU = this.getSchoolUdise();
          if (this.config.enabled && this.getEffectiveFirebaseUrl() && activeU && activeU.length === 11) {
            this.pullFromCloud(true, activeU);
          }
        }
      });
    }

    window.addEventListener('pagehide', () => {
      this.flushPendingPush();
    });

    // Multi-device focus pull: auto sync when user clicks into the PM Poshan window/tab
    window.addEventListener('focus', () => {
      const activeU = this.getSchoolUdise();
      if (this.config.enabled && this.getEffectiveFirebaseUrl() && activeU && activeU.length === 11) {
        this.pullFromCloud(true, activeU);
      }
    });

    // Multi-device periodic sync: every 60s, automatically pull fresh changes from other devices if tab is visible
    if (this.backgroundSyncInterval) clearInterval(this.backgroundSyncInterval);
    this.backgroundSyncInterval = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      if (this.isSyncing) return;
      const activeU = this.getSchoolUdise();
      if (this.config.enabled && this.getEffectiveFirebaseUrl() && activeU && activeU.length === 11) {
        this.pullFromCloud(true, activeU);
      }
    }, 60000);
  },

  /**
   * Return active school UDISE ONLY if user is actively logged in.
   * NEVER fallback to a default or arbitrary school.
   */
  getSchoolUdise() {
    let udise = '';
    if (typeof app !== 'undefined' && typeof app.getActiveUdise === 'function') {
      udise = app.getActiveUdise();
    }
    if (!udise && typeof localStorage !== 'undefined') {
      udise = localStorage.getItem('MDM_CURRENT_UDISE') || '';
    }
    if (!udise && typeof window !== 'undefined' && window.MDM_CONFIG && window.MDM_CONFIG.singleSchoolMode === true && window.MDM_CONFIG.schoolUdise) {
      udise = String(window.MDM_CONFIG.schoolUdise).trim();
    }
    udise = String(udise || '').trim();
    return (/^\d{11}$/.test(udise)) ? udise : '';
  },

  getCloudKey(targetUdise = null) {
    const udise = (targetUdise || this.getSchoolUdise() || '').replace(/[^a-zA-Z0-9_-]/g, '_');
    return `mdm_${udise}`;
  },

  onSchoolSwitched(newUdise) {
    if (newUdise) {
      this.config.schoolCode = String(newUdise).trim();
      this.config.status = 'idle';
      this.config.lastError = '';
      this.saveConfig();
      this.updateUIStatus();
    }
  },

  scheduleDebouncedPush(immediate = false, targetUdise = null) {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);

    const udiseToPush = targetUdise || this.getSchoolUdise();
    this.pendingPushUdise = udiseToPush;

    if (this.isSyncing) {
      this.hasPendingPush = true;
      return;
    }

    if (immediate) {
      this.debounceTimer = null;
      if (this.getEffectiveFirebaseUrl() && udiseToPush) {
        this.pushToCloud(true, udiseToPush);
      }
      return;
    }

    // Responsive 400ms debounce instead of old 2500ms lag
    this.debounceTimer = setTimeout(() => {
      if (this.getEffectiveFirebaseUrl() && udiseToPush) {
        this.pushToCloud(true, udiseToPush);
      }
    }, 400);
  },

  flushPendingPush() {
    if (this.debounceTimer || this.hasPendingPush) {
      if (this.debounceTimer) {
        clearTimeout(this.debounceTimer);
        this.debounceTimer = null;
      }
      const activeU = this.pendingPushUdise || this.getSchoolUdise();
      if (this.getEffectiveFirebaseUrl() && activeU) {
        this.pushToCloud(true, activeU);
      }
    }
  },

  /**
   * Smart Conflict-Free Merge for a single day record
   * Truly preserves user edits (even if setting 0 kids or holiday) based on edit timestamp
   */
  mergeDayRecord(recA, recB, preferA = true) {
    if (!recA && !recB) return null;
    if (!recA) return Object.assign({}, recB);
    if (!recB) return Object.assign({}, recA);

    const timeA = new Date(recA.updatedAt || recA.savedAt || 0).getTime();
    const timeB = new Date(recB.updatedAt || recB.savedAt || 0).getTime();

    // 1. Strict Timestamp Authority: The record with the strictly newer timestamp ALWAYS wins
    if (timeA > 0 && timeB > 0) {
      if (timeA > timeB) return Object.assign({}, recB, recA);
      if (timeB > timeA) return Object.assign({}, recA, recB);
    } else if (timeA > 0 && (!timeB || timeB === 0)) {
      return Object.assign({}, recB, recA);
    } else if (timeB > 0 && (!timeA || timeA === 0)) {
      return Object.assign({}, recA, recB);
    }

    // 2. Only if both timestamps are completely equal or absent:
    // If one is an active working day and the other is an uninitialized blank, keep the data.
    const aHasData = (!recA.isHoliday && ((parseInt(recA.children) || 0) > 0 || (recA.quantities && Object.values(recA.quantities).some(v => parseFloat(v) > 0))));
    const bHasData = (!recB.isHoliday && ((parseInt(recB.children) || 0) > 0 || (recB.quantities && Object.values(recB.quantities).some(v => parseFloat(v) > 0))));

    if (aHasData && !bHasData) return Object.assign({}, recB, recA);
    if (!aHasData && bHasData) return Object.assign({}, recA, recB);

    return preferA ? Object.assign({}, recB, recA) : Object.assign({}, recA, recB);
  },

  /**
   * Smart Conflict-Free Merge for daily records dictionary
   */
  mergeDayRecordsMap(mapA, mapB, preferA = true, deletedDates = []) {
    const result = {};
    const keysA = Object.keys(mapA || {});
    const keysB = Object.keys(mapB || {});
    const allKeys = new Set([...keysA, ...keysB]);
    const delSet = new Set(Array.isArray(deletedDates) ? deletedDates : []);

    allKeys.forEach(k => {
      if (delSet.has(k)) return; // Strictly exclude deleted dates from merge
      const recA = mapA ? mapA[k] : null;
      const recB = mapB ? mapB[k] : null;
      const merged = this.mergeDayRecord(recA, recB, preferA);
      if (merged) result[k] = merged;
    });

    return result;
  },

  /**
   * Robust Deduplicating & Tombstone-Aware Merge for Inward Stock Receipts
   * Prevents duplicate entries and ensures deleted receipts are NEVER resurrected
   */
  mergeStockReceiptsList(localList, remoteList, deletedIds = []) {
    const l = Array.isArray(localList) ? localList : [];
    const r = Array.isArray(remoteList) ? remoteList : [];
    const delSet = new Set(Array.isArray(deletedIds) ? deletedIds : []);

    const combined = [...r, ...l].filter(item => item && typeof item === 'object' && (!item.id || !delSet.has(item.id)));
    const seenIds = new Set();
    const seenSigs = new Set();
    const result = [];

    combined.forEach(item => {
      if (!item.id) {
        item.id = 'rcp_' + (item.date ? item.date.replace(/-/g, '') : 'old') + '_' + Math.random().toString(36).substr(2, 6);
      }
      if (seenIds.has(item.id)) return;

      const itemsKeys = Object.keys(item.items || {}).filter(k => !isNaN(parseFloat(item.items[k])) && parseFloat(item.items[k]) !== 0).sort();
      const itemsSig = itemsKeys.map(k => `${k}:${parseFloat(item.items[k])}`).join('|');
      const billSig = (item.billNo || '').trim().toLowerCase();
      const dateSig = (item.date || '').trim();
      const secSig = item.section || 'primary';
      const sig = `${dateSig}#${billSig}#${secSig}#${itemsSig}`;

      if (seenSigs.has(sig)) return;

      seenIds.add(item.id);
      seenSigs.add(sig);
      result.push(item);
    });

    return result;
  },

  /**
   * Helper: compute deterministic signature for damaged stock
   */
  getDamagedSignature(item, sectionFallback = 'primary') {
    if (!item || typeof item !== 'object') return '';
    const dateSig = (item.date || '').trim();
    const secSig = item.section || sectionFallback || 'primary';
    const itemsKeys = Object.keys(item.items || {}).filter(k => parseFloat(item.items[k]) > 0).sort();
    const itemsSig = itemsKeys.map(k => `${k}:${parseFloat(item.items[k])}`).join('|');
    return `${dateSig}#${secSig}#${itemsSig}`;
  },

  getDamagedRelaxedSignature(item) {
    if (!item || typeof item !== 'object') return '';
    const dateSig = (item.date || '').trim();
    const itemsKeys = Object.keys(item.items || {}).filter(k => parseFloat(item.items[k]) > 0).sort();
    const itemsSig = itemsKeys.map(k => `${k}:${parseFloat(item.items[k])}`).join('|');
    return `${dateSig}#${itemsSig}`;
  },

  /**
   * Robust Deduplicating & Tombstone-Aware Merge for Damaged Stock
   * Uses both unique IDs and deterministic content signatures (strict & relaxed)
   */
  mergeDamagedStockList(localList, remoteList, deletedIds = [], deletedSigs = []) {
    const l = Array.isArray(localList) ? localList : [];
    const r = Array.isArray(remoteList) ? remoteList : [];
    const delSet = new Set(Array.isArray(deletedIds) ? deletedIds : []);
    const delSigSet = new Set(Array.isArray(deletedSigs) ? deletedSigs : []);

    // Also build a set of relaxed signatures (date#items) from all deleted signatures
    const relaxedDelSigSet = new Set();
    delSigSet.forEach(s => {
      if (s) {
        relaxedDelSigSet.add(s);
        const parts = s.split('#');
        if (parts.length === 3) {
          relaxedDelSigSet.add(`${parts[0]}#${parts[2]}`);
        }
      }
    });

    const isDeleted = (item) => {
      if (!item || typeof item !== 'object') return true;
      if (item.id && delSet.has(item.id)) return true;
      const sig = this.getDamagedSignature(item);
      if (sig && delSigSet.has(sig)) return true;
      const sigUpper = this.getDamagedSignature(item, 'upper');
      if (sigUpper && delSigSet.has(sigUpper)) return true;
      const relSig = this.getDamagedRelaxedSignature(item);
      if (relSig && (delSigSet.has(relSig) || relaxedDelSigSet.has(relSig))) return true;
      return false;
    };

    const combined = [...r, ...l].filter(item => !isDeleted(item));

    const seenIds = new Set();
    const seenSigs = new Set();
    const result = [];

    combined.forEach(item => {
      if (isDeleted(item)) return;

      const sig = this.getDamagedSignature(item);
      if (!item.id) {
        item.id = 'dmg_' + (sig ? sig.replace(/[^a-zA-Z0-9_-]/g, '_') : Date.now());
      }
      if (delSet.has(item.id)) return;
      if (seenIds.has(item.id)) return;
      if (sig && seenSigs.has(sig)) return;

      seenIds.add(item.id);
      if (sig) seenSigs.add(sig);
      result.push(item);
    });

    return result;
  },

  /**
   * Helper: compute deterministic signature for inter-section stock transfers / loans
   */
  getTransferSignature(item) {
    if (!item || typeof item !== 'object') return '';
    const dateSig = (item.date || '').trim();
    const dirSig = item.direction || `${item.fromSection || ''}_to_${item.toSection || ''}`;
    const itemsKeys = Object.keys(item.items || {}).filter(k => parseFloat(item.items[k]) > 0).sort();
    const itemsSig = itemsKeys.map(k => `${k}:${parseFloat(item.items[k])}`).join('|');
    return `${dateSig}#${dirSig}#${itemsSig}`;
  },

  getTransferRelaxedSignature(item) {
    if (!item || typeof item !== 'object') return '';
    const dateSig = (item.date || '').trim();
    const itemsKeys = Object.keys(item.items || {}).filter(k => parseFloat(item.items[k]) > 0).sort();
    const itemsSig = itemsKeys.map(k => `${k}:${parseFloat(item.items[k])}`).join('|');
    return `${dateSig}#${itemsSig}`;
  },

  /**
   * Robust Deduplicating & Tombstone-Aware Merge for Stock Transfers (उसनवार / धान्य उचल)
   */
  mergeStockTransfersList(localList, remoteList, deletedIds = [], deletedSigs = []) {
    const l = Array.isArray(localList) ? localList : [];
    const r = Array.isArray(remoteList) ? remoteList : [];
    const delSet = new Set(Array.isArray(deletedIds) ? deletedIds : []);
    const delSigSet = new Set(Array.isArray(deletedSigs) ? deletedSigs : []);

    const relaxedDelSigSet = new Set();
    delSigSet.forEach(s => {
      if (s) {
        relaxedDelSigSet.add(s);
        const parts = s.split('#');
        if (parts.length === 3) {
          relaxedDelSigSet.add(`${parts[0]}#${parts[2]}`);
        }
      }
    });

    const isDeleted = (item) => {
      if (!item || typeof item !== 'object') return true;
      if (item.id && delSet.has(item.id)) return true;
      const sig = this.getTransferSignature(item);
      if (sig && delSigSet.has(sig)) return true;
      const relSig = this.getTransferRelaxedSignature(item);
      if (relSig && (delSigSet.has(relSig) || relaxedDelSigSet.has(relSig))) return true;
      return false;
    };

    const combined = [...r, ...l].filter(item => !isDeleted(item));

    const seenIds = new Set();
    const seenSigs = new Set();
    const result = [];

    combined.forEach(item => {
      if (isDeleted(item)) return;

      const sig = this.getTransferSignature(item);
      if (!item.id) {
        item.id = 'trf_' + (sig ? sig.replace(/[^a-zA-Z0-9_-]/g, '_') : Date.now());
      }
      if (delSet.has(item.id)) return;
      if (seenIds.has(item.id)) return;
      if (sig && seenSigs.has(sig)) return;

      seenIds.add(item.id);
      if (sig) seenSigs.add(sig);
      result.push(item);
    });

    return result.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  },

  /**
   * Smart Merge for Initial Stock balances (1 April stock)
   * Truly respects deliberate user edits (including setting stock to 0) using strict timestamp authority
   */
  mergeStockBalances(stockA, stockB, preferA = true) {
    if (!stockA && !stockB) return {};
    if (!stockA) return Object.assign({}, stockB);
    if (!stockB) return Object.assign({}, stockA);

    const timeA = stockA._updatedAt ? new Date(stockA._updatedAt).getTime() : 0;
    const timeB = stockB._updatedAt ? new Date(stockB._updatedAt).getTime() : 0;

    // Strict Timestamp Authority
    if (timeA > 0 && timeB > 0) {
      if (timeA > timeB) return Object.assign({}, stockB, stockA);
      if (timeB > timeA) return Object.assign({}, stockA, stockB);
    } else if (timeA > 0 && (!timeB || timeB === 0)) {
      return Object.assign({}, stockB, stockA);
    } else if (timeB > 0 && (!timeA || timeA === 0)) {
      return Object.assign({}, stockA, stockB);
    }

    // Fallback if timestamps are absent on both sides:
    const keysA = Object.keys(stockA).filter(k => !k.startsWith('_'));
    const keysB = Object.keys(stockB).filter(k => !k.startsWith('_'));
    if (keysA.length > 0 && keysB.length === 0) return Object.assign({}, stockA);
    if (keysB.length > 0 && keysA.length === 0) return Object.assign({}, stockB);

    // If preferA (e.g. pushing local updates), local values win
    if (preferA) {
      return Object.assign({}, stockB, stockA);
    } else {
      return Object.assign({}, stockA, stockB);
    }
  },

  /**
   * Smart Merge for School Settings
   * Preserves non-empty strings and valid numbers with timestamp-based reconciliation
   */
  mergeSettings(localSett, remoteSett, targetUdise = null, preferRemote = false) {
    const l = localSett || {};
    const r = remoteSett || {};

    const lTime = l.updatedAt ? new Date(l.updatedAt).getTime() : 0;
    const rTime = r.updatedAt ? new Date(r.updatedAt).getTime() : 0;

    const isPlaceholder = (name) => !name || !String(name).trim() || String(name).includes('(UDISE:') || String(name).startsWith('शाळा (');

    // Determine which side is authoritative based on timestamp
    // If remote has a strictly newer timestamp, remote wins.
    // If local has a strictly newer timestamp, local wins.
    // If timestamps are tied or missing, fall back to preferRemote (true for pullFromCloud, false for pushToCloud).
    let remoteWins = false;
    if (rTime > lTime) {
      remoteWins = true;
    } else if (lTime > rTime) {
      remoteWins = false;
    } else {
      remoteWins = !!preferRemote;
    }

    let res = {};
    if (remoteWins) {
      // Remote is authoritative: start with local, overwrite with remote
      res = Object.assign({}, l, r);
      // If remote had an empty/null/undefined field but local had a non-empty value, preserve local's value
      Object.keys(l).forEach(k => {
        if ((r[k] === undefined || r[k] === null || r[k] === '') && (l[k] !== undefined && l[k] !== null && l[k] !== '')) {
          res[k] = l[k];
        }
      });
    } else {
      // Local is authoritative: start with remote, overwrite with local
      res = Object.assign({}, r, l);
      // If local had an empty/null/undefined field but remote had a non-empty value, preserve remote's value
      Object.keys(r).forEach(k => {
        if ((l[k] === undefined || l[k] === null || l[k] === '') && (r[k] !== undefined && r[k] !== null && r[k] !== '')) {
          res[k] = r[k];
        }
      });
    }

    // Critical Rule: Real school name ALWAYS beats placeholder school name
    if (isPlaceholder(res.schoolName)) {
      if (!isPlaceholder(r.schoolName)) res.schoolName = r.schoolName;
      else if (!isPlaceholder(l.schoolName)) res.schoolName = l.schoolName;
    } else {
      if (isPlaceholder(l.schoolName) && !isPlaceholder(r.schoolName)) res.schoolName = r.schoolName;
      else if (isPlaceholder(r.schoolName) && !isPlaceholder(l.schoolName)) res.schoolName = l.schoolName;
    }

    // Preserve the freshest timestamp
    if (rTime > lTime) {
      res.updatedAt = r.updatedAt;
    } else if (lTime > rTime) {
      res.updatedAt = l.updatedAt;
    } else {
      res.updatedAt = l.updatedAt || r.updatedAt || new Date().toISOString();
    }

    // Critical: Guarantee UDISE matches targetUdise / current school
    if (targetUdise) {
      res.udise = String(targetUdise).trim();
    } else if (r.udise && /^\d{11}$/.test(r.udise)) {
      res.udise = String(r.udise).trim();
    } else if (l.udise && /^\d{11}$/.test(l.udise)) {
      res.udise = String(l.udise).trim();
    }
    return res;
  },

  /**
   * Smart Conflict-Free Merge for Ingredients / Consumption Rates (धान्य प्रमाण)
   * Ensures rates and custom items updated on PC or Mobile are cleanly reconciled
   */
  mergeIngredients(localIngs, remoteIngs, preferRemote = false) {
    const l = (localIngs && typeof localIngs === 'object') ? localIngs : {};
    const r = (remoteIngs && typeof remoteIngs === 'object') ? remoteIngs : {};

    const allKeys = Array.from(new Set([...Object.keys(l), ...Object.keys(r)]));
    if (allKeys.length === 0) return {};

    const merged = {};
    allKeys.forEach(k => {
      const localItem = l[k];
      const remoteItem = r[k];

      if (!localItem && remoteItem) {
        merged[k] = Object.assign({}, remoteItem);
      } else if (localItem && !remoteItem) {
        merged[k] = Object.assign({}, localItem);
      } else {
        // Exists in both: reconcile fields
        if (preferRemote) {
          // On pullFromCloud: remote is authoritative for rates and names
          merged[k] = Object.assign({}, localItem, remoteItem);
        } else {
          // On pushToCloud: local is authoritative
          merged[k] = Object.assign({}, remoteItem, localItem);
        }
      }
    });

    return merged;
  },

  /**
   * Smart Merge for Menus (Daily food items / pulses assignment)
   */
  mergeMenus(localMenus, remoteMenus, preferRemote = false) {
    const l = Array.isArray(localMenus) ? localMenus : [];
    const r = Array.isArray(remoteMenus) ? remoteMenus : [];
    if (l.length === 0 && r.length === 0) return [];
    if (l.length === 0) return r;
    if (r.length === 0) return l;

    const base = preferRemote ? r : l;
    const secondary = preferRemote ? l : r;
    const merged = [...base];

    secondary.forEach(item => {
      const exists = merged.some(m => (m.id && item.id && m.id === item.id) || (m.name && item.name && m.name === item.name));
      if (!exists) {
        merged.push(item);
      }
    });

    return merged;
  },

  /**
   * Push local data to Google Firebase Realtime Database
   */
  async pushToCloud(isSilent = false, targetUdise = null) {
    const currentUdise = targetUdise || this.getSchoolUdise();
    if (!currentUdise || currentUdise.length !== 11) {
      this.isSyncing = false;
      return false;
    }

    const cleanBaseUrl = this.getEffectiveFirebaseUrl();
    if (!cleanBaseUrl) {
      if (!isSilent) {
        alert('⚠️ Google Firebase Realtime Database URL प्रविष्ट केलेली नाही!\n\nकृपया प्रथम Firebase Realtime Database ची URL टाका.\nउदा. https://your-project-default-rtdb.firebaseio.com/');
      }
      return false;
    }

    if (this.isSyncing) {
      this.hasPendingPush = true;
      return false;
    }
    this.isSyncing = true;
    this.hasPendingPush = false;

    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      this.isSyncing = false;
      this.config.status = 'offline';
      this.config.lastError = 'इंटरनेट कनेक्शन उपलब्ध नाही.';
      this.updateUIStatus();
      if (!isSilent && typeof app !== 'undefined') {
        app.showToast('⚠️ इंटरनेट उपलब्ध नाही. इंटरनेट सुरू झाल्यावर डेटा क्लाऊडवर सेव्ह होईल.', 'warning');
      }
      return false;
    }

    this.config.status = 'syncing';
    this.updateUIStatus();

    this.config.schoolCode = currentUdise;
    const endpoint = `${cleanBaseUrl}/mdm_schools/${this.getCloudKey(currentUdise)}.json`;

    try {
      // 1. Safety Check: Fetch remote state to prevent wiping populated database with blank device
      let existingRemote = null;
      try {
        const checkRes = await this.fetchWithTimeout(endpoint, {}, 8000);
        if (checkRes.ok) {
          existingRemote = await checkRes.json();
        }
      } catch (checkErr) {
        console.warn("Pre-check remote bucket notice:", checkErr);
      }

      // Resolve data to push: prioritize currentUdise specific storage if targetUdise differs from active memory
      let dataToPush = null;
      if (typeof app !== 'undefined') {
        const activeU = (typeof app.getActiveUdise === 'function') ? app.getActiveUdise() : '';
        if (activeU === currentUdise && app.data && app.data.settings && app.data.settings.udise === currentUdise) {
          dataToPush = app.data;
        } else {
          const storageKey = app.getSchoolStorageKey ? app.getSchoolStorageKey(currentUdise) : `MDM_SCHOOL_DATA_${currentUdise}`;
          const localRaw = (typeof localStorage !== 'undefined') ? localStorage.getItem(storageKey) : null;
          if (localRaw) {
            try { dataToPush = JSON.parse(localRaw); } catch(e) {}
          }
          if (!dataToPush && app.data && app.data.settings && app.data.settings.udise === currentUdise) {
            dataToPush = app.data;
          }
        }
      }
      if (!dataToPush && typeof app !== 'undefined' && app.data && app.data.settings && app.data.settings.udise === currentUdise) {
        dataToPush = app.data;
      }
      if (!dataToPush && typeof app !== 'undefined' && typeof app.createDefaultSchoolData === 'function') {
        dataToPush = app.createDefaultSchoolData(currentUdise);
      }
      if (!dataToPush) dataToPush = {};
      if (!dataToPush.settings) dataToPush.settings = {};
      dataToPush.settings.udise = currentUdise;

      const localRecCount = Object.keys(dataToPush.records || {}).length +
                            Object.keys(dataToPush.recordsUpper || {}).length;
      const remoteRecCount = (existingRemote && existingRemote.appData)
        ? (Object.keys(existingRemote.appData.records || {}).length + Object.keys(existingRemote.appData.recordsUpper || {}).length) : 0;

      // GUARD 1: Prevent Blank Device from destroying remote daily records while safely allowing stock & settings push
      if (localRecCount === 0 && remoteRecCount > 0) {
        const remoteRecs = (existingRemote.appData && existingRemote.appData.records) || {};
        const remoteRecsU = (existingRemote.appData && existingRemote.appData.recordsUpper) || {};
        dataToPush.records = remoteRecs;
        dataToPush.recordsUpper = remoteRecsU;
        if (typeof app !== 'undefined' && app.data && (typeof app.getActiveUdise === 'function' && app.getActiveUdise() === currentUdise)) {
          app.data.records = remoteRecs;
          app.data.recordsUpper = remoteRecsU;
        }
      }

      // GUARD 2: Smart Conflict-Free Merge before push so any missing remote dates/receipts are combined
      if (existingRemote && existingRemote.appData) {
        const remoteData = existingRemote.appData;

        // Union of deleted record date tombstones
        const mergedDeletedRecordDates = Array.from(new Set([
          ...(dataToPush.deletedRecordDates || []),
          ...(remoteData.deletedRecordDates || [])
        ]));
        const mergedDeletedRecordDatesUpper = Array.from(new Set([
          ...(dataToPush.deletedRecordDatesUpper || []),
          ...(remoteData.deletedRecordDatesUpper || [])
        ]));

        const mergedRecords = this.mergeDayRecordsMap(dataToPush.records, remoteData.records, true, mergedDeletedRecordDates);
        const mergedRecordsUpper = this.mergeDayRecordsMap(dataToPush.recordsUpper, remoteData.recordsUpper, true, mergedDeletedRecordDatesUpper);
        const mergedTaste = Object.assign({}, remoteData.tasteRecords || {}, dataToPush.tasteRecords || {});
        const mergedTasteUpper = Object.assign({}, remoteData.tasteRecordsUpper || {}, dataToPush.tasteRecordsUpper || {});
        const mergedStock = this.mergeStockBalances(dataToPush.initialStock, remoteData.initialStock, true);
        const mergedStockUpper = this.mergeStockBalances(dataToPush.initialStockUpper, remoteData.initialStockUpper, true);
        const mergedSettings = this.mergeSettings(dataToPush.settings, remoteData.settings, currentUdise, false);
        
        // Union of deleted tombstones
        const mergedDeletedReceipts = Array.from(new Set([
          ...(dataToPush.deletedStockReceiptIds || []),
          ...(remoteData.deletedStockReceiptIds || [])
        ]));
        const mergedDeletedDamaged = Array.from(new Set([
          ...(dataToPush.deletedDamagedIds || []),
          ...(remoteData.deletedDamagedIds || [])
        ]));
        const mergedDeletedDamagedSigs = Array.from(new Set([
          ...(dataToPush.deletedDamagedSigs || []),
          ...(remoteData.deletedDamagedSigs || [])
        ]));
        const mergedDeletedTransfers = Array.from(new Set([
          ...(dataToPush.deletedStockTransferIds || []),
          ...(remoteData.deletedStockTransferIds || [])
        ]));
        const mergedDeletedTransferSigs = Array.from(new Set([
          ...(dataToPush.deletedStockTransferSigs || []),
          ...(remoteData.deletedStockTransferSigs || [])
        ]));

        // Stock receipts, damaged stock, and stock transfers with deduplication & tombstone protection
        const mergedReceipts = this.mergeStockReceiptsList(dataToPush.stockReceipts, remoteData.stockReceipts, mergedDeletedReceipts);
        const mergedReceiptsUpper = this.mergeStockReceiptsList(dataToPush.stockReceiptsUpper, remoteData.stockReceiptsUpper, mergedDeletedReceipts);
        const mergedDamaged = this.mergeDamagedStockList(dataToPush.damagedStock, remoteData.damagedStock, mergedDeletedDamaged, mergedDeletedDamagedSigs);
        const mergedDamagedUpper = this.mergeDamagedStockList(dataToPush.damagedStockUpper, remoteData.damagedStockUpper, mergedDeletedDamaged, mergedDeletedDamagedSigs);
        const mergedTransfers = this.mergeStockTransfersList(dataToPush.stockTransfers, remoteData.stockTransfers, mergedDeletedTransfers, mergedDeletedTransferSigs);

        const mergedIngredients = this.mergeIngredients(dataToPush.ingredients, remoteData.ingredients, false);
        const mergedMenus = this.mergeMenus(dataToPush.menus, remoteData.menus, false);
        const mergedMonthlyRates = Object.assign({}, remoteData.monthlyRates || {}, dataToPush.monthlyRates || {});

        dataToPush = Object.assign({}, dataToPush, {
          records: mergedRecords,
          recordsUpper: mergedRecordsUpper,
          deletedRecordDates: mergedDeletedRecordDates,
          deletedRecordDatesUpper: mergedDeletedRecordDatesUpper,
          tasteRecords: mergedTaste,
          tasteRecordsUpper: mergedTasteUpper,
          initialStock: mergedStock,
          initialStockUpper: mergedStockUpper,
          settings: mergedSettings,
          ingredients: mergedIngredients,
          menus: mergedMenus,
          monthlyRates: mergedMonthlyRates,
          stockReceipts: mergedReceipts,
          stockReceiptsUpper: mergedReceiptsUpper,
          deletedStockReceiptIds: mergedDeletedReceipts,
          damagedStock: mergedDamaged,
          damagedStockUpper: mergedDamagedUpper,
          deletedDamagedIds: mergedDeletedDamaged,
          deletedDamagedSigs: mergedDeletedDamagedSigs,
          stockTransfers: mergedTransfers,
          deletedStockTransferIds: mergedDeletedTransfers,
          deletedStockTransferSigs: mergedDeletedTransferSigs
        });

        if (typeof app !== 'undefined' && app.data && (typeof app.getActiveUdise === 'function' && app.getActiveUdise() === currentUdise)) {
          app.data.records = mergedRecords;
          app.data.recordsUpper = mergedRecordsUpper;
          app.data.deletedRecordDates = mergedDeletedRecordDates;
          app.data.deletedRecordDatesUpper = mergedDeletedRecordDatesUpper;
          app.data.tasteRecords = mergedTaste;
          app.data.tasteRecordsUpper = mergedTasteUpper;
          app.data.initialStock = mergedStock;
          app.data.initialStockUpper = mergedStockUpper;
          app.data.settings = mergedSettings;
          app.data.ingredients = mergedIngredients;
          app.data.menus = mergedMenus;
          app.data.monthlyRates = mergedMonthlyRates;
          app.data.stockReceipts = mergedReceipts;
          app.data.stockReceiptsUpper = mergedReceiptsUpper;
          app.data.deletedStockReceiptIds = mergedDeletedReceipts;
          app.data.damagedStock = mergedDamaged;
          app.data.damagedStockUpper = mergedDamagedUpper;
          app.data.deletedDamagedIds = mergedDeletedDamaged;
          app.data.deletedDamagedSigs = mergedDeletedDamagedSigs;
          app.data.stockTransfers = mergedTransfers;
          app.data.deletedStockTransferIds = mergedDeletedTransfers;
          app.data.deletedStockTransferSigs = mergedDeletedTransferSigs;
          if (typeof app.saveState === 'function') app.saveState(true);
        } else if (typeof localStorage !== 'undefined') {
          const sKey = (typeof app !== 'undefined' && app.getSchoolStorageKey) ? app.getSchoolStorageKey(currentUdise) : `MDM_SCHOOL_DATA_${currentUdise}`;
          const bKey = (typeof app !== 'undefined' && app.getSchoolBackupKey) ? app.getSchoolBackupKey(currentUdise) : `MDM_SCHOOL_BACKUP_${currentUdise}`;
          localStorage.setItem(sKey, JSON.stringify(dataToPush));
          localStorage.setItem(bKey, JSON.stringify(dataToPush));
        }

        // Auto snapshot safety backup
        try {
          const backupEndpoint = `${cleanBaseUrl}/mdm_backups/${this.getCloudKey(currentUdise)}_safety_backup.json`;
          this.fetchWithTimeout(backupEndpoint, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(existingRemote)
          }, 6000).catch(() => {});
        } catch (bErr) {}
      }

      const payload = {
        version: "2.0",
        schoolCode: currentUdise,
        updatedAt: new Date().toISOString(),
        updatedBy: (typeof app !== 'undefined' && app.data && app.data.settings && app.data.settings.headmaster) || 'User',
        appData: dataToPush
      };

      const res = await this.fetchWithTimeout(endpoint, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }, 15000);

      if (res.ok) {
        // Also ensure school is saved to central registry (/mdm_registry)
        if (dataToPush && dataToPush.settings) {
          this.pushSchoolToRegistry(currentUdise, {
            udise: currentUdise,
            schoolName: dataToPush.settings.schoolName || '',
            centre: dataToPush.settings.centre || '',
            taluka: dataToPush.settings.taluka || '',
            district: dataToPush.settings.district || '',
            pat: dataToPush.settings.pat || 9,
            patPrimary: dataToPush.settings.patPrimary || 9,
            patUpper: dataToPush.settings.patUpper || 15,
            schoolLevel: dataToPush.settings.schoolLevel || 'both',
            lastActive: new Date().toISOString()
          });
        }
        // Also permanently store root school_info so database root always has latest school identity
        if (dataToPush && dataToPush.settings) {
          try {
            const schoolInfoEndpoint = `${cleanBaseUrl}/school_info.json`;
            const infoPayload = Object.assign({}, dataToPush.settings, {
              udise: currentUdise,
              updatedAt: new Date().toISOString(),
              updatedBy: (dataToPush.settings && dataToPush.settings.headmaster) || 'User'
            });
            this.fetchWithTimeout(schoolInfoEndpoint, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(infoPayload)
            }, 8000).catch(() => {});
          } catch (infoErr) {}
        }

        this.config.status = 'synced';
        this.config.lastSyncTime = new Date().toISOString();
        this.config.lastError = '';
        this.saveConfig();

        const recCount = Object.keys(dataToPush.records || {}).length;
        if (!isSilent && typeof app !== 'undefined') {
          app.showToast(`☁️ डेटा यशस्वीरित्या Google Firebase वर सेव्ह झाला (${recCount} नोंदी)!`, 'success');
          alert(`☁️ कॉम्प्युटरवरील डेटा (${recCount} दैनंदिन नोंदी व साठा) Google Firebase वर यशस्वीरित्या सेव्ह झाला!\n\nशाळा UDISE: ${currentUdise}\n\nआता तुम्ही मोबाईलवर ॲप उघडून याच UDISE सह "📥 क्लाऊडवरून आणा" बटण दाबू शकता.`);
        } else if (typeof app !== 'undefined' && typeof app.showToast === 'function') {
          app.showToast(`☁️ क्लाऊडवर सेव्ह झाले (${recCount} नोंदी)`, 'success');
        }
        return true;
      } else {
        const errorText = await res.text();
        if (res.status === 401 || res.status === 403) {
          throw new Error('Firebase Rules लॉक आहेत (401 Permission Denied). कृपया Firebase Console मध्ये Rules मध्ये ".read": true, ".write": true करा.');
        }
        throw new Error(`Firebase Server Error (${res.status}): ${errorText.substring(0, 100)}`);
      }
    } catch (err) {
      console.warn("Firebase push error:", err);
      this.config.status = 'error';
      this.config.lastError = err.message || 'सिंक त्रुटी';
      this.updateUIStatus();
      if (typeof app !== 'undefined' && typeof app.showToast === 'function') {
        app.showToast(`⚠️ क्लाऊड सिंक करताना अडचण आली: ${this.config.lastError}`, 'warning');
      }
      return false;
    } finally {
      this.isSyncing = false;
      if (this.hasPendingPush) {
        this.hasPendingPush = false;
        const nextU = this.pendingPushUdise || null;
        this.pendingPushUdise = null;
        this.scheduleDebouncedPush(true, nextU);
      }
    }
  },

  /**
   * Pull data from Google Firebase Realtime Database
   */
  async pullFromCloud(isSilent = false, targetUdise = null) {
    const currentUdise = targetUdise || this.getSchoolUdise();
    if (!currentUdise || currentUdise.length !== 11) {
      this.isSyncing = false;
      return false;
    }

    const cleanBaseUrl = this.getEffectiveFirebaseUrl();
    if (!cleanBaseUrl) {
      if (!isSilent) {
        alert('⚠️ Google Firebase Realtime Database URL प्रविष्ट केलेली नाही!\n\nकृपया प्रथम Firebase Realtime Database ची URL टाका.\nउदा. https://your-project-default-rtdb.firebaseio.com/');
      }
      return false;
    }

    if (this.isSyncing) return false;
    this.isSyncing = true;

    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      this.isSyncing = false;
      this.config.status = 'offline';
      this.updateUIStatus();
      if (!isSilent) alert('इंटरनेट कनेक्शन बंद आहे. कृपया इंटरनेट चालू करा.');
      return false;
    }

    this.config.status = 'syncing';
    this.updateUIStatus();

    this.config.schoolCode = currentUdise;
    const endpoint = `${cleanBaseUrl}/mdm_schools/${this.getCloudKey(currentUdise)}.json`;

    try {
      const res = await this.fetchWithTimeout(endpoint, {}, 15000);
      if (res.ok) {
        const json = await res.json();
        const remoteData = (json && json.appData && typeof json.appData === 'object') 
          ? json.appData 
          : ((json && (json.records || json.settings)) ? json : null);
        if (remoteData) {
          const remoteRecords = remoteData.records || {};
          const recordCount = Object.keys(remoteRecords).length;

          if (typeof app !== 'undefined') {
            const isActiveSchool = (typeof app.getActiveUdise === 'function' && app.getActiveUdise() === currentUdise);
            
            // Read target school base data (from memory ONLY if it strictly belongs to currentUdise, else from dedicated storage)
            let baseData = null;
            if (isActiveSchool && app.data && app.data.settings && app.data.settings.udise === currentUdise) {
              baseData = app.data;
            } else {
              const storageKey = app.getSchoolStorageKey ? app.getSchoolStorageKey(currentUdise) : `MDM_SCHOOL_DATA_${currentUdise}`;
              const localRaw = (typeof localStorage !== 'undefined') ? localStorage.getItem(storageKey) : null;
              if (localRaw) {
                try { baseData = JSON.parse(localRaw); } catch(e) {}
              }
              if (!baseData && typeof app.createDefaultSchoolData === 'function') {
                baseData = app.createDefaultSchoolData(currentUdise);
              } else if (!baseData) {
                baseData = { records: {}, recordsUpper: {}, settings: {}, initialStock: {}, ingredients: {}, menus: [] };
              }
            }

            // Union of deleted record date tombstones
            const mergedDeletedRecordDates = Array.from(new Set([
              ...(baseData.deletedRecordDates || []),
              ...(remoteData.deletedRecordDates || [])
            ]));
            const mergedDeletedRecordDatesUpper = Array.from(new Set([
              ...(baseData.deletedRecordDatesUpper || []),
              ...(remoteData.deletedRecordDatesUpper || [])
            ]));

            // Smart Conflict-Free Merge: Local + Remote (Protects local populated data from being wiped)
            const mergedRecords = this.mergeDayRecordsMap(baseData.records, remoteRecords, false, mergedDeletedRecordDates);
            const mergedRecordsUpper = this.mergeDayRecordsMap(baseData.recordsUpper, remoteData.recordsUpper || {}, false, mergedDeletedRecordDatesUpper);
            const mergedTaste = Object.assign({}, remoteData.tasteRecords || {}, baseData.tasteRecords || {});
            const mergedTasteUpper = Object.assign({}, remoteData.tasteRecordsUpper || {}, baseData.tasteRecordsUpper || {});
            const mergedStock = this.mergeStockBalances(baseData.initialStock, remoteData.initialStock, false);
            const mergedStockUpper = this.mergeStockBalances(baseData.initialStockUpper, remoteData.initialStockUpper, false);
            const mergedSettings = this.mergeSettings(baseData.settings, remoteData.settings, currentUdise, true);
            const mergedIngredients = this.mergeIngredients(baseData.ingredients, remoteData.ingredients, true);
            const mergedMenus = this.mergeMenus(baseData.menus, remoteData.menus, true);

            // Union of deleted tombstones
            const mergedDeletedReceipts = Array.from(new Set([
              ...(baseData.deletedStockReceiptIds || []),
              ...(remoteData.deletedStockReceiptIds || [])
            ]));
            const mergedDeletedDamaged = Array.from(new Set([
              ...(baseData.deletedDamagedIds || []),
              ...(remoteData.deletedDamagedIds || [])
            ]));
            const mergedDeletedDamagedSigs = Array.from(new Set([
              ...(baseData.deletedDamagedSigs || []),
              ...(remoteData.deletedDamagedSigs || [])
            ]));
            const mergedDeletedTransfers = Array.from(new Set([
              ...(baseData.deletedStockTransferIds || []),
              ...(remoteData.deletedStockTransferIds || [])
            ]));
            const mergedDeletedTransferSigs = Array.from(new Set([
              ...(baseData.deletedStockTransferSigs || []),
              ...(remoteData.deletedStockTransferSigs || [])
            ]));

            // Stock receipts, damaged stock, and stock transfers with deduplication & tombstone protection
            const mergedReceipts = this.mergeStockReceiptsList(baseData.stockReceipts, remoteData.stockReceipts, mergedDeletedReceipts);
            const mergedReceiptsUpper = this.mergeStockReceiptsList(baseData.stockReceiptsUpper, remoteData.stockReceiptsUpper, mergedDeletedReceipts);
            const mergedDamaged = this.mergeDamagedStockList(baseData.damagedStock, remoteData.damagedStock, mergedDeletedDamaged, mergedDeletedDamagedSigs);
            const mergedDamagedUpper = this.mergeDamagedStockList(baseData.damagedStockUpper, remoteData.damagedStockUpper, mergedDeletedDamaged, mergedDeletedDamagedSigs);
            const mergedTransfers = this.mergeStockTransfersList(baseData.stockTransfers, remoteData.stockTransfers, mergedDeletedTransfers, mergedDeletedTransferSigs);

            const mergedTarget = Object.assign({}, baseData, {
              records: mergedRecords,
              recordsUpper: mergedRecordsUpper,
              deletedRecordDates: mergedDeletedRecordDates,
              deletedRecordDatesUpper: mergedDeletedRecordDatesUpper,
              tasteRecords: mergedTaste,
              tasteRecordsUpper: mergedTasteUpper,
              initialStock: mergedStock,
              initialStockUpper: mergedStockUpper,
              settings: mergedSettings,
              ingredients: mergedIngredients,
              menus: mergedMenus,
              stockReceipts: mergedReceipts,
              stockReceiptsUpper: mergedReceiptsUpper,
              deletedStockReceiptIds: mergedDeletedReceipts,
              damagedStock: mergedDamaged,
              damagedStockUpper: mergedDamagedUpper,
              deletedDamagedIds: mergedDeletedDamaged,
              deletedDamagedSigs: mergedDeletedDamagedSigs,
              stockTransfers: mergedTransfers,
              deletedStockTransferIds: mergedDeletedTransfers,
              deletedStockTransferSigs: mergedDeletedTransferSigs,
              customDemands: Object.assign({}, baseData.customDemands || {}, remoteData.customDemands || {}),
              customDemandsUpper: Object.assign({}, baseData.customDemandsUpper || {}, remoteData.customDemandsUpper || {}),
              formBRemarks: Object.assign({}, baseData.formBRemarks || {}, remoteData.formBRemarks || {}),
              formBActivityDates: Object.assign({}, baseData.formBActivityDates || {}, remoteData.formBActivityDates || {}),
              monthlyRates: Object.assign({}, baseData.monthlyRates || {}, remoteData.monthlyRates || {})
            });

            // Save to localStorage for this specific school
            if (typeof localStorage !== 'undefined') {
              const storageKey = app.getSchoolStorageKey ? app.getSchoolStorageKey(currentUdise) : `MDM_SCHOOL_DATA_${currentUdise}`;
              const backupKey = app.getSchoolBackupKey ? app.getSchoolBackupKey(currentUdise) : `MDM_SCHOOL_BACKUP_${currentUdise}`;
              localStorage.setItem(storageKey, JSON.stringify(mergedTarget));
              localStorage.setItem(backupKey, JSON.stringify(mergedTarget));
              if (recordCount > 0) {
                localStorage.setItem('MDM_SAFE_BACKUP_' + currentUdise, JSON.stringify(mergedTarget));
              }
            }

            if (isActiveSchool) {
              app.data = mergedTarget;
              if (typeof app.applySchoolLevelMode === 'function') app.applySchoolLevelMode(app.data.settings?.schoolLevel);
              if (typeof app.updateHeaderMeta === 'function') app.updateHeaderMeta();
              if (typeof app.populateMenuDropdown === 'function') app.populateMenuDropdown();
              if (typeof app.renderManualGrainsCheckboxes === 'function') app.renderManualGrainsCheckboxes();
              if (typeof app.renderSettingsView === 'function') app.renderSettingsView();
              if (typeof app.renderStockView === 'function') app.renderStockView();
              if (typeof app.refreshAllViews === 'function') app.refreshAllViews();
              if (typeof app.renderCurrentTab === 'function') app.renderCurrentTab();
              if (typeof app.onDateChanged === 'function') app.onDateChanged();
              if (typeof app.renderRecentDaysRibbon === 'function') app.renderRecentDaysRibbon();
            }

            if (typeof app !== 'undefined' && typeof app.registerSchool === 'function' && mergedSettings) {
              app.registerSchool(mergedSettings);
            }
          }

          this.config.status = 'synced';
          this.config.lastSyncTime = json.updatedAt || new Date().toISOString();
          this.config.lastError = '';
          this.saveConfig();

          if (!isSilent && typeof app !== 'undefined') {
            app.showToast(`🎉 Google Firebase वरून ${recordCount} नोंदी व शाळा माहिती यशस्वीरित्या डाऊनलोड झाली!`, 'success');
            alert(`🎉 Google Firebase वरून ${recordCount} दैनंदिन नोंदी, साठा व शाळा तपशील यशस्वीरित्या डाऊनलोड झाला!\n\nशाळा UDISE: ${currentUdise}\nया डिव्हाइसवर सर्व डेटा अद्ययावत झाला आहे.`);
          }
          return true;
        } else {
          // If remote school bucket is empty
          this.config.status = 'idle';
          this.updateUIStatus();
          if (!isSilent) {
            alert(`⚠️ Firebase वर या शाळेचा (UDISE: ${currentUdise}) कोणताही डेटा सापडला नाही!\n\nदुरुस्ती कशी करावी:\n1. ज्या डिव्हाइसवर (उदा. लॅपटॉप/PC) डेटा भरलेला आहे तिथे ॲप उघडा.\n2. वरील "☁️ क्लाऊड सिंक" बटण दाबा.\n3. "☁️ आता क्लाऊडवर सेव्ह करा" हे बटण दाबा.\n4. त्यानंतर या डिव्हाइसवर येऊन "📥 क्लाऊडवरून आणा" बटण दाबा.`);
          }
          return false;
        }
      } else {
        if (res.status === 401 || res.status === 403) {
          throw new Error('Firebase Rules लॉक आहेत (401 Permission Denied). कृपया Rules मध्ये ".read": true, ".write": true करा.');
        }
        throw new Error(`Firebase Server returned ${res.status}`);
      }
    } catch (err) {
      console.warn("Firebase pull error:", err);
      this.config.status = 'error';
      this.config.lastError = err.message;
      this.updateUIStatus();
      if (!isSilent) {
        alert(`⚠️ क्लाऊडवरून डेटा आणताना त्रुटी आली:\n${this.config.lastError}`);
      }
      return false;
    } finally {
      this.isSyncing = false;
      if (this.hasPendingPush) {
        this.hasPendingPush = false;
        const nextU = this.pendingPushUdise || null;
        this.pendingPushUdise = null;
        this.scheduleDebouncedPush(true, nextU);
      }
    }
  },

  /**
   * Test Firebase Database Connection (Both PUT & GET)
   */
  async testFirebaseConnection(url, code) {
    const cleanUrl = this.normalizeFirebaseUrl(url || this.config.firebaseUrl);
    if (!cleanUrl || cleanUrl.length < 8) {
      alert('कृपया वैध Google Firebase Realtime Database URL प्रविष्ट करा.\nउदा. https://your-project-default-rtdb.firebaseio.com/');
      return false;
    }

    if (cleanUrl.includes('console.firebase.google.com')) {
      alert('⚠️ तुम्ही Firebase Console ची लिंक टाकली आहे!\n\nकृपया Realtime Database ची मुख्य URL टाका.\nउदा. https://your-project-default-rtdb.firebaseio.com/');
      return false;
    }

    const testEndpoint = `${cleanUrl}/mdm_schools/test_ping.json`;

    try {
      // 1. Write Test (PUT)
      const res = await this.fetchWithTimeout(testEndpoint, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ping: "ok", timestamp: new Date().toISOString() })
      }, 10000);

      if (res.ok) {
        // 2. Read Test (GET)
        const readRes = await this.fetchWithTimeout(testEndpoint, {}, 10000);
        if (readRes.ok) {
          alert('✅ अभिनंदन! Google Firebase Cloud Database यशस्वीरित्या कनेक्ट झाला!\n\nडेटा वाचन (Read) व लेखन (Write) दोन्ही सुरळीत काम करत आहेत.\nआता खालील "💾 सेव्ह करा व सुरू करा" बटण दाबा.');
          return true;
        }
      }

      if (res.status === 401 || res.status === 403) {
        alert('⚠️ Firebase परवानगी त्रुटी (Permission Denied - Error 401/403):\n\nतुमच्या Firebase Database चे Rules लॉक आहेत!\n\nदुरुस्ती कशी करावी:\n1. Firebase Console (console.firebase.google.com) उघडा.\n2. डाव्या मेनूत Build -> Realtime Database वर जा.\n3. वरील "Rules" टॅब उघडा.\n4. Rules मध्ये खालीलप्रमाणे लिहा:\n{\n  "rules": {\n    ".read": true,\n    ".write": true\n  }\n}\n5. "Publish" बटण दाबा.');
        return false;
      } else {
        alert(`⚠️ Firebase कनेक्ट होऊ शकले नाही (${res.status}). कृपया Firebase Database URL तपासा.`);
        return false;
      }
    } catch (err) {
      alert(`⚠️ Firebase कनेक्शन त्रुटी: ${err.message}\n\nकृपया इंटरनेट कनेक्शन चालू आहे का आणि Realtime Database ची बरोबर URL टाकली आहे का ते तपासा.`);
      return false;
    }
  },

  /**
   * Setup & Enable Firebase Cloud Sync
   */
  async setupCloudSync(schoolCode, pin, firebaseUrl = '') {
    const cleanUrl = this.normalizeFirebaseUrl(firebaseUrl);
    if (!cleanUrl || cleanUrl.length < 8) {
      alert('कृपया Google Firebase Realtime Database ची URL प्रविष्ट करा.\nउदा. https://your-project-default-rtdb.firebaseio.com/');
      return false;
    }

    if (!schoolCode || schoolCode.trim().length < 3) {
      alert('कृपया शाळेचा UDISE क्रमांक प्रविष्ट करा.');
      return false;
    }

    this.config.enabled = true;
    this.config.schoolCode = schoolCode.trim();
    this.config.secretPin = pin ? pin.trim() : 'Ican@123';
    this.config.firebaseUrl = cleanUrl;
    this.config.autoSync = true;
    this.config.lastError = '';
    this.saveConfig();

    // If local has records, push to cloud; if local is empty, pull from cloud!
    const localRecCount = Object.keys((typeof app !== 'undefined' && app.data && app.data.records) || {}).length;
    if (localRecCount > 0) {
      await this.pushToCloud(false);
    } else {
      await this.pullFromCloud(false);
    }
    return true;
  },

  /**
   * Disable Cloud Sync
   */
  disableCloudSync() {
    this.config.enabled = false;
    this.config.status = 'idle';
    this.config.lastError = '';
    this.saveConfig();
    this.updateUIStatus();
    if (typeof app !== 'undefined') {
      app.showToast('Google Firebase क्लाऊड सिंक बंद करण्यात आले.', 'info');
    }
  },

  /**
   * Restore from Cloud Safety Backup
   */
  async restoreFromCloudBackup() {
    const cleanBaseUrl = this.normalizeFirebaseUrl(this.config.firebaseUrl);
    if (!cleanBaseUrl) {
      alert('कृपया प्रथम Firebase URL प्रविष्ट करा.');
      return false;
    }
    const backupEndpoint = `${cleanBaseUrl}/mdm_backups/${this.getCloudKey()}_safety_backup.json`;

    try {
      const res = await this.fetchWithTimeout(backupEndpoint, {}, 12000);
      if (res.ok) {
        const json = await res.json();
        if (json && json.appData && json.appData.records) {
          const recCount = Object.keys(json.appData.records).length;
          if (confirm(`सुरक्षित क्लाऊड बॅकअप सापडला (${recCount} नोंदी).\n\nहा डेटा त्वरित रिस्टोअर करायचा का?`)) {
            if (typeof app !== 'undefined') {
              app.data = Object.assign({}, app.data, json.appData);
              if (typeof app.saveState === 'function') app.saveState(true);
              if (typeof app.loadState === 'function') app.loadState();
              if (typeof app.refreshAllViews === 'function') app.refreshAllViews();
              if (typeof app.onDateChanged === 'function') app.onDateChanged();
              if (typeof app.renderCurrentTab === 'function') app.renderCurrentTab();
            }
            await this.pushToCloud(true);
            alert(`🎉 ${recCount} नोंदींचा सुरक्षित क्लाऊड बॅकअप यशस्वीरित्या रिस्टोअर झाला!`);
            return true;
          }
        }
      }
      alert('क्लाऊडवर कोणताही जुना सुरक्षित बॅकअप सापडला नाही.');
      return false;
    } catch (e) {
      alert('क्लाऊड बॅकअप शोधताना त्रुटी आली: ' + e.message);
      return false;
    }
  },

  formatTimeStr(isoString) {
    if (!isoString) return 'आत्ता';
    const t = new Date(isoString);
    if (isNaN(t.getTime())) return 'आत्ता';
    let hrs = t.getHours();
    const mins = String(t.getMinutes()).padStart(2, '0');
    const ampm = hrs >= 12 ? 'PM' : 'AM';
    hrs = hrs % 12 || 12;
    return `${hrs}:${mins} ${ampm}`;
  },

  updateUIStatus() {
    if (typeof document === 'undefined') return;
    this.config.schoolCode = this.getSchoolUdise();

    const headerPill = document.getElementById('cloudStatusPill');
    const headerText = document.getElementById('cloudStatusText');
    const headerDot = document.getElementById('cloudStatusDot');

    const effectiveUrl = this.getEffectiveFirebaseUrl();
    const isConnected = !!(this.config.enabled && effectiveUrl && this.config.status !== 'offline' && this.config.status !== 'error');

    if (headerPill) {
      if (isConnected) {
        headerPill.className = 'meta-pill cloud-pill cloud-pill-synced';
        if (headerText) headerText.textContent = '☁️ सिंक चालू';
        if (headerDot) {
          headerDot.style.background = '#10b981';
          headerDot.style.boxShadow = '0 0 6px #10b981';
        }
        headerPill.title = 'Google Firebase क्लाऊड सिंक: चालू (सक्रिय)';
      } else {
        headerPill.className = 'meta-pill cloud-pill cloud-pill-offline';
        if (headerText) headerText.textContent = '☁️ सिंक बंद';
        if (headerDot) {
          headerDot.style.background = '#ef4444';
          headerDot.style.boxShadow = '0 0 6px #ef4444';
        }
        headerPill.title = 'Google Firebase क्लाऊड सिंक: बंद';
      }
    }

    const settingsBadge = document.getElementById('settingsCloudBadge');
    if (settingsBadge) {
      if (isConnected) {
        settingsBadge.className = 'badge bg-success text-white';
        settingsBadge.textContent = '🟢 चालू (Active)';
      } else {
        settingsBadge.className = 'badge bg-danger text-white';
        settingsBadge.textContent = '🔴 बंद (Disconnected)';
      }
    }

    const statusInModal = document.getElementById('cloudModalStatusText');
    if (statusInModal) {
      if (this.config.enabled && effectiveUrl) {
        if (this.config.status === 'synced') {
          statusInModal.innerHTML = `<span class="badge badge-success" style="font-size: 0.9rem;">✅ Google Firebase क्लाऊड सिंक सक्रिय</span> (शाळा UDISE: <code>${this.config.schoolCode}</code>) <br><small class="text-success" style="font-weight: 600;">शेवटचा यशस्वी सिंक: ${this.formatTimeStr(this.config.lastSyncTime)}</small>`;
        } else if (this.config.status === 'syncing') {
          statusInModal.innerHTML = `<span class="badge badge-warning" style="font-size: 0.9rem;">🔄 Firebase शी सिंक होत आहे...</span> (शाळा: <code>${this.config.schoolCode}</code>)`;
        } else if (this.config.status === 'offline') {
          statusInModal.innerHTML = `<span class="badge badge-warning" style="font-size: 0.9rem;">⚠️ इंटरनेट कनेक्शन बंद आहे (ऑफलाईन मोड)</span>`;
        } else if (this.config.status === 'error') {
          statusInModal.innerHTML = `<span class="badge badge-danger" style="font-size: 0.9rem;">⚠️ त्रुटी: ${this.config.lastError || 'कनेक्शन अयशस्वी'}</span>`;
        } else {
          statusInModal.innerHTML = `<span class="badge badge-info" style="font-size: 0.9rem;">ℹ️ सिंक तयार आहे (शाळा: <code>${this.config.schoolCode}</code>)</span>`;
        }
      } else {
        statusInModal.innerHTML = `<span class="badge badge-secondary" style="font-size: 0.9rem;">❌ सिंक बंद आहे (डेटा फक्त या डिव्हाइसवर सुरक्षित आहे)</span>`;
      }
    }

    this.populateFormInputs();
  },

  /**
   * Push school auth profile to Google Firebase Realtime Database
   */
  async pushAuthToCloud(udise, authData) {
    const cleanBaseUrl = this.getEffectiveFirebaseUrl();
    if (!cleanBaseUrl || !udise || !authData) return false;
    const cleanUdise = String(udise).trim();
    const endpoint = `${cleanBaseUrl}/mdm_schools/mdm_${cleanUdise}/auth.json`;
    try {
      await this.fetchWithTimeout(endpoint, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(authData)
      }, 8000);
      this.pushSchoolToRegistry(cleanUdise, authData);
      return true;
    } catch(e) {
      console.warn("Could not push auth to cloud:", e);
      return false;
    }
  },

  /**
   * Pull school auth profile from Google Firebase Realtime Database
   * Enables cross-device login for schools registered on another device
   */
  async pullAuthFromCloud(udise) {
    const cleanBaseUrl = this.getEffectiveFirebaseUrl();
    if (!cleanBaseUrl || !udise) return null;
    const cleanUdise = String(udise).trim();
    const endpoint = `${cleanBaseUrl}/mdm_schools/mdm_${cleanUdise}/auth.json`;
    try {
      const res = await this.fetchWithTimeout(endpoint, {}, 8000);
      if (res.ok) {
        const remoteAuth = await res.json();
        if (remoteAuth && remoteAuth.passwordHash) {
          if (typeof app !== 'undefined' && typeof app.saveSchoolAuth === 'function') {
            app.saveSchoolAuth(cleanUdise, remoteAuth);
          }
          return remoteAuth;
        }
      }
    } catch(e) {
      console.warn("Could not pull remote auth:", e);
    }
    return null;
  },

  /**
   * Push school license/trial to Google Firebase Realtime Database
   */
  async pushLicenseToCloud(udise, licenseData) {
    const cleanBaseUrl = this.getEffectiveFirebaseUrl();
    if (!cleanBaseUrl || !udise || !licenseData) return false;
    const cleanUdise = String(udise).trim();
    const endpoint = `${cleanBaseUrl}/mdm_schools/mdm_${cleanUdise}/license.json`;
    try {
      await this.fetchWithTimeout(endpoint, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(licenseData)
      }, 8000);
      return true;
    } catch(e) {
      console.warn("Could not push license to cloud:", e);
      return false;
    }
  },

  /**
   * Pull school license from Cloud to check remote Admin activation
   */
  async pullLicenseFromCloud(udise) {
    const cleanBaseUrl = this.getEffectiveFirebaseUrl();
    if (!cleanBaseUrl || !udise) return null;
    const cleanUdise = String(udise).trim();
    const endpoint = `${cleanBaseUrl}/mdm_schools/mdm_${cleanUdise}/license.json`;
    try {
      const res = await this.fetchWithTimeout(endpoint, {}, 8000);
      if (res.ok) {
        const remoteLic = await res.json();
        if (remoteLic && remoteLic.status) {
          if (typeof app !== 'undefined' && app.saveSchoolLicense) {
            app.saveSchoolLicense(cleanUdise, remoteLic);
          }
          return remoteLic;
        }
      }
    } catch(e) {
      console.warn("Could not pull remote license:", e);
    }
  },

  /**
   * Push school metadata to lightweight central registry in Firebase
   * Enables 100% matched school lists across Localhost, GitHub Pages & Mobile devices
   */
  async pushSchoolToRegistry(udise, schoolInfo) {
    const cleanBaseUrl = this.getEffectiveFirebaseUrl();
    if (!cleanBaseUrl || !udise || !schoolInfo) return false;
    const cleanUdise = String(udise).trim();
    const endpoint = `${cleanBaseUrl}/mdm_registry/mdm_${cleanUdise}.json`;
    const payload = {
      udise: cleanUdise,
      schoolName: schoolInfo.schoolName || `शाळा (${cleanUdise})`,
      centre: schoolInfo.centre || 'खांडस',
      taluka: schoolInfo.taluka || 'कर्जत',
      district: schoolInfo.district || 'रायगड',
      pat: parseInt(schoolInfo.pat) || 9,
      patPrimary: parseInt(schoolInfo.patPrimary || schoolInfo.pat) || 9,
      patUpper: parseInt(schoolInfo.patUpper) || 15,
      schoolLevel: schoolInfo.schoolLevel || 'both',
      lastActive: schoolInfo.lastActive || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    try {
      await this.fetchWithTimeout(endpoint, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }, 7000);
      return true;
    } catch(e) {
      console.warn("Could not push school to registry:", e);
      return false;
    }
  },

  /**
   * Pull all deleted school tombstones from Firebase
   */
  async pullTombstones() {
    const cleanBaseUrl = this.getEffectiveFirebaseUrl();
    if (!cleanBaseUrl) return {};
    const endpoint = `${cleanBaseUrl}/mdm_tombstones.json?t=${Date.now()}`;
    try {
      const res = await this.fetchWithTimeout(endpoint, { cache: 'no-store' }, 6000);
      if (res.ok) {
        const data = await res.json();
        if (data && typeof data === 'object') {
          const map = {};
          Object.keys(data).forEach(k => {
            const u = k.replace(/^mdm_/, '').trim();
            if (/^\d{11}$/.test(u)) {
              map[u] = data[k] || { deletedAt: new Date().toISOString() };
            }
          });
          return map;
        }
      }
    } catch (e) {
      console.warn("Could not pull tombstones:", e);
    }
    return {};
  },

  /**
   * Clear tombstone if a school is explicitly re-registered
   */
  async clearTombstone(udise) {
    const cleanBaseUrl = this.getEffectiveFirebaseUrl();
    if (!cleanBaseUrl || !udise) return false;
    const cleanUdise = String(udise).trim();
    try {
      await this.fetchWithTimeout(`${cleanBaseUrl}/mdm_tombstones/mdm_${cleanUdise}.json`, { method: 'DELETE' }, 6000);
      return true;
    } catch (e) {
      console.warn("Could not clear tombstone:", e);
      return false;
    }
  },

  /**
   * Pull all registered schools from lightweight central registry in Firebase
   * Automatically excludes any tombstoned/deleted schools
   */
  async pullSchoolRegistry() {
    const cleanBaseUrl = this.getEffectiveFirebaseUrl();
    if (!cleanBaseUrl) return null;
    const endpoint = `${cleanBaseUrl}/mdm_registry.json?t=${Date.now()}`;
    try {
      const [res, tombstones] = await Promise.all([
        this.fetchWithTimeout(endpoint, { cache: 'no-store' }, 8000),
        this.pullTombstones()
      ]);
      if (res.ok) {
        const data = await res.json();
        if (data && typeof data === 'object') {
          const filtered = {};
          const activeU = (typeof app !== 'undefined' && typeof app.getActiveUdise === 'function') ? app.getActiveUdise() : '';
          Object.keys(data).forEach(k => {
            const u = k.replace(/^mdm_/, '').trim();
            // Never filter out active school or default school
            if (!tombstones[u] || u === '27240304501' || u === activeU) {
              filtered[k] = data[k];
            }
          });
          return filtered;
        }
        return {};
      }
    } catch(e) {
      console.warn("Could not pull school registry:", e);
    }
    return null;
  },

  /**
   * Check if a school UDISE already exists in Firebase (prevents duplicate registrations)
   */
  async checkSchoolExists(udise) {
    const cleanBaseUrl = this.getEffectiveFirebaseUrl();
    if (!cleanBaseUrl || !udise) return { exists: false };
    const cleanUdise = String(udise).trim();
    if (cleanUdise.length !== 11) return { exists: false };

    // 0. Check central registry first (authoritative for live active schools)
    try {
      const regRes = await this.fetchWithTimeout(`${cleanBaseUrl}/mdm_registry/mdm_${cleanUdise}.json?t=${Date.now()}`, {}, 6000);
      if (regRes.ok) {
        const regData = await regRes.json();
        if (regData && (regData.udise || regData.schoolName)) {
          // School is alive in registry! If there was a stale tombstone, clear it!
          this.clearTombstone(cleanUdise);
          return { exists: true, schoolName: regData.schoolName || `शाळा (${cleanUdise})` };
        }
      }
    } catch(e) {}

    // 1. Check tombstone only if not active in registry
    try {
      const tombRes = await this.fetchWithTimeout(`${cleanBaseUrl}/mdm_tombstones/mdm_${cleanUdise}.json?t=${Date.now()}`, {}, 4000);
      if (tombRes.ok) {
        const tomb = await tombRes.json();
        if (tomb && tomb.deletedAt) {
          return { exists: false, isTombstoned: true };
        }
      }
    } catch(e) {}

    // 2. Check auth node
    try {
      const authRes = await this.fetchWithTimeout(`${cleanBaseUrl}/mdm_schools/mdm_${cleanUdise}/auth.json?t=${Date.now()}`, {}, 6000);
      if (authRes.ok) {
        const authData = await authRes.json();
        if (authData && authData.passwordHash) {
          return { exists: true, schoolName: authData.schoolName || `शाळा (${cleanUdise})` };
        }
      }
    } catch(e) {}

    // 3. Check shallow school existence
    try {
      const schRes = await this.fetchWithTimeout(`${cleanBaseUrl}/mdm_schools/mdm_${cleanUdise}/schoolCode.json?t=${Date.now()}`, {}, 6000);
      if (schRes.ok) {
        const code = await schRes.json();
        if (code && String(code).trim() === cleanUdise) {
          return { exists: true, schoolName: `शाळा (${cleanUdise})` };
        }
      }
    } catch(e) {}

    return { exists: false };
  },

  /**
   * Delete school from cloud entirely (both from data bucket, registry, backups + write tombstone)
   */
  async deleteSchoolFromCloud(udise) {
    const cleanBaseUrl = this.getEffectiveFirebaseUrl();
    if (!cleanBaseUrl || !udise) return false;
    const cleanUdise = String(udise).trim();
    try {
      await Promise.allSettled([
        this.fetchWithTimeout(`${cleanBaseUrl}/mdm_schools/mdm_${cleanUdise}.json`, { method: 'DELETE' }, 7000),
        this.fetchWithTimeout(`${cleanBaseUrl}/mdm_registry/mdm_${cleanUdise}.json`, { method: 'DELETE' }, 7000),
        this.fetchWithTimeout(`${cleanBaseUrl}/mdm_backups/mdm_${cleanUdise}_safety_backup.json`, { method: 'DELETE' }, 7000),
        this.fetchWithTimeout(`${cleanBaseUrl}/mdm_tombstones/mdm_${cleanUdise}.json`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ udise: cleanUdise, deletedAt: new Date().toISOString() })
        }, 7000)
      ]);
      return true;
    } catch(e) {
      console.warn("Could not delete school from cloud:", e);
      return false;
    }
  },

  /**
   * Direct instant purge of a deleted damaged stock record from Firebase RTDB
   * Guarantees zero resurrection by updating remote arrays and saving tombstones
   */
  async deleteDamagedStockFromCloud(udise, delId, delSig = null, delRelSig = null) {
    const cleanBaseUrl = this.getEffectiveFirebaseUrl();
    if (!cleanBaseUrl || !udise) return false;
    const cleanUdise = String(udise).trim();
    const cloudKey = this.getCloudKey(cleanUdise);

    try {
      const getRes = await this.fetchWithTimeout(`${cleanBaseUrl}/mdm_schools/${cloudKey}/appData.json`, {}, 6000);
      if (getRes.ok) {
        const remoteAppData = await getRes.json();
        if (remoteAppData) {
          // Helper to check if item matches deletion criteria
          const matchesDel = (d, sectionContext) => {
            if (!d || typeof d !== 'object') return false;
            if (delId && d.id === delId) return true;
            if (delSig && (this.getDamagedSignature(d, sectionContext) === delSig || this.getDamagedSignature(d) === delSig)) return true;
            if (delRelSig && this.getDamagedRelaxedSignature(d) === delRelSig) return true;
            if (delSig) {
              const sigParts = delSig.split('#');
              const dParts = this.getDamagedSignature(d, sectionContext).split('#');
              if (sigParts.length === 3 && dParts.length === 3) {
                // Same date and same items
                if (sigParts[0] === dParts[0] && sigParts[2] === dParts[2]) return true;
              }
            }
            if (delRelSig) {
              const rParts = delRelSig.split('#');
              const dRel = this.getDamagedRelaxedSignature(d).split('#');
              if (rParts.length === 2 && dRel.length === 2) {
                if (rParts[0] === dRel[0] && rParts[1] === dRel[1]) return true;
              }
            }
            return false;
          };

          // Filter Primary damaged stock
          if (Array.isArray(remoteAppData.damagedStock)) {
            const filtered = remoteAppData.damagedStock.filter(d => !matchesDel(d, 'primary'));
            remoteAppData.damagedStock = filtered;
          }

          // Filter Upper damaged stock
          if (Array.isArray(remoteAppData.damagedStockUpper)) {
            const filteredU = remoteAppData.damagedStockUpper.filter(d => !matchesDel(d, 'upper'));
            remoteAppData.damagedStockUpper = filteredU;
          }

          // Generate all signature variants for tombstones
          const sigVariants = [delSig, delRelSig].filter(Boolean);
          if (delSig) {
            const parts = delSig.split('#');
            if (parts.length === 3) {
              sigVariants.push(`${parts[0]}#primary#${parts[2]}`);
              sigVariants.push(`${parts[0]}#upper#${parts[2]}`);
              sigVariants.push(`${parts[0]}#${parts[2]}`);
            }
          }
          if (delRelSig) {
            const rParts = delRelSig.split('#');
            if (rParts.length === 2) {
              sigVariants.push(`${rParts[0]}#primary#${rParts[1]}`);
              sigVariants.push(`${rParts[0]}#upper#${rParts[1]}`);
            }
          }

          // Append tombstones
          const delIds = Array.from(new Set([...(remoteAppData.deletedDamagedIds || []), delId].filter(Boolean)));
          const delSigs = Array.from(new Set([...(remoteAppData.deletedDamagedSigs || []), ...sigVariants].filter(Boolean)));
          remoteAppData.deletedDamagedIds = delIds;
          remoteAppData.deletedDamagedSigs = delSigs;

          await Promise.allSettled([
            this.fetchWithTimeout(`${cleanBaseUrl}/mdm_schools/${cloudKey}/appData/damagedStock.json`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(remoteAppData.damagedStock || [])
            }, 6000),
            this.fetchWithTimeout(`${cleanBaseUrl}/mdm_schools/${cloudKey}/appData/damagedStockUpper.json`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(remoteAppData.damagedStockUpper || [])
            }, 6000),
            this.fetchWithTimeout(`${cleanBaseUrl}/mdm_schools/${cloudKey}/appData/deletedDamagedIds.json`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(delIds)
            }, 6000),
            this.fetchWithTimeout(`${cleanBaseUrl}/mdm_schools/${cloudKey}/appData/deletedDamagedSigs.json`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(delSigs)
            }, 6000)
          ]);
          return true;
        }
      }
    } catch (e) {
      console.warn("Direct cloud damaged stock delete error:", e);
      return false;
    }
  },

  /**
   * Direct instant purge of a deleted stock transfer / loan from Firebase RTDB
   * Guarantees zero resurrection by updating remote arrays and saving tombstones
   */
  async deleteStockTransferFromCloud(udise, delId, delSig = null, delRelSig = null) {
    const cleanBaseUrl = this.getEffectiveFirebaseUrl();
    if (!cleanBaseUrl || !udise) return false;
    const cleanUdise = String(udise).trim();
    const cloudKey = this.getCloudKey(cleanUdise);

    try {
      const getRes = await this.fetchWithTimeout(`${cleanBaseUrl}/mdm_schools/${cloudKey}/appData.json`, {}, 6000);
      if (getRes.ok) {
        const remoteAppData = await getRes.json();
        if (remoteAppData) {
          const matchesDel = (t) => {
            if (!t || typeof t !== 'object') return false;
            if (delId && t.id === delId) return true;
            if (delSig && this.getTransferSignature(t) === delSig) return true;
            if (delRelSig && this.getTransferRelaxedSignature(t) === delRelSig) return true;
            if (delSig) {
              const sigParts = delSig.split('#');
              const tParts = this.getTransferSignature(t).split('#');
              if (sigParts.length === 3 && tParts.length === 3) {
                if (sigParts[0] === tParts[0] && sigParts[2] === tParts[2]) return true;
              }
            }
            if (delRelSig) {
              const rParts = delRelSig.split('#');
              const tRel = this.getTransferRelaxedSignature(t).split('#');
              if (rParts.length === 2 && tRel.length === 2) {
                if (rParts[0] === tRel[0] && rParts[1] === tRel[1]) return true;
              }
            }
            return false;
          };

          if (Array.isArray(remoteAppData.stockTransfers)) {
            remoteAppData.stockTransfers = remoteAppData.stockTransfers.filter(t => !matchesDel(t));
          }

          const sigVariants = [delSig, delRelSig].filter(Boolean);
          if (delSig) {
            const parts = delSig.split('#');
            if (parts.length === 3) {
              sigVariants.push(`${parts[0]}#${parts[2]}`);
            }
          }

          const delIds = Array.from(new Set([...(remoteAppData.deletedStockTransferIds || []), delId].filter(Boolean)));
          const delSigs = Array.from(new Set([...(remoteAppData.deletedStockTransferSigs || []), ...sigVariants].filter(Boolean)));
          remoteAppData.deletedStockTransferIds = delIds;
          remoteAppData.deletedStockTransferSigs = delSigs;

          await Promise.allSettled([
            this.fetchWithTimeout(`${cleanBaseUrl}/mdm_schools/${cloudKey}/appData/stockTransfers.json`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(remoteAppData.stockTransfers || [])
            }, 6000),
            this.fetchWithTimeout(`${cleanBaseUrl}/mdm_schools/${cloudKey}/appData/deletedStockTransferIds.json`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(delIds)
            }, 6000),
            this.fetchWithTimeout(`${cleanBaseUrl}/mdm_schools/${cloudKey}/appData/deletedStockTransferSigs.json`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(delSigs)
            }, 6000)
          ]);
          return true;
        }
      }
    } catch (e) {
      console.warn("Direct cloud stock transfer delete error:", e);
      return false;
    }
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = cloudSync;
}

