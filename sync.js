// Synchronisation Firebase (Auth e-mail + Firestore) — module chargé à la demande par index.html.
// Si la config est absente ou si le SDK ne se charge pas, l'app continue en mode local.
const V = "12.19.0";
const CDN = `https://www.gstatic.com/firebasejs/${V}/`;

export async function initSync(app) {
  const hooks = app.hooks;
  let cfg;
  try {
    ({ firebaseConfig: cfg } = await import("./firebase-config.js"));
  } catch (e) {
    app.setStatus({ state: "off" });
    return null;
  }
  if (!cfg || !cfg.apiKey || /^COLLE/i.test(cfg.apiKey) || !cfg.projectId) {
    app.setStatus({ state: "off" });
    return null;
  }

  let appMod, authMod, fsMod;
  try {
    [appMod, authMod, fsMod] = await Promise.all([
      import(CDN + "firebase-app.js"),
      import(CDN + "firebase-auth.js"),
      import(CDN + "firebase-firestore.js"),
    ]);
  } catch (e) {
    app.setStatus({ state: "unavailable" });
    return null;
  }

  const { initializeApp } = appMod;
  const { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } = authMod;
  const { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, collection, doc, setDoc, deleteDoc, onSnapshot } = fsMod;

  const fb = initializeApp(cfg);
  const auth = getAuth(fb);
  const db = initializeFirestore(fb, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    experimentalAutoDetectLongPolling: true,
  });

  let uid = null;
  let email = "";
  let unsubR = null;
  let unsubS = null;
  let queue = Promise.resolve();
  let shopTimer = null;

  const ls = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
  };
  const docId = (id) => String(id).replace(/\//g, "_");
  const recipesCol = () => collection(db, "users", uid, "recipes");
  const recipeRef = (id) => doc(db, "users", uid, "recipes", docId(id));
  const shopRef = () => doc(db, "users", uid, "meta", "shop");
  const fail = (e) => app.setStatus({ state: "error", email, message: friendly(e) });

  function friendly(e) {
    const c = (e && e.code) || "";
    if (c.includes("permission-denied")) return "accès refusé — vérifie les règles Firestore.";
    if (c.includes("resource-exhausted")) return "quota gratuit du jour atteint.";
    if (c.includes("invalid-argument") || /exceeds the maximum/i.test((e && e.message) || "")) return "une recette est trop volumineuse (trop de photos ?).";
    return (e && e.message) || "erreur inconnue.";
  }

  // ---------- envoi (local -> serveur) ----------
  hooks.push = async (r) => {
    if (!uid) return;
    try {
      const clean = JSON.parse(JSON.stringify(r));
      clean.photos = await app.fitPhotos(clean.photos);
      await setDoc(recipeRef(r.id), clean);
    } catch (e) { fail(e); }
  };
  hooks.remove = async (id) => {
    if (!uid) return;
    try { await deleteDoc(recipeRef(id)); } catch (e) { fail(e); }
  };
  hooks.pushShop = () => {
    if (!uid) return;
    clearTimeout(shopTimer);
    shopTimer = setTimeout(async () => {
      const s = app.getShop();
      try {
        // merge:true => un téléphone qui n'a pas encore la dernière version de l'app
        // n'efface jamais les champs qu'il ne connaît pas (freq, basics…).
        await setDoc(shopRef(), {
          sel: Object.entries(s.sel || {}).map(([id, n]) => ({ id, n: Number(n) || 1 })),
          have: Object.keys(s.have || {}).filter((k) => s.have[k]),
          extra: s.extra || [],
          freq: s.freq || {},
          basics: s.basics || {},
          updated: Date.now(),
        }, { merge: true });
      } catch (e) { fail(e); }
    }, 400);
  };

  // ---------- réception (serveur -> local) ----------
  async function handleRecipes(snap, migKey) {
    let changed = false;
    const remoteIds = new Set();
    snap.forEach((d) => remoteIds.add((d.data() && d.data().id) || d.id));
    for (const ch of snap.docChanges()) {
      const d = ch.doc;
      if (d.metadata.hasPendingWrites) continue; // nos propres écritures
      const data = d.data();
      const id = (data && data.id) || d.id;
      if (ch.type === "removed") {
        if (await app.getLocal(id)) { await app.delLocal(id); changed = true; }
      } else {
        const loc = await app.getLocal(id);
        if (!loc || (data.updated || 0) > (loc.updated || 0)) {
          await app.putLocal(data);
          changed = true;
        }
      }
    }
    if (changed) app.refresh();

    // Première synchro confirmée par le serveur : on envoie les recettes présentes
    // uniquement sur cet appareil (une seule fois par compte et par appareil).
    if (!snap.metadata.fromCache && !ls.get(migKey)) {
      const locals = await app.listLocal();
      for (const r of locals) if (!remoteIds.has(r.id)) hooks.push(r);
      ls.set(migKey, "1");
    }
    app.setStatus({
      state: snap.metadata.fromCache ? "offline" : snap.metadata.hasPendingWrites ? "pending" : "ok",
      email,
    });
  }

  function start(user) {
    uid = user.uid;
    email = user.email || "";
    const migKey = "livre-sync-migrated-" + uid;
    app.setStatus({ state: "syncing", email });

    unsubR = onSnapshot(
      recipesCol(),
      { includeMetadataChanges: true },
      (snap) => { queue = queue.then(() => handleRecipes(snap, migKey)).catch(fail); },
      fail
    );
    unsubS = onSnapshot(
      shopRef(),
      (snap) => {
        if (snap.metadata.hasPendingWrites) return;
        if (!snap.exists()) {
          if (!snap.metadata.fromCache) hooks.pushShop();
          return;
        }
        const d = snap.data();
        app.setShop({
          sel: Object.fromEntries((d.sel || []).map((x) => [x.id, x.n])),
          have: Object.fromEntries((d.have || []).map((k) => [k, true])),
          extra: Array.isArray(d.extra) ? d.extra : [],
          freq: d.freq && typeof d.freq === "object" ? d.freq : {},
          basics: d.basics && typeof d.basics === "object" ? d.basics : {},
        });
      },
      fail
    );
  }

  function stop() {
    if (unsubR) unsubR();
    if (unsubS) unsubS();
    unsubR = unsubS = null;
    uid = null;
  }

  onAuthStateChanged(auth, (user) => {
    stop();
    if (!user) { app.setStatus({ state: "signedout" }); return; }
    start(user);
  });

  window.addEventListener("offline", () => { if (uid) app.setStatus({ state: "offline", email }); });
  window.addEventListener("online", () => { if (uid) app.setStatus({ state: "syncing", email }); });

  return {
    signIn: (e, p) => signInWithEmailAndPassword(auth, e, p),
    signOut: () => signOut(auth),
  };
}
