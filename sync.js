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
  const { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, collection, doc, setDoc, getDoc, getDocs, getDocFromServer, deleteDoc, onSnapshot, Timestamp } = fsMod;

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
  const livePhotos = new Map(); // photo actuelle de chaque ami (data URL, vide si aucune)
  const okPhoto = (p) => (typeof p === "string" && p.startsWith("data:image/") && p.length < 60000 ? p : "");
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
  const planRef = () => doc(db, "users", uid, "meta", "plan");
  const profileRef = () => doc(db, "users", uid, "meta", "profile");
  const friendRef = (f) => doc(db, "users", uid, "friends", f);
  const inboxOf = (u) => collection(db, "users", u, "inbox");
  // pseudo public : lisible seulement par les comptes que l'on a en amis
  const publicRef = (u) => doc(db, "profiles", u);
  // annuaire des pseudos : pseudos/{clé} = {uid, name} ; la clé (minuscules sans accents) rend le pseudo unique
  const pseudoRef = (k) => doc(db, "pseudos", k);
  const keyOf = (n) => app.pseudoKey(n);
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

  hooks.pushPlan = () => {
    if (!uid) return;
    // merge:true fusionne repas par repas ; un repas retiré est gardé vide (id "") pour que le retrait se propage
    setDoc(planRef(), { slots: app.getPlan().slots, updated: Date.now() }, { merge: true }).catch(fail);
  };

  // ---------- amis et partage ----------
  const myName = () => (app.getProfile().name || "").trim();
  // attend le serveur au plus 12 s : hors ligne, une lecture ou une écriture attendrait indéfiniment
  const net = (p) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(offlineErr()), 12000))]);
  const offlineErr = () => Object.assign(new Error("Pas de réseau : réessaie quand tu seras connecté."), { code: "offline" });
  // erreurs Firestore en français : hors ligne (« client is offline » en anglais sinon), règles pas à jour
  const rulesErr = (e) => {
    const c = (e && e.code) || "";
    if (c === "offline" || c.includes("unavailable") || /offline/i.test((e && e.message) || "")) return offlineErr();
    if (c.includes("permission-denied")) return new Error("Refusé : les règles Firestore ne sont pas à jour.");
    return e;
  };
  // l'annuaire se lit sur le serveur, jamais dans le cache : hors ligne, on le dit tout de suite au lieu de croire un pseudo libre
  const readPseudo = async (k) => {
    if (navigator.onLine === false) throw offlineErr();
    try { return await net(getDocFromServer(pseudoRef(k))); } catch (e) { throw rulesErr(e); }
  };

  // réserve le pseudo dans l'annuaire (et libère l'ancien) ; refuse s'il appartient à un autre compte
  async function claimPseudo(name, oldName) {
    const k = keyOf(name);
    if (k.length < 2) throw new Error("Ton pseudo doit contenir au moins 2 lettres ou chiffres.");
    const snap = await readPseudo(k);
    if (snap.exists() && (snap.data() || {}).uid !== uid) throw Object.assign(new Error(`Le pseudo « ${name} » est déjà pris.`), { code: "taken" });
    try { await net(setDoc(pseudoRef(k), { uid, name, updated: Date.now() })); } catch (e) { throw rulesErr(e); }
    const ok = oldName && keyOf(oldName);
    if (ok && ok !== k) deleteDoc(pseudoRef(ok)).catch(() => {});
    app.setPseudoTaken(false);
  }

  async function addFriendByPseudo(input) {
    if (!uid) throw new Error("Connecte-toi d'abord.");
    const k = keyOf(input);
    if (k.length < 2) throw new Error("Tape le pseudo de ton ami.");
    if (k === keyOf(myName())) throw new Error("C'est ton propre pseudo.");
    if (!myName()) throw new Error("Choisis d'abord ton pseudo.");
    const snap = await readPseudo(k);
    const p = snap.exists() ? snap.data() || {} : null;
    if (!p || typeof p.uid !== "string") throw new Error(`Personne n'a le pseudo « ${String(input).trim()} ».`);
    if (p.uid === uid) throw new Error("C'est ton propre pseudo.");
    const name = String(p.name || input).slice(0, 30);
    if (friendDocs.some((f) => f.uid === p.uid)) throw new Error(`${name} est déjà ton ami.`);
    setDoc(friendRef(p.uid), { name, since: Date.now() }).catch(fail);
    // prévient l'ami : son app l'ajoutera à son tour (amitié réciproque)
    setDoc(doc(inboxOf(p.uid)), { type: "friend", from: uid, fromName: myName(), pseudo: k, at: Date.now() }).catch(fail);
    return name;
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
          const known = friendDocs.some((f) => f.uid === m.from);
          setDoc(friendRef(m.from), { name: String(m.fromName || "").slice(0, 30), since: Date.now() }, { merge: true }).catch(fail);
          if (!known) app.toast(`${String(m.fromName || "Quelqu'un").slice(0, 30)} t'a ajouté à ses amis`);
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
        // ancienne catégorie (« Gâteau & pâtisserie ») encore sur le serveur : on renvoie la version migrée,
        // sans toucher à « updated ». Sans effet ensuite : le document revient avec la nouvelle catégorie.
        if (app.oldCat && app.oldCat(data)) {
          const cur = await app.getLocal(id);
          if (cur && (cur.updated || 0) >= (data.updated || 0)) hooks.push(cur);
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
      onSnapshot(planRef(), (snap) => {
        if (snap.metadata.hasPendingWrites) return;
        if (!snap.exists()) {
          if (!snap.metadata.fromCache && Object.keys(app.getPlan().slots).length) hooks.pushPlan();
          return;
        }
        app.setPlan(snap.data() || {});
      }, fail),
      // includeMetadataChanges : on sait quand le serveur a confirmé qu'il n'y a pas encore de pseudo
      onSnapshot(profileRef(), { includeMetadataChanges: true }, (snap) => {
        const d = snap.exists() ? snap.data() : {};
        const name = typeof d.name === "string" ? d.name : "";
        const photo = okPhoto(d.photo);
        app.setProfile({ name, photo }, !snap.metadata.fromCache);
        // une fois par session : le profil public suit le pseudo et la photo du compte
        if (name && !publicSynced && !snap.metadata.fromCache) {
          publicSynced = true;
          setDoc(publicRef(uid), { name, photo, updated: Date.now() }, { merge: true }).catch(() => {});
          // pseudo choisi avant l'annuaire : on le réserve, ou on signale qu'un autre compte l'a déjà
          claimPseudo(name).catch((e) => { if (e && e.code === "taken") app.setPseudoTaken(true); });
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
    const list = friendDocs.map((f) => ({ ...f, name: liveNames.get(f.uid) || f.name, photo: livePhotos.get(f.uid) || "" }));
    list.sort((a, b) => a.name.localeCompare(b.name, "fr", { sensitivity: "base" }));
    app.setFriends(list);
  }
  // suit le pseudo de chaque ami : s'il le change, on voit le nouveau
  function watchFriendNames() {
    const ids = new Set(friendDocs.map((f) => f.uid));
    for (const [id, u] of nameUnsubs) if (!ids.has(id)) { u(); nameUnsubs.delete(id); liveNames.delete(id); livePhotos.delete(id); }
    for (const f of friendDocs) {
      if (nameUnsubs.has(f.uid)) continue;
      nameUnsubs.set(f.uid, onSnapshot(publicRef(f.uid), (snap) => {
        const n = snap.exists() ? String((snap.data() || {}).name || "").slice(0, 30) : "";
        if (!n) return;
        const p = okPhoto((snap.data() || {}).photo);
        if (n === liveNames.get(f.uid) && p === (livePhotos.get(f.uid) || "")) return;
        liveNames.set(f.uid, n);
        livePhotos.set(f.uid, p);
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
    livePhotos.clear();
    friendDocs = [];
    publicSynced = false;
    unsubR = unsubS = null;
    uid = null;
    app.setFriends([]);
    app.setProfile({ name: "", photo: "" });
  }

  onAuthStateChanged(auth, (user) => {
    stop();
    if (app.setUser) app.setUser(user ? user.uid : null);
    if (!user) { app.setStatus({ state: "signedout" }); return; }
    start(user);
  });

  window.addEventListener("offline", () => { if (uid) app.setStatus({ state: "offline", email }); });
  window.addEventListener("online", () => { if (uid) app.setStatus({ state: "syncing", email }); });

  return {
    signIn: (e, p) => signInWithEmailAndPassword(auth, e, p),
    signOut: () => signOut(auth),
    signedIn: () => !!uid,
    // nouveau pseudo : réservé dans l'annuaire d'abord (lève une erreur s'il est pris ou sans réseau)
    setProfile: async (name, oldName) => {
      if (!uid) return;
      await claimPseudo(name, oldName);
      setDoc(profileRef(), { name, updated: Date.now() }, { merge: true }).catch(fail);
      setDoc(publicRef(uid), { name, updated: Date.now() }, { merge: true }).catch(fail);
    },
    // photo de profil : petite image JPEG en data URL ("" = aucune), dans mon profil et dans le profil public
    setPhoto: (photo) => {
      if (!uid) return;
      photo = okPhoto(photo);
      setDoc(profileRef(), { photo, updated: Date.now() }, { merge: true }).catch(fail);
      setDoc(publicRef(uid), { name: myName(), photo, updated: Date.now() }, { merge: true }).catch(fail);
    },
    addFriendByPseudo,
    redeemInvite,
    removeFriend: (f) => { if (uid) deleteDoc(friendRef(f)).catch(fail); },
    isFriend: (u) => friendDocs.some((f) => f.uid === u),
    restoreFriend: (f) => { if (uid) setDoc(friendRef(f.uid), { name: f.name, since: f.since || Date.now() }).catch(fail); },
    sendRecipe,
    // recettes d'un ami, en lecture seule (règle Firestore : il faut être dans ses amis)
    friendRecipes: async (f) => {
      if (!uid) throw new Error("Connecte-toi d'abord.");
      let snap;
      try {
        snap = await getDocs(collection(db, "users", f, "recipes"));
      } catch (e) {
        const c = (e && e.code) || "";
        if (c.includes("permission-denied")) { const err = new Error("denied"); err.code = "denied"; throw err; }
        throw new Error("Chargement impossible : il faut du réseau.");
      }
      return snap.docs.map((d) => ({ ...d.data(), id: (d.data() && d.data().id) || d.id }));
    },
  };
}
