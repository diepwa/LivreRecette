# CLAUDE.md

NoutBook (anciennement « Mon livre de recettes ») : PWA de recettes et de liste de courses, en français, sans build ni dépendance npm. Hébergée sur GitHub Pages (https://diepwa.github.io/LivreRecette/) et installée sur les iPhone de deux utilisateurs qui partagent un seul compte Firebase.

**Règle absolue : une mise à jour ne doit jamais faire perdre de données** (recettes, photos, panier, historique d'achats). En cas de doute, ne pas changer.

## Fichiers

- `index.html` : toute l'app (HTML, CSS, JS inline). Logique pure entre `/*PURE-START*/` et `/*PURE-END*/` (`buildList`, `shopList`, `buildCatalog`, `normalizeShop`, `nameKey`, `EMOJI_MAP`…), testable avec node.
- `sync.js` : synchro Firebase (SDK 12.19.0 depuis gstatic, chargé à la demande). Sans config ou sans réseau, l'app reste en mode local.
- `firebase-config.js` : vraie config du projet `recettes-cedd9`. Ne pas la vider ni la remplacer par des valeurs d'exemple (ces valeurs ne sont pas secrètes).
- `firestore.rules` : accès réservé à `request.auth.uid == uid`. Ne jamais assouplir.
- `recipe-pdf.js` + `vendor/pdf-lib.min.js` (pdf-lib 1.17.1, MIT) : export PDF d'une recette, hors ligne. Polices standard WinAnsi, les émojis sont retirés.
- `sw.js` : service worker (cache d'abord, mise à jour en arrière-plan).
- `manifest.json`, `icons/` (dont `apple-touch-icon.png` 180×180, `splash.png`, `nout.png`).
- `LISEZ-MOI.md` : mode d'emploi pour l'utilisateur (Firebase, installation iPhone, panier, PDF).

## Mise à jour de la PWA et du cache

- **À chaque modification d'un fichier servi, incrémenter `CACHE` dans `sw.js`** (actuellement `livre-recettes-v9`), sinon les téléphones gardent l'ancienne version.
- Tout nouveau fichier local doit être ajouté à `ASSETS` dans `sw.js`.
- Ne jamais mettre en cache les appels Firestore/Auth. Seuls le SDK versionné (`www.gstatic.com/firebasejs/`) et Google Fonts sont mis en cache hors origine.
- Ne pas changer `start_url`, `scope`, l'emplacement des fichiers ni le nom du dépôt : les données locales sont liées à l'adresse.
- Le nom et l'icône de l'écran d'accueil iOS sont figés à l'installation : les changer n'affecte pas une icône déjà installée (il faut la supprimer et refaire « Sur l'écran d'accueil »).

## Données (noms internes figés)

- IndexedDB `livre-recettes` (version 1, store `recipes`, keyPath `id`), localStorage `livre-courses`, marqueur d'export `app:"livre-recettes"`. Ne pas les renommer malgré le nom NoutBook. Pour changer le schéma : incrémenter la version IndexedDB avec un `onupgradeneeded` qui conserve l'existant.
- Firestore : `users/{uid}/recipes/{id}` et `users/{uid}/meta/shop`. `meta/shop` s'écrit avec `setDoc(..., {merge:true})` pour qu'un téléphone pas à jour n'efface pas les champs qu'il ne connaît pas.
- Tout nouveau champ est optionnel avec une valeur par défaut à la lecture. Ne jamais renommer ni supprimer un champ existant.
- Un document Firestore fait au plus 1 Mo : 6 photos max par recette, recompressées par `fitPhotos`. Ne pas augmenter sans autre stockage.
- Panier : `sel` {id: personnes} (Firestore : `[{id,n}]`), `have` {clé: true}, `extra` [noms] (tableau de chaînes), `freq` {clé: {n,last,name}} (fusion par maximum, jamais vidé, même par « Vider »), `basics` {clé: bool}. Clé produit = `nameKey(nom)` ; ne pas la changer sans migration. `normalizeShop()` migre l'ancien format.

## Design

- Palette crème / brun (variables `:root` d'`index.html`) : fond `#faf7f1`, encre `#33291f`, accent `#6b5238`, accent doux `#ece3d5`, ligne `#e6dccb`. Thème sombre : fond `#1b1712`, accent `#d9c3a0`. Tuiles « à acheter » rouges (`--buy` `#e0555d`) et « catalogue » vert-bleu (`--cat` `#4f8f85`) conservées volontairement.
- Pour changer la palette, modifier ensemble : `:root` et le bloc sombre, `<meta name="theme-color">`, `manifest.json` (`background_color`, `theme_color`), le splash (`#splash`), l'objet `C` de `recipe-pdf.js` et les icônes `icons/*`.
- Polices Google Fonts : Fredoka (titres, `--serif`) et Nunito (texte, `--sans`).
- Écran de démarrage `#splash` : logo puis lettres « NoutBook » animées.
- Émojis : l'ordinateur de l'utilisateur n'affiche pas les émojis récents. Préférer ≤ Emoji 11 ; pour un émoji récent, ajouter un repli en 3e élément dans `EMOJI_MAP`. Affichage via `shownEmoji()`. Pas d'émoji devant les titres « NoutBook » et « Liste de courses ».
- Garder `[hidden]{display:none !important}` (sinon `.btn{display:inline-block}` écrase `hidden`).
- Pas de bouton « Créer un compte » : les inscriptions sont fermées.

## Fonctions à préserver

Catégories, recherche, favoris, photos multiples (couverture = 1re), panier rapide 🛒 (accueil et page recette), page panier façon Bring (tuiles rouges à acheter, vertes « Souvent achetés » et « Dans vos recettes », barre « Il me faut… », appui long, annuler), récap des recettes du panier (affiché seulement s'il y en a au moins une), regroupement des ingrédients et quantités, produits de base exclus par défaut, copier/partager la liste, PDF, export/import JSON, thème clair/sombre, impression, synchro temps réel et hors ligne.

## Tester avant de livrer

- Syntaxe : script inline d'`index.html`, `sync.js`, `sw.js`, `recipe-pdf.js`.
- Logique pure : extraire le bloc `PURE-START/PURE-END` et le tester avec node.
- Bout en bout dans Chromium (Playwright préinstallé), servi par `python3 -m http.server 8765`, avec `serviceWorkers: 'block'`. Vérifier que d'anciens enregistrements restent lisibles.
- Arrêter le serveur avec `kill $(pgrep -f "http.server 876[5]")`, jamais `pkill -f` avec un motif présent dans la commande elle-même.

## Avec l'utilisateur

Signaler tout point à risque, conseiller un export de secours (« ⋯ » → Exporter) avant une mise à jour importante, et dire quels fichiers ont changé.
