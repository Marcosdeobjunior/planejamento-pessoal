(function () {
  "use strict";

  var DEFAULT_STATE = {
    profile: {
      name: "Usu\u00e1rio",
      avatar: ""
    },
    data: {}
  };
  var runtimeState = deepClone(DEFAULT_STATE);
  var userScopedSnapshots = {};
  var guestScopedSnapshot = null;
  var fileSyncTimer = null;
  var filePendingState = null;
  var fileWriteInFlight = null;
  var fileStorageHandle = null;
  var fileHandleLoaded = false;
  var fileLastSyncedAt = "";
  var fileLastError = "";
  var firebaseReadyPromise = null;
  var firebaseAppInstance = null;
  var firebaseDbInstance = null;
  var firebaseDocRef = null;
  var firebaseUnsubscribe = null;
  var firebaseSyncTimer = null;
  var firebasePendingState = null;
  var firebaseSyncInFlight = null;
  var firebaseLastSyncedAt = "";
  var firebaseLastError = "";
  var firebaseIsApplyingRemote = false;
  var firebaseIsHydrated = false;
  var firebaseAuthInstance = null;
  var firebaseCurrentUser = null;
  var firebasePendingDeletedUid = '';
  var firebaseAuthReadyPromise = null;
  var firebaseUserReadyPromise = null;
  var firebaseUserUnsubscribe = null;
  var firebaseUserDocRef = null;
  var firebaseCollectionDocRefs = {};
  var firebaseRemoteCollections = {};
  var firebaseCollectionListeners = {};
  var authModalMounted = false;
  var authSuccessRedirectUrl = "";
  var firebaseAuthListenerReady = false;
  var firebaseFreshAccountUids = {};
  var firebasePendingSignupProfileName = "";
  var authRememberDefault = false;
  var authSignupEmailCheckTimer = null;
  var authSignupEmailCheckSeq = 0;
  var rpgDailyRefreshTimer = null;
  var taskTimeReminderTimer = null;
  var taskReminderPermissionBound = false;
  var taskReminderVisibilityBound = false;
  var NOTIFICATION_DISMISSALS_STORAGE_PREFIX = "soter_notif_dismissals_v1_";
  var TASK_TIME_ALERTS_STORAGE_PREFIX = "soter_task_time_alerts_v1_";
  var LAST_AUTH_UID_STORAGE_KEY = "soter_last_auth_uid_v1";
  var USER_STATE_STORAGE_PREFIX = "soter_state_cache_v2_";
  var GUEST_STATE_STORAGE_KEY = "soter_state_cache_v2_guest";

  function currentPage() {
    var explicit = document.body.getAttribute("data-page");
    if (explicit) return explicit;
    var file = location.pathname.split("/").pop().toLowerCase();
    if (!file || file === "index.html" || file === "index.htm") return "home";
    return file.replace(".html", "");
  }

  function syncScrollbarCompensation() {
    if (!document || !document.documentElement || !window) return;
    var viewport = window.innerWidth || 0;
    var layout = document.documentElement.clientWidth || 0;
    var scrollbarWidth = Math.max(0, viewport - layout);
    document.documentElement.style.setProperty("--scrollbar-comp", scrollbarWidth + "px");
  }

  function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function ensureStateShape(raw) {
    var state = raw && typeof raw === "object" ? raw : {};
    if (!state.profile || typeof state.profile !== "object") state.profile = {};
    if (typeof state.profile.name !== "string" || !state.profile.name.trim()) state.profile.name = DEFAULT_STATE.profile.name;
    if (typeof state.profile.avatar !== "string") state.profile.avatar = "";
    if (!state.data || typeof state.data !== "object") state.data = {};
    return state;
  }

  function getNotificationDismissalsScopeKey() {
    var activeUid = firebaseCurrentUser && firebaseCurrentUser.uid ? String(firebaseCurrentUser.uid) : "";
    var lastUid = "";
    if (activeUid) return NOTIFICATION_DISMISSALS_STORAGE_PREFIX + activeUid;
    try {
      lastUid = String(localStorage.getItem(LAST_AUTH_UID_STORAGE_KEY) || "").trim();
    } catch (err) {
      lastUid = "";
    }
    return NOTIFICATION_DISMISSALS_STORAGE_PREFIX + (lastUid || "__guest__");
  }

  function rememberLastAuthUid(uid) {
    try {
      uid = String(uid || "").trim();
      if (uid) localStorage.setItem(LAST_AUTH_UID_STORAGE_KEY, uid);
      else localStorage.removeItem(LAST_AUTH_UID_STORAGE_KEY);
    } catch (err) { }
  }

  function loadNotificationDismissalsSnapshot() {
    try {
      var raw = localStorage.getItem(getNotificationDismissalsScopeKey());
      if (!raw) return {};
      var parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (err) {
      return {};
    }
  }

  function saveNotificationDismissalsSnapshot(dismissals) {
    try {
      localStorage.setItem(
        getNotificationDismissalsScopeKey(),
        JSON.stringify(dismissals && typeof dismissals === "object" ? dismissals : {})
      );
    } catch (err) { }
  }

  function getTaskTimeAlertsScopeKey() {
    var activeUid = firebaseCurrentUser && firebaseCurrentUser.uid ? String(firebaseCurrentUser.uid) : "";
    var lastUid = "";
    if (activeUid) return TASK_TIME_ALERTS_STORAGE_PREFIX + activeUid;
    try {
      lastUid = String(localStorage.getItem(LAST_AUTH_UID_STORAGE_KEY) || "").trim();
    } catch (err) {
      lastUid = "";
    }
    return TASK_TIME_ALERTS_STORAGE_PREFIX + (lastUid || "__guest__");
  }

  function loadTaskTimeAlertsSnapshot() {
    try {
      var raw = localStorage.getItem(getTaskTimeAlertsScopeKey());
      if (!raw) return {};
      var parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (err) {
      return {};
    }
  }

  function saveTaskTimeAlertsSnapshot(alerts) {
    try {
      localStorage.setItem(
        getTaskTimeAlertsScopeKey(),
        JSON.stringify(alerts && typeof alerts === "object" ? alerts : {})
      );
    } catch (err) { }
  }

  function pruneTaskTimeAlertsSnapshot(alerts, nowMs) {
    var next = alerts && typeof alerts === "object" ? alerts : {};
    var changed = false;
    Object.keys(next).forEach(function (key) {
      var stamp = Number(next[key]);
      if (!Number.isFinite(stamp) || stamp <= 0 || nowMs - stamp > 45 * 86400000) {
        delete next[key];
        changed = true;
      }
    });
    return { alerts: next, changed: changed };
  }

  function loadState() {
    return ensureStateShape(deepClone(runtimeState));
  }

  function readPersistedStateFromKey(key) {
    var safeKey = String(key || "");
    var raw;
    if (!safeKey) return null;
    try {
      raw = localStorage.getItem(safeKey === "__guest__" ? GUEST_STATE_STORAGE_KEY : (USER_STATE_STORAGE_PREFIX + safeKey));
      if (raw) return ensureStateShape(JSON.parse(raw));
    } catch (err) { }
    if (safeKey === "__guest__") return guestScopedSnapshot ? ensureStateShape(deepClone(guestScopedSnapshot)) : null;
    return userScopedSnapshots[safeKey] ? ensureStateShape(deepClone(userScopedSnapshots[safeKey])) : null;
  }

  function writePersistedStateToKey(key, state) {
    var safeKey = String(key || "");
    var snapshot = compactStateForStorage(ensureStateShape(state));
    if (!safeKey) return;
    try {
      localStorage.setItem(
        safeKey === "__guest__" ? GUEST_STATE_STORAGE_KEY : (USER_STATE_STORAGE_PREFIX + safeKey),
        JSON.stringify(snapshot)
      );
    } catch (err) { }
    if (safeKey === "__guest__") {
      guestScopedSnapshot = deepClone(snapshot);
      return;
    }
    userScopedSnapshots[safeKey] = deepClone(snapshot);
  }

  function removePersistedStateFromKey(key) {
    var safeKey = String(key || "");
    if (!safeKey) return;
    try {
      localStorage.removeItem(safeKey === "__guest__" ? GUEST_STATE_STORAGE_KEY : (USER_STATE_STORAGE_PREFIX + safeKey));
    } catch (err) { }
    if (safeKey === "__guest__") {
      guestScopedSnapshot = null;
      return;
    }
    delete userScopedSnapshots[safeKey];
  }

  function loadScopedStateForUser(uid) {
    if (!uid) return null;
    return readPersistedStateFromKey(String(uid || ""));
  }

  function saveScopedStateForUser(uid, state) {
    if (!uid) return;
    writePersistedStateToKey(String(uid || ""), state);
  }

  function removeScopedStateForUser(uid) {
    if (!uid) return;
    removePersistedStateFromKey(String(uid || ""));
  }

  function loadGuestStateSnapshot() {
    return readPersistedStateFromKey("__guest__");
  }

  function saveGuestStateSnapshot(state) {
    writePersistedStateToKey("__guest__", state);
  }

  function hydrateRuntimeStateFromCache() {
    var lastUid = "";
    var cached = null;
    try {
      lastUid = String(localStorage.getItem(LAST_AUTH_UID_STORAGE_KEY) || "").trim();
    } catch (err) {
      lastUid = "";
    }
    if (lastUid) cached = loadScopedStateForUser(lastUid);
    if (!cached) cached = loadGuestStateSnapshot();
    if (cached) runtimeState = ensureStateShape(deepClone(cached));
  }

  function markFreshFirebaseAccount(uid, name) {
    uid = String(uid || '').trim();
    if (!uid) return;
    firebaseFreshAccountUids[uid] = {
      name: String(name || '').trim()
    };
  }

  function consumeFreshFirebaseAccount(uid) {
    uid = String(uid || '').trim();
    if (!uid || !firebaseFreshAccountUids[uid]) return false;
    var payload = firebaseFreshAccountUids[uid];
    delete firebaseFreshAccountUids[uid];
    return payload;
  }

  function isQuotaError(err) {
    if (!err) return false;
    if (err.name === "QuotaExceededError" || err.name === "NS_ERROR_DOM_QUOTA_REACHED") return true;
    return typeof err.message === "string" && err.message.toLowerCase().indexOf("quota") >= 0;
  }

  function pruneDataUrls(input) {
    var clone = deepClone(input);
    var removed = 0;
    var imageKeyHints = {
      img: true,
      imagem: true,
      image: true,
      capa: true,
      cover: true,
      avatar: true,
      foto: true,
      photo: true
    };

    function walk(node, parent, key) {
      if (!node) return;
      if (typeof node === "string") {
        var isDataUrl = node.indexOf("data:image/") === 0;
        if (isDataUrl && parent) {
          parent[key] = "";
          removed += 1;
        }
        return;
      }
      if (Array.isArray(node)) {
        node.forEach(function (item, idx) { walk(item, node, idx); });
        return;
      }
      if (typeof node === "object") {
        Object.keys(node).forEach(function (k) {
          var value = node[k];
          if (typeof value === "string" && imageKeyHints[String(k).toLowerCase()] && value.indexOf("data:image/") === 0) {
            node[k] = "";
            removed += 1;
            return;
          }
          walk(value, node, k);
        });
      }
    }

    walk(clone, null, null);
    return { state: clone, removed: removed };
  }

  function compactStateForStorage(input) {
    var clone = deepClone(input);
    clone = ensureStateShape(clone);
    var data = clone.data || {};

    if (data.sonhosHub && Array.isArray(data.sonhosHub.sonhos)) {
      delete data.sonhos;
    }

    if (data.financasTracker && Array.isArray(data.financasTracker.txs)) {
      delete data.financas;
      delete data.financasSavingsGoal;
      delete data.financasCategorySets;
      delete data.financasRecurrenceRules;
    }

    if (data.wishlistTracker && typeof data.wishlistTracker === "object") {
      delete data.wishlist;
      delete data.wishlistHistory;
      delete data.wishlistGoal;
    }

    if (Array.isArray(data.trackerLivraria)) {
      delete data.trackerLivros;
      delete data.libraryTrackerItems;
      delete data.livros;
      delete data.livraria;
    }

    if (Array.isArray(data.trackerCinema)) {
      delete data.trackerFilmes;
      delete data.trackerSeries;
      delete data.cinema;
      delete data.filmes;
    }

    if (Array.isArray(data.trackerMangas)) {
      delete data.trackerManga;
      delete data.mangas;
    }

    clone.data = data;
    return clone;
  }

  function supportsFileStorage() {
    return false;
  }

  function openFileHandleDb() {
    return new Promise(function (resolve, reject) {
      if (!supportsFileStorage()) {
        reject(new Error("unsupported"));
        return;
      }
      var req = indexedDB.open(FILE_DB_NAME, 1);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains(FILE_DB_STORE)) db.createObjectStore(FILE_DB_STORE);
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error || new Error("db_open_failed")); };
    });
  }

  function getStoredFileHandle() {
    if (fileHandleLoaded) return Promise.resolve(fileStorageHandle);
    return openFileHandleDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(FILE_DB_STORE, "readonly");
        var store = tx.objectStore(FILE_DB_STORE);
        var req = store.get(FILE_HANDLE_KEY);
        req.onsuccess = function () {
          fileStorageHandle = req.result || null;
          fileHandleLoaded = true;
          resolve(fileStorageHandle);
        };
        req.onerror = function () { reject(req.error || new Error("db_read_failed")); };
      });
    }).catch(function () {
      fileHandleLoaded = true;
      fileStorageHandle = null;
      return null;
    });
  }

  function storeFileHandle(handle) {
    if (!supportsFileStorage()) return Promise.reject(new Error("unsupported"));
    return openFileHandleDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(FILE_DB_STORE, "readwrite");
        tx.objectStore(FILE_DB_STORE).put(handle, FILE_HANDLE_KEY);
        tx.oncomplete = function () {
          fileStorageHandle = handle;
          fileHandleLoaded = true;
          resolve(handle);
        };
        tx.onerror = function () { reject(tx.error || new Error("db_write_failed")); };
      });
    });
  }

  function removeStoredFileHandle() {
    if (!supportsFileStorage()) return Promise.resolve();
    return openFileHandleDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(FILE_DB_STORE, "readwrite");
        tx.objectStore(FILE_DB_STORE).delete(FILE_HANDLE_KEY);
        tx.oncomplete = function () {
          fileStorageHandle = null;
          fileHandleLoaded = true;
          resolve();
        };
        tx.onerror = function () { reject(tx.error || new Error("db_delete_failed")); };
      });
    });
  }

  function verifyFilePermission(handle, write) {
    if (!handle || typeof handle.queryPermission !== "function") return Promise.resolve(false);
    var opts = write ? { mode: "readwrite" } : {};
    return Promise.resolve(handle.queryPermission(opts)).then(function (result) {
      if (result === "granted") return true;
      if (typeof handle.requestPermission !== "function") return false;
      return Promise.resolve(handle.requestPermission(opts)).then(function (next) {
        return next === "granted";
      });
    }).catch(function () { return false; });
  }

  function updateFileStorageMeta(patch) {
    var state = ensureStateShape(loadState());
    if (!state.data.fileStorage || typeof state.data.fileStorage !== "object") state.data.fileStorage = {};
    Object.keys(patch || {}).forEach(function (key) {
      state.data.fileStorage[key] = patch[key];
    });
    persistStateSnapshot(state, { dispatchStatus: true });
  }

  var FIREBASE_COLLECTION_DEFS = [
    { name: "planejamento", dataKeys: ["tasks", "tarefas"] },
    { name: "sonhos", dataKeys: ["sonhos", "sonhosHub"] },
    { name: "livraria", dataKeys: ["trackerLivraria", "trackerLivros", "livros", "livraria", "libraryTrackerItems", "libraryHub"] },
    { name: "cinema", dataKeys: ["trackerCinema", "trackerFilmes", "trackerSeries", "cinema", "filmes"] },
    { name: "mangas", dataKeys: ["trackerMangas", "trackerManga", "mangas"] },
    { name: "revisao", dataKeys: ["revisaoPlanner"] },
    { name: "financas", dataKeys: ["financasTracker", "financas", "financasSavingsGoal", "financasCategorySets", "financasRecurrenceRules"] },
    { name: "wishlist", dataKeys: ["wishlistTracker", "wishlist", "wishlistHistory", "wishlistGoal"] },
    { name: "viagens", dataKeys: ["viagens", "travels"] },
    { name: "academia", dataKeys: ["academiaTracker", "academia", "gym", "treinos", "workouts"] },
    { name: "rpg", dataKeys: ["rpg"] },
    { name: "sistema", dataKeys: ["lastVisitedPage", "lastVisitedAt", "notifications", "headerBalanceHidden", "fileStorage", "firebaseSync"] }
  ];

  function getFirebaseCollectionDef(name) {
    return FIREBASE_COLLECTION_DEFS.filter(function (def) { return def.name === name; })[0] || null;
  }

  function buildStateFromRemoteCollections(remoteCollections) {
    var state = deepClone(DEFAULT_STATE);
    var docs = remoteCollections && typeof remoteCollections === "object" ? remoteCollections : {};
    Object.keys(docs).forEach(function (collectionName) {
      var payload = docs[collectionName];
      if (!payload || typeof payload !== "object") return;
      if (payload.profile && typeof payload.profile === "object") {
        state.profile = Object.assign({}, state.profile, payload.profile);
      }
      if (payload.data && typeof payload.data === "object") {
        Object.keys(payload.data).forEach(function (key) {
          state.data[key] = payload.data[key];
        });
      }
    });
    return ensureStateShape(state);
  }

  function decomposeStateToFirebaseCollections(state) {
    var shaped = compactStateForStorage(ensureStateShape(state));
    var docs = {};
    FIREBASE_COLLECTION_DEFS.forEach(function (def) {
      var partial = {};
      def.dataKeys.forEach(function (key) {
        if (Object.prototype.hasOwnProperty.call(shaped.data, key)) partial[key] = shaped.data[key];
      });
      docs[def.name] = {
        version: 2,
        collection: def.name,
        updatedAt: new Date().toISOString(),
        data: partial
      };
    });
    docs.perfil = {
      version: 2,
      collection: "perfil",
      updatedAt: new Date().toISOString(),
      profile: deepClone(shaped.profile)
    };
    return docs;
  }

  function getCollectionDocRef(name) {
    return firebaseCollectionDocRefs[name] || null;
  }

  function clearFirebaseRealtimeListeners() {
    Object.keys(firebaseCollectionListeners).forEach(function (key) {
      try { if (typeof firebaseCollectionListeners[key] === "function") firebaseCollectionListeners[key](); } catch (err) { }
    });
    firebaseCollectionListeners = {};
  }

  function resetFirebaseRealtimeState() {
    if (firebaseUnsubscribe) {
      try { firebaseUnsubscribe(); } catch (err) { }
    }
    firebaseUnsubscribe = null;
    clearFirebaseRealtimeListeners();
    firebaseDocRef = null;
    firebaseIsHydrated = false;
  }

  function hasRemoteCollectionData(remoteCollections) {
    var state = buildStateFromRemoteCollections(remoteCollections);
    return hasMeaningfulState(state);
  }

  function isRemoteStateOlderThanLocal(remoteUpdatedAt, localState) {
    var remoteTime = Date.parse(String(remoteUpdatedAt || ""));
    var localTime = Date.parse(String(localState && localState.data && localState.data.lastVisitedAt || ""));
    return Number.isFinite(remoteTime) && Number.isFinite(localTime) && remoteTime < localTime;
  }

  function summarizeStateForSync(state) {
    state = compactStateForStorage(ensureStateShape(state));
    var data = state.data || {};
    var labelMap = {
      tasks: "planejamento",
      sonhosHub: "sonhos",
      viagens: "viagens",
      wishlistTracker: "wishlist",
      financasTracker: "financas",
      trackerLivraria: "livraria",
      trackerCinema: "cinema",
      trackerMangas: "mangas",
      academiaTracker: "academia",
      libraryHub: "biblioteca hub",
      revisaoPlanner: "revisao",
      rpg: "rpg"
    };
    var keys = Object.keys(data).filter(function (key) {
      return ["lastVisitedPage", "lastVisitedAt", "notifications", "headerBalanceHidden", "fileStorage"].indexOf(key) === -1;
    });
    var labels = keys.map(function (key) {
      return labelMap[key] || key;
    });
    return {
      keys: keys,
      labels: labels,
      bytes: JSON.stringify(state).length
    };
  }

  function appendFileStorageLog(level, message, extra) {
    try {
      var state = ensureStateShape(loadState());
      if (!state.data.fileStorage || typeof state.data.fileStorage !== "object") state.data.fileStorage = {};
      var logs = Array.isArray(state.data.fileStorage.logs) ? state.data.fileStorage.logs.slice(-39) : [];
      logs.push({
        id: Date.now() + "_" + Math.random().toString(36).slice(2, 7),
        at: new Date().toISOString(),
        level: level || "info",
        message: message || "",
        extra: extra && typeof extra === "object" ? extra : {}
      });
      state.data.fileStorage.logs = logs;
      persistStateSnapshot(state, { dispatchStatus: false });
      window.dispatchEvent(new CustomEvent("soter:file-storage-log", { detail: logs[logs.length - 1] }));
    } catch (err) { }
  }

  function trimFileStorageDebug(state) {
    var clone = deepClone(state);
    clone = ensureStateShape(clone);
    if (!clone.data.fileStorage || typeof clone.data.fileStorage !== "object") return clone;
    var meta = clone.data.fileStorage;
    if (Array.isArray(meta.logs)) meta.logs = meta.logs.slice(-12);
    if (meta.lastSyncedSummary && typeof meta.lastSyncedSummary === "object") {
      meta.lastSyncedSummary = {
        keys: Array.isArray(meta.lastSyncedSummary.keys) ? meta.lastSyncedSummary.keys.slice(0, 12) : [],
        labels: Array.isArray(meta.lastSyncedSummary.labels) ? meta.lastSyncedSummary.labels.slice(0, 12) : [],
        bytes: Number(meta.lastSyncedSummary.bytes || 0)
      };
    }
    clone.data.fileStorage = meta;
    return clone;
  }

  function persistStateSnapshot(state, options) {
    var opts = options && typeof options === "object" ? options : {};
    var shaped = compactStateForStorage(ensureStateShape(state));
    runtimeState = deepClone(shaped);
    if (opts.dispatchStatus) {
      var meta = shaped.data && shaped.data.fileStorage ? shaped.data.fileStorage : {};
      window.dispatchEvent(new CustomEvent("soter:file-storage-status", { detail: meta }));
    }
    return deepClone(shaped);
  }

  function writeStateToFile(handle, state) {
    if (!handle) return Promise.reject(new Error("missing_handle"));
    return Promise.resolve(handle.getFileHandle(FILE_NAME, { create: true })).then(function (fileHandle) {
      return Promise.resolve(fileHandle.createWritable()).then(function (writer) {
        return Promise.resolve(writer.write(JSON.stringify(state, null, 2))).then(function () {
          return writer.close();
        });
      });
    });
  }

  function readStateFromFile(handle) {
    if (!handle) return Promise.reject(new Error("missing_handle"));
    return Promise.resolve(handle.getFileHandle(FILE_NAME)).then(function (fileHandle) {
      return Promise.resolve(fileHandle.getFile()).then(function (file) {
        return Promise.resolve(file.text()).then(function (text) {
          if (!text) return null;
          return ensureStateShape(JSON.parse(text));
        });
      });
    });
  }

  function getFileStorageEnabled(state) {
    return false;
  }

  function flushFileSync() {
    filePendingState = null;
    return Promise.resolve(false);
  }

  function queueFileSync(state) {
    filePendingState = null;
  }

  function hasMeaningfulState(state) {
    state = ensureStateShape(state);
    if (state.profile && (state.profile.avatar || state.profile.name !== DEFAULT_STATE.profile.name)) return true;
    var ignore = {
      lastVisitedPage: true,
      lastVisitedAt: true,
      headerBalanceHidden: true,
      notifications: true,
      fileStorage: true,
      rpg: true
    };
    return Object.keys(state.data || {}).some(function (key) {
      if (ignore[key]) return false;
      var value = state.data[key];
      if (Array.isArray(value)) return value.length > 0;
      if (value && typeof value === "object") return Object.keys(value).length > 0;
      return value !== "" && value !== null && value !== undefined;
    });
  }

  function tryHydrateFromFile() {
    return;
  }

  function clearLegacyStorageKeys(state) {
    return;
  }

  function getFirebaseRuntimeConfig() {
    if (typeof window === "undefined") return null;
    var config = window.SOTER_FIREBASE_CONFIG;
    if (!config || typeof config !== "object") return null;
    if (!config.apiKey || !config.projectId) return null;
    if (String(config.projectId).indexOf("CHANGE_ME") >= 0) return null;
    return config;
  }

  function getFirebaseAuthConfig() {
    var runtime = getFirebaseRuntimeConfig() || {};
    var auth = runtime.auth && typeof runtime.auth === "object" ? runtime.auth : {};
    return {
      enabled: auth.enabled !== false,
      emailPassword: auth.emailPassword !== false,
      google: !!auth.google,
      allowGuest: !!auth.allowGuest
    };
  }

  function getFirebaseUserRoot() {
    var runtime = getFirebaseRuntimeConfig() || {};
    return runtime.userCollection || 'users';
  }

  function deleteFirestoreUserSubcollection(uid, subcollectionName) {
    if (!firebaseDbInstance || !uid) return Promise.resolve(null);
    var ref = firebaseDbInstance.collection(getFirebaseUserRoot()).doc(String(uid)).collection(subcollectionName);
    return ref.get().then(function (snap) {
      if (snap.empty) return null;
      var docs = snap.docs;
      var chunks = [];
      for (var i = 0; i < docs.length; i += 400) chunks.push(docs.slice(i, i + 400));
      return chunks.reduce(function (chain, chunk) {
        return chain.then(function () {
          var batch = firebaseDbInstance.batch();
          chunk.forEach(function (d) { batch.delete(d.ref); });
          return batch.commit();
        });
      }, Promise.resolve());
    });
  }

  function getFirebaseAuthDisplayName(user) {
    if (!user) return '';
    return String(user.displayName || user.email || ('UID ' + String(user.uid || '').slice(0, 6))).trim();
  }

  function getFirebaseAuthProviderIds(user) {
    if (!user) return [];
    var providers = Array.isArray(user.providerData) ? user.providerData : [];
    return providers.map(function (entry) {
      return String(entry && entry.providerId || '').trim();
    }).filter(function (providerId, index, list) {
      return !!providerId && list.indexOf(providerId) === index;
    });
  }

  function dispatchFirebaseAuthChanged() {
    try {
      window.dispatchEvent(new CustomEvent('soter:firebase-auth-changed', {
        detail: {
          signedIn: !!firebaseCurrentUser,
          uid: firebaseCurrentUser ? firebaseCurrentUser.uid || '' : '',
          email: firebaseCurrentUser ? firebaseCurrentUser.email || '' : '',
          displayName: firebaseCurrentUser ? getFirebaseAuthDisplayName(firebaseCurrentUser) : ''
        }
      }));
    } catch (err) { }
  }

  function buildFreshAccountState(user) {
    var freshState = deepClone(DEFAULT_STATE);
    var preferredName = String(
      (user && (user.displayName || '')) || ''
    ).trim();
    if (preferredName) freshState.profile.name = preferredName;
    return freshState;
  }

  function mergeAuthProfileIntoState(state, user) {
    var shaped = ensureStateShape(deepClone(state));
    var preferredName = String((user && user.displayName) || '').trim();
    if (preferredName && (!shaped.profile.name || shaped.profile.name === DEFAULT_STATE.profile.name)) {
      shaped.profile.name = preferredName;
    }
    return shaped;
  }

  function prepareStateForApp(nextState, previousState) {
    var prev = ensureStateShape(previousState || loadState());
    var state = syncRpgState(nextState, prev);
    state = syncAbandonNotifications(state);
    state = syncBookStreakNotification(state);
    state = syncReviewNotifications(state);
    state = syncDomainNotifications(state);
    state.data.notifications = filterDismissedNotifications(state, state.data.notifications);
    return state;
  }

  function replaceLocalStateSnapshot(nextState, previousState) {
    var prepared = prepareStateForApp(nextState, previousState || nextState);
    persistStateSnapshot(prepared, { dispatchStatus: true });
    if (firebaseCurrentUser && firebaseCurrentUser.uid) {
      saveScopedStateForUser(firebaseCurrentUser.uid, prepared);
    } else {
      saveGuestStateSnapshot(prepared);
    }
    applyProfileToUI(prepared);
    renderNotifications(prepared);
    renderRpgHeader(prepared);
    renderHeaderBalance(prepared);
    return prepared;
  }

  function updateFirebaseAuthUi() {
    var status = document.getElementById('firebase-auth-status');
    var emailEl = document.getElementById('firebase-auth-email');
    var loginBtn = document.getElementById('firebase-login-btn');
    var logoutBtn = document.getElementById('firebase-logout-btn');
    var openBtn = document.getElementById('firebase-open-auth-modal-btn');
    var syncBtn = document.getElementById('firebase-sync-user-btn');
    if (status) status.textContent = firebaseCurrentUser ? 'Conectado ao Firebase' : 'Usando modo local';
    if (emailEl) emailEl.textContent = firebaseCurrentUser ? getFirebaseAuthDisplayName(firebaseCurrentUser) : 'Entre para sincronizar por usu\u00e1rio';
    if (loginBtn) loginBtn.style.display = firebaseCurrentUser ? 'none' : '';
    if (openBtn) openBtn.style.display = firebaseCurrentUser ? 'none' : '';
    if (logoutBtn) logoutBtn.style.display = firebaseCurrentUser ? '' : 'none';
    if (syncBtn) syncBtn.disabled = !firebaseCurrentUser;
  }

  function consumeAuthRedirect() {
    var redirect = String(authSuccessRedirectUrl || '').trim();
    authSuccessRedirectUrl = '';
    return redirect;
  }

  function finishAuthFlow(message, feedback) {
    if (feedback) {
      feedback.textContent = message || '';
      feedback.setAttribute('data-tone', 'ok');
    }
    var redirect = consumeAuthRedirect();
    setTimeout(function () {
      closeAuthModal();
      if (redirect) window.location.href = redirect;
    }, 350);
  }


  var authSkyState = { signin: 'night', signup: 'night' };
  var vantaNightEffect = null;
  var vantaDayEffect = null;

  function initVantaNight() {
    var el = document.getElementById('lm-sky-night');
    if (!el || vantaNightEffect) return;
    loadScript('js/three.r134.min.js').then(function () {
      return loadScript('js/vanta.clouds2.min.js');
    }).then(function () {
      if (vantaNightEffect) return;
      vantaNightEffect = window.VANTA.CLOUDS2({
        el: '#lm-sky-night',
        mouseControls: true,
        touchControls: true,
        gyroControls: false,
        minHeight: 200.00,
        minWidth: 200.00,
        scale: 1.00,
        skyColor: 0xa2c55,
        speed: 0.30,
        texturePath: './gallery/noise.png'
      });
    }).catch(function () {});
  }

  function initVantaDay() {
    var el = document.getElementById('lm-sky-day');
    if (!el || vantaDayEffect) return;
    loadScript('js/three.r134.min.js').then(function () {
      return loadScript('js/vanta.clouds2.min.js');
    }).then(function () {
      if (vantaDayEffect) return;
      vantaDayEffect = window.VANTA.CLOUDS2({
        el: '#lm-sky-day',
        mouseControls: true,
        touchControls: true,
        gyroControls: false,
        minHeight: 200.00,
        minWidth: 200.00,
        scale: 1.00,
        skyColor: 0x76a3d9,
        speed: 0.40,
        texturePath: './gallery/noise.png'
      });
    }).catch(function () {});
  }

  function destroyVantaNight() {
    if (vantaNightEffect) {
      vantaNightEffect.destroy();
      vantaNightEffect = null;
    }
  }

  function destroyVantaDay() {
    if (vantaDayEffect) {
      vantaDayEffect.destroy();
      vantaDayEffect = null;
    }
  }

  function setAuthSky(mode) {
    var modal = document.getElementById('firebase-auth-modal');
    var night = document.getElementById('lm-sky-night');
    var day = document.getElementById('lm-sky-day');
    if (!modal || !night || !day) return;
    if (mode === 'day') {
      night.style.opacity = '0';
      day.style.opacity = '1';
      modal.classList.add('sky-day');
      return;
    }
    night.style.opacity = '1';
    day.style.opacity = '0';
    modal.classList.remove('sky-day');
  }

  function syncAuthSky() {
    var anyVisible = Object.keys(authSkyState).some(function (key) {
      return authSkyState[key] === 'day';
    });
    setAuthSky(anyVisible ? 'day' : 'night');
  }

  function toggleAuthPassword(inputId, btnId, key) {
    var input = document.getElementById(inputId);
    var btn = document.getElementById(btnId);
    var isPass;
    if (!input) return;
    isPass = input.type === 'password';
    input.type = isPass ? 'text' : 'password';
    if (btn) btn.textContent = isPass ? '\u2600' : '\uD83C\uDF19';
    authSkyState[key] = isPass ? 'day' : 'night';
    syncAuthSky();
  }

  function syncRememberInputs(value) {
    var rememberSignin = document.getElementById('firebase-auth-remember-input');
    var rememberSignup = document.getElementById('firebase-auth-signup-remember-input');
    authRememberDefault = !!value;
    if (rememberSignin) rememberSignin.checked = authRememberDefault;
    if (rememberSignup) rememberSignup.checked = authRememberDefault;
  }

  function readRememberChoice(fallbackId) {
    var primary = document.getElementById(fallbackId || '');
    var secondaryId = fallbackId === 'firebase-auth-signup-remember-input'
      ? 'firebase-auth-remember-input'
      : 'firebase-auth-signup-remember-input';
    var secondary = document.getElementById(secondaryId);
    if (primary) return !!primary.checked;
    if (secondary) return !!secondary.checked;
    return !!authRememberDefault;
  }

  function setFirebaseAuthPersistence(remember) {
    if (!firebaseAuthInstance || !window.firebase || !window.firebase.auth || !window.firebase.auth.Auth || !window.firebase.auth.Auth.Persistence) {
      return Promise.resolve(true);
    }
    return firebaseAuthInstance.setPersistence(
      remember
        ? window.firebase.auth.Auth.Persistence.LOCAL
        : window.firebase.auth.Auth.Persistence.SESSION
    );
  }

  function ensureAuthModal() {
    if (authModalMounted || !document.body) return;
    authModalMounted = true;
    var wrap = document.createElement('div');
    wrap.id = 'firebase-auth-modal';
    wrap.className = 'soter-auth-modal';
    wrap.hidden = true;
    wrap.innerHTML = [
      '<div id="login-modal-bd" data-auth-close></div>',
      '<div id="login-modal" role="dialog" aria-modal="true" aria-labelledby="soter-auth-title">',
      '  <div class="lm-shell">',
      '    <div class="lm-sky-header">',
      '      <div id="lm-sky-night"></div>',
      '      <div id="lm-sky-day"></div>',
      '      <div class="lm-sky-title">',
      '        <div class="lm-sky-title-brand" id="soter-auth-title"><em style="font-style:italic;color:var(--accent1)">S\u00f3l</em> de S\u00f3ter</div>',
      '        <div class="lm-sky-title-sub">acesse seu universo</div>',
      '      </div>',
      '    </div>',
      '    <div class="lm-body">',
      '      <div class="lm-tabs">',
      '        <button class="lm-tab active" id="ltab-login" type="button">Entrar</button>',
      '        <button class="lm-tab" id="ltab-signup" type="button">Registrar</button>',
      '      </div>',
      '      <div class="lm-msg err" id="firebase-auth-feedback-error"></div>',
      '      <div class="lm-msg ok" id="firebase-auth-feedback-ok"></div>',
      '      <div id="lmform-login">',
      '        <div style="display:flex;flex-direction:column;gap:13px">',
      '          <div>',
      '            <label class="lm-label">E-mail</label>',
      '            <div style="position:relative">',
      '              <input id="firebase-auth-email-input" type="email" placeholder="seu@email.com" autocomplete="email" class="lm-field-inp no-icon">',
      '            </div>',
      '          </div>',
      '          <div>',
      '            <label class="lm-label">Senha</label>',
      '            <div style="position:relative">',
      '              <input id="firebase-auth-password-input" type="password" placeholder="\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022" autocomplete="current-password" class="lm-field-inp">',
      '              <button class="lm-eye-btn" id="firebase-auth-password-eye" type="button" title="Mostrar/ocultar senha">\uD83C\uDF19</button>',
      '            </div>',
      '          </div>',
      '          <label class="lm-remember-row">',
      '            <input id="firebase-auth-remember-input" type="checkbox">',
      '            <span class="lm-remember-toggle" aria-hidden="true"><span class="lm-remember-toggle-core"></span></span>',
      '            <span class="lm-remember-copy"><strong>Manter conectado</strong><em>Continuar logado neste dispositivo</em></span>',
      '          </label>',
      '          <button class="lm-submit" type="button" id="firebase-auth-signin-btn">Entrar</button>',
      '        </div>',
      '      </div>',
      '      <div id="lmform-signup" style="display:none">',
      '        <div style="display:flex;flex-direction:column;gap:13px">',
      '          <div>',
      '            <label class="lm-label">Como quer ser chamado?</label>',
      '            <div style="position:relative">',
      '              <input id="firebase-auth-name-input" type="text" placeholder="Seu nome" autocomplete="name" class="lm-field-inp no-icon">',
      '            </div>',
      '          </div>',
      '          <div>',
      '            <label class="lm-label">E-mail</label>',
      '            <div style="position:relative">',
      '              <input id="firebase-auth-signup-email-input" type="email" placeholder="seu@email.com" autocomplete="email" class="lm-field-inp no-icon">',
      '            </div>',
      '            <div class="lm-inline-status" id="firebase-auth-signup-email-status"></div>',
      '          </div>',
      '          <div>',
      '            <label class="lm-label">Senha <span style="opacity:.4;font-size:8px">(m\u00edn. 6 caracteres)</span></label>',
      '            <div style="position:relative">',
      '              <input id="firebase-auth-signup-password-input" type="password" placeholder="M\u00ednimo 6 caracteres" autocomplete="new-password" class="lm-field-inp">',
      '              <button class="lm-eye-btn" id="firebase-auth-signup-password-eye" type="button" title="Mostrar/ocultar senha">\uD83C\uDF19</button>',
      '            </div>',
      '          </div>',
      '          <div>',
      '            <label class="lm-label">Confirmar senha</label>',
      '            <div id="apc-indicator" class="apc-indicator" style="display:none"></div>',
      '            <div class="apc-field-wrap" id="apc-field-wrap">',
      '              <div style="position:relative">',
      '                <input id="firebase-auth-signup-password-confirm-input" type="password" placeholder="Repita sua senha" autocomplete="new-password" class="lm-field-inp">',
      '                <button class="lm-eye-btn" id="firebase-auth-signup-password-confirm-eye" type="button" title="Mostrar/ocultar senha">\uD83C\uDF19</button>',
      '              </div>',
      '            </div>',
      '          </div>',
      '          <label class="lm-remember-row">',
      '            <input id="firebase-auth-signup-remember-input" type="checkbox">',
      '            <span class="lm-remember-toggle" aria-hidden="true"><span class="lm-remember-toggle-core"></span></span>',
      '            <span class="lm-remember-copy"><strong>Manter conectado</strong><em>Continuar logado neste dispositivo</em></span>',
      '          </label>',
      '          <button class="lm-submit" type="button" id="firebase-auth-signup-btn">Criar conta</button>',
      '        </div>',
      '      </div>',
      '      <div class="lm-close-row">',
      '        <button class="lm-close-btn" type="button" data-auth-close>fechar \u00d7</button>',
      '      </div>',
      '    </div>',
      '  </div>',
      '</div>'
    ].join('');
    document.body.appendChild(wrap);

    wrap.addEventListener('click', function (event) {
      if (event.target && event.target.matches('[data-auth-close]')) closeAuthModal();
    });


    var signinBtn = document.getElementById('firebase-auth-signin-btn');
    var signupBtn = document.getElementById('firebase-auth-signup-btn');
    var tabLogin = document.getElementById('ltab-login');
    var tabSignup = document.getElementById('ltab-signup');
    var passwordEye = document.getElementById('firebase-auth-password-eye');
    var signupPasswordEye = document.getElementById('firebase-auth-signup-password-eye');
    var signupPasswordConfirmEye = document.getElementById('firebase-auth-signup-password-confirm-eye');
    var signupEmailInput = document.getElementById('firebase-auth-signup-email-input');
    var signupEmailStatus = document.getElementById('firebase-auth-signup-email-status');
    var rememberSignin = document.getElementById('firebase-auth-remember-input');
    var rememberSignup = document.getElementById('firebase-auth-signup-remember-input');
    var feedbackError = document.getElementById('firebase-auth-feedback-error');
    var feedbackOk = document.getElementById('firebase-auth-feedback-ok');

    function readSigninCreds() {
      return {
        email: String((document.getElementById('firebase-auth-email-input') || {}).value || '').trim(),
        password: String((document.getElementById('firebase-auth-password-input') || {}).value || ''),
        remember: readRememberChoice('firebase-auth-remember-input')
      };
    }

    function readSignupCreds() {
      return {
        name: String((document.getElementById('firebase-auth-name-input') || {}).value || '').trim(),
        email: String((document.getElementById('firebase-auth-signup-email-input') || {}).value || '').trim(),
        password: String((document.getElementById('firebase-auth-signup-password-input') || {}).value || ''),
        passwordConfirm: String((document.getElementById('firebase-auth-signup-password-confirm-input') || {}).value || ''),
        remember: readRememberChoice('firebase-auth-signup-remember-input')
      };
    }

    function isStrongPassword(password) {
      var value = String(password || '');
      return value.length >= 6 && /[A-Z]/.test(value) && /\d/.test(value);
    }

    function setSignupEmailStatus(message, tone) {
      if (!signupEmailStatus) return;
      signupEmailStatus.textContent = String(message || '');
      signupEmailStatus.className = 'lm-inline-status' + (tone ? ' ' + tone : '');
      signupEmailStatus.style.display = message ? 'block' : 'none';
    }

    function looksLikeEmail(value) {
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
    }

    function checkSignupEmailAvailability(email) {
      var requestSeq = authSignupEmailCheckSeq + 1;
      authSignupEmailCheckSeq = requestSeq;
      if (authSignupEmailCheckTimer) clearTimeout(authSignupEmailCheckTimer);
      email = String(email || '').trim();
      if (!email) {
        setSignupEmailStatus('', '');
        return;
      }
      if (!looksLikeEmail(email)) {
        setSignupEmailStatus('Digite um e-mail v\u00e1lido para verificar disponibilidade.', 'warn');
        return;
      }
      setSignupEmailStatus('Verificando disponibilidade do e-mail...', 'loading');
      authSignupEmailCheckTimer = setTimeout(function () {
        initFirebaseSync().then(function () {
          if (!firebaseAuthInstance || typeof firebaseAuthInstance.fetchSignInMethodsForEmail !== 'function') {
            throw new Error('auth_unavailable');
          }
          return firebaseAuthInstance.fetchSignInMethodsForEmail(email);
        }).then(function (methods) {
          if (requestSeq !== authSignupEmailCheckSeq) return;
          if (Array.isArray(methods) && methods.length) {
            setSignupEmailStatus('Este e-mail j\u00e1 est\u00e1 em uso.', 'error');
            return;
          }
          setSignupEmailStatus('E-mail aparentemente dispon\u00edvel. A confirma\u00e7\u00e3o final acontece ao criar a conta.', 'ok');
        }).catch(function () {
          if (requestSeq !== authSignupEmailCheckSeq) return;
          setSignupEmailStatus('N\u00e3o foi poss\u00edvel verificar este e-mail agora. Voc\u00ea ainda pode tentar criar a conta.', 'warn');
        });
      }, 380);
    }

    function formatAuthMessage(err, mode) {
      var raw = String(err && (err.code || err.message) || err || '').trim();
      if (!raw) return mode === 'signup' ? 'N\u00e3o foi poss\u00edvel criar a conta agora.' : 'N\u00e3o foi poss\u00edvel entrar agora.';
      if (raw.indexOf('auth/email-already-in-use') >= 0) return 'J\u00e1 existe uma conta com este e-mail.';
      if (raw.indexOf('auth/user-not-found') >= 0) return 'Esta conta n\u00e3o existe.';
      if (raw.indexOf('auth/wrong-password') >= 0 || raw.indexOf('INVALID_LOGIN_CREDENTIALS') >= 0 || raw.indexOf('auth/invalid-credential') >= 0) {
        return 'E-mail ou senha incorretos.';
      }
      if (raw.indexOf('auth/invalid-email') >= 0) return 'Digite um e-mail v\u00e1lido.';
      if (raw.indexOf('auth/weak-password') >= 0) return 'A senha precisa ter pelo menos 6 caracteres, 1 letra mai\u00fascula e 1 n\u00famero.';
      if (raw.indexOf('auth/too-many-requests') >= 0) return 'Muitas tentativas seguidas. Aguarde um pouco e tente novamente.';
      return mode === 'signup' ? 'N\u00e3o foi poss\u00edvel criar a conta agora.' : 'N\u00e3o foi poss\u00edvel entrar agora.';
    }

    function showFeedback(message, isError) {
      if (feedbackError) {
        feedbackError.style.display = isError && message ? 'block' : 'none';
        feedbackError.textContent = isError ? (message || '') : '';
      }
      if (feedbackOk) {
        feedbackOk.style.display = !isError && message ? 'block' : 'none';
        feedbackOk.textContent = !isError ? (message || '') : '';
      }
    }
    function setAuthTab(tab) {
      var isLogin = tab === 'login';
      var loginForm = document.getElementById('lmform-login');
      var signupForm = document.getElementById('lmform-signup');
      if (tabLogin) tabLogin.classList.toggle('active', isLogin);
      if (tabSignup) tabSignup.classList.toggle('active', !isLogin);
      if (loginForm) loginForm.style.display = isLogin ? '' : 'none';
      if (signupForm) signupForm.style.display = isLogin ? 'none' : '';
      showFeedback('', true);
      showFeedback('', false);
      if (isLogin) setSignupEmailStatus('', '');
    }
    if (tabLogin) tabLogin.addEventListener('click', function () { setAuthTab('login'); });
    if (tabSignup) tabSignup.addEventListener('click', function () { setAuthTab('signup'); });
    if (passwordEye) passwordEye.addEventListener('click', function () {
      toggleAuthPassword('firebase-auth-password-input', 'firebase-auth-password-eye', 'signin');
    });
    if (signupPasswordEye) signupPasswordEye.addEventListener('click', function () {
      toggleAuthPassword('firebase-auth-signup-password-input', 'firebase-auth-signup-password-eye', 'signup');
    });
    if (signupPasswordConfirmEye) signupPasswordConfirmEye.addEventListener('click', function () {
      toggleAuthPassword('firebase-auth-signup-password-confirm-input', 'firebase-auth-signup-password-confirm-eye', 'signup');
    });
    if (signupEmailInput) signupEmailInput.addEventListener('input', function () {
      checkSignupEmailAvailability(signupEmailInput.value);
    });
    if (signupEmailInput) signupEmailInput.addEventListener('blur', function () {
      checkSignupEmailAvailability(signupEmailInput.value);
    });
    if (rememberSignin) rememberSignin.addEventListener('change', function () {
      syncRememberInputs(rememberSignin.checked);
    });
    if (rememberSignup) rememberSignup.addEventListener('change', function () {
      syncRememberInputs(rememberSignup.checked);
    });
    if (signinBtn) signinBtn.addEventListener('click', function () {
      var creds = readSigninCreds();
      if (!creds.email || !creds.password) { showFeedback('Preencha email e senha.', true); return; }
      window.SoterStorage.loginWithEmail(creds.email, creds.password, { remember: creds.remember }).then(function () {
        showFeedback('Login realizado com sucesso.', false);
        finishAuthFlow('Login realizado com sucesso.', feedbackOk);
      }).catch(function (err) { showFeedback(formatAuthMessage(err, 'signin'), true); });
    });
    if (signupBtn) signupBtn.addEventListener('click', function () {
      var creds = readSignupCreds();
      if (!creds.name) { showFeedback('Digite seu nome.', true); return; }
      if (!creds.email || !creds.password) { showFeedback('Preencha email e senha.', true); return; }
      if (!looksLikeEmail(creds.email)) { showFeedback('Digite um e-mail v\u00e1lido.', true); return; }
      if (!isStrongPassword(creds.password)) { showFeedback('A senha precisa ter pelo menos 6 caracteres, 1 letra mai\u00fascula e 1 n\u00famero.', true); return; }
      if (creds.password !== creds.passwordConfirm) { showFeedback('As senhas n\u00e3o coincidem.', true); return; }
      window.SoterStorage.registerWithEmail(creds.email, creds.password, { remember: creds.remember, name: creds.name }).then(function () {
        var state = ensureStateShape(loadState());
        state.profile.name = creds.name;
        saveState(state);
        showFeedback('Conta criada com sucesso.', false);
        finishAuthFlow('Conta criada com sucesso.', feedbackOk);
      }).catch(function (err) { showFeedback(formatAuthMessage(err, 'signup'), true); });
    });
    // Assisted Password Confirmation
    var apcPasswordInput = document.getElementById('firebase-auth-signup-password-input');
    var apcConfirmInput = document.getElementById('firebase-auth-signup-password-confirm-input');
    var apcIndicator = document.getElementById('apc-indicator');
    var apcFieldWrap = document.getElementById('apc-field-wrap');
    var apcShaking = false;

    function buildApcDots(password) {
      if (!apcIndicator) return;
      apcIndicator.innerHTML = '';
      var len = String(password || '').length;
      if (!len) { apcIndicator.style.display = 'none'; return; }
      apcIndicator.style.display = 'flex';
      for (var i = 0; i < len; i++) {
        var slot = document.createElement('div');
        slot.className = 'apc-dot-slot';
        var bg = document.createElement('div');
        bg.className = 'apc-dot-bg';
        var dot = document.createElement('div');
        dot.className = 'apc-dot';
        slot.appendChild(bg);
        slot.appendChild(dot);
        apcIndicator.appendChild(slot);
      }
    }

    function updateApcState() {
      if (!apcIndicator || !apcPasswordInput || !apcConfirmInput) return;
      var password = apcPasswordInput.value;
      var confirm = apcConfirmInput.value;
      var slots = apcIndicator.querySelectorAll('.apc-dot-slot');
      slots.forEach(function (slot, i) {
        var bg = slot.querySelector('.apc-dot-bg');
        if (i < confirm.length) {
          slot.classList.add('filled');
          bg.className = 'apc-dot-bg ' + (confirm[i] === password[i] ? 'apc-match-bg' : 'apc-mismatch-bg');
        } else {
          slot.classList.remove('filled');
          bg.className = 'apc-dot-bg';
        }
      });
      var matched = password.length > 0 && password === confirm;
      apcIndicator.classList.toggle('apc-matched', matched);
      apcConfirmInput.classList.toggle('apc-field-matched', matched);
      if (matched && apcFieldWrap && !apcFieldWrap.classList.contains('apc-pulse')) {
        apcFieldWrap.classList.add('apc-pulse');
        setTimeout(function () { apcFieldWrap.classList.remove('apc-pulse'); }, 350);
      }
    }

    if (apcPasswordInput) {
      apcPasswordInput.addEventListener('input', function () {
        buildApcDots(apcPasswordInput.value);
        if (apcConfirmInput && apcConfirmInput.value.length > apcPasswordInput.value.length) {
          apcConfirmInput.value = apcConfirmInput.value.slice(0, apcPasswordInput.value.length);
        }
        updateApcState();
      });
    }

    if (apcConfirmInput) {
      apcConfirmInput.addEventListener('input', function () {
        var password = apcPasswordInput ? apcPasswordInput.value : '';
        if (apcConfirmInput.value.length > password.length) {
          apcConfirmInput.value = apcConfirmInput.value.slice(0, password.length);
          if (!apcShaking && apcFieldWrap) {
            apcShaking = true;
            apcFieldWrap.classList.add('apc-shake');
            setTimeout(function () {
              apcFieldWrap.classList.remove('apc-shake');
              apcShaking = false;
            }, 450);
          }
        }
        updateApcState();
      });
    }

    syncRememberInputs(authRememberDefault);
    setAuthTab('login');
  }

  function openAuthModal(options) {
    ensureAuthModal();
    authSuccessRedirectUrl = '';
    if (typeof options === 'string') {
      authSuccessRedirectUrl = options;
    } else if (options && typeof options === 'object' && options.redirectUrl) {
      authSuccessRedirectUrl = String(options.redirectUrl || '').trim();
    }
    var modal = document.getElementById('firebase-auth-modal');
    var shell = document.getElementById('login-modal');
    if (!modal) return;
    modal.hidden = false;
    document.body.classList.add('auth-modal-open');
    authSkyState.signin = 'night';
    authSkyState.signup = 'night';
    syncAuthSky();
    requestAnimationFrame(function () { initVantaNight(); initVantaDay(); });
    if (shell) {
      shell.style.display = 'block';
      shell.style.opacity = '0';
      shell.style.transform = 'translate(-50%,-50%) scale(.92)';
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          shell.style.opacity = '1';
          shell.style.transform = 'translate(-50%,-50%) scale(1)';
        });
      });
    }
    var emailInput = document.getElementById('firebase-auth-email-input');
    if (emailInput && typeof emailInput.focus === 'function') {
      setTimeout(function () { emailInput.focus(); }, 20);
    }
  }

  function closeAuthModal() {
    var modal = document.getElementById('firebase-auth-modal');
    var shell = document.getElementById('login-modal');
    if (!modal) return;
    if (shell) {
      shell.style.opacity = '0';
      shell.style.transform = 'translate(-50%,-50%) scale(.92)';
    }
    setTimeout(function () {
      modal.hidden = true;
      document.body.classList.remove('auth-modal-open');
      destroyVantaNight();
      destroyVantaDay();
    }, 380);
  }

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var existing = document.querySelector('script[data-soter-src="' + src + '"]');
      if (existing) {
        if (existing.getAttribute('data-loaded') === '1') { resolve(); return; }
        existing.addEventListener('load', function () { resolve(); }, { once: true });
        existing.addEventListener('error', function () { reject(new Error('script_failed')); }, { once: true });
        return;
      }
      var script = document.createElement('script');
      script.src = src;
      script.async = true;
      script.defer = true;
      script.setAttribute('data-soter-src', src);
      script.onload = function () {
        script.setAttribute('data-loaded', '1');
        resolve();
      };
      script.onerror = function () { reject(new Error('script_failed')); };
      document.head.appendChild(script);
    });
  }

  function updateFirebaseMeta(patch) {
    var current = ensureStateShape(loadState());
    if (!current.data || typeof current.data !== 'object') current.data = {};
    var meta = current.data.firebaseSync && typeof current.data.firebaseSync === 'object'
      ? current.data.firebaseSync
      : {};
    Object.keys(patch || {}).forEach(function (key) {
      if (typeof patch[key] === 'undefined') return;
      meta[key] = patch[key];
    });
    current.data.firebaseSync = meta;
    persistStateSnapshot(current, { dispatchStatus: true });
  }

  function connectFirebaseRealtime() {
    if (!firebaseDocRef || !window.firebase || !window.firebase.firestore) return;
    if (firebaseUnsubscribe) return;
    firebaseUnsubscribe = firebaseDocRef.onSnapshot(function (docSnap) {
      var remote = docSnap && docSnap.exists ? docSnap.data() : null;
      if (!remote || !remote.state) {
        firebaseIsHydrated = true;
        updateFirebaseMeta({ enabled: true, hydrated: true, lastError: '' });
        return;
      }
      var localState = loadState();
      if (isRemoteStateOlderThanLocal(remote.updatedAt, localState)) {
        queueFirebaseSync(localState);
        return;
      }
      var incoming = mergeAuthProfileIntoState(ensureStateShape(remote.state), firebaseCurrentUser);
      var serializedIncoming = JSON.stringify(compactStateForStorage(incoming));
      var serializedLocal = JSON.stringify(compactStateForStorage(localState));
      firebaseIsHydrated = true;
      updateFirebaseMeta({
        enabled: true,
        hydrated: true,
        lastRemoteAt: remote.updatedAt || '',
        lastError: ''
      });
      if (serializedIncoming === serializedLocal) return;
      firebaseIsApplyingRemote = true;
      try {
        applySiteState(incoming, localState);
      } finally {
        firebaseIsApplyingRemote = false;
      }
    }, function (err) {
      firebaseLastError = String((err && err.message) || err || 'firebase_snapshot_failed');
      updateFirebaseMeta({ enabled: true, lastError: firebaseLastError });
      console.error('[SoterStorage] Falha ao ouvir Firebase:', err);
    });
  }

  function hydrateFirebaseDocument() {
    if (!firebaseDocRef) return Promise.resolve(true);
    return firebaseDocRef.get().then(function (docSnap) {
      if (!docSnap.exists || !docSnap.data() || !docSnap.data().state) {
        var initialState = mergeAuthProfileIntoState(loadState(), firebaseCurrentUser);
        return firebaseDocRef.set({
          state: compactStateForStorage(initialState),
          updatedAt: new Date().toISOString(),
          source: location.pathname || 'site'
        }, { merge: true });
      }
      return docSnap;
    }).then(function (docSnap) {
      if (docSnap && docSnap.exists && docSnap.data() && docSnap.data().state) {
        if (isRemoteStateOlderThanLocal(docSnap.data().updatedAt, loadState())) {
          queueFirebaseSync(loadState());
          firebaseIsHydrated = true;
          updateFirebaseMeta({ hydrated: true, lastError: '' });
          return true;
        }
        firebaseIsApplyingRemote = true;
        try {
          applySiteState(mergeAuthProfileIntoState(ensureStateShape(docSnap.data().state), firebaseCurrentUser), loadState());
        } finally {
          firebaseIsApplyingRemote = false;
        }
      }
      firebaseIsHydrated = true;
      updateFirebaseMeta({ hydrated: true, lastError: '' });
      return true;
    }).catch(function (err) {
      var msg = String((err && err.message) || err || 'hydrate_failed');
      firebaseLastError = msg;
      updateFirebaseMeta({ enabled: true, hydrated: false, lastError: msg });
      console.error('[SoterStorage] Falha ao carregar dados do Firebase:', err);
      throw err;
    });
  }

  function getFirebaseUserStateRef() {
    if (!firebaseDbInstance || !firebaseCurrentUser) return null;
    var userRoot = getFirebaseUserRoot();
    return firebaseDbInstance
      .collection(userRoot)
      .doc(String(firebaseCurrentUser.uid || ''))
      .collection('private')
      .doc('siteState');
  }

  function activateFirebaseForCurrentUser() {
    if (!firebaseDbInstance || !firebaseCurrentUser) return Promise.resolve(false);
    var config = getFirebaseRuntimeConfig() || {};
    var userRoot = getFirebaseUserRoot();
    firebaseDocRef = getFirebaseUserStateRef();
    if (!firebaseDocRef) return Promise.resolve(false);
    updateFirebaseMeta({
      enabled: true,
      provider: 'firestore',
      collection: userRoot,
      document: 'private/siteState',
      strategy: 'user_private_document',
      projectId: config.projectId,
      userUid: firebaseCurrentUser.uid || '',
      userEmail: firebaseCurrentUser.email || '',
      lastError: ''
    });
    connectFirebaseRealtime();
    return hydrateFirebaseDocument();
  }

  function ensureFirebaseAuthListener() {
    if (firebaseAuthListenerReady || !firebaseAuthInstance) return;
    firebaseAuthListenerReady = true;
    if (!firebaseUserReadyPromise) {
      firebaseUserReadyPromise = new Promise(function (resolve) {
        firebaseUserUnsubscribe = function () { resolve(true); };
      });
    }
    firebaseAuthInstance.onAuthStateChanged(function (user) {
      var previousUser = firebaseCurrentUser;
      var currentLocalState = ensureStateShape(loadState());
      if (previousUser && previousUser.uid && previousUser.uid !== firebasePendingDeletedUid) {
        saveScopedStateForUser(previousUser.uid, currentLocalState);
      } else if (!previousUser || !previousUser.uid) {
        saveGuestStateSnapshot(currentLocalState);
      }
      firebaseCurrentUser = user || null;
      rememberLastAuthUid(firebaseCurrentUser ? firebaseCurrentUser.uid : '');
      try {
        if (firebaseCurrentUser) {
          sessionStorage.setItem("soter_allow_index", "1");
        } else {
          sessionStorage.removeItem("soter_allow_index");
        }
      } catch (e) {}
      if (firebaseUserUnsubscribe) {
        try { firebaseUserUnsubscribe(); } catch (err) { }
        firebaseUserUnsubscribe = null;
      }
      updateFirebaseAuthUi();
      dispatchFirebaseAuthChanged();
      if (!firebaseCurrentUser) {
        resetFirebaseRealtimeState();
        if (firebasePendingDeletedUid) {
          removeScopedStateForUser(firebasePendingDeletedUid);
          firebasePendingDeletedUid = '';
        }
        replaceLocalStateSnapshot(loadGuestStateSnapshot() || deepClone(DEFAULT_STATE), currentLocalState);
        updateFirebaseMeta({
          enabled: true,
          hydrated: false,
          userUid: '',
          userEmail: '',
          lastError: ''
        });
        return;
      }
      if (previousUser && previousUser.uid && previousUser.uid !== firebaseCurrentUser.uid) {
        resetFirebaseRealtimeState();
      }
      var freshAccountMeta = consumeFreshFirebaseAccount(firebaseCurrentUser.uid);
      var pendingSignupName = String(firebasePendingSignupProfileName || '').trim();
      var nextState = freshAccountMeta
        ? buildFreshAccountState({
          displayName: freshAccountMeta.name || pendingSignupName || firebaseCurrentUser.displayName || ''
        })
        : (loadScopedStateForUser(firebaseCurrentUser.uid) || buildFreshAccountState({
          displayName: pendingSignupName || firebaseCurrentUser.displayName || ''
        }));
      nextState = mergeAuthProfileIntoState(nextState, firebaseCurrentUser);
      if (pendingSignupName && (!nextState.profile.name || nextState.profile.name === DEFAULT_STATE.profile.name)) {
        nextState.profile.name = pendingSignupName;
      }
      replaceLocalStateSnapshot(nextState, currentLocalState);
      if (pendingSignupName) firebasePendingSignupProfileName = '';
      activateFirebaseForCurrentUser().catch(function (err) {
        firebaseLastError = String((err && err.message) || err || 'firebase_user_sync_failed');
        updateFirebaseMeta({ enabled: true, hydrated: false, lastError: firebaseLastError });
      });
    });
  }

  function initFirebaseSync() {
    var config = getFirebaseRuntimeConfig();
    if (!config) return Promise.resolve(null);
    if (firebaseReadyPromise) return firebaseReadyPromise;
    firebaseReadyPromise = Promise.resolve()
      .then(function () { return loadScript('https://www.gstatic.com/firebasejs/10.12.5/firebase-app-compat.js'); })
      .then(function () { return loadScript('https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore-compat.js'); })
      .then(function () { return loadScript('https://www.gstatic.com/firebasejs/10.12.5/firebase-auth-compat.js'); })
      .then(function () {
        if (!window.firebase || !window.firebase.initializeApp) throw new Error('firebase_unavailable');
        var appName = config.appName || 'soter-app';
        try {
          firebaseAppInstance = window.firebase.app(appName);
        } catch (err) {
          firebaseAppInstance = window.firebase.initializeApp({
            apiKey: config.apiKey,
            authDomain: config.authDomain,
            projectId: config.projectId,
            storageBucket: config.storageBucket,
            messagingSenderId: config.messagingSenderId,
            appId: config.appId
          }, appName);
        }
        firebaseDbInstance = firebaseAppInstance.firestore();
        firebaseAuthInstance = firebaseAppInstance.auth();
        ensureFirebaseAuthListener();
        updateFirebaseMeta({
          enabled: true,
          provider: 'firestore',
          projectId: config.projectId,
          lastError: ''
        });
        return true;
      })
      .catch(function (err) {
        firebaseLastError = String((err && err.message) || err || 'firebase_init_failed');
        updateFirebaseMeta({ enabled: false, hydrated: false, lastError: firebaseLastError });
        console.error('[SoterStorage] Falha ao iniciar Firebase:', err);
        throw err;
      });
    return firebaseReadyPromise;
  }

  function flushFirebaseSync() {
    if (!firebasePendingState) return Promise.resolve(null);
    return initFirebaseSync().then(function () {
      if (!firebaseDocRef) return null;
      if (firebaseSyncInFlight) return firebaseSyncInFlight;
      var payloadState = compactStateForStorage(firebasePendingState);
      firebasePendingState = null;
      firebaseSyncInFlight = firebaseDocRef.set({
        state: payloadState,
        updatedAt: new Date().toISOString(),
        source: location.pathname || 'site'
      }, { merge: true }).then(function () {
        firebaseLastSyncedAt = new Date().toISOString();
        firebaseLastError = '';
        updateFirebaseMeta({ enabled: true, hydrated: firebaseIsHydrated, lastSyncAt: firebaseLastSyncedAt, lastError: '' });
        return true;
      }).catch(function (err) {
        firebaseLastError = String((err && err.message) || err || 'firebase_sync_failed');
        updateFirebaseMeta({ enabled: true, hydrated: firebaseIsHydrated, lastError: firebaseLastError });
        console.error('[SoterStorage] Falha ao sincronizar com Firebase:', err);
        throw err;
      }).finally(function () {
        firebaseSyncInFlight = null;
        if (firebasePendingState) flushFirebaseSync();
      });
      return firebaseSyncInFlight;
    });
  }

  function queueFirebaseSync(state) {
    if (firebaseIsApplyingRemote) return;
    if (!getFirebaseRuntimeConfig()) return;
    firebasePendingState = compactStateForStorage(ensureStateShape(state));
    if (firebaseSyncTimer) clearTimeout(firebaseSyncTimer);
    firebaseSyncTimer = setTimeout(function () {
      firebaseSyncTimer = null;
      flushFirebaseSync().catch(function () { });
    }, 700);
  }

  function saveState(state) {
    var shaped = compactStateForStorage(ensureStateShape(state));
    persistStateSnapshot(shaped, { dispatchStatus: false });
    if (firebaseCurrentUser && firebaseCurrentUser.uid) {
      saveScopedStateForUser(firebaseCurrentUser.uid, shaped);
    } else {
      saveGuestStateSnapshot(shaped);
    }
    queueFirebaseSync(shaped);
  }

  function getInitials(name) {
    var cleaned = (name || "").trim();
    if (!cleaned) return "?";
    var parts = cleaned.split(/\s+/).slice(0, 2);
    return parts.map(function (p) { return p.charAt(0).toUpperCase(); }).join("");
  }

  var RPG_XP = {
    livroPagina: 0.09,
    livroConclusao: 18,
    livroReflexao: 8,
    cinemaFilme: 12,
    cinemaEpisodio: 4,
    cinemaConclusaoSerie: 10,
    cinemaDocumentario: 3,
    cinemaReflexao: 4,
    mangaCapitulo: 2.6,
    mangaConclusao: 9,
    mangaReflexao: 3,
    treinoDia: 18,
    treinoExercicio: 3,
    treinoMinuto: 0.18,
    treinoScore: 0.06,
    treinoStreak: 1.4,
    estudoHora: 15,
    estudoConclusao: 7,
    estudoRevisao: 5,
    revisaoCard: 1.15,
    revisaoDia: 3,
    revisaoStreak: 1.6,
    tarefaBaseBaixa: 5,
    tarefaBaseMedia: 10,
    tarefaBaseAlta: 16,
    tarefaPrazo: 5,
    sonhoBase: 2,
    sonhoMeta: 7,
    sonhoPlanejamento: 4,
    sonhoRealizado: 28,
    sonhoReserva: 2,
    sonhoReflexao: 5,
    viagem: 56,
    viagemPlanejada: 3,
    viagemNota: 5,
    financaTx: 1,
    financaSave: 3,
    financaRule: 8,
    financaConsistency: 10,
    wishlistItem: 1,
    wishlistAquisicao: 10,
    wishlistGrupo: 2,
    wishlistDetalhe: 2
  };

  var RPG_TITLES = [
    "Iniciante", "Aprendiz", "Explorador", "Aventureiro", "Viajante",
    "Veterano", "Especialista", "Mestre", "Gr\u00e3o-Mestre", "Lend\u00e1rio"
  ];

  var RPG_CLASSES = {
    initiate: { name: "Despertando", icon: "\u2726", bonus: "Sem especializa\u00e7\u00e3o fixa", passive: "Base neutra para construir sua rota." },
    scholar: { name: "S\u00e1bio", icon: "\uD83D\uDCDA", bonus: "Leitura, estudo e revis\u00e3o", passive: "+12% XP em Livraria, Estudo e Revis\u00e3o." },
    warrior: { name: "Guerreiro", icon: "\u2694", bonus: "Treino e disciplina", passive: "+14% XP em Academia e +6% em Tarefas." },
    explorer: { name: "Explorador", icon: "\uD83E\uDDED", bonus: "Expans\u00e3o de mundo", passive: "+14% XP em Viagens e +3% em Cinema." },
    artist: { name: "Artista", icon: "\uD83C\uDFA8", bonus: "Express\u00e3o e sensibilidade", passive: "+12% XP em Sonhos e +10% em Wishlist." },
    mage: { name: "Mago", icon: "\uD83D\uDD2E", bonus: "Mem\u00f3ria e precis\u00e3o mental", passive: "+14% XP em Revis\u00e3o e +10% em Estudo." },
    ranger: { name: "Ranger", icon: "\uD83C\uDFF9", bonus: "Versatilidade consistente", passive: "+8% XP em Tarefas, Academia e Viagens." }
  };

  var RPG_MISSION_XP = {
    m_leitura: 12,
    m_treino: 16,
    m_tarefa: 10,
    m_estudo: 14,
    m_sonho: 8,
    m_cinema: 10,
    m_manga: 9,
    m_wishlist: 6
  };

  var RPG_MAX_LEVEL = RPG_TITLES.length;
  var RPG_ATTR_MAX = 100;
  var RPG_SKILL_MAX = 10;
  var RPG_NOTIFICATION_LIMIT = 120;
  var RPG_DAILY_MISSION_COUNT = 4;
  var ABANDON_NOTIF_PREFIX = "tracker-abandon-";
  var BOOK_STREAK_NOTIF_ID = "tracker-reading-streak";
  var REVIEW_DUE_NOTIF_ID = "review-due";
  var REVIEW_STREAK_NOTIF_ID = "review-streak";
  var DREAM_NOTIF_PREFIX = "dream-";
  var TRAVEL_NOTIF_PREFIX = "travel-";
  var FINANCE_NOTIF_PREFIX = "finance-";
  var TASK_NOTIF_PREFIX = "task-";
  var GYM_NOTIF_ID = "gym-today";
  var ABANDON_RULES = { watch: 2, risk: 14, critical: 30 };
  var ABANDON_TRACKER_LABELS = { livros: "Livraria", cinema: "Cinema", mangas: "Mang\u00e1s" };
  var ABANDON_ACTIVE_STATUSES = {
    livros: { lendo: true, relendo: true },
    cinema: { assistindo: true, reassistindo: true },
    mangas: { lendo: true, relendo: true }
  };
  var ACH_STAGE_WORDS = [
    "da Fresta", "da Centelha", "da Vigilia", "do Atlas", "do Ritual",
    "do Folego", "da Mare", "da Cupula", "do Zenith", "da Lenda"
  ];
  var RPG_SKILL_DEFS = [
    {
      id: "reading",
      icon: "\uD83D\uDCD6",
      color: "#c8a96e",
      name: "Devorador de P\u00e1ginas",
      desc: "Aprimora leitura profunda e recompensa registro de qualidade.",
      utility: "+1,5% XP da Livraria por n\u00edvel e refor\u00e7o no b\u00f4nus de reflex\u00e3o.",
      reqLevel: 1,
      reqXP: 0,
      reqAch: null,
      getLevel: function (state) { return Math.min(RPG_SKILL_MAX, getCompletedBooksCount(state)); }
    },
    {
      id: "cinema",
      icon: "\uD83C\uDFAC",
      color: "#e8864a",
      name: "Olhos de Lince",
      desc: "Transforma curadoria audiovisual em progresso mais valioso.",
      utility: "+1,4% XP do Cinema por n\u00edvel e mais peso para notas e document\u00e1rios.",
      reqLevel: 1,
      reqXP: 0,
      reqAch: null,
      getLevel: function (state) { return Math.min(RPG_SKILL_MAX, getCinemaCompletedCount(state)); }
    },
    {
      id: "fitness",
      icon: "\uD83D\uDCAA",
      color: "#e06b8b",
      name: "Corpo de Ferro",
      desc: "Premia const\u00e2ncia real nos treinos programados.",
      utility: "+1,8% XP da Academia por n\u00edvel e escalada melhor de esfor\u00e7o.",
      reqLevel: 1,
      reqXP: 0,
      reqAch: null,
      getLevel: function (state) { return Math.min(RPG_SKILL_MAX, Math.floor(getGymCompletionStats(state).completedTrainingDays / 4)); }
    },
    {
      id: "study",
      icon: "\uD83E\uDDE0",
      color: "#4ab0e8",
      name: "Mente Afiada",
      desc: "Aumenta reten\u00e7\u00e3o, revis\u00e3o e horas de estudo de alto valor.",
      utility: "+1,6% XP em Estudo e Revis\u00e3o por n\u00edvel.",
      reqLevel: 2,
      reqXP: 50,
      reqAch: null,
      getLevel: function (state) {
        var reviewStats = getReviewStats(state);
        return Math.min(RPG_SKILL_MAX, Math.floor((getEstudosHoras(state) + (reviewStats.totalCards / 20)) / 4));
      }
    },
    {
      id: "travel",
      icon: "\u2708\uFE0F",
      color: "#5ec4a8",
      name: "Passaporte Dourado",
      desc: "D\u00e1 mais peso a destinos realmente conclu\u00eddos e vividos.",
      utility: "+2% XP de Viagens por n\u00edvel.",
      reqLevel: 3,
      reqXP: 100,
      reqAch: null,
      getLevel: function (state) { return Math.min(RPG_SKILL_MAX, getViagens(state).filter(isVisitedViagem).length * 2); }
    },
    {
      id: "dreams",
      icon: "\uD83C\uDF19",
      color: "#7c6fcd",
      name: "Arquiteto dos Sonhos",
      desc: "Valoriza planos densos, reflex\u00e3o e sonhos concretizados.",
      utility: "+1,5% XP em Sonhos por n\u00edvel e leve refor\u00e7o na Wishlist.",
      reqLevel: 4,
      reqXP: 150,
      reqAch: "dreamer",
      getLevel: function (state) {
        return Math.min(RPG_SKILL_MAX, Math.floor((getDreamsWithPlanCount(state) + getDreamsCompletedCount(state)) / 2));
      }
    },
    {
      id: "planning",
      icon: "\uD83D\uDCCB",
      color: "#5ec4a8",
      name: "Estrategista",
      desc: "Converte organiza\u00e7\u00e3o e execu\u00e7\u00e3o limpa em vantagem real.",
      utility: "+1,8% XP em Tarefas por n\u00edvel e +0,6% em Finan\u00e7as.",
      reqLevel: 5,
      reqXP: 200,
      reqAch: "taskmaster",
      getLevel: function (state) { return Math.min(RPG_SKILL_MAX, Math.floor(getTaskCompletedCount(state) / 4)); }
    },
    {
      id: "manga",
      icon: "\uD83D\uDCDA",
      color: "#e06b8b",
      name: "Esp\u00edrito Otaku",
      desc: "Valoriza cad\u00eancia, conclus\u00e3o e curadoria de mang\u00e1s.",
      utility: "+1,6% XP de Mang\u00e1s por n\u00edvel.",
      reqLevel: 6,
      reqXP: 250,
      reqAch: "manga_fan",
      getLevel: function (state) { return Math.min(RPG_SKILL_MAX, getCompletedMangasCount(state)); }
    }
  ];

  function ensureRpgShape(state) {
    state = ensureStateShape(state);
    if (!state.data.rpg || typeof state.data.rpg !== "object") state.data.rpg = {};
    if (!state.data.rpg.classe) state.data.rpg.classe = "initiate";
    if (!state.data.rpg.missions || typeof state.data.rpg.missions !== "object") state.data.rpg.missions = {};
    if (!state.data.rpg.missionRewards || typeof state.data.rpg.missionRewards !== "object") state.data.rpg.missionRewards = {};
    if (!Array.isArray(state.data.rpg.log)) state.data.rpg.log = [];
    return state;
  }

  function pickArray(data, keys) {
    var i;
    for (i = 0; i < keys.length; i += 1) {
      if (Array.isArray(data[keys[i]])) return data[keys[i]];
    }
    return [];
  }

  function getLivros(state) { return pickArray(state.data, ["trackerLivraria", "trackerLivros", "livros", "livraria"]); }
  function getCinema(state) { return pickArray(state.data, ["trackerCinema", "trackerFilmes", "trackerSeries", "cinema", "filmes"]); }
  function getMangas(state) { return pickArray(state.data, ["trackerMangas", "trackerManga", "mangas"]); }
  function getTasks(state) { return pickArray(state.data, ["tasks", "tarefas"]); }
  function getGym(state) { return pickArray(state.data, ["academia", "gym", "treinos", "workouts"]); }
  function getEstudos(state) { return pickArray(state.data, ["estudos"]); }
  function getViagens(state) { return pickArray(state.data, ["viagens", "travels"]); }
  function getWishlist(state) {
    var data = state.data || {};
    if (data.wishlistTracker && Array.isArray(data.wishlistTracker.items)) return data.wishlistTracker.items;
    return pickArray(data, ["wishlist"]);
  }
  function getWishlistHistory(state) {
    var data = state.data || {};
    if (data.wishlistTracker && Array.isArray(data.wishlistTracker.acquisitionHistory)) return data.wishlistTracker.acquisitionHistory;
    return Array.isArray(data.wishlistHistory) ? data.wishlistHistory : [];
  }
  function getWishlistGroups(state) {
    var data = state.data || {};
    if (data.wishlistTracker && Array.isArray(data.wishlistTracker.listGroups)) return data.wishlistTracker.listGroups;
    return [];
  }
  function getWishlistGoal(state) {
    var data = state.data || {};
    if (data.wishlistTracker && data.wishlistTracker.goal && typeof data.wishlistTracker.goal === "object") return data.wishlistTracker.goal;
    if (data.wishlistGoal && typeof data.wishlistGoal === "object") return data.wishlistGoal;
    return { saved: 0, goal: 0 };
  }

  function getSonhos(state) {
    var data = state.data || {};
    if (data.sonhosHub && Array.isArray(data.sonhosHub.sonhos)) return data.sonhosHub.sonhos;
    return pickArray(data, ["sonhos"]);
  }

  function norm(v) {
    return String(v == null ? "" : v).trim().toLowerCase();
  }
  function num(v) {
    var parsed = Number(v);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  function hasMeaningfulText(v) {
    return String(v || "").trim().length >= 12;
  }
  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }
  function clampProgress(current, total) {
    var safeCurrent = Math.max(0, num(current));
    var safeTotal = Math.max(0, num(total));
    if (!safeTotal) return safeCurrent;
    return Math.min(safeCurrent, safeTotal);
  }
  function scaleTo100(value, target) {
    if (!target) return 0;
    return clamp(Math.round(value / target * 100), 0, 100);
  }

  function isDoneLivro(item) { return item && norm(item.status) === "concluido"; }
  function isDoneCinema(item) { return item && norm(item.status) === "concluido"; }
  function isDoneManga(item) { return item && norm(item.status) === "concluido"; }
  function isDoneTask(item) { return !!(item && item.done); }
  function isVisitedViagem(item) { return ["feito", "feita", "visitado", "visitada", "concluido", "concluida"].indexOf(norm(item && item.status)) >= 0; }
  function isDoneDream(item) { return !!(item && item.realizado); }
  function getEstudosHoras(state) {
    return getEstudos(state).reduce(function (acc, item) {
      return acc + Number(item && item.horas || 0);
    }, 0);
  }
  function getLivroPagesRead(item) {
    if (!item) return 0;
    var total = num(item.paginas);
    var current = num(item.atual);
    if (isDoneLivro(item) && total > 0) return total;
    return clampProgress(current, total);
  }
  function getLivroReflectionBonus(item) {
    var bonus = 0;
    if (hasMeaningfulText(item && (item.obs || item.notas || item.resenha))) bonus += RPG_XP.livroReflexao;
    if (num(item && item.nota) > 0) bonus += 2;
    return bonus;
  }
  function getMangaChaptersRead(item) {
    if (!item) return 0;
    var total = num(item.capTotal);
    var current = num(item.capAtual);
    if (isDoneManga(item) && total > 0) return total;
    return clampProgress(current, total);
  }
  function getMangaReflectionBonus(item) {
    var bonus = 0;
    if (hasMeaningfulText(item && (item.obs || item.notas))) bonus += RPG_XP.mangaReflexao;
    if (num(item && item.nota) > 0) bonus += 1;
    return bonus;
  }
  function isSeriesType(item) {
    var kind = norm(item && item.tipo);
    return kind === "serie" || kind === "s?rie" || kind.indexOf("serie") >= 0;
  }
  function isDocumentaryType(item) {
    return norm(item && item.tipo).indexOf("document") >= 0;
  }
  function getCinemaUnits(item) {
    if (!item) return 0;
    if (isSeriesType(item)) {
      var epTotal = num(item.episodioTotal);
      var epAtual = num(item.episodioAtual);
      if (isDoneCinema(item) && epTotal > 0) return epTotal;
      if (epTotal > 0 || epAtual > 0) return clampProgress(epAtual, epTotal);
      var tempTotal = num(item.temporadaTotal);
      var tempAtual = num(item.temporadaAtual);
      if (isDoneCinema(item) && tempTotal > 0) return tempTotal;
      return clampProgress(tempAtual, tempTotal);
    }
    return isDoneCinema(item) ? 1 : 0;
  }
  function getCinemaReflectionBonus(item) {
    var bonus = 0;
    if (hasMeaningfulText(item && (item.obs || item.notas || item.review))) bonus += RPG_XP.cinemaReflexao;
    if (isDocumentaryType(item)) bonus += RPG_XP.cinemaDocumentario;
    if (num(item && item.nota) > 0) bonus += 1;
    return bonus;
  }
  function getTaskComplexity(task, tasks) {
    if (!task) return 0;
    var subtasks = Array.isArray(task.subtarefas) ? task.subtarefas.length : 0;
    var childTasks = (tasks || []).filter(function (item) { return item.parentId === task.id; }).length;
    var complexity = subtasks * 3 + childTasks * 6;
    if (task.parentId) complexity += 4;
    if (subtasks >= 3) complexity += 6;
    if (childTasks > 0) complexity += 8;
    return complexity;
  }
  function isTaskStrategic(task) {
    return norm(task && task.prior) === "alta" || hasMeaningfulText(task && task.nota);
  }
  function isTaskOnTime(task) {
    if (!task || !task.done) return false;
    if (!task.data) return true;
    var doneAt = task.doneAt || task.updatedAt || new Date().toISOString();
    return String(doneAt).slice(0, 10) <= String(task.data).slice(0, 10);
  }
  function countDreamGoalsDone(dream) {
    return Array.isArray(dream && dream.metas) ? dream.metas.filter(function (meta) { return !!meta.feita; }).length : 0;
  }
  function hasDreamPlanning(dream) {
    return hasMeaningfulText(dream && dream.desc) ||
      hasMeaningfulText(dream && dream.intencao) ||
      !!(dream && (dream.dataInicio || dream.dataFim));
  }
  function getDreamFinanceHistoryCount(dream) {
    return Array.isArray(dream && dream.financeHistory) ? dream.financeHistory.length : 0;
  }
  function getSavingsTxValue(txs) {
    return (txs || []).reduce(function (acc, tx) {
      return acc + (tx && tx.type === "save" ? num(tx.value) : 0);
    }, 0);
  }
  function countMeaningfulWishlistItems(items) {
    return (items || []).filter(function (item) {
      return !!(item && (item.price || item.link || hasMeaningfulText(item.notes || item.notas)));
    }).length;
  }

  function countItemsWithText(items, fields) {
    return (items || []).filter(function (item) {
      return fields.some(function (field) {
        var value = item && item[field];
        if (Array.isArray(value)) return value.join(" ").trim().length > 0;
        return String(value || "").trim().length > 0;
      });
    }).length;
  }

  function countItemsWithRating(items) {
    return (items || []).filter(function (item) {
      return num(item && (item.nota || item.rating || item.score)) > 0;
    }).length;
  }

  function countItemsWithFavorite(items) {
    return (items || []).filter(function (item) { return !!(item && item.fav); }).length;
  }

  function countDistinctValues(items, fields) {
    var seen = {};
    (items || []).forEach(function (item) {
      fields.forEach(function (field) {
        var value = item && item[field];
        if (Array.isArray(value)) {
          value.forEach(function (entry) {
            var normalized = norm(entry);
            if (normalized) seen[normalized] = true;
          });
          return;
        }
        var normalized = norm(value);
        if (normalized) seen[normalized] = true;
      });
    });
    return Object.keys(seen).length;
  }

  function reqLabel(value, singular, plural) {
    return value + " " + (value === 1 ? singular : plural);
  }

  function arcNames(prefix) {
    return ACH_STAGE_WORDS.map(function (label) { return prefix + " " + label; });
  }

  function getFavoritosCount(state) {
    return getLivros(state).concat(getCinema(state), getMangas(state)).filter(function (item) { return !!item.fav; }).length;
  }

  function getCompletedBooksCount(state) {
    return getLivros(state).filter(isDoneLivro).length;
  }

  function getReadPagesTotal(state) {
    return getLivros(state).reduce(function (acc, item) { return acc + getLivroPagesRead(item); }, 0);
  }

  function getBooksWithNotesCount(state) {
    return countItemsWithText(getLivros(state), ["obs", "notas", "resenha"]);
  }

  function getRatedBooksCount(state) {
    return countItemsWithRating(getLivros(state));
  }

  function getFavoriteBooksCount(state) {
    return countItemsWithFavorite(getLivros(state));
  }

  function getCinemaEntriesCount(state) {
    return getCinema(state).length;
  }

  function getCinemaCompletedCount(state) {
    return getCinema(state).filter(isDoneCinema).length;
  }

  function getCinemaUnitsTotal(state) {
    return getCinema(state).reduce(function (acc, item) { return acc + getCinemaUnits(item); }, 0);
  }

  function getCinemaRatedCount(state) {
    return countItemsWithRating(getCinema(state));
  }

  function getCinemaFavoriteCount(state) {
    return countItemsWithFavorite(getCinema(state));
  }

  function getGymMinutesTotal(state) {
    return getGym(state).reduce(function (acc, item) {
      var direct = num(item && (item.minutos || item.duracao || item.tempo));
      var hours = num(item && item.horas) * 60;
      return acc + Math.max(direct, hours);
    }, 0);
  }

  function getGymTypeDiversityCount(state) {
    return countDistinctValues(getGym(state), ["tipo", "categoria", "nome", "modalidade"]);
  }

  function getGymDetailedCount(state) {
    return getGym(state).filter(function (item) {
      var filled = 0;
      ["tipo", "categoria", "obs", "descricao", "peso", "carga", "series", "reps", "minutos", "duracao", "tempo", "distancia"].forEach(function (field) {
        if (item && item[field] != null && String(item[field]).trim() !== "" && String(item[field]) !== "0") filled += 1;
      });
      return filled >= 2;
    }).length;
  }

  function getGymEffortScore(state) {
    return Math.round(getGym(state).reduce(function (acc, item) {
      return acc +
        num(item && (item.minutos || item.duracao || item.tempo)) +
        (num(item && item.horas) * 60) +
        num(item && item.reps) +
        (num(item && item.series) * 5) +
        Math.round(num(item && (item.peso || item.carga)) / 5) +
        Math.round(num(item && item.distancia) * 10);
    }, 0));
  }

  function getStudySessionsCount(state) {
    return getEstudos(state).length;
  }

  function getStudySubjectCount(state) {
    return countDistinctValues(getEstudos(state), ["materia", "disciplina", "tema", "assunto"]);
  }

  function getStudyNotesCount(state) {
    return countItemsWithText(getEstudos(state), ["obs", "resumo", "notas", "descricao", "comentario"]);
  }

  function getStudyLongSessionsCount(state) {
    return getEstudos(state).filter(function (item) { return num(item && item.horas) >= 2; }).length;
  }

  function getDreamsWithPlanCount(state) {
    return countItemsWithText(getSonhos(state), ["metas", "objetivos", "etapas", "plano", "proximosPassos"]);
  }

  function getDreamsCompletedCount(state) {
    return getSonhos(state).filter(isDoneDream).length;
  }

  function getDreamsReflectionCount(state) {
    return countItemsWithText(getSonhos(state), ["obs", "notas", "motivo", "porque", "reflexao", "descricao"]);
  }

  function getDreamCategoryCount(state) {
    return countDistinctValues(getSonhos(state), ["categoria", "tipo", "area", "tag", "tags"]);
  }

  function getTripNotesCount(state) {
    return countItemsWithText(getViagens(state), ["obs", "descricao", "roteiro", "notas"]);
  }

  function getPlannedTripsCount(state) {
    return getViagens(state).filter(function (item) { return !isVisitedViagem(item); }).length;
  }

  function getUniqueTripDestinationsCount(state) {
    return countDistinctValues(getViagens(state), ["dest", "destino", "local", "cidade", "pais"]);
  }

  function getCompletedMangasCount(state) {
    return getMangas(state).filter(isDoneManga).length;
  }

  function getMangaChaptersTotal(state) {
    return getMangas(state).reduce(function (acc, item) { return acc + getMangaChaptersRead(item); }, 0);
  }

  function getMangaEntriesCount(state) {
    return getMangas(state).length;
  }

  function getMangaRatedCount(state) {
    return countItemsWithRating(getMangas(state));
  }

  function getMangaFavoriteCount(state) {
    return countItemsWithFavorite(getMangas(state));
  }

  function getTaskCompletedCount(state) {
    return getTasks(state).filter(isDoneTask).length;
  }

  function getTaskTotalCount(state) {
    return getTasks(state).length;
  }

  function isHighPriorityEntry(item) {
    var priority = norm(item && (item.prior || item.prioridade));
    return priority === "alta" || priority === "high" || priority === "urgent";
  }

  function getHighPriorityTasksDoneCount(state) {
    return getTasks(state).filter(function (task) { return isDoneTask(task) && isHighPriorityEntry(task); }).length;
  }

  function getComplexTasksDoneCount(state) {
    var tasks = getTasks(state);
    return tasks.filter(function (task) { return isDoneTask(task) && getTaskComplexity(task, tasks) >= 10; }).length;
  }

  function getSubtasksTotalCount(state) {
    return getTasks(state).reduce(function (acc, task) {
      return acc + (Array.isArray(task && task.subtarefas) ? task.subtarefas.length : 0);
    }, 0);
  }

  function getLibraryEntriesCount(state) {
    return getLivros(state).length + getCinema(state).length + getMangas(state).length;
  }

  function getCompletedMediaCount(state) {
    return getCompletedBooksCount(state) + getCinemaCompletedCount(state) + getCompletedMangasCount(state);
  }

  function getAllRatedCount(state) {
    return countItemsWithRating(getLivros(state)) + countItemsWithRating(getCinema(state)) + countItemsWithRating(getMangas(state));
  }

  function getAllNotedCount(state) {
    return countItemsWithText(getLivros(state), ["obs", "notas", "resenha"]) +
      countItemsWithText(getCinema(state), ["obs", "notas", "review", "comentario"]) +
      countItemsWithText(getMangas(state), ["obs", "notas", "review", "comentario"]);
  }

  function getWishlistPriorityCount(state) {
    return getWishlist(state).filter(isHighPriorityEntry).length;
  }

  function getWishlistPricedCount(state) {
    return getWishlist(state).filter(function (item) {
      return num(item && (item.preco || item.valor || item.price)) > 0;
    }).length;
  }

  function getWishlistCategorizedCount(state) {
    return getWishlist(state).filter(function (item) {
      return !!(item && (item.categoria || item.tipo || item.grupo || item.tag));
    }).length;
  }

  function isAcquiredWishlist(item) {
    var status = norm(item && item.status);
    return status.indexOf("compr") >= 0 || status.indexOf("obt") >= 0 || status.indexOf("done") >= 0 || status.indexOf("concl") >= 0;
  }

  function getWishlistAcquiredCount(state) {
    return getWishlist(state).filter(isAcquiredWishlist).length;
  }

  function isDoneStudyItem(item) {
    if (!item || typeof item !== "object") return false;
    if (item.done || item.completed || item.concluida || item.concluido || item.revisado) return true;
    if (Number(item.progress || item.progresso || 0) >= 100) return true;
    return ["concluido", "concluida", "feito", "feita", "completed", "done", "revisado", "revisada"].indexOf(norm(item.status)) >= 0;
  }

  function ensureNotificationArray(state) {
    if (!state.data || typeof state.data !== "object") state.data = {};
    if (!Array.isArray(state.data.notifications)) state.data.notifications = [];
    return state.data.notifications;
  }

  function ensureNotificationDismissals(state) {
    if (!state.data || typeof state.data !== "object") state.data = {};
    if (!state.data.notificationDismissals || typeof state.data.notificationDismissals !== "object") {
      state.data.notificationDismissals = loadNotificationDismissalsSnapshot();
    }
    return state.data.notificationDismissals;
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function normalizeNotification(raw, fallback) {
    var source = raw && typeof raw === "object" ? raw : { text: String(raw || "") };
    var defaults = fallback || {};
    return {
      id: source.id != null ? source.id : (defaults.id != null ? defaults.id : Date.now() + Math.floor(Math.random() * 1000)),
      text: String(source.text || defaults.text || ""),
      icon: String(source.icon || defaults.icon || "\ud83d\udd14"),
      label: String(source.label || defaults.label || "Sistema"),
      tone: String(source.tone || defaults.tone || "info"),
      cycle: String(source.cycle || defaults.cycle || "persist"),
      href: String(source.href || defaults.href || "")
    };
  }

  function createNotification(id, text, meta) {
    return normalizeNotification(Object.assign({ id: id, text: text }, meta || {}));
  }

  function isNotificationDismissed(state, notification) {
    var dismissals = ensureNotificationDismissals(state);
    var normalized = normalizeNotification(notification);
    return dismissals[String(normalized.id)] === String(normalized.cycle);
  }

  function dismissNotification(state, notification) {
    var dismissals = ensureNotificationDismissals(state);
    var normalized = normalizeNotification(notification);
    dismissals[String(normalized.id)] = String(normalized.cycle);
    saveNotificationDismissalsSnapshot(dismissals);
  }

  function clearNotificationDismissal(state, notification) {
    var dismissals = ensureNotificationDismissals(state);
    var normalized = normalizeNotification(notification);
    if (dismissals[String(normalized.id)] === String(normalized.cycle)) {
      delete dismissals[String(normalized.id)];
      saveNotificationDismissalsSnapshot(dismissals);
    }
  }

  function filterDismissedNotifications(state, notifications) {
    return (notifications || []).map(function (notification) {
      return normalizeNotification(notification);
    }).filter(function (notification) {
      return !isNotificationDismissed(state, notification);
    });
  }

  function getNotificationCycleDate(date) {
    return getRpgDailyCycleDate(date);
  }

  function parseTaskClockMinutes(value) {
    var match = String(value || "").trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return null;
    var hours = Number(match[1]);
    var minutes = Number(match[2]);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
    return hours * 60 + minutes;
  }

  function supportsDesktopTaskNotifications() {
    return typeof window !== "undefined" && typeof window.Notification === "function";
  }

  function hasTimedTasksForToday(state) {
    var today = getNotificationCycleDate();
    return getTasks(state).some(function (task) {
      return !!task &&
        !task.done &&
        String(task.data || "").slice(0, 10) === String(today) &&
        parseTaskClockMinutes(task.hora) !== null;
    });
  }

  function requestTaskReminderPermission() {
    if (!supportsDesktopTaskNotifications()) return;
    if (window.Notification.permission !== "default") return;
    try {
      Promise.resolve(window.Notification.requestPermission()).then(function () {
        checkTaskTimeReminders();
      }).catch(function () { });
    } catch (err) { }
  }

  function ensureTaskReminderPermissionPrompt() {
    if (taskReminderPermissionBound || !supportsDesktopTaskNotifications()) return;
    if (window.Notification.permission !== "default") return;
    if (!hasTimedTasksForToday(ensureStateShape(loadState()))) return;
    var onInteract = function () {
      window.removeEventListener("pointerdown", onInteract, true);
      window.removeEventListener("keydown", onInteract, true);
      taskReminderPermissionBound = false;
      requestTaskReminderPermission();
    };
    taskReminderPermissionBound = true;
    window.addEventListener("pointerdown", onInteract, true);
    window.addEventListener("keydown", onInteract, true);
  }

  function buildTaskReminderBody(task) {
    var bits = [];
    if (task && task.hora) bits.push("Agora às " + String(task.hora).slice(0, 5));
    if (task && task.cat) bits.push(task.cat);
    return bits.join(" • ") || "Tarefa agendada para agora.";
  }

  function checkTaskTimeReminders() {
    if (!supportsDesktopTaskNotifications()) return;
    ensureTaskReminderPermissionPrompt();
    if (window.Notification.permission !== "granted") return;

    var now = new Date();
    var nowMs = now.getTime();
    var today = getNotificationCycleDate(now);
    var state = ensureStateShape(loadState());
    var snapshot = pruneTaskTimeAlertsSnapshot(loadTaskTimeAlertsSnapshot(), nowMs);
    var alerts = snapshot.alerts;
    var changed = snapshot.changed;

    getTasks(state).forEach(function (task) {
      if (!task || task.done) return;
      if (String(task.data || "").slice(0, 10) !== String(today)) return;
      if (parseTaskClockMinutes(task.hora) === null) return;

      var triggerAt = Date.parse(String(today) + "T" + String(task.hora).slice(0, 5) + ":00");
      if (!Number.isFinite(triggerAt)) return;
      if (nowMs < triggerAt || nowMs - triggerAt > 90000) return;

      var key = [task.id, today, String(task.hora).slice(0, 5)].join("|");
      if (alerts[key]) return;

      alerts[key] = nowMs;
      changed = true;

      try {
        var notification = new window.Notification("Hora da tarefa: " + String(task.nome || "Tarefa"), {
          body: buildTaskReminderBody(task),
          tag: "task-time-" + String(task.id),
          renotify: false
        });
        notification.onclick = function () {
          try { window.focus(); } catch (err) { }
          if (currentPage() !== "tarefas") window.location.href = "tarefas.html";
        };
      } catch (err) { }
    });

    if (changed) saveTaskTimeAlertsSnapshot(alerts);
  }

  function getIsoToday() {
    return new Date().toISOString().slice(0, 10);
  }

  function getLocalIsoDate(date) {
    var value = date instanceof Date ? date : new Date(date || Date.now());
    return [
      value.getFullYear(),
      String(value.getMonth() + 1).padStart(2, "0"),
      String(value.getDate()).padStart(2, "0")
    ].join("-");
  }

  function getRpgDailyCycleDate(date) {
    var now = date instanceof Date ? new Date(date.getTime()) : new Date(date || Date.now());
    var effective = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (now.getHours() === 0 && now.getMinutes() < 1) effective.setDate(effective.getDate() - 1);
    return getLocalIsoDate(effective);
  }

  function getReviewPlanner(state) {
    var planner = state && state.data && state.data.revisaoPlanner && typeof state.data.revisaoPlanner === "object"
      ? state.data.revisaoPlanner
      : {};
    return {
      decks: Array.isArray(planner.decks) ? planner.decks : [],
      cards: Array.isArray(planner.cards) ? planner.cards : [],
      log: planner.log && typeof planner.log === "object" ? planner.log : {},
      doneByDate: planner.doneByDate && typeof planner.doneByDate === "object" ? planner.doneByDate : {}
    };
  }

  function getReviewDueNotificationCount(state) {
    var planner = getReviewPlanner(state);
    var today = getNotificationCycleDate();
    var due = planner.cards.filter(function (card) { return card && card.nextDue && card.nextDue <= today; }).length;
    var fresh = planner.cards.filter(function (card) { return !card || !card.nextDue || card.nextDue === ""; }).length;
    return due + Math.min(fresh, 20);
  }

  function getReviewHeatmapStreakInfo(state) {
    var planner = getReviewPlanner(state);
    var todayKey = getNotificationCycleDate();
    var active = {};
    var cursor = new Date(todayKey + "T00:00:00");
    var cutoff = new Date(todayKey + "T00:00:00");
    var streak = 0;

    cutoff.setDate(cutoff.getDate() - 90);
    Object.keys(planner.log).forEach(function (day) {
      if (!planner.log[day] || planner.log[day] <= 0) return;
      var parsed = new Date(day + "T00:00:00");
      if (parsed < cutoff) return;
      active[day] = true;
    });

    while (active[getLocalIsoDate(cursor)]) {
      streak += 1;
      cursor.setDate(cursor.getDate() - 1);
      if (cursor < cutoff) break;
    }

    if (!streak) {
      cursor = new Date(todayKey + "T00:00:00");
      cursor.setDate(cursor.getDate() - 1);
      while (active[getLocalIsoDate(cursor)]) {
        streak += 1;
        cursor.setDate(cursor.getDate() - 1);
        if (cursor < cutoff) break;
      }
    }

    return {
      streak: streak,
      todayDone: !!active[todayKey],
      shouldNotify: streak >= 2
    };
  }

  function diffFromToday(dateStr) {
    if (!dateStr) return null;
    var date = new Date(String(dateStr).slice(0, 10) + "T00:00:00");
    if (isNaN(date)) return null;
    var today = new Date(getNotificationCycleDate() + "T00:00:00");
    return Math.round((date - today) / 86400000);
  }

  function getDreamFinanceInfo(dream) {
    var base = num(dream && dream.acumulado);
    var target = num(dream && dream.custo);
    var history = Array.isArray(dream && dream.financeHistory) ? dream.financeHistory : [];
    var deposits = history.reduce(function (acc, item) { return acc + num(item && item.valor); }, 0);
    return {
      target: target,
      current: base + deposits
    };
  }

  function getTaskCreatedDay(task) {
    if (task && task.createdAt) return String(task.createdAt).slice(0, 10);
    if (task && typeof task.id === "number" && Number.isFinite(task.id)) return new Date(task.id).toISOString().slice(0, 10);
    return getNotificationCycleDate();
  }

  function countTasksWithoutDate(state) {
    return getTasks(state).filter(function (task) {
      return !!task && !task.done && !task.data;
    }).length;
  }

  function countTasksDueSoon(state, today) {
    return getTasks(state).filter(function (task) {
      var diff;
      if (!task || task.done || !task.data) return false;
      diff = diffFromToday(task.data);
      return diff != null && diff >= 1 && diff <= 3;
    }).length;
  }

  function countOverdueTasks(state, today) {
    return getTasks(state).filter(function (task) {
      return !!task && !task.done && task.data && String(task.data).slice(0, 10) < String(today);
    }).length;
  }

  function getDreamDeadlineCounts(state) {
    var counts = { soon: 0, overdue: 0 };
    getSonhos(state).forEach(function (dream) {
      var diff;
      if (!dream || dream.realizado || !dream.dataFim) return;
      diff = diffFromToday(dream.dataFim);
      if (diff == null) return;
      if (diff < 0) counts.overdue += 1;
      else if (diff <= 7) counts.soon += 1;
    });
    return counts;
  }

  function getTravelDeadlineCounts(state) {
    var counts = { soon: 0, overdue: 0 };
    getViagens(state).forEach(function (trip) {
      var startDate = trip && (trip.startDate || trip.dataInicio || trip.start || "");
      var diff;
      if (!startDate || isVisitedViagem(trip)) return;
      diff = diffFromToday(startDate);
      if (diff == null) return;
      if (diff < 0) counts.overdue += 1;
      else if (diff <= 7) counts.soon += 1;
    });
    return counts;
  }

  function getFinanceDebitCounts(state, today) {
    var counts = { dueOut: 0, dueIn: 0 };
    (getFinanceTxs(state) || []).forEach(function (tx) {
      if (!tx || !tx.date) return;
      if (String(tx.date).slice(0, 10) !== String(today)) return;
      if (tx.type === "out" || tx.type === "save") counts.dueOut += 1;
      if (tx.type === "in") counts.dueIn += 1;
    });
    financeRuleOccurrencesUntil(getFinanceRules(state), today).forEach(function (tx) {
      if (!tx || String(tx.date).slice(0, 10) !== String(today)) return;
      if (tx.type === "out" || tx.type === "save") counts.dueOut += 1;
      if (tx.type === "in") counts.dueIn += 1;
    });
    return counts;
  }

  function syncDomainNotifications(state) {
    var notifications = ensureNotificationArray(state).filter(function (notification) {
      var id = String(notification && notification.id || "");
      return id.indexOf(DREAM_NOTIF_PREFIX) !== 0 &&
        id.indexOf(TRAVEL_NOTIF_PREFIX) !== 0 &&
        id.indexOf(FINANCE_NOTIF_PREFIX) !== 0 &&
        id.indexOf(TASK_NOTIF_PREFIX) !== 0 &&
        id !== GYM_NOTIF_ID;
    });
    var today = getNotificationCycleDate();
    var dreamCounts = getDreamDeadlineCounts(state);
    var travelCounts = getTravelDeadlineCounts(state);
    var financeCounts = getFinanceDebitCounts(state, today);
    var tasksTodayCount = getTasks(state).filter(function (task) {
      return !!task && !task.done && String(task.data || "").slice(0, 10) === String(today);
    }).length;
    var tasksSoonCount = countTasksDueSoon(state, today);
    var tasksOverdueCount = countOverdueTasks(state, today);
    var tasksWithoutDateCount = countTasksWithoutDate(state);

    if (dreamCounts.overdue > 0) {
      notifications.unshift(createNotification(
        DREAM_NOTIF_PREFIX + "overdue",
        "Sonhos: " + dreamCounts.overdue + " prazo" + (dreamCounts.overdue === 1 ? " venceu." : "s venceram."),
        { icon: "\uD83C\uDF19", label: "Sonhos", tone: "danger", cycle: today, href: "sonhos.html" }
      ));
    }
    if (dreamCounts.soon > 0) {
      notifications.unshift(createNotification(
        DREAM_NOTIF_PREFIX + "soon",
        "Sonhos: " + dreamCounts.soon + " prazo" + (dreamCounts.soon === 1 ? " est\u00e1 pr\u00f3ximo." : "s est\u00e3o pr\u00f3ximos."),
        { icon: "\uD83C\uDF19", label: "Sonhos", tone: "dream", cycle: today, href: "sonhos.html" }
      ));
    }

    if (travelCounts.overdue > 0) {
      notifications.unshift(createNotification(
        TRAVEL_NOTIF_PREFIX + "overdue",
        "Viagens: " + travelCounts.overdue + " data" + (travelCounts.overdue === 1 ? " passou sem conclus\u00e3o." : "s passaram sem conclus\u00e3o."),
        { icon: "\u2708\uFE0F", label: "Viagens", tone: "danger", cycle: today, href: "viagens.html" }
      ));
    }
    if (travelCounts.soon > 0) {
      notifications.unshift(createNotification(
        TRAVEL_NOTIF_PREFIX + "soon",
        "Viagens: " + travelCounts.soon + " data" + (travelCounts.soon === 1 ? " est\u00e1 pr\u00f3xima." : "s est\u00e3o pr\u00f3ximas."),
        { icon: "\u2708\uFE0F", label: "Viagens", tone: "travel", cycle: today, href: "viagens.html" }
      ));
    }

    if (financeCounts.dueOut > 0) {
      notifications.unshift(createNotification(
        FINANCE_NOTIF_PREFIX + "debit-out",
        "Finan\u00e7as: " + financeCounts.dueOut + " sa\u00edda" + (financeCounts.dueOut === 1 ? " agendada foi debitada hoje." : "s agendadas foram debitadas hoje."),
        { icon: "\uD83D\uDCE4", label: "Finan\u00e7as", tone: "money", cycle: today, href: "financas.html" }
      ));
    }
    if (financeCounts.dueIn > 0) {
      notifications.unshift(createNotification(
        FINANCE_NOTIF_PREFIX + "debit-in",
        "Finan\u00e7as: " + financeCounts.dueIn + " entrada" + (financeCounts.dueIn === 1 ? " agendada caiu hoje." : "s agendadas ca\u00edram hoje."),
        { icon: "\uD83D\uDCB0", label: "Finan\u00e7as", tone: "money", cycle: today, href: "financas.html" }
      ));
    }

    if (tasksOverdueCount > 0) {
      notifications.unshift(createNotification(
        TASK_NOTIF_PREFIX + "overdue",
        "Planejamento: " + tasksOverdueCount + " tarefa" + (tasksOverdueCount === 1 ? " est\u00e1 vencida." : "s est\u00e3o vencidas."),
        { icon: "\u23F0", label: "Planejamento", tone: "danger", cycle: today, href: "tarefas.html" }
      ));
    }
    if (tasksTodayCount > 0) {
      notifications.unshift(createNotification(
        TASK_NOTIF_PREFIX + "today",
        "Planejamento: " + tasksTodayCount + " tarefa" + (tasksTodayCount === 1 ? " \u00e9 para hoje." : "s s\u00e3o para hoje."),
        { icon: "\uD83D\uDDD3\uFE0F", label: "Planejamento", tone: "plan", cycle: today, href: "tarefas.html" }
      ));
    }
    if (tasksSoonCount > 0) {
      notifications.unshift(createNotification(
        TASK_NOTIF_PREFIX + "soon",
        "Planejamento: " + tasksSoonCount + " prazo" + (tasksSoonCount === 1 ? " est\u00e1 chegando." : "s est\u00e3o chegando."),
        { icon: "\u231B", label: "Planejamento", tone: "warn", cycle: today, href: "tarefas.html" }
      ));
    }
    if (tasksWithoutDateCount > 0) {
      notifications.unshift(createNotification(
        TASK_NOTIF_PREFIX + "nodate",
        "Planejamento: " + tasksWithoutDateCount + " tarefa" + (tasksWithoutDateCount === 1 ? " segue sem data." : "s seguem sem data."),
        { icon: "\uD83D\uDCCC", label: "Planejamento", tone: "plan", cycle: today, href: "tarefas.html" }
      ));
    }

    (function () {
      var gymState = state && state.data && state.data.academiaTracker && typeof state.data.academiaTracker === "object" ? state.data.academiaTracker : null;
      var todayDate = new Date(today + "T00:00:00");
      if (!gymState || !gymState.profile || !Array.isArray(gymState.profile.trainDays)) return;
      if (gymState.profile.trainDays.map(Number).indexOf(todayDate.getDay()) === -1) return;
      notifications.unshift(createNotification(
        GYM_NOTIF_ID,
        "Academia: h\u00e1 treino previsto para hoje.",
        { icon: "\uD83C\uDFCB\uFE0F", label: "Academia", tone: "gym", cycle: today, href: "academia.html" }
      ));
    }());

    if (notifications.length > RPG_NOTIFICATION_LIMIT) notifications.length = RPG_NOTIFICATION_LIMIT;
    state.data.notifications = notifications;
    return state;
  }

  function parseTrackerTime(value) {
    if (value == null || value === "") return 0;
    var numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 0) return numeric;
    var parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function getTrackerItemTitle(item, tracker) {
    if (item && (item.titulo || item.title || item.nome)) return String(item.titulo || item.title || item.nome);
    if (tracker === "cinema" && isSeriesType(item)) return "S\u00e9rie";
    return tracker === "cinema" ? "T\u00edtulo" : tracker === "mangas" ? "Mang\u00e1" : "Livro";
  }

  function getTrackerLastTouch(item) {
    var stamps = [
      parseTrackerTime(item && item.updatedAt),
      parseTrackerTime(item && item.createdAt),
      parseTrackerTime(item && item.finishedAt)
    ];
    if (Array.isArray(item && item.timeline)) {
      item.timeline.forEach(function (row) { stamps.push(parseTrackerTime(row && row.at)); });
    }
    if (Array.isArray(item && item.progressHistory)) {
      item.progressHistory.forEach(function (row) { stamps.push(parseTrackerTime(row && row.at)); });
    }
    return Math.max.apply(null, stamps.concat(0));
  }

  function getAbandonState(tracker, item) {
    var lastTouch = getTrackerLastTouch(item);
    var days = lastTouch ? Math.max(0, Math.floor((Date.now() - lastTouch) / 86400000)) : 0;
    var status = norm(item && item.status);
    var activeStatuses = ABANDON_ACTIVE_STATUSES[tracker] || {};
    var isActive = !!activeStatuses[status];
    if (!isActive) return { notify: false, days: days, key: "off" };
    if (days >= ABANDON_RULES.critical) return { notify: true, days: days, key: "critical" };
    if (days >= ABANDON_RULES.risk) return { notify: true, days: days, key: "risk" };
    if (days >= ABANDON_RULES.watch) return { notify: true, days: days, key: "watch" };
    return { notify: false, days: days, key: "fresh" };
  }

  function buildAbandonNotification(tracker, item, abandonState) {
    var trackerLabel = tracker === "cinema" && isSeriesType(item) ? "S\u00e9ries" : (ABANDON_TRACKER_LABELS[tracker] || tracker);
    return Object.assign(createNotification(
      ABANDON_NOTIF_PREFIX + tracker + "-" + String(item && item.id != null ? item.id : getTrackerItemTitle(item, tracker)),
      trackerLabel + ': "' + getTrackerItemTitle(item, tracker) + '" est\u00e1 h\u00e1 ' + abandonState.days + " dias sem atualiza\u00e7\u00e3o.",
      {
        icon: tracker === "livros" ? "\uD83D\uDCDA" : tracker === "mangas" ? "\uD83D\uDCD6" : isSeriesType(item) ? "\uD83D\uDCFA" : "\uD83C\uDFAC",
        label: "Ante-abandono",
        tone: abandonState.key === "critical" ? "danger" : abandonState.key === "risk" ? "warn" : "library",
        cycle: getNotificationCycleDate(),
        href: tracker === "livros" ? "livros.html" : tracker === "mangas" ? "mangas.html" : "cinema.html"
      }
    ), { days: abandonState.days });
  }

  function syncAbandonNotifications(state) {
    var current = ensureNotificationArray(state);
    var foreign = current.filter(function (notification) {
      return String(notification && notification.id || "").indexOf(ABANDON_NOTIF_PREFIX) !== 0;
    });
    var generated = [];

    [
      { tracker: "livros", items: getLivros(state) },
      { tracker: "cinema", items: getCinema(state) },
      { tracker: "mangas", items: getMangas(state) }
    ].forEach(function (entry) {
      (entry.items || []).forEach(function (item) {
        var abandonState = getAbandonState(entry.tracker, item);
        if (!abandonState.notify) return;
        generated.push(buildAbandonNotification(entry.tracker, item, abandonState));
      });
    });

    generated.sort(function (a, b) {
      return b.days - a.days || String(a.text).localeCompare(String(b.text), "pt-BR");
    });

    state.data.notifications = foreign.concat(generated.map(function (notification) {
      return normalizeNotification(notification);
    }));
    return state;
  }

  function getBookReadingActiveDays(state) {
    var days = {};
    getLivros(state).forEach(function (item) {
      if (!Array.isArray(item && item.progressHistory)) return;
      item.progressHistory.forEach(function (row) {
        var at = parseTrackerTime(row && row.at);
        var value = num(row && row.value);
        if (!at || value <= 0) return;
        days[getLocalIsoDate(new Date(at))] = true;
      });
    });
    return Object.keys(days).sort();
  }

  function getBookReadingStreakInfo(state) {
    var activeDays = getBookReadingActiveDays(state);
    if (!activeDays.length) return { streak: 0, lastActiveDay: "", todayDone: false, shouldNotify: false };

    var todayKey = getNotificationCycleDate();
    var cursor = new Date(todayKey + "T00:00:00");
    var activeMap = {};
    var streak = 0;

    activeDays.forEach(function (day) { activeMap[day] = true; });
    while (activeMap[getLocalIsoDate(cursor)]) {
      streak += 1;
      cursor.setDate(cursor.getDate() - 1);
    }

    if (!streak) {
      cursor = new Date(todayKey + "T00:00:00");
      cursor.setDate(cursor.getDate() - 1);
      while (activeMap[getLocalIsoDate(cursor)]) {
        streak += 1;
        cursor.setDate(cursor.getDate() - 1);
      }
    }

    return {
      streak: streak,
      lastActiveDay: activeDays[activeDays.length - 1],
      todayDone: !!activeMap[todayKey],
      shouldNotify: streak >= 2
    };
  }

  function toLocalIsoDateFromTime(value) {
    var parsed = parseTrackerTime(value);
    if (!parsed) return "";
    return getLocalIsoDate(new Date(parsed));
  }

  function buildStreakInfoFromDayMap(dayMap) {
    var days = Object.keys(dayMap || {}).sort();
    if (!days.length) return { streak: 0, lastActiveDay: "", todayDone: false };
    var activeMap = {};
    var todayKey = getNotificationCycleDate();
    var cursor = new Date(todayKey + "T00:00:00");
    var streak = 0;

    days.forEach(function (day) { activeMap[day] = true; });
    while (activeMap[getLocalIsoDate(cursor)]) {
      streak += 1;
      cursor.setDate(cursor.getDate() - 1);
    }
    if (!streak) {
      cursor = new Date(todayKey + "T00:00:00");
      cursor.setDate(cursor.getDate() - 1);
      while (activeMap[getLocalIsoDate(cursor)]) {
        streak += 1;
        cursor.setDate(cursor.getDate() - 1);
      }
    }
    return {
      streak: streak,
      lastActiveDay: days[days.length - 1],
      todayDone: !!activeMap[todayKey]
    };
  }

  function getTrackerEngagementStreakInfo(state, tracker) {
    var items = tracker === "cinema" ? getCinema(state) : tracker === "mangas" ? getMangas(state) : getLivros(state);
    var dayMap = {};

    (items || []).forEach(function (item) {
      if (Array.isArray(item && item.progressHistory)) {
        item.progressHistory.forEach(function (row) {
          var day = toLocalIsoDateFromTime(row && row.at);
          if (day) dayMap[day] = true;
        });
      }
      if (tracker === "cinema" && !isSeriesType(item) && isDoneCinema(item)) {
        var cinemaDay = toLocalIsoDateFromTime(item && (item.finishedAt || item.updatedAt || item.createdAt));
        if (cinemaDay) dayMap[cinemaDay] = true;
      }
      if (tracker === "livros" && isDoneLivro(item)) {
        var livroDay = toLocalIsoDateFromTime(item && (item.finishedAt || item.updatedAt));
        if (livroDay) dayMap[livroDay] = true;
      }
      if (tracker === "mangas" && isDoneManga(item)) {
        var mangaDay = toLocalIsoDateFromTime(item && (item.finishedAt || item.updatedAt));
        if (mangaDay) dayMap[mangaDay] = true;
      }
    });

    return buildStreakInfoFromDayMap(dayMap);
  }

  function getGymScheduleStreakInfo(state) {
    var gymState = state && state.data && state.data.academiaTracker && typeof state.data.academiaTracker === "object"
      ? state.data.academiaTracker
      : {};
    var profile = gymState.profile && typeof gymState.profile === "object" ? gymState.profile : {};
    var trainDays = Array.isArray(profile.trainDays) ? profile.trainDays.map(Number) : [];
    var doneByDate = gymState.todayDoneByDate && typeof gymState.todayDoneByDate === "object" ? gymState.todayDoneByDate : {};
    var today = new Date(getLocalIsoDate(new Date()) + "T00:00:00");
    var streak = 0;
    var lastActiveDay = "";

    function getExercisesForDow(dow) {
      var items = Array.isArray(gymState.exercises) ? gymState.exercises : [];
      return items.filter(function (exercise) {
        return Array.isArray(exercise && exercise.days) && exercise.days.map(Number).indexOf(dow) >= 0;
      });
    }

    function isCompletedTrainingDay(dateStr) {
      var date = new Date(String(dateStr || "").slice(0, 10) + "T00:00:00");
      var dow = date.getDay();
      if (trainDays.indexOf(dow) < 0) return false;
      var exercises = getExercisesForDow(dow);
      if (!exercises.length) return false;
      var doneMap = doneByDate[dateStr] && typeof doneByDate[dateStr] === "object" ? doneByDate[dateStr] : {};
      return exercises.every(function (exercise) { return !!doneMap[exercise.id]; });
    }

    for (var i = 0; i < 240; i += 1) {
      var current = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
      var key = getLocalIsoDate(current);
      if (trainDays.indexOf(current.getDay()) < 0) continue;
      if (isCompletedTrainingDay(key)) {
        streak += 1;
        if (!lastActiveDay) lastActiveDay = key;
        continue;
      }
      if (i === 0 && trainDays.indexOf(today.getDay()) < 0) continue;
      break;
    }

    return {
      streak: streak,
      lastActiveDay: lastActiveDay,
      todayDone: !!lastActiveDay && lastActiveDay === getLocalIsoDate(today)
    };
  }

  function syncBookStreakNotification(state) {
    state.data.notifications = ensureNotificationArray(state).filter(function (notification) {
      return String(notification && notification.id || "") !== BOOK_STREAK_NOTIF_ID;
    });
    return state;
  }

  function syncReviewNotifications(state) {
    var notifications = ensureNotificationArray(state).filter(function (notification) {
      var id = String(notification && notification.id || "");
      return id !== REVIEW_DUE_NOTIF_ID && id !== REVIEW_STREAK_NOTIF_ID;
    });
    var reviewDueCount = getReviewDueNotificationCount(state);

    if (reviewDueCount > 0) {
      notifications.unshift(createNotification(
        REVIEW_DUE_NOTIF_ID,
        "Revis\u00e3o: h\u00e1 " + reviewDueCount + " card" + (reviewDueCount === 1 ? "" : "s") + " para revisar hoje.",
        { icon: "\uD83E\uDDE0", label: "Revis\u00e3o", tone: "study", cycle: getNotificationCycleDate(), href: "revisao.html" }
      ));
    }

    state.data.notifications = notifications;
    return state;
  }

  function pushNotification(state, text, meta) {
    var notifications = ensureNotificationArray(state);
    var options = meta && typeof meta === "object" ? meta : {};
    var notification = createNotification(
      options.id != null ? options.id : (Date.now() + Math.floor(Math.random() * 1000)),
      text,
      {
        icon: options.icon || "\u2694",
        label: options.label || "RPG",
        tone: options.tone || "rpg",
        cycle: options.cycle || "persist",
        href: options.href || "rpg.html"
      }
    );
    if (isNotificationDismissed(state, notification)) return;
    if (notifications.some(function (entry) {
      var current = normalizeNotification(entry);
      return String(current.id) === String(notification.id) && String(current.cycle) === String(notification.cycle);
    })) return;
    notifications.unshift(notification);
    if (notifications.length > RPG_NOTIFICATION_LIMIT) notifications.length = RPG_NOTIFICATION_LIMIT;
  }

  function makeSeries(config) {
    return config.thresholds.map(function (threshold, index) {
      return {
        id: config.ids && config.ids[index] ? config.ids[index] : config.idPrefix + "_" + (index + 1),
        group: config.group,
        name: config.names[index],
        req: config.req(threshold, index),
        check: function (state) { return config.metric(state) >= threshold; }
      };
    });
  }

  function buildAchievementDefinitions() {
    return []
      .concat(makeSeries({ group: "Leitura", idPrefix: "reading_books", names: arcNames("Biblioteca"), thresholds: [1, 2, 3, 5, 8, 10, 15, 20, 30, 50], ids: ["first_book", "reading_triplet", null, "reading_hand", null, "bookworm", "reading_shelf", "bookmaster", "reading_legend", null], metric: getCompletedBooksCount, req: function (v) { return reqLabel(v, "livro", "livros"); } }))
      .concat(makeSeries({ group: "Leitura", idPrefix: "reading_pages", names: arcNames("Marcapagina"), thresholds: [100, 200, 350, 500, 800, 1200, 1800, 2600, 4000, 6000], metric: getReadPagesTotal, req: function (v) { return v + " paginas"; } }))
      .concat(makeSeries({ group: "Leitura", idPrefix: "reading_notes", names: arcNames("Margem Viva"), thresholds: [1, 2, 3, 5, 8, 10, 14, 20, 28, 40], metric: getBooksWithNotesCount, req: function (v) { return reqLabel(v, "nota", "notas"); } }))
      .concat(makeSeries({ group: "Leitura", idPrefix: "reading_ratings", names: arcNames("Curadoria"), thresholds: [1, 2, 4, 6, 10, 15, 20, 30, 40, 60], metric: getRatedBooksCount, req: function (v) { return reqLabel(v, "avaliacao", "avaliacoes"); } }))
      .concat(makeSeries({ group: "Leitura", idPrefix: "reading_favorites", names: arcNames("Estante Dourada"), thresholds: [1, 2, 3, 5, 8, 10, 12, 15, 20, 30], metric: getFavoriteBooksCount, req: function (v) { return reqLabel(v, "favorito", "favoritos"); } }))
      .concat(makeSeries({ group: "Cinema", idPrefix: "cinema_done", names: arcNames("Claquete"), thresholds: [1, 2, 3, 5, 8, 12, 18, 25, 40, 60], ids: [null, null, null, "cinephile", null, null, null, "cinelord", null, null], metric: getCinemaCompletedCount, req: function (v) { return reqLabel(v, "titulo", "titulos"); } }))
      .concat(makeSeries({ group: "Cinema", idPrefix: "cinema_entries", names: arcNames("Catalogo de Cena"), thresholds: [1, 3, 5, 8, 12, 20, 30, 45, 60, 80], metric: getCinemaEntriesCount, req: function (v) { return reqLabel(v, "cadastro", "cadastros"); } }))
      .concat(makeSeries({ group: "Cinema", idPrefix: "cinema_units", names: arcNames("Tela Viva"), thresholds: [1, 5, 10, 20, 35, 60, 90, 140, 220, 320], metric: getCinemaUnitsTotal, req: function (v) { return v + " unidades"; } }))
      .concat(makeSeries({ group: "Cinema", idPrefix: "cinema_ratings", names: arcNames("Critica de Bolso"), thresholds: [1, 2, 4, 6, 10, 15, 20, 30, 40, 60], metric: getCinemaRatedCount, req: function (v) { return reqLabel(v, "avaliacao", "avaliacoes"); } }))
      .concat(makeSeries({ group: "Cinema", idPrefix: "cinema_favorites", names: arcNames("Arquivo de Cena"), thresholds: [1, 2, 3, 5, 8, 12, 18, 25, 35, 50], metric: getCinemaFavoriteCount, req: function (v) { return reqLabel(v, "favorito", "favoritos"); } }))
      .concat(makeSeries({ group: "Academia", idPrefix: "gym_count", names: arcNames("Forja"), thresholds: [1, 2, 3, 5, 8, 12, 18, 25, 40, 60], ids: ["gym_start", null, null, null, null, null, "gym_warrior", null, "gym_legend", null], metric: function (state) { return getGym(state).length; }, req: function (v) { return reqLabel(v, "treino", "treinos"); } }))
      .concat(makeSeries({ group: "Academia", idPrefix: "gym_minutes", names: arcNames("Cadencia"), thresholds: [30, 60, 120, 240, 400, 700, 1000, 1500, 2200, 3000], metric: getGymMinutesTotal, req: function (v) { return v + " min"; } }))
      .concat(makeSeries({ group: "Academia", idPrefix: "gym_types", names: arcNames("Variedade"), thresholds: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], metric: getGymTypeDiversityCount, req: function (v) { return reqLabel(v, "estilo", "estilos"); } }))
      .concat(makeSeries({ group: "Academia", idPrefix: "gym_detail", names: arcNames("Registro Brutal"), thresholds: [1, 2, 3, 5, 8, 12, 18, 25, 35, 50], metric: getGymDetailedCount, req: function (v) { return reqLabel(v, "registro rico", "registros ricos"); } }))
      .concat(makeSeries({ group: "Academia", idPrefix: "gym_effort", names: arcNames("Volume de Aco"), thresholds: [10, 30, 60, 100, 150, 220, 320, 450, 650, 900], metric: getGymEffortScore, req: function (v) { return v + " score"; } }))
      .concat(makeSeries({ group: "Estudo", idPrefix: "study_sessions", names: arcNames("Caderno Aberto"), thresholds: [1, 2, 3, 5, 8, 12, 18, 25, 40, 60], ids: [null, null, null, null, null, "scholar", null, null, null, null], metric: getStudySessionsCount, req: function (v) { return reqLabel(v, "sessao", "sessoes"); } }))
      .concat(makeSeries({ group: "Estudo", idPrefix: "study_hours", names: arcNames("Sessao Clara"), thresholds: [1, 3, 5, 8, 12, 20, 30, 50, 80, 120], ids: [null, null, null, null, null, null, null, "professor", null, null], metric: getEstudosHoras, req: function (v) { return v + "h"; } }))
      .concat(makeSeries({ group: "Estudo", idPrefix: "study_subjects", names: arcNames("Mapa Mental"), thresholds: [1, 2, 3, 4, 5, 6, 8, 10, 12, 15], metric: getStudySubjectCount, req: function (v) { return reqLabel(v, "tema", "temas"); } }))
      .concat(makeSeries({ group: "Estudo", idPrefix: "study_notes", names: arcNames("Margem Atenta"), thresholds: [1, 2, 3, 5, 8, 12, 18, 25, 35, 50], metric: getStudyNotesCount, req: function (v) { return reqLabel(v, "nota", "notas"); } }))
      .concat(makeSeries({ group: "Estudo", idPrefix: "study_long", names: arcNames("Imersao"), thresholds: [1, 2, 3, 5, 8, 12, 16, 20, 30, 40], metric: getStudyLongSessionsCount, req: function (v) { return reqLabel(v, "sessao longa", "sessoes longas"); } }))
      .concat(makeSeries({ group: "Sonhos", idPrefix: "dream_count", names: arcNames("Nebulosa"), thresholds: [1, 2, 3, 5, 8, 12, 18, 25, 35, 50], ids: [null, null, null, "dreamer", null, null, null, null, null, null], metric: function (state) { return getSonhos(state).length; }, req: function (v) { return reqLabel(v, "sonho", "sonhos"); } }))
      .concat(makeSeries({ group: "Sonhos", idPrefix: "dream_plan", names: arcNames("Mapa de Desejos"), thresholds: [1, 2, 3, 5, 7, 10, 14, 18, 24, 30], metric: getDreamsWithPlanCount, req: function (v) { return reqLabel(v, "plano", "planos"); } }))
      .concat(makeSeries({ group: "Sonhos", idPrefix: "dream_done", names: arcNames("Sonho Vivo"), thresholds: [1, 2, 3, 5, 8, 12, 16, 20, 25, 30], metric: getDreamsCompletedCount, req: function (v) { return reqLabel(v, "realizado", "realizados"); } }))
      .concat(makeSeries({ group: "Sonhos", idPrefix: "dream_reflection", names: arcNames("Eco Interior"), thresholds: [1, 2, 3, 5, 7, 10, 14, 18, 24, 30], metric: getDreamsReflectionCount, req: function (v) { return reqLabel(v, "reflexao", "reflexoes"); } }))
      .concat(makeSeries({ group: "Sonhos", idPrefix: "dream_categories", names: arcNames("Horizonte Intimo"), thresholds: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], metric: getDreamCategoryCount, req: function (v) { return reqLabel(v, "categoria", "categorias"); } }))
      .concat(makeSeries({ group: "Viagens", idPrefix: "travel_all", names: arcNames("Passaporte"), thresholds: [1, 2, 3, 5, 8, 12, 18, 25, 35, 50], ids: ["traveler", null, null, "globetrotter", null, null, null, null, null, null], metric: function (state) { return getViagens(state).length; }, req: function (v) { return reqLabel(v, "viagem", "viagens"); } }))
      .concat(makeSeries({ group: "Viagens", idPrefix: "travel_visited", names: arcNames("Rota Viva"), thresholds: [1, 2, 3, 5, 8, 12, 18, 25, 35, 50], metric: function (state) { return getViagens(state).filter(isVisitedViagem).length; }, req: function (v) { return reqLabel(v, "visitado", "visitados"); } }))
      .concat(makeSeries({ group: "Viagens", idPrefix: "travel_planned", names: arcNames("Roteiro Aberto"), thresholds: [1, 2, 3, 5, 8, 12, 18, 25, 35, 50], metric: getPlannedTripsCount, req: function (v) { return reqLabel(v, "planejada", "planejadas"); } }))
      .concat(makeSeries({ group: "Viagens", idPrefix: "travel_unique", names: arcNames("Atlas"), thresholds: [1, 2, 3, 5, 8, 12, 18, 25, 35, 50], metric: getUniqueTripDestinationsCount, req: function (v) { return reqLabel(v, "destino", "destinos"); } }))
      .concat(makeSeries({ group: "Viagens", idPrefix: "travel_notes", names: arcNames("Caderno de Bordo"), thresholds: [1, 2, 3, 5, 7, 10, 14, 18, 24, 30], metric: getTripNotesCount, req: function (v) { return reqLabel(v, "anotacao", "anotacoes"); } }))
      .concat(makeSeries({ group: "Mangas", idPrefix: "manga_done", names: arcNames("Painel"), thresholds: [1, 2, 3, 5, 8, 12, 18, 25, 35, 50], ids: [null, null, null, "manga_fan", null, null, null, null, null, null], metric: getCompletedMangasCount, req: function (v) { return reqLabel(v, "manga", "mangas"); } }))
      .concat(makeSeries({ group: "Mangas", idPrefix: "manga_chapters", names: arcNames("Capitulo"), thresholds: [10, 25, 50, 80, 120, 180, 260, 360, 500, 700], metric: getMangaChaptersTotal, req: function (v) { return v + " capitulos"; } }))
      .concat(makeSeries({ group: "Mangas", idPrefix: "manga_entries", names: arcNames("Estante Otaku"), thresholds: [1, 2, 3, 5, 8, 12, 18, 25, 35, 50], metric: getMangaEntriesCount, req: function (v) { return reqLabel(v, "cadastro", "cadastros"); } }))
      .concat(makeSeries({ group: "Mangas", idPrefix: "manga_ratings", names: arcNames("Curadoria Otaku"), thresholds: [1, 2, 3, 5, 8, 12, 18, 25, 35, 50], metric: getMangaRatedCount, req: function (v) { return reqLabel(v, "avaliacao", "avaliacoes"); } }))
      .concat(makeSeries({ group: "Mangas", idPrefix: "manga_favorites", names: arcNames("Favoritos Otaku"), thresholds: [1, 2, 3, 5, 8, 12, 18, 25, 35, 50], metric: getMangaFavoriteCount, req: function (v) { return reqLabel(v, "favorito", "favoritos"); } }))
      .concat(makeSeries({ group: "Tarefas", idPrefix: "tasks_done", names: arcNames("Checklist"), thresholds: [1, 3, 5, 8, 12, 20, 30, 45, 65, 90], ids: [null, null, null, null, null, "taskmaster", null, "planner", null, null], metric: getTaskCompletedCount, req: function (v) { return reqLabel(v, "tarefa", "tarefas"); } }))
      .concat(makeSeries({ group: "Tarefas", idPrefix: "tasks_all", names: arcNames("Fluxo"), thresholds: [3, 5, 8, 12, 18, 25, 35, 50, 70, 100], metric: getTaskTotalCount, req: function (v) { return reqLabel(v, "registro", "registros"); } }))
      .concat(makeSeries({ group: "Tarefas", idPrefix: "tasks_high", names: arcNames("Prioridade"), thresholds: [1, 2, 3, 5, 8, 12, 18, 25, 35, 50], metric: getHighPriorityTasksDoneCount, req: function (v) { return reqLabel(v, "prioridade alta", "prioridades altas"); } }))
      .concat(makeSeries({ group: "Tarefas", idPrefix: "tasks_complex", names: arcNames("Engenharia"), thresholds: [1, 2, 3, 5, 8, 12, 18, 25, 35, 50], metric: getComplexTasksDoneCount, req: function (v) { return reqLabel(v, "complexa", "complexas"); } }))
      .concat(makeSeries({ group: "Tarefas", idPrefix: "tasks_subtasks", names: arcNames("Costura"), thresholds: [3, 5, 8, 12, 18, 25, 35, 50, 70, 100], metric: getSubtasksTotalCount, req: function (v) { return reqLabel(v, "subtarefa", "subtarefas"); } }))
      .concat(makeSeries({ group: "Evolu\u00e7\u00e3o", idPrefix: "evo_level", names: arcNames("N\u00edvel"), thresholds: [2, 3, 4, 5, 6, 8, 10, 12, 15, 20], ids: [null, null, null, "level5", null, null, "legend", null, null, null], metric: function (state) { return getLevelFromXp(Math.round(calcRpgXp(state))); }, req: function (v) { return "N\u00edvel " + v; } }))
      .concat(makeSeries({ group: "Evolu\u00e7\u00e3o", idPrefix: "evo_xp", names: arcNames("Prest\u00edgio"), thresholds: [180, 420, 760, 1200, 1800, 2600, 3600, 4900, 6500, 8600], metric: function (state) { return Math.round(calcRpgXp(state)); }, req: function (v) { return v + " XP"; } }))
      .concat(makeSeries({ group: "Evolu\u00e7\u00e3o", idPrefix: "evo_skills", names: arcNames("Arsenal"), thresholds: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], metric: function (state) { return getSkillStates(state).filter(function (skill) { return skill.unlocked; }).length; }, req: function (v) { return reqLabel(v, "skill", "skills"); } }))
      .concat(makeSeries({ group: "Evolu\u00e7\u00e3o", idPrefix: "evo_attrs", names: arcNames("Atributo"), thresholds: [120, 180, 240, 300, 360, 420, 480, 540, 580, 600], metric: function (state) { return getRpgAttrs(state).reduce(function (acc, attr) { return acc + num(attr && attr.val); }, 0); }, req: function (v) { return v + " atributos"; } }))
      .concat(makeSeries({ group: "Evolu\u00e7\u00e3o", idPrefix: "evo_sources", names: arcNames("Constela\u00e7\u00e3o"), thresholds: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], metric: function (state) { return Object.keys(getRpgBreakdown(state)).filter(function (key) { return key !== "total" && num(getRpgBreakdown(state)[key]) > 0; }).length; }, req: function (v) { return reqLabel(v, "fonte", "fontes"); } }))
      .concat(makeSeries({ group: "Cole\u00e7\u00e3o", idPrefix: "collection_favorites", names: arcNames("Favoritos"), thresholds: [1, 3, 5, 8, 10, 15, 25, 35, 50, 70], ids: [null, null, null, null, "collector", null, null, null, null, null], metric: getFavoritosCount, req: function (v) { return reqLabel(v, "favorito", "favoritos"); } }))
      .concat(makeSeries({ group: "Cole\u00e7\u00e3o", idPrefix: "collection_size", names: arcNames("Museu"), thresholds: [5, 10, 15, 25, 40, 60, 90, 130, 180, 250], metric: getLibraryEntriesCount, req: function (v) { return reqLabel(v, "item", "itens"); } }))
      .concat(makeSeries({ group: "Cole\u00e7\u00e3o", idPrefix: "collection_done", names: arcNames("Arquivo"), thresholds: [1, 3, 5, 8, 12, 18, 25, 35, 50, 70], metric: getCompletedMediaCount, req: function (v) { return reqLabel(v, "conclu\u00edda", "conclu\u00eddas"); } }))
      .concat(makeSeries({ group: "Cole\u00e7\u00e3o", idPrefix: "collection_rated", names: arcNames("Curadoria"), thresholds: [1, 3, 5, 8, 12, 18, 25, 35, 50, 70], metric: getAllRatedCount, req: function (v) { return reqLabel(v, "avalia\u00e7\u00e3o", "avalia\u00e7\u00f5es"); } }))
      .concat(makeSeries({ group: "Cole\u00e7\u00e3o", idPrefix: "collection_notes", names: arcNames("Margem do Acervo"), thresholds: [1, 3, 5, 8, 12, 18, 25, 35, 50, 70], metric: getAllNotedCount, req: function (v) { return reqLabel(v, "nota", "notas"); } }))
      .concat(makeSeries({ group: "Wishlist", idPrefix: "wishlist_count", names: arcNames("Desejo"), thresholds: [1, 3, 5, 8, 10, 15, 25, 35, 50, 70], ids: [null, null, null, null, "wishmaster", null, null, null, null, null], metric: function (state) { return getWishlist(state).length; }, req: function (v) { return reqLabel(v, "item", "itens"); } }))
      .concat(makeSeries({ group: "Wishlist", idPrefix: "wishlist_priority", names: arcNames("Radar"), thresholds: [1, 2, 3, 5, 8, 12, 18, 25, 35, 50], metric: getWishlistPriorityCount, req: function (v) { return reqLabel(v, "prioridade", "prioridades"); } }))
      .concat(makeSeries({ group: "Wishlist", idPrefix: "wishlist_price", names: arcNames("Etiqueta"), thresholds: [1, 2, 3, 5, 8, 12, 18, 25, 35, 50], metric: getWishlistPricedCount, req: function (v) { return reqLabel(v, "preco", "precos"); } }))
      .concat(makeSeries({ group: "Wishlist", idPrefix: "wishlist_categories", names: arcNames("Prateleira Futura"), thresholds: [1, 2, 3, 5, 8, 12, 18, 25, 35, 50], metric: getWishlistCategorizedCount, req: function (v) { return reqLabel(v, "categoria", "categorias"); } }))
      .concat(makeSeries({ group: "Wishlist", idPrefix: "wishlist_acquired", names: arcNames("Tesouro Pretendido"), thresholds: [1, 2, 3, 5, 8, 12, 18, 25, 35, 50], metric: getWishlistAcquiredCount, req: function (v) { return reqLabel(v, "conquista", "conquistas"); } }));
  }

  function getAchievementStateMap(state) {
    var unlocked = {};
    buildAchievementDefinitions().forEach(function (achievement) {
      unlocked[achievement.id] = achievement.check(state);
    });
    return unlocked;
  }

  function getAchievementGroupSummary(unlockedMap) {
    var summary = {};
    buildAchievementDefinitions().forEach(function (achievement) {
      if (!summary[achievement.group]) summary[achievement.group] = { total: 0, unlocked: 0 };
      summary[achievement.group].total += 1;
      if (unlockedMap[achievement.id]) summary[achievement.group].unlocked += 1;
    });
    return summary;
  }

  function isSkillRequirementUnlocked(state, reqAch, unlockedMap) {
    if (!reqAch) return true;
    if (reqAch === "dreamer") return getSonhos(state).length >= 5;
    if (reqAch === "taskmaster") return getTaskCompletedCount(state) >= 20;
    if (reqAch === "manga_fan") return getCompletedMangasCount(state) >= 5;
    return !!(unlockedMap && unlockedMap[reqAch]);
  }

  function getSkillDefById(skillId) {
    var i;
    for (i = 0; i < RPG_SKILL_DEFS.length; i += 1) {
      if (RPG_SKILL_DEFS[i].id === skillId) return RPG_SKILL_DEFS[i];
    }
    return null;
  }

  function getReviewStats(state) {
    var planner = getReviewPlanner(state);
    var totalCards = 0;
    var activeDays = 0;
    var streakInfo = getReviewHeatmapStreakInfo(state);
    Object.keys(planner.log).forEach(function (day) {
      var count = num(planner.log[day]);
      if (count <= 0) return;
      totalCards += count;
      activeDays += 1;
    });
    return {
      totalCards: totalCards,
      activeDays: activeDays,
      streak: streakInfo.streak,
      todayDone: streakInfo.todayDone,
      dueCount: getReviewDueNotificationCount(state)
    };
  }

  function getGymCompletionStats(state) {
    var gymState = state && state.data && state.data.academiaTracker && typeof state.data.academiaTracker === "object"
      ? state.data.academiaTracker
      : {};
    var profile = gymState.profile && typeof gymState.profile === "object" ? gymState.profile : {};
    var trainDays = Array.isArray(profile.trainDays) ? profile.trainDays.map(Number) : [];
    var exercises = Array.isArray(gymState.exercises) ? gymState.exercises : [];
    var doneByDate = gymState.todayDoneByDate && typeof gymState.todayDoneByDate === "object" ? gymState.todayDoneByDate : {};
    var completedTrainingDays = 0;
    var completedExercises = 0;
    var completedMinutes = 0;
    var scheduledDaysTracked = 0;
    var effortScore = 0;

    function getExercisesForDow(dow) {
      return exercises.filter(function (exercise) {
        return Array.isArray(exercise && exercise.days) && exercise.days.map(Number).indexOf(dow) >= 0;
      });
    }

    Object.keys(doneByDate).forEach(function (dateStr) {
      var date = new Date(String(dateStr || "").slice(0, 10) + "T00:00:00");
      var dow;
      var dayExercises;
      var doneMap;
      if (isNaN(date)) return;
      dow = date.getDay();
      if (trainDays.indexOf(dow) < 0) return;
      dayExercises = getExercisesForDow(dow);
      if (!dayExercises.length) return;
      scheduledDaysTracked += 1;
      doneMap = doneByDate[dateStr] && typeof doneByDate[dateStr] === "object" ? doneByDate[dateStr] : {};
      dayExercises.forEach(function (exercise) {
        if (!doneMap[exercise.id]) return;
        completedExercises += 1;
        completedMinutes += Math.max(
          num(exercise && (exercise.minutos || exercise.duracao || exercise.tempo)),
          num(exercise && exercise.horas) * 60
        );
        effortScore +=
          num(exercise && (exercise.minutos || exercise.duracao || exercise.tempo)) +
          (num(exercise && exercise.horas) * 60) +
          num(exercise && exercise.reps) +
          (num(exercise && exercise.series) * 5) +
          Math.round(num(exercise && (exercise.peso || exercise.carga)) / 5) +
          Math.round(num(exercise && exercise.distancia) * 10);
      });
      if (dayExercises.every(function (exercise) { return !!doneMap[exercise.id]; })) completedTrainingDays += 1;
    });

    return {
      completedTrainingDays: completedTrainingDays,
      completedExercises: completedExercises,
      completedMinutes: completedMinutes,
      scheduledDaysTracked: scheduledDaysTracked,
      effortScore: Math.round(effortScore),
      streak: getGymScheduleStreakInfo(state).streak
    };
  }

  function getBalancedDomainStats(state) {
    var gymStats = getGymCompletionStats(state);
    var reviewStats = getReviewStats(state);
    var flags = {
      leitura: getCompletedBooksCount(state) >= 3 || getReadPagesTotal(state) >= 280,
      estudo: getEstudosHoras(state) >= 8 || reviewStats.totalCards >= 60,
      academia: gymStats.completedTrainingDays >= 12,
      tarefas: getTaskCompletedCount(state) >= 15,
      sonhos: getDreamsWithPlanCount(state) >= 6 || getDreamsCompletedCount(state) >= 3,
      viagens: getViagens(state).filter(isVisitedViagem).length >= 2,
      financas: getFinanceTxs(state).length >= 20 && getSavingsTxValue(getFinanceTxs(state)) >= 300,
      wishlist: getWishlistAcquiredCount(state) >= 3
    };
    return {
      count: Object.keys(flags).filter(function (key) { return flags[key]; }).length,
      flags: flags
    };
  }

  function getRawSkillLevelMap(state) {
    var map = {};
    RPG_SKILL_DEFS.forEach(function (skill) {
      map[skill.id] = Math.max(0, Math.min(RPG_SKILL_MAX, num(skill.getLevel(state))));
    });
    return map;
  }

  function getSkillStatesFromBase(state, baseXp, unlockedMap) {
    var currentLevel = getLevelFromXp(baseXp);
    var rawLevels = getRawSkillLevelMap(state);
    return RPG_SKILL_DEFS.map(function (skill) {
      var requiredLevel = Math.max(1, Number(skill.reqLevel || 0) || Math.ceil(Number(skill.reqXP || 0) / 100));
      var rawLevel = rawLevels[skill.id] || 0;
      var unlocked = currentLevel >= requiredLevel && isSkillRequirementUnlocked(state, skill.reqAch, unlockedMap) && rawLevel > 0;
      return {
        id: skill.id,
        icon: skill.icon,
        color: skill.color,
        name: skill.name,
        desc: skill.desc,
        utility: skill.utility,
        reqLevel: requiredLevel,
        unlocked: unlocked,
        level: unlocked ? rawLevel : 0,
        rawLevel: rawLevel
      };
    });
  }

  function getSelectedClassId(state) {
    var classStates = getRpgClassStates(state);
    var selected = String(state && state.data && state.data.rpg && state.data.rpg.classe || "initiate");
    if (!classStates[selected] || !classStates[selected].unlocked) return "initiate";
    return selected;
  }

  function getRpgDomainBonuses(state, baseXp) {
    var bonuses = {
      livros: 0,
      cinema: 0,
      mangas: 0,
      treinos: 0,
      estudos: 0,
      revisao: 0,
      tarefas: 0,
      sonhos: 0,
      viagens: 0,
      financas: 0,
      wishlist: 0
    };
    var skillStates = getSkillStatesFromBase(state, baseXp, null);
    var selectedClass = getSelectedClassId(state);

    function addBonus(key, amount) {
      if (!bonuses[key]) bonuses[key] = 0;
      bonuses[key] += amount;
    }

    skillStates.forEach(function (skill) {
      if (!skill.unlocked || !skill.level) return;
      if (skill.id === "reading") addBonus("livros", skill.level * 0.015);
      if (skill.id === "cinema") addBonus("cinema", skill.level * 0.014);
      if (skill.id === "fitness") addBonus("treinos", skill.level * 0.018);
      if (skill.id === "study") {
        addBonus("estudos", skill.level * 0.016);
        addBonus("revisao", skill.level * 0.016);
      }
      if (skill.id === "travel") addBonus("viagens", skill.level * 0.02);
      if (skill.id === "dreams") {
        addBonus("sonhos", skill.level * 0.015);
        addBonus("wishlist", skill.level * 0.005);
      }
      if (skill.id === "planning") {
        addBonus("tarefas", skill.level * 0.018);
        addBonus("financas", skill.level * 0.006);
      }
      if (skill.id === "manga") addBonus("mangas", skill.level * 0.016);
    });

    if (selectedClass === "scholar") {
      addBonus("livros", 0.12);
      addBonus("estudos", 0.12);
      addBonus("revisao", 0.12);
    } else if (selectedClass === "warrior") {
      addBonus("treinos", 0.14);
      addBonus("tarefas", 0.06);
    } else if (selectedClass === "explorer") {
      addBonus("viagens", 0.14);
      addBonus("cinema", 0.03);
    } else if (selectedClass === "artist") {
      addBonus("sonhos", 0.12);
      addBonus("wishlist", 0.10);
      addBonus("mangas", 0.04);
    } else if (selectedClass === "mage") {
      addBonus("revisao", 0.14);
      addBonus("estudos", 0.10);
      addBonus("sonhos", 0.04);
    } else if (selectedClass === "ranger") {
      addBonus("tarefas", 0.08);
      addBonus("treinos", 0.08);
      addBonus("viagens", 0.08);
    }

    return bonuses;
  }

  function applyDomainBonus(value, bonus) {
    if (!value) return 0;
    if (!bonus) return Math.round(value);
    return Math.round(value * (1 + bonus));
  }

  function getRpgClassStates(state) {
    var readingStreak = getTrackerEngagementStreakInfo(state, "livros");
    var gymStreak = getGymScheduleStreakInfo(state);
    var tripCount = getViagens(state).filter(isVisitedViagem).length;
    var dreamReflection = getDreamsReflectionCount(state);
    var collectionNotes = getAllNotedCount(state);
    var reviewStats = getReviewStats(state);
    var balancedDomains = getBalancedDomainStats(state);
    return {
      initiate: {
        id: "initiate",
        unlocked: true,
        name: RPG_CLASSES.initiate.name,
        icon: RPG_CLASSES.initiate.icon,
        bonus: RPG_CLASSES.initiate.bonus,
        requirement: "Base inicial",
        progress: "Sempre dispon\u00edvel"
      },
      scholar: {
        id: "scholar",
        unlocked: readingStreak.streak >= 30,
        name: RPG_CLASSES.scholar.name,
        icon: RPG_CLASSES.scholar.icon,
        bonus: RPG_CLASSES.scholar.bonus,
        requirement: "30 dias seguidos de leitura",
        progress: readingStreak.streak + "/30 dias"
      },
      warrior: {
        id: "warrior",
        unlocked: gymStreak.streak >= 60,
        name: RPG_CLASSES.warrior.name,
        icon: RPG_CLASSES.warrior.icon,
        bonus: RPG_CLASSES.warrior.bonus,
        requirement: "60 treinos seguidos nos dias marcados",
        progress: gymStreak.streak + "/60 treinos"
      },
      explorer: {
        id: "explorer",
        unlocked: tripCount >= 5,
        name: RPG_CLASSES.explorer.name,
        icon: RPG_CLASSES.explorer.icon,
        bonus: RPG_CLASSES.explorer.bonus,
        requirement: "5 viagens conclu\u00eddas",
        progress: tripCount + "/5 viagens"
      },
      artist: {
        id: "artist",
        unlocked: dreamReflection >= 8 && collectionNotes >= 12,
        name: RPG_CLASSES.artist.name,
        icon: RPG_CLASSES.artist.icon,
        bonus: RPG_CLASSES.artist.bonus,
        requirement: "8 reflex\u00f5es em sonhos e 12 notas no acervo",
        progress: dreamReflection + "/8 sonhos criativos \u00b7 " + collectionNotes + "/12 notas"
      },
      mage: {
        id: "mage",
        unlocked: reviewStats.streak >= 21 && reviewStats.totalCards >= 120,
        name: RPG_CLASSES.mage.name,
        icon: RPG_CLASSES.mage.icon,
        bonus: RPG_CLASSES.mage.bonus,
        requirement: "21 dias de revis\u00e3o e 120 cards revistos",
        progress: reviewStats.streak + "/21 dias \u00b7 " + reviewStats.totalCards + "/120 cards"
      },
      ranger: {
        id: "ranger",
        unlocked: balancedDomains.count >= 5,
        name: RPG_CLASSES.ranger.name,
        icon: RPG_CLASSES.ranger.icon,
        bonus: RPG_CLASSES.ranger.bonus,
        requirement: "5 frentes de vida est\u00e1veis",
        progress: balancedDomains.count + "/5 frentes equilibradas"
      }
    };
  }

  function syncRpgClassSelection(state) {
    var classes = getRpgClassStates(state);
    var selected = String(state && state.data && state.data.rpg && state.data.rpg.classe || "initiate");
    if (!classes[selected] || !classes[selected].unlocked) state.data.rpg.classe = "initiate";
    return state;
  }

  function getSkillStates(state) {
    return getSkillStatesFromBase(state, getRawRpgBreakdown(state).total, null);
  }

  function getMissionCatalog() {
    return {
      m_leitura: "Sessao de Leitura",
      m_treino: "Treino do Dia",
      m_tarefa: "Conclua uma Tarefa",
      m_estudo: "Hora de Estudo",
      m_sonho: "Registro de Sonho",
      m_cinema: "Sessao de Cinema",
      m_manga: "Capitulo de Manga",
      m_wishlist: "Atualizar Wishlist"
    };
  }

  function enqueueRpgNotifications(state, prevState, today) {
    var prevXp = Math.round(calcRpgXp(prevState));
    var nextXp = Math.round(calcRpgXp(state));
    var prevLevel = getLevelFromXp(prevXp);
    var nextLevel = getLevelFromXp(nextXp);
    var prevAttrs = getRpgAttrs(prevState);
    var nextAttrs = getRpgAttrs(state);
    var prevSkills = {};
    var nextSkills = {};
    var missionCatalog = getMissionCatalog();
    var prevAchievements = getAchievementStateMap(prevState);
    var nextAchievements = getAchievementStateMap(state);

    getSkillStates(prevState).forEach(function (skill) { prevSkills[skill.id] = skill; });
    getSkillStates(state).forEach(function (skill) { nextSkills[skill.id] = skill; });

    if (nextLevel > prevLevel) {
      pushNotification(state, "Seu n\u00edvel geral subiu para Nv " + nextLevel + ".", {
        id: "rpg-level-" + nextLevel,
        cycle: today,
        href: "rpg.html"
      });
      if (prevLevel < RPG_MAX_LEVEL && nextLevel >= RPG_MAX_LEVEL) {
        pushNotification(state, "Voc\u00ea atingiu o n\u00edvel m\u00e1ximo geral do RPG.", {
          id: "rpg-level-max",
          cycle: today,
          href: "rpg.html"
        });
      }
    }

    nextAttrs.forEach(function (attr) {
      var before = prevAttrs.find(function (candidate) { return candidate.label === attr.label; });
      var beforeVal = before ? num(before.val) : 0;
      var afterVal = num(attr.val);
      if (afterVal > beforeVal) {
        pushNotification(state, attr.label + " subiu para " + afterVal + ".", {
          id: "rpg-attr-" + attr.label + "-" + afterVal,
          cycle: today,
          href: "rpg.html"
        });
        if (beforeVal < RPG_ATTR_MAX && afterVal >= RPG_ATTR_MAX) {
          pushNotification(state, attr.label + " atingiu o n\u00edvel m\u00e1ximo.", {
            id: "rpg-attr-max-" + attr.label,
            cycle: today,
            href: "rpg.html"
          });
        }
      }
    });

    if (prevState.data.rpg.missionsDate !== today) {
      pushNotification(state, "As miss\u00f5es do dia foram renovadas no RPG.", {
        id: "rpg-missions-renewed",
        cycle: today
      });
      if (RPG_DAILY_MISSION_COUNT > 0) {
        pushNotification(state, "Voc\u00ea tem " + RPG_DAILY_MISSION_COUNT + " miss\u00f5es do dia para fazer.", {
          id: "rpg-missions-count",
          cycle: today,
          href: "rpg.html"
        });
      }
    }

    Object.keys(state.data.rpg.missions).forEach(function (missionId) {
      if (!state.data.rpg.missions[missionId]) return;
      if (prevState.data.rpg.missions[missionId]) return;
      pushNotification(state, 'Miss\u00e3o conclu\u00edda: "' + (missionCatalog[missionId] || missionId) + '".', {
        id: "rpg-mission-" + missionId + "-" + today,
        cycle: today,
        href: "rpg.html"
      });
    });

    Object.keys(nextSkills).forEach(function (skillId) {
      var before = prevSkills[skillId] || { level: 0, unlocked: false };
      var after = nextSkills[skillId];
      if (!after.unlocked) return;
      if (!before.unlocked) {
        pushNotification(state, 'Habilidade desbloqueada: "' + after.name + '".', {
          id: "rpg-skill-unlock-" + after.id,
          cycle: today,
          href: "rpg.html"
        });
      }
      if (after.level > before.level) {
        pushNotification(state, '"' + after.name + '" subiu para o n\u00edvel ' + after.level + ".", {
          id: "rpg-skill-level-" + after.id + "-" + after.level,
          cycle: today,
          href: "rpg.html"
        });
        if (before.level < RPG_SKILL_MAX && after.level >= RPG_SKILL_MAX) {
          pushNotification(state, '"' + after.name + '" atingiu o n\u00edvel m\u00e1ximo.', {
            id: "rpg-skill-max-" + after.id,
            cycle: today,
            href: "rpg.html"
          });
        }
      }
    });

    buildAchievementDefinitions().forEach(function (achievement) {
      if (nextAchievements[achievement.id] && !prevAchievements[achievement.id]) {
        pushNotification(state, 'Nova conquista desbloqueada: "' + achievement.name + '" (' + achievement.group + ').', {
          id: "rpg-achievement-" + achievement.id,
          cycle: today,
          href: "rpg.html"
        });
      }
    });
  }

  function xpForLevel(level) {
    var step = Math.max(0, Number(level || 1) - 1);
    if (!step) return 0;
    return Math.round(160 * step * step + 140 * step);
  }
  function getLevelFromXp(xp) {
    var level = 1;
    while (xp >= xpForLevel(level + 1)) level += 1;
    return level;
  }

  function calcLivroXp(item) {
    return Math.round(getLivroPagesRead(item) * RPG_XP.livroPagina +
      (isDoneLivro(item) ? RPG_XP.livroConclusao : 0) +
      getLivroReflectionBonus(item));
  }

  function calcCinemaXp(item) {
    if (!item) return 0;
    if (isSeriesType(item)) {
      return Math.round(getCinemaUnits(item) * RPG_XP.cinemaEpisodio +
        (isDoneCinema(item) ? RPG_XP.cinemaConclusaoSerie : 0) +
        getCinemaReflectionBonus(item));
    }
    return Math.round((isDoneCinema(item) ? RPG_XP.cinemaFilme : 0) + getCinemaReflectionBonus(item));
  }

  function calcMangaXp(item) {
    return Math.round(getMangaChaptersRead(item) * RPG_XP.mangaCapitulo +
      (isDoneManga(item) ? RPG_XP.mangaConclusao : 0) +
      getMangaReflectionBonus(item));
  }

  function calcEstudoXp(item) {
    if (!item) return 0;
    return Math.round(num(item.horas) * RPG_XP.estudoHora +
      (isDoneStudyItem(item) ? RPG_XP.estudoConclusao : 0) +
      ((item.revisado || norm(item.status) === "revisado" || norm(item.tipo) === "revisao") ? RPG_XP.estudoRevisao : 0));
  }

  function calcTaskXp(task, tasks) {
    if (!isDoneTask(task)) return 0;
    var prior = norm(task.prior || "media");
    var base = prior === "alta" ? RPG_XP.tarefaBaseAlta : prior === "baixa" ? RPG_XP.tarefaBaseBaixa : RPG_XP.tarefaBaseMedia;
    return Math.round(base + getTaskComplexity(task, tasks) + (isTaskOnTime(task) ? RPG_XP.tarefaPrazo : 0) + (isTaskStrategic(task) ? 4 : 0));
  }

  function calcDreamXp(dream) {
    if (!dream) return 0;
    return Math.round(RPG_XP.sonhoBase +
      countDreamGoalsDone(dream) * RPG_XP.sonhoMeta +
      (hasDreamPlanning(dream) ? RPG_XP.sonhoPlanejamento : 0) +
      (isDoneDream(dream) ? RPG_XP.sonhoRealizado : 0) +
      getDreamFinanceHistoryCount(dream) * RPG_XP.sonhoReserva +
      (hasMeaningfulText(dream && (dream.obs || dream.notas || dream.reflexao || dream.desc)) ? RPG_XP.sonhoReflexao : 0));
  }

  function calcViagemXp(item) {
    if (!item) return 0;
    return Math.round((isVisitedViagem(item) ? RPG_XP.viagem : 0) +
      ((item.dataInicio || item.start || item.dataFim || item.end) ? RPG_XP.viagemPlanejada : 0) +
      (hasMeaningfulText(item && (item.obs || item.descricao || item.roteiro || item.notas)) ? RPG_XP.viagemNota : 0));
  }

  function calcReviewXp(state) {
    var stats = getReviewStats(state);
    return Math.round(
      (stats.totalCards * RPG_XP.revisaoCard) +
      (stats.activeDays * RPG_XP.revisaoDia) +
      (Math.min(stats.streak, 30) * RPG_XP.revisaoStreak)
    );
  }

  function calcGymXp(state) {
    var stats = getGymCompletionStats(state);
    return Math.round(
      (stats.completedTrainingDays * RPG_XP.treinoDia) +
      (stats.completedExercises * RPG_XP.treinoExercicio) +
      (stats.completedMinutes * RPG_XP.treinoMinuto) +
      (stats.effortScore * RPG_XP.treinoScore) +
      (Math.min(stats.streak, 60) * RPG_XP.treinoStreak)
    );
  }

  function calcFinanceXp(state) {
    var txs = getFinanceTxs(state);
    var rules = getFinanceRules(state);
    var monthBuckets = {};
    var txXp = txs.reduce(function (acc, tx) {
      if (!tx) return acc;
      if (tx.date) monthBuckets[String(tx.date).slice(0, 7)] = true;
      return acc + RPG_XP.financaTx + (tx.type === "save" ? RPG_XP.financaSave : 0);
    }, 0);
    var savingsScale = Math.min(42, Math.floor(getSavingsTxValue(txs) / 250));
    var consistencyBonus = Math.min(60, Object.keys(monthBuckets).length * RPG_XP.financaConsistency);
    return Math.round(txXp + rules.length * RPG_XP.financaRule + savingsScale + consistencyBonus);
  }

  function calcWishlistXp(state) {
    var items = getWishlist(state);
    var history = getWishlistHistory(state);
    var groups = getWishlistGroups(state);
    var goal = getWishlistGoal(state);
    var savedBonus = Math.min(30, Math.floor(num(goal.saved) / 200));
    return Math.round(items.length * RPG_XP.wishlistItem +
      (countMeaningfulWishlistItems(items) * RPG_XP.wishlistDetalhe) +
      history.length * RPG_XP.wishlistAquisicao +
      groups.length * RPG_XP.wishlistGrupo +
      savedBonus);
  }

  function getMissionRewardsTotal(state) {
    var total = 0;
    Object.keys(state.data.rpg.missionRewards || {}).forEach(function (dateKey) {
      var rewards = state.data.rpg.missionRewards[dateKey];
      if (!rewards || typeof rewards !== "object") return;
      Object.keys(rewards).forEach(function (missionId) {
        total += Number(rewards[missionId] || 0);
      });
    });
    return total;
  }

  function getRawRpgBreakdown(state) {
    state = ensureRpgShape(state);
    var tasks = getTasks(state);
    var breakdown = {
      livros: getLivros(state).reduce(function (acc, item) { return acc + calcLivroXp(item); }, 0),
      cinema: getCinema(state).reduce(function (acc, item) { return acc + calcCinemaXp(item); }, 0),
      mangas: getMangas(state).reduce(function (acc, item) { return acc + calcMangaXp(item); }, 0),
      treinos: calcGymXp(state),
      estudos: getEstudos(state).reduce(function (acc, item) { return acc + calcEstudoXp(item); }, 0),
      revisao: calcReviewXp(state),
      tarefas: tasks.reduce(function (acc, item) { return acc + calcTaskXp(item, tasks); }, 0),
      sonhos: getSonhos(state).reduce(function (acc, item) { return acc + calcDreamXp(item); }, 0),
      viagens: getViagens(state).reduce(function (acc, item) { return acc + calcViagemXp(item); }, 0),
      financas: calcFinanceXp(state),
      wishlist: calcWishlistXp(state),
      missoes: getMissionRewardsTotal(state)
    };
    breakdown.total = breakdown.livros + breakdown.cinema + breakdown.mangas + breakdown.treinos +
      breakdown.estudos + breakdown.revisao + breakdown.tarefas + breakdown.sonhos + breakdown.viagens +
      breakdown.financas + breakdown.wishlist + breakdown.missoes;
    return breakdown;
  }

  function getRpgBreakdown(state) {
    var raw = getRawRpgBreakdown(state);
    var bonuses = getRpgDomainBonuses(state, raw.total);
    var finalBreakdown = {
      livros: applyDomainBonus(raw.livros, bonuses.livros),
      cinema: applyDomainBonus(raw.cinema, bonuses.cinema),
      mangas: applyDomainBonus(raw.mangas, bonuses.mangas),
      treinos: applyDomainBonus(raw.treinos, bonuses.treinos),
      estudos: applyDomainBonus(raw.estudos, bonuses.estudos),
      revisao: applyDomainBonus(raw.revisao, bonuses.revisao),
      tarefas: applyDomainBonus(raw.tarefas, bonuses.tarefas),
      sonhos: applyDomainBonus(raw.sonhos, bonuses.sonhos),
      viagens: applyDomainBonus(raw.viagens, bonuses.viagens),
      financas: applyDomainBonus(raw.financas, bonuses.financas),
      wishlist: applyDomainBonus(raw.wishlist, bonuses.wishlist),
      missoes: raw.missoes
    };
    finalBreakdown.total = finalBreakdown.livros + finalBreakdown.cinema + finalBreakdown.mangas + finalBreakdown.treinos +
      finalBreakdown.estudos + finalBreakdown.revisao + finalBreakdown.tarefas + finalBreakdown.sonhos + finalBreakdown.viagens +
      finalBreakdown.financas + finalBreakdown.wishlist + finalBreakdown.missoes;
    return finalBreakdown;
  }

  function calcRpgXp(state) {
    return getRpgBreakdown(state).total;
  }

  function getRpgAttrs(state) {
    var breakdown = getRpgBreakdown(state);
    var total = breakdown.total;
    return [
      { icon: "\uD83E\uDDE0", label: "Intelecto", val: scaleTo100(breakdown.livros * 0.5 + breakdown.estudos * 0.65 + breakdown.revisao * 0.55 + breakdown.mangas * 0.18 + breakdown.cinema * 0.12, 1250), color: "#c8a96e" },
      { icon: "\uD83D\uDCAA", label: "Forca", val: scaleTo100(breakdown.treinos * 1.05 + breakdown.tarefas * 0.1, 980), color: "#e06b8b" },
      { icon: "\uD83E\uDDED", label: "Sabedoria", val: scaleTo100(breakdown.sonhos * 0.72 + breakdown.financas * 0.82 + breakdown.estudos * 0.24 + breakdown.revisao * 0.2 + breakdown.wishlist * 0.28, 1180), color: "#4ab0e8" },
      { icon: "\u26A1", label: "Disciplina", val: scaleTo100(breakdown.tarefas * 0.58 + breakdown.treinos * 0.18 + breakdown.estudos * 0.14 + breakdown.revisao * 0.24 + breakdown.financas * 0.35, 1180), color: "#5ec4a8" },
      { icon: "\uD83C\uDF0D", label: "Exploracao", val: scaleTo100(breakdown.viagens * 1 + breakdown.cinema * 0.22 + breakdown.mangas * 0.08, 780), color: "#7c6fcd" },
      { icon: "\u2728", label: "Prestigio", val: scaleTo100(total, 7600), color: "#e8864a" }
    ];
  }

  function buildRpgLog(state) {
    var entries = [];
    var now = Date.now();
    var gymStats = getGymCompletionStats(state);
    var reviewStats = getReviewStats(state);
    getLivros(state).filter(function (item) { return getLivroPagesRead(item) > 0; }).slice(-3).forEach(function (item) {
      entries.push({ icon: "\uD83D\uDCD6", text: 'Leitura registrada: "' + (item.titulo || item.title || "Livro") + '"', xp: calcLivroXp(item), t: item.updatedAt || item.id || now });
    });
    getCinema(state).filter(function (item) { return calcCinemaXp(item) > 0; }).slice(-3).forEach(function (item) {
      entries.push({ icon: "\uD83C\uDFAC", text: 'Tela atualizada: "' + (item.titulo || item.title || "Titulo") + '"', xp: calcCinemaXp(item), t: item.updatedAt || item.id || now });
    });
    getMangas(state).filter(function (item) { return getMangaChaptersRead(item) > 0; }).slice(-3).forEach(function (item) {
      entries.push({ icon: "\uD83D\uDDBC", text: 'Manga atualizado: "' + (item.titulo || item.title || "Manga") + '"', xp: calcMangaXp(item), t: item.updatedAt || item.id || now });
    });
    if (gymStats.completedTrainingDays > 0) {
      entries.push({
        icon: "\uD83D\uDCAA",
        text: "Academia em rota: " + gymStats.completedTrainingDays + " dia(s) de treino conclu\u00eddos e sequ\u00eancia de " + gymStats.streak + ".",
        xp: calcGymXp(state),
        t: now
      });
    }
    getEstudos(state).slice(-3).forEach(function (item) {
      entries.push({ icon: "\uD83C\uDF93", text: "Estudo registrado" + (item.materia ? " - " + item.materia : ""), xp: calcEstudoXp(item), t: item.updatedAt || item.id || now });
    });
    if (reviewStats.totalCards > 0) {
      entries.push({
        icon: "\uD83E\uDDE0",
        text: "Revis\u00e3o ativa: " + reviewStats.totalCards + " cards revistos em " + reviewStats.activeDays + " dia(s).",
        xp: calcReviewXp(state),
        t: now - 1
      });
    }
    getTasks(state).filter(isDoneTask).slice(-3).forEach(function (item) {
      entries.push({ icon: "\u2705", text: 'Tarefa concluida: "' + (item.nome || "Tarefa") + '"', xp: calcTaskXp(item, getTasks(state)), t: item.doneAt || item.updatedAt || item.id || now });
    });
    getSonhos(state).slice(-2).forEach(function (item) {
      entries.push({ icon: "\uD83C\uDF19", text: 'Sonho revisado: "' + (item.titulo || "Sonho") + '"', xp: calcDreamXp(item), t: item.updatedAt || item.id || now });
    });
    getViagens(state).filter(isVisitedViagem).slice(-2).forEach(function (item) {
      entries.push({ icon: "\u2708\uFE0F", text: "Destino concluido: " + (item.dest || item.destino || "Viagem"), xp: calcViagemXp(item), t: item.updatedAt || item.id || now });
    });
    getFinanceTxs(state).slice(-2).forEach(function (item) {
      entries.push({ icon: "\uD83D\uDCB0", text: "Movimento financeiro registrado", xp: RPG_XP.financaTx + (item.type === "save" ? RPG_XP.financaSave : 0), t: item.updatedAt || item.id || now });
    });
    getWishlistHistory(state).slice(-2).forEach(function (item) {
      entries.push({ icon: "\uD83C\uDF20", text: 'Wishlist avan\u00e7ou: "' + (item.name || "Item") + '"', xp: RPG_XP.wishlistAquisicao, t: item.acquiredAt || item.id || now });
    });
    return entries.sort(function (a, b) { return b.t - a.t; }).slice(0, 12);
  }

  function getRpgQuickStats(state) {
    return {
      livros: getCompletedBooksCount(state),
      cinema: getCinemaCompletedCount(state),
      gym: getGymCompletionStats(state).completedTrainingDays,
      tarefas: getTaskCompletedCount(state),
      revisao: getReviewStats(state).totalCards
    };
  }

  function getDailyMissionsForState(state) {
    var today = getRpgDailyCycleDate();
    var pool = [
      { id: "m_leitura", icon: "\uD83D\uDCDA", name: "Sess\u00e3o de Leitura", desc: "Abra a Livraria e registre progresso real.", xp: RPG_MISSION_XP.m_leitura, color: "#c8a96e" },
      { id: "m_treino", icon: "\uD83D\uDCAA", name: "Treino do Dia", desc: "Complete o treino previsto na Academia.", xp: RPG_MISSION_XP.m_treino, color: "#e06b8b" },
      { id: "m_tarefa", icon: "\u2705", name: "Conclua uma Tarefa", desc: "Feche ao menos uma tarefa do planejamento.", xp: RPG_MISSION_XP.m_tarefa, color: "#5ec4a8" },
      { id: "m_estudo", icon: "\uD83E\uDDE0", name: "Hora de Estudo", desc: "Registre estudo ou revis\u00e3o consistente.", xp: RPG_MISSION_XP.m_estudo, color: "#4ab0e8" },
      { id: "m_sonho", icon: "\uD83C\uDF19", name: "Registro de Sonho", desc: "Avance em um sonho com plano, nota ou meta.", xp: RPG_MISSION_XP.m_sonho, color: "#7c6fcd" },
      { id: "m_cinema", icon: "\uD83C\uDFAC", name: "Sess\u00e3o de Cinema", desc: "Atualize filme, s\u00e9rie ou epis\u00f3dio assistido.", xp: RPG_MISSION_XP.m_cinema, color: "#e8864a" },
      { id: "m_manga", icon: "\uD83D\uDCDA", name: "Cap\u00edtulo de Mang\u00e1", desc: "Atualize seu progresso de mang\u00e1.", xp: RPG_MISSION_XP.m_manga, color: "#e06b8b" },
      { id: "m_wishlist", icon: "\uD83C\uDF20", name: "Atualizar Wishlist", desc: "Detalhe ou revise um item da wishlist.", xp: RPG_MISSION_XP.m_wishlist, color: "#7c6fcd" }
    ];
    var seed = parseInt(String(today).replace(/-/g, ""), 10) % pool.length;
    return [0, 1, 2, 3].map(function (offset) {
      var mission = pool[(seed + offset) % pool.length];
      return {
        id: mission.id,
        icon: mission.icon,
        name: mission.name,
        desc: mission.desc,
        xp: mission.xp,
        color: mission.color,
        done: !!(state && state.data && state.data.rpg && state.data.rpg.missions && state.data.rpg.missions[mission.id])
      };
    });
  }

  function findByIdOrName(items, item) {
    if (!item) return null;
    var itemId = item.id;
    var itemTitle = norm(item.titulo || item.title || item.nome);
    return (items || []).find(function (candidate) {
      if (itemId != null && candidate && candidate.id != null) return String(candidate.id) === String(itemId);
      return norm(candidate && (candidate.titulo || candidate.title || candidate.nome)) === itemTitle;
    }) || null;
  }

  function hasBookProgressUpdate(prevState, nextState) {
    var prev = getLivros(prevState);
    var next = getLivros(nextState);
    return next.some(function (book) {
      var before = findByIdOrName(prev, book);
      if (!before) return Number(book && book.atual || 0) > 0;
      return Number(book && book.atual || 0) !== Number(before && before.atual || 0);
    });
  }

  function hasNewCompletedTask(prevState, nextState) {
    var prev = getTasks(prevState);
    var next = getTasks(nextState);
    return next.some(function (task) {
      var before = findByIdOrName(prev, task);
      return !!(task && task.done) && !(before && before.done);
    });
  }

  function hasNewCompletedStudy(prevState, nextState) {
    var prev = getEstudos(prevState);
    var next = getEstudos(nextState);
    return next.some(function (entry) {
      var before = findByIdOrName(prev, entry);
      return isDoneStudyItem(entry) && !isDoneStudyItem(before);
    });
  }

  function hasNewWorkout(prevState, nextState) {
    return getGym(nextState).length > getGym(prevState).length;
  }

  function hasDreamProgressUpdate(prevState, nextState) {
    var prev = getSonhos(prevState);
    var next = getSonhos(nextState);
    return next.some(function (dream) {
      var before = findByIdOrName(prev, dream);
      if (!before) return true;
      return JSON.stringify(dream) !== JSON.stringify(before);
    });
  }

  function hasCinemaProgressUpdate(prevState, nextState) {
    var prev = getCinema(prevState);
    var next = getCinema(nextState);
    return next.some(function (item) {
      var before = findByIdOrName(prev, item);
      if (!before) return true;
      return JSON.stringify(item) !== JSON.stringify(before);
    });
  }

  function hasMangaProgressUpdate(prevState, nextState) {
    var prev = getMangas(prevState);
    var next = getMangas(nextState);
    return next.some(function (item) {
      var before = findByIdOrName(prev, item);
      if (!before) return getMangaChaptersRead(item) > 0;
      return getMangaChaptersRead(item) !== getMangaChaptersRead(before) || JSON.stringify(item) !== JSON.stringify(before);
    });
  }

  function hasWishlistProgressUpdate(prevState, nextState) {
    var prevItems = getWishlist(prevState);
    var nextItems = getWishlist(nextState);
    var prevHistory = getWishlistHistory(prevState);
    var nextHistory = getWishlistHistory(nextState);
    return nextItems.length > prevItems.length || nextHistory.length > prevHistory.length ||
      nextItems.some(function (item) {
        var before = findByIdOrName(prevItems, item);
        if (!before) return true;
        return JSON.stringify(item) !== JSON.stringify(before);
      });
  }

  function syncRpgState(nextState, previousState) {
    var state = ensureRpgShape(nextState);
    var prev = ensureRpgShape(previousState || loadState());
    var today = getRpgDailyCycleDate();

    if (state.data.rpg.missionsDate !== today) {
      state.data.rpg.missions = {};
      state.data.rpg.missionsDate = today;
    }

    if (hasBookProgressUpdate(prev, state)) state.data.rpg.missions.m_leitura = true;
    if (hasNewCompletedTask(prev, state)) state.data.rpg.missions.m_tarefa = true;
    if (hasNewCompletedStudy(prev, state)) state.data.rpg.missions.m_estudo = true;
    if (hasNewWorkout(prev, state)) state.data.rpg.missions.m_treino = true;
    if (hasDreamProgressUpdate(prev, state)) state.data.rpg.missions.m_sonho = true;
    if (hasCinemaProgressUpdate(prev, state)) state.data.rpg.missions.m_cinema = true;
    if (hasMangaProgressUpdate(prev, state)) state.data.rpg.missions.m_manga = true;
    if (hasWishlistProgressUpdate(prev, state)) state.data.rpg.missions.m_wishlist = true;

    if (!state.data.rpg.missionRewards[today] || typeof state.data.rpg.missionRewards[today] !== "object") {
      state.data.rpg.missionRewards[today] = {};
    }

    Object.keys(state.data.rpg.missions).forEach(function (missionId) {
      if (!state.data.rpg.missions[missionId]) return;
      if (state.data.rpg.missionRewards[today][missionId] != null) return;
      state.data.rpg.missionRewards[today][missionId] = Number(RPG_MISSION_XP[missionId] || 0);
    });

    syncRpgClassSelection(state);
    enqueueRpgNotifications(state, prev, today);

    return state;
  }

  function renderRpgHeader(state) {
    state = ensureRpgShape(state);
    var xp = Math.round(calcRpgXp(state));
    var level = getLevelFromXp(xp);
    var xpThisLevel = xpForLevel(level);
    var xpNext = xpForLevel(level + 1);
    var pct = xpNext > xpThisLevel ? Math.max(0, Math.min(100, Math.round((xp - xpThisLevel) / (xpNext - xpThisLevel) * 100))) : 100;
    var cls = RPG_CLASSES[state.data.rpg.classe] || RPG_CLASSES.initiate;
    var title = RPG_TITLES[Math.min(level - 1, RPG_TITLES.length - 1)];

    var headerLevel = document.getElementById("header-level-badge");
    var headerFill = document.getElementById("header-xp-fill");
    var mobileLevel = document.getElementById("mobile-level-badge");
    var mobileFill = document.getElementById("mobile-xp-fill");
    var pmTitle = document.getElementById("pm-title-display");
    var pmXpText = document.getElementById("pm-xp-text");
    var pmXpNext = document.getElementById("pm-xp-next");
    var pmXpFill = document.getElementById("pm-xp-fill");

    if (headerLevel) headerLevel.textContent = "Nv " + level;
    if (headerFill) headerFill.style.width = pct + "%";
    if (mobileLevel) mobileLevel.textContent = "Nv " + level;
    if (mobileFill) mobileFill.style.width = pct + "%";
    if (pmTitle) pmTitle.textContent = title + " \u00b7 " + cls.name + " \u00b7 N\u00edvel " + level;
    if (pmXpText) pmXpText.textContent = xp.toLocaleString("pt-BR") + " XP";
    if (pmXpNext) pmXpNext.textContent = "pr\u00f3x. n\u00edvel: " + xpNext.toLocaleString("pt-BR") + " XP";
    if (pmXpFill) pmXpFill.style.width = pct + "%";
  }

  function getFinanceTxs(state) {
    var data = state && state.data ? state.data : {};
    if (data.financasTracker && Array.isArray(data.financasTracker.txs)) return data.financasTracker.txs;
    if (Array.isArray(data.financas)) return data.financas;
    return [];
  }

  function getFinanceRules(state) {
    var data = state && state.data ? state.data : {};
    if (data.financasTracker && Array.isArray(data.financasTracker.recurrenceRules)) return data.financasTracker.recurrenceRules;
    if (Array.isArray(data.financasRecurrenceRules)) return data.financasRecurrenceRules;
    return [];
  }

  function financeToday() {
    return new Date().toISOString().slice(0, 10);
  }

  function isFinanceFuture(tx) {
    return !!(tx && tx.date > financeToday());
  }

  function financeDelta(tx) {
    if (!tx) return 0;
    var value = Number(tx.value || 0);
    if (tx.type === "in") return value;
    if (tx.type === "save_withdraw") return value;
    if (tx.type === "out" || tx.type === "save") return -value;
    return 0;
  }

  function financeDateStr(year, month, day) {
    return year + "-" + String(month + 1).padStart(2, "0") + "-" + String(day).padStart(2, "0");
  }

  function financeIsHoliday(dateStr, holidays) {
    return (holidays || []).indexOf(dateStr) >= 0;
  }

  function financeCountableDay(dateObj, countSaturday, holidays) {
    var dayOfWeek = dateObj.getDay();
    var dateStr = financeDateStr(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate());
    if (financeIsHoliday(dateStr, holidays)) return false;
    if (dayOfWeek === 0) return false;
    if (dayOfWeek === 6) return !!countSaturday;
    return true;
  }

  function financeReceivableDay(dateObj, holidays) {
    var dayOfWeek = dateObj.getDay();
    var dateStr = financeDateStr(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate());
    if (financeIsHoliday(dateStr, holidays)) return false;
    return dayOfWeek !== 0 && dayOfWeek !== 6;
  }

  function financeShiftBusinessDay(dateObj, direction, holidays) {
    var next = new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate());
    var step = direction === "next_business_day" ? 1 : -1;
    while (!financeReceivableDay(next, holidays)) next.setDate(next.getDate() + step);
    return next;
  }

  function financeRuleDate(rule, year, month) {
    if (rule.pattern === "fixed_day") {
      var fixedDate = new Date(year, month, Math.min(Number(rule.day || 20), new Date(year, month + 1, 0).getDate()));
      var fixedNeedsShift = (!!rule.avoidWeekend && (fixedDate.getDay() === 0 || fixedDate.getDay() === 6)) ||
        (!!rule.fixedAvoidHoliday && financeIsHoliday(financeDateStr(year, month, fixedDate.getDate()), rule.holidays));
      if (fixedNeedsShift) fixedDate = financeShiftBusinessDay(fixedDate, rule.shift === "next_business_day" ? "next_business_day" : "previous_business_day", rule.holidays);
      return financeDateStr(fixedDate.getFullYear(), fixedDate.getMonth(), fixedDate.getDate());
    }

    var lastDay = new Date(year, month + 1, 0).getDate();
    var count = 0;
    var candidate = new Date(year, month, lastDay);
    var day;
    for (day = 1; day <= lastDay; day += 1) {
      var dateObj = new Date(year, month, day);
      if (!financeCountableDay(dateObj, !!rule.countSaturday, rule.holidays || [])) continue;
      count += 1;
      if (count >= Number(rule.nth || 5)) {
        candidate = dateObj;
        break;
      }
    }
    if (!financeReceivableDay(candidate, rule.holidays || [])) {
      candidate = financeShiftBusinessDay(candidate, rule.shift === "next_business_day" ? "next_business_day" : "previous_business_day", rule.holidays || []);
    }
    return financeDateStr(candidate.getFullYear(), candidate.getMonth(), candidate.getDate());
  }

  function financeRuleOccurrencesUntil(rules, endDate) {
    var end = new Date(endDate + "T12:00:00");
    var startYear = end.getFullYear() - 2;
    var startMonth = 0;
    (rules || []).forEach(function (rule) {
      if (!rule || !rule.startDate) return;
      var start = new Date(rule.startDate + "T12:00:00");
      if (start.getFullYear() < startYear) {
        startYear = start.getFullYear();
        startMonth = start.getMonth();
      } else if (start.getFullYear() === startYear) {
        startMonth = Math.min(startMonth, start.getMonth());
      }
    });
    var occurrences = [];
    var year = startYear;
    var month = startMonth;
    while (year < end.getFullYear() || (year === end.getFullYear() && month <= end.getMonth())) {
      (rules || []).forEach(function (rule) {
        if (!rule || !rule.startDate || Number(rule.value || 0) <= 0) return;
        var date = financeRuleDate(rule, year, month);
        if (date < rule.startDate || date > endDate) return;
        occurrences.push({
          date: date,
          type: rule.type,
          value: Number(rule.value || 0)
        });
      });
      month += 1;
      if (month > 11) {
        month = 0;
        year += 1;
      }
    }
    return occurrences;
  }

  function expandFinanceRecurringMonth(txs, year, month) {
    var result = [];
    (txs || []).forEach(function (tx) {
      if (!tx || !tx.date) return;
      var baseDate = new Date(tx.date + "T12:00:00");
      var txYear = baseDate.getFullYear();
      var txMonth = baseDate.getMonth();

      if (tx.recurrence === "monthly") {
        if (year > txYear || (year === txYear && month >= txMonth)) {
          var monthlyDate = year + "-" + String(month + 1).padStart(2, "0") + "-" + String(baseDate.getDate()).padStart(2, "0");
          result.push(Object.assign({}, tx, { date: monthlyDate }));
        }
      } else if (tx.recurrence === "weekly") {
        var cur = new Date(tx.date + "T12:00:00");
        var firstOfMonth = new Date(year, month, 1);
        var lastOfMonth = new Date(year, month + 1, 0);
        while (cur < firstOfMonth) cur.setDate(cur.getDate() + 7);
        while (cur <= lastOfMonth) {
          var weeklyDate = cur.getFullYear() + "-" + String(cur.getMonth() + 1).padStart(2, "0") + "-" + String(cur.getDate()).padStart(2, "0");
          result.push(Object.assign({}, tx, { date: weeklyDate }));
          cur.setDate(cur.getDate() + 7);
        }
      } else if (txYear === year && txMonth === month) {
        result.push(tx);
      }
    });
    return result;
  }

  function computeHeaderFinance(state) {
    var txs = getFinanceTxs(state);
    var rules = getFinanceRules(state);
    var now = new Date();
    var today = financeToday();
    var ym = { y: now.getFullYear(), m: now.getMonth() };
    var saldo = 0;
    var inMonth = 0;
    var outMonth = 0;

    txs.forEach(function (tx) {
      if (!tx || !tx.date) return;
      if (tx.recurrence === "monthly") {
        var monthlyCur = new Date(tx.date + "T12:00:00");
        while (monthlyCur <= now) {
          saldo += financeDelta(tx);
          monthlyCur.setMonth(monthlyCur.getMonth() + 1);
        }
      } else if (tx.recurrence === "weekly") {
        var weeklyCur = new Date(tx.date + "T12:00:00");
        while (weeklyCur <= now) {
          saldo += financeDelta(tx);
          weeklyCur.setDate(weeklyCur.getDate() + 7);
        }
      } else if (tx.date <= today) {
        saldo += financeDelta(tx);
      }
    });
    financeRuleOccurrencesUntil(rules, today).forEach(function (tx) {
      saldo += financeDelta(tx);
    });

    expandFinanceRecurringMonth(txs, ym.y, ym.m).forEach(function (tx) {
      if (tx.type === "in") inMonth += Number(tx.value || 0);
      if (tx.type === "out") outMonth += Number(tx.value || 0);
    });
    financeRuleOccurrencesUntil(rules, financeDateStr(ym.y, ym.m, new Date(ym.y, ym.m + 1, 0).getDate())).forEach(function (tx) {
      if (tx.date.slice(0, 7) !== financeDateStr(ym.y, ym.m, 1).slice(0, 7)) return;
      if (tx.type === "in") inMonth += Number(tx.value || 0);
      if (tx.type === "out") outMonth += Number(tx.value || 0);
    });

    return {
      saldo: saldo,
      overload: inMonth === 0 ? outMonth > 0 : outMonth > inMonth * 0.4
    };
  }

  function renderHeaderBalance(state) {
    var currentState = state || loadState();
    var balanceVal = document.getElementById("header-balance-val");
    var mobileBalanceVal = document.getElementById("mobile-balance-val");
    var balanceWrap = document.getElementById("header-balance");
    var masked;
    if (!balanceVal && !mobileBalanceVal) return;
    var finance = computeHeaderFinance(currentState);
    var hidden = !(currentState.data && currentState.data.headerBalanceHidden === false);
    var formatted = "R$ " + Number(finance.saldo || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    masked = formatted.replace(/\d/g, "*");
    if (balanceVal) {
      balanceVal.textContent = hidden ? masked : formatted;
      balanceVal.classList.toggle("negative", !!finance.overload);
      balanceVal.classList.toggle("is-hidden", hidden);
    }
    if (mobileBalanceVal) {
      mobileBalanceVal.textContent = hidden ? masked : formatted;
      mobileBalanceVal.classList.toggle("negative", !!finance.overload);
      mobileBalanceVal.classList.toggle("is-hidden", hidden);
      mobileBalanceVal.setAttribute("aria-pressed", hidden ? "true" : "false");
      mobileBalanceVal.setAttribute("title", hidden ? "Mostrar saldo" : "Ocultar saldo");
    }
    if (balanceWrap) {
      balanceWrap.classList.toggle("is-hidden", hidden);
      balanceWrap.setAttribute("aria-pressed", hidden ? "true" : "false");
      balanceWrap.setAttribute("title", hidden ? "Mostrar saldo" : "Ocultar saldo");
    }
  }

  function wireHeaderBalanceToggle(state) {
    var balanceWrap = document.getElementById("header-balance");
    var mobileBalance = document.getElementById("mobile-balance-val");

    function toggleBalanceVisibility() {
      var nextState = ensureStateShape(loadState());
      if (!nextState.data || typeof nextState.data !== "object") nextState.data = {};
      nextState.data.headerBalanceHidden = !nextState.data.headerBalanceHidden;
      state = applySiteState(nextState, loadState());
    }

    if (balanceWrap) {
      balanceWrap.addEventListener("click", function () {
        toggleBalanceVisibility();
      });
    }

    if (mobileBalance) {
      mobileBalance.addEventListener("click", function (event) {
        event.preventDefault();
        event.stopPropagation();
        toggleBalanceVisibility();
      });
    }
  }

  function applySiteState(nextState, previousState) {
    var state = prepareStateForApp(nextState, previousState);
    saveState(state);
    applyProfileToUI(state);
    renderNotifications(state);
    renderRpgHeader(state);
    renderHeaderBalance(state);
    return state;
  }

  function startRpgDailyRefreshWatcher() {
    var lastCycle = getRpgDailyCycleDate();
    if (rpgDailyRefreshTimer) clearInterval(rpgDailyRefreshTimer);
    rpgDailyRefreshTimer = setInterval(function () {
      var nextCycle = getRpgDailyCycleDate();
      if (nextCycle === lastCycle) return;
      lastCycle = nextCycle;
      try {
        applySiteState(loadState(), loadState());
        window.dispatchEvent(new CustomEvent("soter:notifications-changed"));
      } catch (err) { }
    }, 30000);
  }

  function startTaskTimeReminderWatcher() {
    checkTaskTimeReminders();
    if (taskTimeReminderTimer) clearInterval(taskTimeReminderTimer);
    taskTimeReminderTimer = setInterval(function () {
      checkTaskTimeReminders();
    }, 30000);
    if (taskReminderVisibilityBound) return;
    taskReminderVisibilityBound = true;
    window.addEventListener("focus", checkTaskTimeReminders);
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "visible") checkTaskTimeReminders();
    });
  }

  window.SoterRPG = {
    calcXP: function (state) { return calcRpgXp(state || loadState()); },
    getBreakdown: function (state) { return getRpgBreakdown(state || loadState()); },
    getRawBreakdown: function (state) { return getRawRpgBreakdown(state || loadState()); },
    getAttrs: function (state) { return getRpgAttrs(state || loadState()); },
    getClassStates: function (state) { return getRpgClassStates(state || loadState()); },
    getSkillStates: function (state) { return getSkillStates(state || loadState()); },
    getSkillCatalog: function () { return RPG_SKILL_DEFS.map(function (skill) { return Object.assign({}, skill); }); },
    getDailyMissions: function (state) { return getDailyMissionsForState(state || loadState()); },
    getReviewStats: function (state) { return getReviewStats(state || loadState()); },
    getQuickStats: function (state) { return getRpgQuickStats(state || loadState()); },
    getTrackerStreak: function (tracker, state) { return getTrackerEngagementStreakInfo(state || loadState(), tracker); },
    getGymStreak: function (state) { return getGymScheduleStreakInfo(state || loadState()); },
    getLog: function (state) { return buildRpgLog(state || loadState()); },
    xpForLevel: xpForLevel,
    getLevel: function (xp) { return getLevelFromXp(xp); },
    syncState: function (state, previousState) { return syncRpgState(state, previousState); },
    renderHeaderProgress: function (state) { renderRpgHeader(state || loadState()); }
  };

  function applyProfileToUI(state) {
    var profile = state.profile;
    var displayName = profile.name && profile.name.trim() ? profile.name.trim() : DEFAULT_STATE.profile.name;
    var hasAvatar = !!profile.avatar;

    var headerName = document.getElementById("header-profile-name");
    var mobileName = document.getElementById("mobile-profile-name");
    var pmName = document.getElementById("pm-name-display");
    var nameInput = document.getElementById("pm-name-input");
    var initials = document.getElementById("header-initials");
    var mobileInitials = document.getElementById("mobile-initials");
    var avatar = document.getElementById("header-avatar");
    var mobileAvatar = document.getElementById("mobile-avatar");
    var avatarImg = document.getElementById("header-avatar-img");
    var mobileAvatarImg = document.getElementById("mobile-avatar-img");

    if (headerName) headerName.textContent = displayName;
    if (mobileName) mobileName.textContent = displayName;
    if (pmName) pmName.textContent = displayName;
    if (nameInput) nameInput.value = displayName;
    if (initials) initials.textContent = getInitials(displayName);
    if (mobileInitials) mobileInitials.textContent = getInitials(displayName);

    if (avatar && avatarImg) {
      if (hasAvatar) {
        avatar.classList.add("has-photo");
        avatarImg.src = profile.avatar;
      } else {
        avatar.classList.remove("has-photo");
        avatarImg.removeAttribute("src");
      }
    }

    if (mobileAvatar && mobileAvatarImg) {
      if (hasAvatar) {
        mobileAvatar.classList.add("has-photo");
        mobileAvatarImg.src = profile.avatar;
      } else {
        mobileAvatar.classList.remove("has-photo");
        mobileAvatarImg.removeAttribute("src");
      }
    }
  }

  function compressImageDataUrl(file, callback) {
    var reader = new FileReader();
    reader.onload = function (event) {
      var img = new Image();
      img.onload = function () {
        var maxSize = 320;
        var w = img.width;
        var h = img.height;
        var ratio = Math.min(maxSize / w, maxSize / h, 1);
        var outW = Math.round(w * ratio);
        var outH = Math.round(h * ratio);

        var canvas = document.createElement("canvas");
        canvas.width = outW;
        canvas.height = outH;
        canvas.getContext("2d").drawImage(img, 0, 0, outW, outH);
        callback(canvas.toDataURL("image/jpeg", 0.85));
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  }

  function wireProfileControls(state) {
    var nameInput = document.getElementById("pm-name-input");
    var avatarInput = document.getElementById("pm-avatar-input");
    var changePhotoBtn = document.getElementById("pm-avatar-change-btn");
    var removePhotoBtn = document.getElementById("pm-avatar-remove-btn");

    if (nameInput) {
      nameInput.addEventListener("input", function () {
        var value = nameInput.value.trim();
        state.profile.name = value || DEFAULT_STATE.profile.name;
        state = applySiteState(state, loadState());
      });
    }

    if (changePhotoBtn && avatarInput) {
      changePhotoBtn.addEventListener("click", function () {
        avatarInput.click();
      });
    }

    if (avatarInput) {
      avatarInput.addEventListener("change", function (event) {
        var file = event.target.files && event.target.files[0];
        if (!file) return;
        compressImageDataUrl(file, function (dataUrl) {
          state.profile.avatar = dataUrl;
          state = applySiteState(state, loadState());
          avatarInput.value = "";
        });
      });
    }

    if (removePhotoBtn) {
      removePhotoBtn.addEventListener("click", function () {
        state.profile.name = DEFAULT_STATE.profile.name;
        state.profile.avatar = "";
        state = applySiteState(state, loadState());
      });
    }
  }

  function wireFirebaseAuthControls() {
    var openBtn = document.getElementById('firebase-open-auth-modal-btn');
    var loginBtn = document.getElementById('firebase-login-btn');
    var logoutBtn = document.getElementById('firebase-logout-btn');
    var syncBtn = document.getElementById('firebase-sync-user-btn');
    if (openBtn) openBtn.addEventListener('click', function () { openAuthModal(); });
    if (loginBtn) loginBtn.addEventListener('click', function () { openAuthModal(); });
    if (logoutBtn) logoutBtn.addEventListener('click', function () {
      window.SoterStorage.logoutFirebase().catch(function () { });
    });
    if (syncBtn) syncBtn.addEventListener('click', function () {
      if (!firebaseCurrentUser) { openAuthModal(); return; }
      window.SoterStorage.syncFirebaseNow().catch(function () { });
    });
    updateFirebaseAuthUi();
  }

  function renderHeader() {
    var mount = document.querySelector("[data-app-header]");
    if (!mount) return;

    mount.innerHTML = [
      '<header class="site-header" id="site-header">',
      '  <button class="header-mobile-toggle" id="header-mobile-toggle" type="button" aria-label="Abrir menu" aria-expanded="false" aria-controls="header-mobile-drawer">',
      '    <span></span><span></span><span></span>',
      '  </button>',
      '  <a class="header-brand" href="index.html"><em>S\u00f3l</em> de S\u00f3ter</a>',
      '  <nav class="header-nav" id="header-nav">',
      '    <div style="flex:1"></div>',
      '    <div class="hn-dropdown" id="dd-pessoal">',
      '      <button class="hn-dropdown-trigger" type="button" tabindex="0" aria-expanded="false">Pessoal <span class="hn-chevron">\u25be</span></button>',
      '      <div class="hn-menu">',
      '        <a class="hn-menu-item" data-page="sonhos" href="sonhos.html">Sonhos</a>',
      '        <a class="hn-menu-item" data-page="viagens" href="viagens.html">Viagens</a>',
      '        <a class="hn-menu-item" data-page="wishlist" href="wishlist.html">Wishlist</a>',
      '        <a class="hn-menu-item" data-page="financas" href="financas.html">Finan\u00e7as</a>',
      '        <a class="hn-menu-item" data-page="tarefas" href="tarefas.html">Planejamento</a>',
      '        <a class="hn-menu-item" data-page="academia" href="academia.html">Academia</a>',
      '      </div>',
      '    </div>',
      '    <div class="hn-dropdown" id="dd-estudos">',
      '      <button class="hn-dropdown-trigger" type="button" tabindex="0" aria-expanded="false">Estudos <span class="hn-chevron">\u25be</span></button>',
      '      <div class="hn-menu">',
      '        <a class="hn-menu-item" data-page="revisao" href="revisao.html">Revis\u00e3o</a>',
      '      </div>',
      '    </div>',
      '    <div class="hn-dropdown" id="dd-biblioteca">',
      '      <button class="hn-dropdown-trigger" type="button" tabindex="0" aria-expanded="false">Biblioteca <span class="hn-chevron">\u25be</span></button>',
      '      <div class="hn-menu">',
      '        <a class="hn-menu-item" data-page="livros" href="livros.html">Livraria</a>',
      '        <a class="hn-menu-item" data-page="cinema" href="cinema.html">Cinema</a>',
      '        <a class="hn-menu-item" data-page="mangas" href="mangas.html">Mang\u00e1s</a>',
      '      </div>',
      '    </div>',
      '    <div class="hn-dropdown" id="dd-livro">',
      '      <button class="hn-dropdown-trigger" type="button" tabindex="0" aria-expanded="false">Livro <span class="hn-chevron">\u25be</span></button>',
      '      <div class="hn-menu">',
      '        <a class="hn-menu-item" data-page="projetos" href="projetos.html">Projetos</a>',
      '      </div>',
      '    </div>',
      '  </nav>',
      '  <div class="header-desktop-actions">',
      '  <div class="hn-dropdown hn-notif" id="dd-notif">',
      '    <button class="hn-dropdown-trigger hn-notif-trigger" type="button" tabindex="0" aria-label="Notifica\u00e7\u00f5es" aria-expanded="false">\ud83d\udd14 <span class="hn-notif-badge" id="notif-count">0</span></button>',
      '    <div class="hn-menu hn-notif-menu">',
      '      <div class="hn-notif-head"><span>Notifica\u00e7\u00f5es</span><button type="button" class="hn-notif-clear" id="notif-clear-btn">Limpar</button></div>',
      '      <div class="hn-notif-list" id="notif-list"></div>',
      '    </div>',
      '  </div>',
      '  <button class="header-balance" id="header-balance" type="button" aria-label="Alternar visibilidade do saldo" aria-pressed="false">',
      '    <div>',
      '      <div class="balance-label">Saldo</div>',
      '      <div class="balance-value" id="header-balance-val">R$ 0,00</div>',
      '    </div>',
      '  </button>',
      '  <div class="profile-widget" id="profile-widget">',
      '    <button class="profile-trigger" id="profile-trigger" type="button">',
      '      <div class="profile-avatar" id="header-avatar">',
      '        <img id="header-avatar-img" src="" alt="">',
      '        <span class="avatar-initials" id="header-initials">?</span>',
      '      </div>',
      '      <div class="profile-info">',
      '        <div class="profile-name" id="header-profile-name">Usu\u00e1rio</div>',
      '        <div class="profile-level-row">',
      '          <span class="profile-level-badge" id="header-level-badge">Nv 1</span>',
      '          <div class="profile-xp-bar"><div class="profile-xp-fill" id="header-xp-fill" style="width:0%"></div></div>',
      '        </div>',
      '      </div>',
      '      <span class="profile-chevron">\u25be</span>',
      '    </button>',
      '    <div class="profile-menu" id="profile-menu">',
      '      <div class="pm-header">',
      '        <div class="pm-name" id="pm-name-display">Usu\u00e1rio</div>',
      '        <div class="pm-title" id="pm-title-display">Viajante N\u00edvel 1</div>',
      '        <div class="pm-xp-row">',
      '          <span id="pm-xp-text">0 XP</span>',
      '          <span id="pm-xp-next">pr\u00f3x. n\u00edvel: 100 XP</span>',
      '        </div>',
      '        <div class="pm-xp-bar"><div class="pm-xp-fill" id="pm-xp-fill" style="width:0%"></div></div>',
      '      </div>',
      '      <div class="pm-divider"></div>',
      '      <a class="pm-item pm-item-user" href="rpg.html"><span class="pm-icon pm-icon-user" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><circle cx="12" cy="8" r="3.25"></circle><path d="M5.5 18.5c.9-3 3.5-4.75 6.5-4.75s5.6 1.75 6.5 4.75"></path></svg></span> Usu\u00e1rio</a>',
      '    </div>',
      '  </div>',
      '  </div>',
      '</header>',
      '<div class="header-mobile-backdrop" id="header-mobile-backdrop"></div>',
      '<aside class="header-mobile-drawer" id="header-mobile-drawer" aria-hidden="true">',
      '  <div class="header-mobile-drawer-head">',
      '    <div class="header-mobile-profile">',
      '      <div class="profile-avatar header-mobile-avatar" id="mobile-avatar">',
      '        <img id="mobile-avatar-img" src="" alt="">',
      '        <span class="avatar-initials" id="mobile-initials">?</span>',
      '      </div>',
      '      <div class="header-mobile-profile-copy">',
      '        <div class="header-mobile-profile-name" id="mobile-profile-name">Usu\u00e1rio</div>',
      '        <div class="header-mobile-profile-meta">',
      '          <span class="profile-level-badge" id="mobile-level-badge">Nv 1</span>',
      '          <div class="header-mobile-progress-row">',
      '            <div class="header-mobile-xp-bar"><div class="header-mobile-xp-fill" id="mobile-xp-fill" style="width:0%"></div></div>',
      '            <button class="header-mobile-balance" id="mobile-balance-val" type="button" aria-label="Alternar visibilidade do saldo mobile" aria-pressed="false">R$ 0,00</button>',
      '          </div>',
      '        </div>',
      '      </div>',
      '    </div>',
      '    <button class="header-mobile-close" id="header-mobile-close" type="button" aria-label="Fechar menu">\u00d7</button>',
      '  </div>',
      '  <nav class="header-mobile-nav">',
      '    <div class="header-mobile-group-label">Pessoal</div>',
      '    <a class="header-mobile-link" href="sonhos.html">Sonhos</a>',
      '    <a class="header-mobile-link" href="viagens.html">Viagens</a>',
      '    <a class="header-mobile-link" href="wishlist.html">Wishlist</a>',
      '    <a class="header-mobile-link" href="financas.html">Finan\u00e7as</a>',
      '    <a class="header-mobile-link" href="tarefas.html">Planejamento</a>',
      '    <a class="header-mobile-link" href="academia.html">Academia</a>',
      '    <div class="header-mobile-group-label">Estudos</div>',
      '    <a class="header-mobile-link" href="revisao.html">Revis\u00e3o</a>',
      '    <div class="header-mobile-group-label">Biblioteca</div>',
      '    <a class="header-mobile-link" href="livros.html">Livraria</a>',
      '    <a class="header-mobile-link" href="cinema.html">Cinema</a>',
      '    <a class="header-mobile-link" href="mangas.html">Mang\u00e1s</a>',
      '    <div class="header-mobile-group-label">Livro</div>',
      '    <a class="header-mobile-link" href="projetos.html">Projetos</a>',
      '  </nav>',
      '  <div class="header-mobile-drawer-actions">',
      '    <a class="header-mobile-action" href="rpg.html">Usu\u00e1rio</a>',
      '  </div>',
      '</aside>'
    ].join("\n");
  }

  function ensureNotifications(state) {
    if (!state.data || typeof state.data !== "object") state.data = {};
    if (!Array.isArray(state.data.notifications)) {
      state.data.notifications = [];
    } else {
      state.data.notifications = state.data.notifications.map(function (notification) {
        return normalizeNotification(notification);
      });
    }
    state.data.notifications = filterDismissedNotifications(state, state.data.notifications);
    return state.data.notifications;
  }

  function getNotificationPriority(notification) {
    var tone = String(notification && notification.tone || "");
    if (tone === "danger") return 0;
    if (tone === "warn") return 1;
    if (tone === "rpg") return 2;
    return 3;
  }

  function getNotificationGroupOrder(label) {
    var order = {
      "RPG": 0,
      "Ante-abandono": 1,
      "Revis\u00e3o": 2,
      "Sonhos": 3,
      "Viagens": 4,
      "Finan\u00e7as": 5,
      "Planejamento": 6,
      "Academia": 7
    };
    return Object.prototype.hasOwnProperty.call(order, label) ? order[label] : 99;
  }

  function getNotificationTonePillLabel(notification) {
    var tone = String(notification && notification.tone || "");
    if (tone === "danger") return "Urgente";
    if (tone === "warn") return "Aten\u00e7\u00e3o";
    if (tone === "rpg") return "Progresso";
    return "Hoje";
  }

  function renderNotifications(state) {
    var list = document.getElementById("notif-list");
    var count = document.getElementById("notif-count");
    var grouped = {};
    var groupList;
    var summary;
    if (!list || !count) return;

    var notifications = ensureNotifications(state);
    count.textContent = String(notifications.length);
    count.style.display = notifications.length ? "inline-flex" : "none";

    if (!notifications.length) {
      list.innerHTML = '<div class="hn-notif-empty">Sem notifica\u00e7\u00f5es</div>';
      return;
    }

    notifications.map(function (item) {
      return normalizeNotification(item);
    }).forEach(function (notification) {
      var key = String(notification.label || "Sistema");
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(notification);
    });

    groupList = Object.keys(grouped).sort(function (a, b) {
      return getNotificationGroupOrder(a) - getNotificationGroupOrder(b) || a.localeCompare(b, "pt-BR");
    });

    summary = {
      urgent: notifications.filter(function (item) { return getNotificationPriority(item) === 0; }).length,
      attention: notifications.filter(function (item) { return getNotificationPriority(item) === 1; }).length
    };

    list.innerHTML =
      '<div class="hn-notif-summary">' +
      '<span class="hn-notif-summary-pill tone-danger">Urgentes ' + summary.urgent + '</span>' +
      '<span class="hn-notif-summary-pill tone-warn">Aten\u00e7\u00e3o ' + summary.attention + '</span>' +
      '<span class="hn-notif-summary-pill">Total ' + notifications.length + '</span>' +
      '</div>' +
      groupList.map(function (groupName) {
        var items = grouped[groupName].sort(function (a, b) {
          return getNotificationPriority(a) - getNotificationPriority(b) || String(a.text).localeCompare(String(b.text), "pt-BR");
        });
        return '<section class="hn-notif-group">' +
          '<div class="hn-notif-group-head"><span>' + escapeHtml(groupName) + '</span><span>' + items.length + '</span></div>' +
          items.map(function (notification) {
            return '<div class="hn-notif-item tone-' + escapeHtml(notification.tone) + '" data-notif-href="' + escapeHtml(notification.href) + '" tabindex="0" role="button" aria-label="' + escapeHtml(notification.label + ": " + notification.text) + '">' +
              '<div class="hn-notif-icon" aria-hidden="true">' + escapeHtml(notification.icon) + '</div>' +
              '<div class="hn-notif-copy"><div class="hn-notif-label-row"><div class="hn-notif-label">' + escapeHtml(notification.label) + '</div><span class="hn-notif-chip tone-' + escapeHtml(notification.tone) + '">' + escapeHtml(getNotificationTonePillLabel(notification)) + '</span></div><span class="hn-notif-text">' + escapeHtml(notification.text) + '</span><span class="hn-notif-linkhint">Abrir</span></div>' +
              '<button type="button" class="hn-notif-remove" data-notif-id="' + escapeHtml(notification.id) + '" aria-label="Remover notifica\u00e7\u00e3o">\u00d7</button></div>';
          }).join("") +
          '</section>';
      }).join("");
  }

  function wireNotifications(state) {
    var list = document.getElementById("notif-list");
    var clearBtn = document.getElementById("notif-clear-btn");
    if (!list || !clearBtn) return;

    clearBtn.addEventListener("click", function (event) {
      var currentState;
      event.preventDefault();
      event.stopPropagation();
      currentState = ensureStateShape(loadState());
      ensureNotifications(currentState).forEach(function (notification) {
        dismissNotification(currentState, notification);
      });
      currentState.data.notifications = [];
      saveState(currentState);
      renderNotifications(currentState);
    });

    list.addEventListener("click", function (event) {
      var btn = event.target.closest("[data-notif-id]");
      var currentState;
      var item;
      var href;
      if (!btn) {
        item = event.target.closest(".hn-notif-item[data-notif-href]");
        href = item ? String(item.getAttribute("data-notif-href") || "").trim() : "";
        if (href) window.location.href = href;
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      currentState = ensureStateShape(loadState());
      var id = btn.getAttribute("data-notif-id");
      currentState.data.notifications = ensureNotifications(currentState).filter(function (n) {
        if (String(n.id) === id) {
          dismissNotification(currentState, n);
          return false;
        }
        return true;
      });
      saveState(currentState);
      renderNotifications(currentState);
    });

    list.addEventListener("keydown", function (event) {
      var item;
      var href;
      if (event.key !== "Enter" && event.key !== " ") return;
      if (event.target.closest(".hn-notif-remove")) return;
      item = event.target.closest(".hn-notif-item[data-notif-href]");
      if (!item) return;
      href = String(item.getAttribute("data-notif-href") || "").trim();
      if (!href) return;
      event.preventDefault();
      window.location.href = href;
    });
  }

  function wireHeaderMenus() {
    var dropdowns = Array.prototype.slice.call(document.querySelectorAll(".hn-dropdown"));
    var profileWidget = document.getElementById("profile-widget");
    var profileTrigger = document.getElementById("profile-trigger");
    var mobileToggle = document.getElementById("header-mobile-toggle");
    var mobileClose = document.getElementById("header-mobile-close");
    var mobileDrawer = document.getElementById("header-mobile-drawer");
    var mobileBackdrop = document.getElementById("header-mobile-backdrop");

    function setMobileDrawerOpen(open) {
      var shouldOpen = !!open;
      if (!mobileDrawer || !mobileToggle || !mobileBackdrop) return;
      mobileDrawer.classList.toggle("is-open", shouldOpen);
      mobileBackdrop.classList.toggle("is-open", shouldOpen);
      mobileDrawer.setAttribute("aria-hidden", shouldOpen ? "false" : "true");
      mobileToggle.setAttribute("aria-expanded", shouldOpen ? "true" : "false");
      document.body.classList.toggle("mobile-drawer-open", shouldOpen);
    }

    function setDropdownOpen(dropdown, open) {
      if (!dropdown) return;
      dropdown.classList.toggle("is-open", !!open);
      var trigger = dropdown.querySelector(".hn-dropdown-trigger");
      if (trigger) trigger.setAttribute("aria-expanded", open ? "true" : "false");
    }

    function setProfileOpen(open) {
      if (!profileWidget) return;
      profileWidget.classList.toggle("is-open", !!open);
      if (profileTrigger) profileTrigger.setAttribute("aria-expanded", open ? "true" : "false");
    }

    function closeAllMenus() {
      dropdowns.forEach(function (dropdown) { setDropdownOpen(dropdown, false); });
      setProfileOpen(false);
      setMobileDrawerOpen(false);
    }

    dropdowns.forEach(function (dropdown) {
      var trigger = dropdown.querySelector(".hn-dropdown-trigger");
      var menu = dropdown.querySelector(".hn-menu");
      if (!trigger || !menu) return;

      trigger.addEventListener("click", function (event) {
        event.preventDefault();
        event.stopPropagation();
        var shouldOpen = !dropdown.classList.contains("is-open");
        closeAllMenus();
        setDropdownOpen(dropdown, shouldOpen);
      });

      menu.addEventListener("click", function (event) {
        var target = event.target.closest("a, button");
        if (!target) return;
        if (target.classList.contains("hn-notif-remove") || target.id === "notif-clear-btn") return;
        closeAllMenus();
      });
    });

    if (profileTrigger) {
      profileTrigger.setAttribute("aria-expanded", "false");
      profileTrigger.addEventListener("click", function (event) {
        event.preventDefault();
        event.stopPropagation();
        var shouldOpen = !profileWidget.classList.contains("is-open");
        closeAllMenus();
        setProfileOpen(shouldOpen);
      });
    }

    if (mobileToggle) {
      mobileToggle.addEventListener("click", function (event) {
        event.preventDefault();
        event.stopPropagation();
        setMobileDrawerOpen(!mobileDrawer.classList.contains("is-open"));
      });
    }

    if (mobileClose) {
      mobileClose.addEventListener("click", function (event) {
        event.preventDefault();
        setMobileDrawerOpen(false);
      });
    }

    if (mobileBackdrop) {
      mobileBackdrop.addEventListener("click", function () {
        setMobileDrawerOpen(false);
      });
    }

    document.querySelectorAll(".header-mobile-link, .header-mobile-action").forEach(function (link) {
      link.addEventListener("click", function () {
        setMobileDrawerOpen(false);
      });
    });

    document.addEventListener("click", function (event) {
      var insideHeaderMenu = event.target.closest(".hn-dropdown, .profile-widget, .header-mobile-drawer, .header-mobile-toggle");
      if (insideHeaderMenu) return;
      closeAllMenus();
    });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") closeAllMenus();
    });
  }

  function renderFooter() {
    var mount = document.querySelector("[data-app-footer]");
    if (!mount) return;

    var year = String(new Date().getFullYear());
    mount.innerHTML = [
      '<footer class="site-footer">',
      "  <div>",
      '    <div class="footer-brand"><em>S\u00f3l</em> de S\u00f3ter</div>',
      '    <div class="footer-tagline">Espa\u00e7o pessoal \u00b7 tudo em um s\u00f3 lugar</div>',
      "  </div>",
      '  <div class="footer-links">',
      '    <a class="footer-link" href="livros.html">Livraria</a>',
      '    <a class="footer-link" href="cinema.html">Cinema</a>',
      '    <a class="footer-link" href="sonhos.html">Sonhos</a>',
      '    <a class="footer-link" href="financas.html">Finan\u00e7as</a>',
      '    <a class="footer-link" href="tarefas.html">Planejamento</a>',
      "  </div>",
      '  <div class="footer-copy">\u2726 S\u00f3l de S\u00f3ter \u00b7 <span id="footer-year">' + year + "</span></div>",
      "</footer>"
    ].join("\n");
  }

  function highlightCurrentPage() {
    var page = currentPage();
    document.querySelectorAll("[data-page]").forEach(function (node) {
      if (node.getAttribute("data-page") === page) {
        node.classList.add("active");
      }
    });

    var bibliotecaPages = ["livros", "cinema", "mangas"];
    var pessoalPages = ["sonhos", "viagens", "wishlist", "financas", "tarefas", "academia"];
    var livroPages = ["projetos"];

    if (bibliotecaPages.indexOf(page) >= 0) {
      var ddB = document.getElementById("dd-biblioteca");
      if (ddB) ddB.classList.add("has-active");
    }

    if (livroPages.indexOf(page) >= 0) {
      var ddL = document.getElementById("dd-livro");
      if (ddL) ddL.classList.add("has-active");
    }

    if (pessoalPages.indexOf(page) >= 0) {
      var ddP = document.getElementById("dd-pessoal");
      if (ddP) ddP.classList.add("has-active");
    }

    if (page === "estudos" || page === "revisao") {
      var ddE = document.getElementById("dd-estudos");
      if (ddE) ddE.classList.add("has-active");
    }
  }

  function wireIndexNavigation() {
    document.querySelectorAll('a[href="index.html"]').forEach(function (link) {
      link.addEventListener("click", function () {
        sessionStorage.setItem("soter_allow_index", "1");
      });
    });
  }

  function exposeStorageApi(state) {
    function commit(nextState) {
      var previousState = loadState();
      state = applySiteState(nextState, previousState);
      return state;
    }

    window.SoterStorage = {
      load: function () { return loadState(); },
      save: function (nextState) { return commit(nextState); },
      getState: function () { return ensureStateShape(loadState()); },
      setData: function (key, value) {
        state = ensureStateShape(loadState());
        state.data[key] = value;
        return commit(state);
      },
      getData: function (key) {
        state = ensureStateShape(loadState());
        return state.data[key];
      },
      getFirebaseStatus: function () {
        var current = ensureStateShape(loadState());
        var meta = current.data.firebaseSync && typeof current.data.firebaseSync === "object" ? current.data.firebaseSync : {};
        return Promise.resolve({
          configured: !!getFirebaseRuntimeConfig(),
          enabled: !!meta.enabled,
          hydrated: !!meta.hydrated,
          projectId: meta.projectId || "",
          strategy: meta.strategy || "",
          userUid: meta.userUid || (firebaseCurrentUser ? firebaseCurrentUser.uid : ""),
          userEmail: meta.userEmail || (firebaseCurrentUser ? firebaseCurrentUser.email || "" : ""),
          collections: meta.collections || [],
          lastSyncAt: meta.lastSyncAt || firebaseLastSyncedAt || "",
          lastRemoteAt: meta.lastRemoteAt || "",
          lastError: meta.lastError || firebaseLastError || ""
        });
      },
      getFirebaseAuthStatus: function () {
        if (!getFirebaseRuntimeConfig()) {
          return Promise.resolve({
            configured: false,
            signedIn: false,
            uid: '',
            email: '',
            displayName: '',
            providerIds: [],
            providers: getFirebaseAuthConfig()
          });
        }
        return initFirebaseSync().then(function () {
          return Promise.resolve(firebaseUserReadyPromise).catch(function () { return true; });
        }).then(function () {
          return {
            configured: !!getFirebaseRuntimeConfig(),
            signedIn: !!firebaseCurrentUser,
            uid: firebaseCurrentUser ? firebaseCurrentUser.uid : '',
            email: firebaseCurrentUser ? firebaseCurrentUser.email || '' : '',
            displayName: firebaseCurrentUser ? getFirebaseAuthDisplayName(firebaseCurrentUser) : '',
            providerIds: firebaseCurrentUser ? getFirebaseAuthProviderIds(firebaseCurrentUser) : [],
            providers: getFirebaseAuthConfig()
          };
        });
      },
      loginWithEmail: function (email, password, options) {
        return initFirebaseSync().then(function () {
          return setFirebaseAuthPersistence(!!(options && options.remember)).then(function () {
            authRememberDefault = !!(options && options.remember);
            return firebaseAuthInstance.signInWithEmailAndPassword(email, password);
          });
        });
      },
      registerWithEmail: function (email, password, options) {
        return initFirebaseSync().then(function () {
          var desiredName = String(options && options.name || '').trim();
          firebasePendingSignupProfileName = desiredName;
          return setFirebaseAuthPersistence(!!(options && options.remember)).then(function () {
            authRememberDefault = !!(options && options.remember);
            return firebaseAuthInstance.createUserWithEmailAndPassword(email, password);
          }).then(function (credential) {
            var user = credential && credential.user ? credential.user : null;
            if (user && user.uid) {
              markFreshFirebaseAccount(user.uid, desiredName);
              removeScopedStateForUser(user.uid);
            }
            if (user && desiredName && typeof user.updateProfile === 'function') {
              return user.updateProfile({ displayName: desiredName }).then(function () {
                var state = ensureStateShape(loadState());
                state.profile.name = desiredName;
                replaceLocalStateSnapshot(state, state);
                queueFirebaseSync(state);
                return credential;
              }).catch(function () {
                return credential;
              });
            }
            return credential;
          });
        });
      },
      tryAutoEnter: function (redirectUrl) {
        return this.getFirebaseAuthStatus().then(function (status) {
          if (!status || !status.signedIn) return false;
          try { sessionStorage.setItem("soter_allow_index", "1"); } catch (err) { }
          window.location.href = String(redirectUrl || 'index.html');
          return true;
        }).catch(function () {
          return false;
        });
      },
      loginWithGoogle: function () {
        return initFirebaseSync().then(function () {
          if (!getFirebaseAuthConfig().google) throw new Error('google_auth_disabled');
          var provider = new window.firebase.auth.GoogleAuthProvider();
          return firebaseAuthInstance.signInWithPopup(provider);
        });
      },
      logoutFirebase: function () {
        return initFirebaseSync().then(function () {
          return firebaseAuthInstance.signOut().then(function () {
            try { sessionStorage.removeItem("soter_allow_index"); } catch (err) { }
            window.location.href = 'apresentacao.html';
            return true;
          });
        });
      },
      deleteFirebaseAccount: function (options) {
        var opts = options && typeof options === 'object' ? options : {};
        return initFirebaseSync().then(function () {
          var user = firebaseAuthInstance && firebaseAuthInstance.currentUser;
          var providerIds;
          var uid;
          var reauthPromise;
          if (!user) throw new Error('not_authenticated');
          providerIds = getFirebaseAuthProviderIds(user);
          uid = String(user.uid || '');

          if (providerIds.indexOf('password') >= 0) {
            var password = String(opts.password || '');
            if (!password) throw new Error('password_required');
            reauthPromise = user.reauthenticateWithCredential(
              window.firebase.auth.EmailAuthProvider.credential(String(user.email || ''), password)
            );
          } else if (providerIds.indexOf('google.com') >= 0) {
            reauthPromise = user.reauthenticateWithPopup(new window.firebase.auth.GoogleAuthProvider());
          } else {
            throw new Error('unsupported_provider');
          }

          return reauthPromise.then(function () {
            firebasePendingDeletedUid = uid;
            return Promise.resolve(firebaseDocRef ? firebaseDocRef.delete() : null)
              .catch(function () { return null; })
              .then(function () { return deleteFirestoreUserSubcollection(uid, 'rubrica').catch(function () { return null; }); })
              .then(function () { return user.delete(); })
              .then(function () {
                removeScopedStateForUser(uid);
                try { sessionStorage.removeItem("soter_allow_index"); } catch (err) { }
                window.location.href = 'apresentacao.html';
                return true;
              })
              .catch(function (err) {
                firebasePendingDeletedUid = '';
                throw err;
              });
          });
        });
      },
      syncFirebaseNow: function () {
        queueFirebaseSync(loadState());
        return flushFirebaseSync();
      },
      openAuthModal: function (options) {
        openAuthModal(options);
        return Promise.resolve(true);
      }
    };
  }

  renderHeader();
  renderFooter();
  syncScrollbarCompensation();
  window.addEventListener("resize", syncScrollbarCompensation);
  wireIndexNavigation();
  highlightCurrentPage();
  wireHeaderMenus();
  hydrateRuntimeStateFromCache();

  var siteState = prepareStateForApp(loadState(), loadState());
  saveState(siteState);
  applyProfileToUI(siteState);
  renderNotifications(siteState);
  wireNotifications(siteState);
  window.addEventListener("soter:notifications-changed", function () {
    siteState = ensureStateShape(loadState());
    renderNotifications(siteState);
  });
  renderRpgHeader(siteState);
  renderHeaderBalance(siteState);
  wireHeaderBalanceToggle(siteState);
  exposeStorageApi(siteState);
  wireFirebaseAuthControls();
  startRpgDailyRefreshWatcher();
  startTaskTimeReminderWatcher();
  tryHydrateFromFile();
  initFirebaseSync().catch(function () { });
}());

