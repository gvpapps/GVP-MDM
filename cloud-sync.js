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
      // If firebaseUrl ended up empty from an old localStorage cache, self-heal with DEFAULT_URL
      if (!this.config.firebaseUrl) {
        this.config.firebaseUrl = this.DEFAULT_URL;
        this.config.enabled = true;
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
      if (this.config.enabled && this.getEffectiveFirebaseUrl() && this.config.autoSync && udiseToPush) {
        this.pushToCloud(true, udiseToPush);
      }
      return;
    }

    // Responsive 400ms debounce instead of old 2500ms lag
    this.debounceTimer = setTimeout(() => {
      if (this.config.enabled && this.getEffectiveFirebaseUrl() && this.config.autoSync && udiseToPush) {
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
      if (this.config.enabled && this.getEffectiveFirebaseUrl() && this.config.autoSync && activeU) {
        this.pushToCloud(true, activeU);
      }
    }
  },

  /**
   * Smart Conflict-Free Merge for a single day record
   * Never allows an empty/stale record to overwrite a populated record
   */
  mergeDayRecord(recA, recB) {
    if (!recA && !recB) return null;
    if (!recA) return Object.assign({}, recB);
    if (!recB) return Object.assign({}, recA);

    const aHasData = (!recA.isHoliday && ((parseInt(recA.children) || 0) > 0 || (recA.quantities && Object.values(recA.quantities).some(v => parseFloat(v) > 0))));
    const bHasData = (!recB.isHoliday && ((parseInt(recB.children) || 0) > 0 || (recB.quantities && Object.values(recB.quantities).some(v => parseFloat(v) > 0))));

    // If one has attendance/meal data and the other does not, populated record wins
    if (aHasData && !bHasData) return Object.assign({}, recB, recA);
    if (!aHasData && bHasData) return Object.assign({}, recA, recB);

    // If both have data or both empty, compare timestamp (newer wins)
    const timeA = new Date(recA.updatedAt || recA.savedAt || 0).getTime();
    const timeB = new Date(recB.updatedAt || recB.savedAt || 0).getTime();

    if (timeA >= timeB) {
      return Object.assign({}, recB, recA);
    } else {
      return Object.assign({}, recA, recB);
    }
  },

  /**
   * Smart Conflict-Free Merge for daily records dictionary
   */
  mergeDayRecordsMap(mapA, mapB) {
    const result = {};
    const keysA = Object.keys(mapA || {});
    const keysB = Object.keys(mapB || {});
    const allKeys = new Set([...keysA, ...keysB]);

    allKeys.forEach(k => {
      const recA = mapA ? mapA[k] : null;
      const recB = mapB ? mapB[k] : null;
      const merged = this.mergeDayRecord(recA, recB);
      if (merged) result[k] = merged;
    });

    return result;
  },

  /**
   * Smart Merge for Initial Stock balances (1 April stock)
   * Never overwrites positive balances with 0 or undefined
   */
  mergeStockBalances(stockA, stockB) {
    const merged = Object.assign({}, stockA || {});
    const b = stockB || {};
    Object.keys(b).forEach(item => {
      const valA = parseFloat(merged[item] || 0);
      const valB = parseFloat(b[item] || 0);
      if (valB > 0 && valA === 0) {
        merged[item] = valB;
      } else if (valA > 0 && valB > 0) {
        merged[item] = valA;
      }
    });
    return merged;
  },

  /**
   * Smart Merge for School Settings
   * Preserves non-empty strings and valid numbers
   */
  mergeSettings(localSett, remoteSett, targetUdise = null) {
    const res = Object.assign({}, remoteSett || {}, localSett || {});
    const r = remoteSett || {};
    const l = localSett || {};
    Object.keys(r).forEach(k => {
      if ((l[k] === undefined || l[k] === '' || l[k] === null) && r[k] !== undefined && r[k] !== '' && r[k] !== null) {
        res[k] = r[k];
      }
    });
    // Critical: If remote has a real, non-placeholder school name, and local is empty/placeholder or has mismatched UDISE, preserve remote name
    if (r.schoolName && !r.schoolName.includes('(UDISE:') && (
        !l.schoolName || 
        l.schoolName.includes('(UDISE:') || 
        (l.udise && r.udise && l.udise !== r.udise)
    )) {
      res.schoolName = r.schoolName;
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

      // GUARD 1: Prevent Blank Device from destroying remote cloud database
      if (localRecCount === 0 && remoteRecCount > 0) {
        this.config.status = 'idle';
        this.updateUIStatus();
        const warnMsg = `⛔ डेटा सुरक्षा इशारा (डेटा नष्ट होण्यापासून रोखला!):\n\nया डिव्हाइसवर 0 दैनंदिन नोंदी आहेत, तर क्लाऊडवर आधीच ${remoteRecCount} नोंदी सुरक्षित साठवलेल्या आहेत!\n\nरिकामा डेटा अपलोड केल्यास मूळ डेटा नष्ट होईल, म्हणून सिस्टिमने हा रिकामा डेटा रोखला आहे.\n\nकृपया प्रथम "📥 क्लाऊडवरून आणा" (Pull) बटण दाबा जेणेकरून क्लाऊडवरील सर्व डेटा या डिव्हाइसवर येईल.`;
        if (!isSilent) alert(warnMsg);
        else console.warn(warnMsg);
        return false;
      }

      // GUARD 2: Smart Conflict-Free Merge before push so any missing remote dates/receipts are combined
      if (existingRemote && existingRemote.appData && remoteRecCount > 0) {
        const remoteData = existingRemote.appData;
        const mergedRecords = this.mergeDayRecordsMap(dataToPush.records, remoteData.records);
        const mergedRecordsUpper = this.mergeDayRecordsMap(dataToPush.recordsUpper, remoteData.recordsUpper);
        const mergedTaste = Object.assign({}, remoteData.tasteRecords || {}, dataToPush.tasteRecords || {});
        const mergedTasteUpper = Object.assign({}, remoteData.tasteRecordsUpper || {}, dataToPush.tasteRecordsUpper || {});
        const mergedStock = this.mergeStockBalances(dataToPush.initialStock, remoteData.initialStock);
        const mergedStockUpper = this.mergeStockBalances(dataToPush.initialStockUpper, remoteData.initialStockUpper);
        const mergedSettings = this.mergeSettings(dataToPush.settings, remoteData.settings, currentUdise);
        
        // Stock receipts union (Primary)
        const mergedReceipts = [...(remoteData.stockReceipts || [])];
        (dataToPush.stockReceipts || []).forEach(lr => {
          if (!mergedReceipts.some(mr => mr.date === lr.date && mr.billNo === lr.billNo && JSON.stringify(mr.items) === JSON.stringify(lr.items))) {
            mergedReceipts.push(lr);
          }
        });

        // Stock receipts union (Upper)
        const mergedReceiptsUpper = [...(remoteData.stockReceiptsUpper || [])];
        (dataToPush.stockReceiptsUpper || []).forEach(lr => {
          if (!mergedReceiptsUpper.some(mr => mr.date === lr.date && mr.billNo === lr.billNo && JSON.stringify(mr.items) === JSON.stringify(lr.items))) {
            mergedReceiptsUpper.push(lr);
          }
        });

        // Damaged stock union (Primary)
        const mergedDamaged = [...(remoteData.damagedStock || [])];
        (dataToPush.damagedStock || []).forEach(ld => {
          if (!mergedDamaged.some(md => md.date === ld.date && md.reason === ld.reason && JSON.stringify(md.items) === JSON.stringify(ld.items))) {
            mergedDamaged.push(ld);
          }
        });

        // Damaged stock union (Upper)
        const mergedDamagedUpper = [...(remoteData.damagedStockUpper || [])];
        (dataToPush.damagedStockUpper || []).forEach(ld => {
          if (!mergedDamagedUpper.some(md => md.date === ld.date && md.reason === ld.reason && JSON.stringify(md.items) === JSON.stringify(ld.items))) {
            mergedDamagedUpper.push(ld);
          }
        });

        // Stock transfers union (Inter-Section Loans)
        const mergedTransfers = [...(remoteData.stockTransfers || [])];
        (dataToPush.stockTransfers || []).forEach(lt => {
          if (!mergedTransfers.some(mt => mt.id === lt.id || (mt.date === lt.date && mt.direction === lt.direction && JSON.stringify(mt.items) === JSON.stringify(lt.items)))) {
            mergedTransfers.push(lt);
          }
        });

        dataToPush = Object.assign({}, dataToPush, {
          records: mergedRecords,
          recordsUpper: mergedRecordsUpper,
          tasteRecords: mergedTaste,
          tasteRecordsUpper: mergedTasteUpper,
          initialStock: mergedStock,
          initialStockUpper: mergedStockUpper,
          settings: mergedSettings,
          stockReceipts: mergedReceipts,
          stockReceiptsUpper: mergedReceiptsUpper,
          damagedStock: mergedDamaged,
          damagedStockUpper: mergedDamagedUpper,
          stockTransfers: mergedTransfers
        });

        if (typeof app !== 'undefined' && app.data && (typeof app.getActiveUdise === 'function' && app.getActiveUdise() === currentUdise)) {
          app.data.records = mergedRecords;
          app.data.recordsUpper = mergedRecordsUpper;
          app.data.tasteRecords = mergedTaste;
          app.data.tasteRecordsUpper = mergedTasteUpper;
          app.data.initialStock = mergedStock;
          app.data.initialStockUpper = mergedStockUpper;
          app.data.settings = mergedSettings;
          app.data.stockReceipts = mergedReceipts;
          app.data.stockReceiptsUpper = mergedReceiptsUpper;
          app.data.damagedStock = mergedDamaged;
          app.data.damagedStockUpper = mergedDamagedUpper;
          app.data.stockTransfers = mergedTransfers;
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
        body: JSON.stringify(payload),
        keepalive: true
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
      if (!isSilent && typeof app !== 'undefined') {
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

            // Smart Conflict-Free Merge: Local + Remote (Protects local populated data from being wiped)
            const mergedRecords = this.mergeDayRecordsMap(baseData.records, remoteRecords);
            const mergedRecordsUpper = this.mergeDayRecordsMap(baseData.recordsUpper, remoteData.recordsUpper || {});
            const mergedTaste = Object.assign({}, remoteData.tasteRecords || {}, baseData.tasteRecords || {});
            const mergedTasteUpper = Object.assign({}, remoteData.tasteRecordsUpper || {}, baseData.tasteRecordsUpper || {});
            const mergedStock = this.mergeStockBalances(baseData.initialStock, remoteData.initialStock);
            const mergedStockUpper = this.mergeStockBalances(baseData.initialStockUpper, remoteData.initialStockUpper);
            const mergedSettings = this.mergeSettings(baseData.settings, remoteData.settings, currentUdise);

            // Stock receipts union (Primary)
            const mergedReceipts = [...(remoteData.stockReceipts || [])];
            (baseData.stockReceipts || []).forEach(lr => {
              if (!mergedReceipts.some(mr => mr.date === lr.date && mr.billNo === lr.billNo && JSON.stringify(mr.items) === JSON.stringify(lr.items))) {
                mergedReceipts.push(lr);
              }
            });

            // Stock receipts union (Upper)
            const mergedReceiptsUpper = [...(remoteData.stockReceiptsUpper || [])];
            (baseData.stockReceiptsUpper || []).forEach(lr => {
              if (!mergedReceiptsUpper.some(mr => mr.date === lr.date && mr.billNo === lr.billNo && JSON.stringify(mr.items) === JSON.stringify(lr.items))) {
                mergedReceiptsUpper.push(lr);
              }
            });

            // Damaged stock union (Primary)
            const mergedDamaged = [...(remoteData.damagedStock || [])];
            (baseData.damagedStock || []).forEach(ld => {
              if (!mergedDamaged.some(md => md.date === ld.date && md.reason === ld.reason && JSON.stringify(md.items) === JSON.stringify(ld.items))) {
                mergedDamaged.push(ld);
              }
            });

            // Damaged stock union (Upper)
            const mergedDamagedUpper = [...(remoteData.damagedStockUpper || [])];
            (baseData.damagedStockUpper || []).forEach(ld => {
              if (!mergedDamagedUpper.some(md => md.date === ld.date && md.reason === ld.reason && JSON.stringify(md.items) === JSON.stringify(ld.items))) {
                mergedDamagedUpper.push(ld);
              }
            });

            // Stock transfers union (Inter-Section Loans)
            const mergedTransfers = [...(remoteData.stockTransfers || [])];
            (baseData.stockTransfers || []).forEach(lt => {
              if (!mergedTransfers.some(mt => mt.id === lt.id || (mt.date === lt.date && mt.direction === lt.direction && JSON.stringify(mt.items) === JSON.stringify(lt.items)))) {
                mergedTransfers.push(lt);
              }
            });

            const mergedTarget = Object.assign({}, baseData, {
              records: mergedRecords,
              recordsUpper: mergedRecordsUpper,
              tasteRecords: mergedTaste,
              tasteRecordsUpper: mergedTasteUpper,
              initialStock: mergedStock,
              initialStockUpper: mergedStockUpper,
              settings: mergedSettings,
              stockReceipts: mergedReceipts,
              stockReceiptsUpper: mergedReceiptsUpper,
              damagedStock: mergedDamaged,
              damagedStockUpper: mergedDamagedUpper,
              stockTransfers: mergedTransfers,
              customDemands: Object.assign({}, baseData.customDemands || {}, remoteData.customDemands || {}),
              customDemandsUpper: Object.assign({}, baseData.customDemandsUpper || {}, remoteData.customDemandsUpper || {}),
              formBRemarks: Object.assign({}, baseData.formBRemarks || {}, remoteData.formBRemarks || {})
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
              if (typeof app.updateHeaderMeta === 'function') app.updateHeaderMeta();
              if (typeof app.refreshAllViews === 'function') app.refreshAllViews();
              if (typeof app.renderCurrentTab === 'function') app.renderCurrentTab();
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
          Object.keys(data).forEach(k => {
            const u = k.replace(/^mdm_/, '').trim();
            if (!tombstones[u]) {
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

    // 0. Check tombstone first
    try {
      const tombRes = await this.fetchWithTimeout(`${cleanBaseUrl}/mdm_tombstones/mdm_${cleanUdise}.json?t=${Date.now()}`, {}, 4000);
      if (tombRes.ok) {
        const tomb = await tombRes.json();
        if (tomb && tomb.deletedAt) {
          return { exists: false, isTombstoned: true };
        }
      }
    } catch(e) {}

    // 1. Check central registry first (fastest)
    try {
      const regRes = await this.fetchWithTimeout(`${cleanBaseUrl}/mdm_registry/mdm_${cleanUdise}.json?t=${Date.now()}`, {}, 6000);
      if (regRes.ok) {
        const regData = await regRes.json();
        if (regData && (regData.udise || regData.schoolName)) {
          return { exists: true, schoolName: regData.schoolName || `शाळा (${cleanUdise})` };
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
  }
};

