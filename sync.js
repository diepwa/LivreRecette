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
  const { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, collection, doc, setDoc, getDoc, deleteDoc, onSnapshot, Timestamp } = fsMod;

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
  let unsubX = [];
  let friendDocs = [];          // amis tels qu'enregistrés chez moi
  const liveNames = new Map();  // pseudo actuel de chaque ami
  const nameUnsubs = new Map();
  let publicSynced = false;
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
  const listsRef = () => doc(db, "users", uid, "meta", "lists");
  const tagsRef = () => doc(db, "users", uid, "meta", "tags");
  const profileRef = () => doc(db, "users", uid, "meta", "profile");
  const friendRef = (f) => doc(db, "users", uid, "friends", f);
  const inboxOf = (u) => collection(db, "users", u, "inbox");
  // pseudo public : lisible seulement par les comptes que l'on a en amis
  const publicRef = (u) => doc(db, "profiles", u);
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

  hooks.pushLists = () => {
    if (!uid) return;
    // merge:true fusionne liste par liste : deux téléphones peuvent créer une liste chacun sans s'écraser
    setDoc(listsRef(), { lists: app.getLists(), updated: Date.now() }, { merge: true }).catch(fail);
  };

  hooks.pushTags = () => {
    if (!uid) return;
    setDoc(tagsRef(), { icons: app.getTagIcons(), updated: Date.now() }, { merge: true }).catch(fail);
  };

  // ---------- amis et partage ----------
  const myName = () => (app.getProfile().name || "").trim();
  function randomCode() {
    const abc = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
    const b = new Uint8Array(8);
    crypto.getRandomValues(b);
    return Array.from(b, (x) => abc[x % abc.length]).join("");
  }
  async function createInvite() {
    if (!uid) throw new Error("Connecte-toi d'abord.");
    const code = randomCode();
    // valable 7 jours ; les règles Firestore refusent un code expiré
    const write = setDoc(doc(db, "invites", code), {
      from: uid,
      name: myName(),
      exp: Timestamp.fromMillis(Date.now() + 7 * 864e5),
    });
    // hors ligne, l'écriture attendrait le réseau indéfiniment : l'ami ne pourrait pas encore utiliser le code
    const late = new Promise((_, rej) => setTimeout(() => rej(new Error("Pas de réseau : réessaie quand tu seras connecté.")), 12000));
    try { await Promise.race([write, late]); }
    catch (e) {
      if ((e && e.code || "").includes("permission-denied")) throw new Error("Création refusée : les règles Firestore ne sont pas à jour.");
      throw e;
    }
    return code;
  }
  async function redeemInvite(code) {
    if (!uid) throw new Error("Connecte-toi d'abord.");
    let snap;
    try {
      snap = await getDoc(doc(db, "invites", code));
    } catch (e) {
      const c = (e && e.code) || "";
      if (c.includes("permission-denied")) throw new Error("Code inconnu ou expiré. Demande un nouveau code à ton ami.");
      throw new Error("Vérification impossible : il faut du réseau.");
    }
    if (!snap.exists()) throw new Error("Code inconnu ou expiré. Demande un nouveau code à ton ami.");
    const inv = snap.data();
    if (inv.from === uid) throw new Error("C'est ton propre code : envoie-le à ton ami.");
    const name = String(inv.name || "").slice(0, 30);
    setDoc(friendRef(inv.from), { name, since: Date.now() }).catch(fail);
    // prévient l'ami : son app l'ajoutera à son tour (amitié réciproque)
    setDoc(doc(inboxOf(inv.from)), { type: "friend", from: uid, fromName: myName(), code, at: Date.now() }).catch(fail);
    return name;
  }
  function sendRecipe(to, r) {
    if (!uid) return;
    const from = uid;
    (async () => {
      const recipe = app.shareable(r);
      recipe.photos = await app.fitPhotos(recipe.photos);
      for (const f of to) {
        setDoc(doc(inboxOf(f.uid)), { type: "recipe", from, fromName: myName(), at: Date.now(), recipe, tagIcons: app.tagIconsFor(recipe.tags) })
          .catch((e) => {
            const c = (e && e.code) || "";
            app.toast(c.includes("permission-denied")
              ? `Envoi refusé : ${f.name || "ton ami"} doit d'abord ouvrir NoutBook pour confirmer votre amitié (ou t'a retiré de ses amis).`
              : `Envoi à ${f.name || "ton ami"} impossible : ${friendly(e)}`);
          });
      }
    })().catch(fail);
  }

  async function handleInbox(snap) {
    for (const ch of snap.docChanges()) {
      if (ch.type === "removed") continue;
      const d = ch.doc, m = d.data() || {};
      try {
        if (m.type === "recipe" && m.recipe && typeof m.recipe === "object") {
          await app.receiveShared({ ...m, id: d.id });
        } else if (m.type === "friend" && typeof m.from === "string") {
          setDoc(friendRef(m.from), { name: String(m.fromName || "").slice(0, 30), since: Date.now() }).catch(fail);
        }
        // pas d'attente du serveur : hors ligne, la suppression part au retour du réseau
        deleteDoc(d.ref).catch(fail);
      } catch (e) { fail(e); }
    }
  }

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
    unsubX = [
      onSnapshot(listsRef(), (snap) => {
        if (snap.metadata.hasPendingWrites) return;
        if (!snap.exists()) {
          if (!snap.metadata.fromCache && Object.keys(app.getLists()).length) hooks.pushLists();
          return;
        }
        app.setLists((snap.data() || {}).lists || {});
      }, fail),
      onSnapshot(tagsRef(), (snap) => {
        if (snap.metadata.hasPendingWrites) return;
        if (!snap.exists()) {
          if (!snap.metadata.fromCache && Object.keys(app.getTagIcons()).length) hooks.pushTags();
          return;
        }
        app.setTagIcons((snap.data() || {}).icons || {});
      }, fail),
      onSnapshot(profileRef(), (snap) => {
        const d = snap.exists() ? snap.data() : {};
        const name = typeof d.name === "string" ? d.name : "";
        app.setProfile({ name });
        // une fois par session : le pseudo public suit le pseudo du compte
        if (name && !publicSynced && !snap.metadata.fromCache) {
          publicSynced = true;
          setDoc(publicRef(uid), { name, updated: Date.now() }).catch(() => {});
        }
      }, fail),
      onSnapshot(collection(db, "users", uid, "friends"), (snap) => {
        friendDocs = [];
        snap.forEach((d) => friendDocs.push({ uid: d.id, name: String((d.data() || {}).name || ""), since: Number((d.data() || {}).since) || 0 }));
        watchFriendNames();
        emitFriends();
      }, fail),
      onSnapshot(inboxOf(uid), (snap) => { queue = queue.then(() => handleInbox(snap)).catch(fail); }, fail),
    ];
  }

  function emitFriends() {
    const list = friendDocs.map((f) => ({ ...f, name: liveNames.get(f.uid) || f.name }));
    list.sort((a, b) => a.name.localeCompare(b.name, "fr", { sensitivity: "base" }));
    app.setFriends(list);
  }
  // suit le pseudo de chaque ami : s'il le change, on voit le nouveau
  function watchFriendNames() {
    const ids = new Set(friendDocs.map((f) => f.uid));
    for (const [id, u] of nameUnsubs) if (!ids.has(id)) { u(); nameUnsubs.delete(id); liveNames.delete(id); }
    for (const f of friendDocs) {
      if (nameUnsubs.has(f.uid)) continue;
      nameUnsubs.set(f.uid, onSnapshot(publicRef(f.uid), (snap) => {
        const n = snap.exists() ? String((snap.data() || {}).name || "").slice(0, 30) : "";
        if (!n || n === liveNames.get(f.uid)) return;
        liveNames.set(f.uid, n);
        // garde aussi le nouveau pseudo chez moi, pour l'avoir hors ligne
        const mine = friendDocs.find((x) => x.uid === f.uid);
        if (mine && mine.name !== n) setDoc(friendRef(f.uid), { name: n }, { merge: true }).catch(() => {});
        emitFriends();
      }, () => nameUnsubs.delete(f.uid))); // refusé = l'ami ne nous a pas (encore) en ami : on garde le nom enregistré et on réessaiera
    }
  }

  function stop() {
    if (unsubR) unsubR();
    if (unsubS) unsubS();
    unsubX.forEach((u) => u());
    unsubX = [];
    nameUnsubs.forEach((u) => u());
    nameUnsubs.clear();
    liveNames.clear();
    friendDocs = [];
    publicSynced = false;
    unsubR = unsubS = null;
    uid = null;
    app.setFriends([]);
    app.setProfile({ name: "" });
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
    signedIn: () => !!uid,
    setProfile: (name) => {
      if (!uid) return;
      setDoc(profileRef(), { name, updated: Date.now() }, { merge: true }).catch(fail);
      setDoc(publicRef(uid), { name, updated: Date.now() }).catch(fail);
    },
    createInvite,
    redeemInvite,
    removeFriend: (f) => { if (uid) deleteDoc(friendRef(f)).catch(fail); },
    restoreFriend: (f) => { if (uid) setDoc(friendRef(f.uid), { name: f.name, since: f.since || Date.now() }).catch(fail); },
    sendRecipe,
  };
}