window.createLiquidBar = function (canvas, opts) {
  var o = opts || {};
  var col0 = o.col0 || 'rgba(255, 232, 108, 0.96)';
  var col1 = o.col1 || '#c9a96e';
  var col2 = o.col2 || 'rgba(88, 50, 6, 0.98)';
  var hGrad = !!o.horizontal;
  var causticRGB = o.causticRGB || '255,252,215';

  var ctx = canvas.getContext('2d');
  var target = 0, current = 0;
  var t = 0;
  var slosh = 0, sloshVel = 0;
  var bubbles = [];
  var lw = 0, lh = 0;
  var raf = null, active = false;

  // 4-component wave system — freq, base-amp, speed, phase
  var WF = [0.030, 0.058, 0.108, 0.016];
  var WA = [1.5,   0.95,  0.52,  0.85];
  var WS = [1.05, -0.62,  1.75, -0.35];
  var WP = [0.0,   2.1,   4.3,   1.0 ];

  function waveY(x) {
    var y = 0, sm = 1.0 + Math.abs(slosh) * 0.55;
    for (var i = 0; i < 4; i++) {
      y += Math.sin(x * WF[i] + t * WS[i] + WP[i]) * WA[i];
    }
    return y * sm;
  }

  function resize() {
    var p = canvas.parentElement;
    if (!p) return;
    var r = p.getBoundingClientRect();
    lw = r.width  || p.offsetWidth  || 0;
    lh = r.height || p.offsetHeight || 0;
    var dpr = window.devicePixelRatio || 1;
    canvas.width  = Math.round(lw * dpr);
    canvas.height = Math.round(lh * dpr);
  }

  function spawnBubbles(fw) {
    var n = 3 + Math.floor(Math.random() * 5);
    for (var i = 0; i < n; i++) {
      bubbles.push({
        x: Math.random() * Math.max(1, fw * 0.85),
        y: lh * (0.55 + Math.random() * 0.45),
        vx: (Math.random() - 0.5) * 0.4,
        vy: -(0.4 + Math.random() * 1.2),
        r: 0.8 + Math.random() * 2.4,
        life: 0.7 + Math.random() * 0.3,
        decay: 0.008 + Math.random() * 0.012
      });
    }
  }

  function tracePath(fw) {
    var FADE = 20;
    ctx.beginPath();
    ctx.moveTo(0, lh);
    ctx.lineTo(0, waveY(0));
    for (var x = 2; x <= fw; x += 2) {
      var wy = waveY(x);
      if (fw < lw * 0.98 && x > fw - FADE) {
        wy *= Math.max(0, (fw - x) / FADE);
      }
      ctx.lineTo(x, wy);
    }
    ctx.lineTo(fw, lh);
    ctx.closePath();
  }

  function tick() {
    if (!lw || !lh) resize();
    t += 0.022;
    current += (target - current) * 0.045;

    // Spring-damped slosh oscillator
    sloshVel = (sloshVel - slosh * 0.18) * 0.83;
    slosh += sloshVel;
    if (Math.abs(slosh) < 0.01 && Math.abs(sloshVel) < 0.01) slosh = sloshVel = 0;

    // Bubble physics
    for (var i = bubbles.length - 1; i >= 0; i--) {
      var b = bubbles[i];
      b.x += b.vx + Math.sin(t * 2.7 + i * 1.4) * 0.12;
      b.y += b.vy;
      b.vy *= 0.997;
      b.life -= b.decay;
      if (b.life <= 0) bubbles.splice(i, 1);
    }

    var dpr = window.devicePixelRatio || 1;
    var W = lw, H = lh;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!W || !H) { raf = requestAnimationFrame(tick); return; }

    ctx.save();
    ctx.scale(dpr, dpr);

    var fw = Math.max(0, (current / 100) * W);

    if (fw > 0.5) {
      // ── Main fill ─────────────────────────────────────────
      tracePath(fw);
      var mainGrad = hGrad
        ? ctx.createLinearGradient(0, 0, W, 0)
        : ctx.createLinearGradient(0, 0, 0, H);
      mainGrad.addColorStop(0.00, col0);
      mainGrad.addColorStop(0.45, col1);
      mainGrad.addColorStop(1.00, col2);
      ctx.fillStyle = mainGrad;
      ctx.fill();

      // ── Inner effects (clipped to liquid shape) ────────────
      ctx.save();
      tracePath(fw);
      ctx.clip();

      // Caustic blob 1 — large, slow drift
      var c1x = fw * (0.20 + 0.14 * Math.sin(t * 0.63));
      var c1y = H  * (0.28 + 0.12 * Math.sin(t * 0.44 + 1.2));
      var cg1 = ctx.createRadialGradient(c1x, c1y, 0, c1x, c1y, fw * 0.52);
      cg1.addColorStop(0, 'rgba(' + causticRGB + ',0.22)');
      cg1.addColorStop(1, 'rgba(' + causticRGB + ',0.00)');
      ctx.fillStyle = cg1;
      ctx.fillRect(0, 0, fw, H);

      // Caustic blob 2 — smaller, faster
      var c2x = fw * (0.65 + 0.17 * Math.sin(t * 1.05 + 2.4));
      var c2y = H  * (0.52 + 0.14 * Math.cos(t * 0.82 + 0.7));
      var cg2 = ctx.createRadialGradient(c2x, c2y, 0, c2x, c2y, fw * 0.28);
      cg2.addColorStop(0, 'rgba(' + causticRGB + ',0.16)');
      cg2.addColorStop(1, 'rgba(' + causticRGB + ',0.00)');
      ctx.fillStyle = cg2;
      ctx.fillRect(0, 0, fw, H);

      // Glass shine on surface
      var sg = ctx.createLinearGradient(0, 0, 0, H * 0.58);
      sg.addColorStop(0.00, 'rgba(255,255,255,0.36)');
      sg.addColorStop(0.28, 'rgba(255,255,255,0.10)');
      sg.addColorStop(1.00, 'rgba(255,255,255,0.00)');
      ctx.fillStyle = sg;
      ctx.fillRect(0, 0, fw, H * 0.58);

      // Depth shadow at bottom
      var dg = ctx.createLinearGradient(0, H * 0.52, 0, H);
      dg.addColorStop(0, 'rgba(0,0,0,0.00)');
      dg.addColorStop(1, 'rgba(0,0,0,0.28)');
      ctx.fillStyle = dg;
      ctx.fillRect(0, H * 0.52, fw, H * 0.48);

      // Bubbles
      for (var bi = 0; bi < bubbles.length; bi++) {
        var bb = bubbles[bi];
        if (bb.x > fw || bb.y < waveY(bb.x)) continue;
        ctx.save();
        ctx.globalAlpha = Math.max(0, bb.life) * 0.75;
        ctx.beginPath();
        ctx.arc(bb.x, bb.y, bb.r, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255,255,255,0.85)';
        ctx.lineWidth = 0.5;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(bb.x - bb.r * 0.28, bb.y - bb.r * 0.28, bb.r * 0.4, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        ctx.fill();
        ctx.restore();
      }

      ctx.restore(); // end inner clip

      // ── Leading-edge glow (outside clip) ──────────────────
      if (fw < W - 3) {
        var ey = H * 0.5 + waveY(fw) * 0.35;
        var eg = ctx.createRadialGradient(fw, ey, 0, fw, ey, H * 1.1);
        eg.addColorStop(0.00, 'rgba(255,242,148,0.70)');
        eg.addColorStop(0.30, 'rgba(255,228,100,0.25)');
        eg.addColorStop(1.00, 'rgba(255,228,100,0.00)');
        ctx.fillStyle = eg;
        ctx.beginPath();
        ctx.arc(fw, ey, H * 1.1, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.restore();
    raf = requestAnimationFrame(tick);
  }

  function start() {
    if (active) return;
    active = true;
    resize();
    raf = requestAnimationFrame(tick);
    window.addEventListener('resize', resize);
  }

  return {
    set: function (pct) {
      pct = Math.max(0, Math.min(100, Number(pct) || 0));
      if (Math.abs(pct - target) > 0.5) {
        slosh = 10;
        sloshVel = 5;
        spawnBubbles((current / 100) * lw);
      }
      target = pct;
      if (!active) start();
    },
    start: start
  };
};

// Registro do Service Worker (cache offline)
if ("serviceWorker" in navigator) {
  window.addEventListener("load", function () {
    navigator.serviceWorker.register("/sw.js").catch(function (err) {
      console.warn("[SW] Registro falhou:", err);
    });
  });
}
