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

- **À chaque modification d'un fichier servi, incrémenter `CACHE` dans `sw.js`** (actuellement `livre-recettes-v15`), sinon les téléphones gardent l'ancienne version.
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

Contexte de design de l'app, à relire avant toute modification visuelle.

### Pour qui, pour quoi

- Deux personnes d'un même foyer, sur iPhone, en PWA plein écran. Usage dans la cuisine (mains occupées, coup d'œil rapide sur une recette) et au supermarché (cocher vite, d'une main, parfois avec un réseau faible).
- L'app remplace un cahier de recettes familial et une appli de courses type Bring. Elle doit rester aussi simple à utiliser que ces deux objets.
- Interface entièrement en français, sur un ton familier : les textes tutoient (« Ton livre est vide… », « Touche une tuile… »). Garder ce tutoiement dans les nouveaux textes.

### Personnalité

Chaleureuse, familiale, gourmande, un peu ludique (logo chat, lettres animées au démarrage, émojis d'aliments). Jamais froide ni « appli de productivité ». Calme plutôt que bruyante : une seule couleur d'accent, beaucoup de crème.

### Direction visuelle

- Papier crème et encre brune, comme un carnet de cuisine. Les photos des recettes apportent la couleur ; l'interface reste sobre autour.
- Formes rondes et douces : polices arrondies, coins arrondis partout, pastilles en `999px`.
- Deux exceptions colorées assumées, propres au panier façon Bring : tuiles rouges « à acheter » et tuiles vert-bleu « catalogue ». Ne pas les ramener dans la palette brune.

### Palette

- Variables `:root` d'`index.html` : fond `#faf7f1`, carte `#ffffff`, encre `#33291f`, texte secondaire `--muted` `#85775f`, ligne `#e6dccb`, accent `#6b5238`, accent doux `#ece3d5`, ok `#4f7a4a`. Rouge danger `#c0392b`.
- Thème sombre (`prefers-color-scheme`) : fond `#1b1712`, carte `#26201a`, encre `#f0e8da`, accent `#d9c3a0`. Toute nouvelle couleur doit avoir sa valeur sombre.
- Panier : `--buy` `#e0555d` (sombre `#c94a52`), `--cat` `#4f8f85` (sombre `#3f7a71`). Couleurs de recette `--rc` dans le récap et les pastilles des tuiles.
- Toujours passer par les variables, pas de couleur en dur dans un nouveau composant.
- Pour changer la palette, modifier ensemble : `:root` et le bloc sombre, `<meta name="theme-color">`, `manifest.json` (`background_color`, `theme_color`), le splash (`#splash`), l'objet `C` de `recipe-pdf.js` et les icônes `icons/*`.

### Typographie

- Google Fonts : Fredoka (titres, `--serif`, graisse 600-700) et Nunito (texte, `--sans`). Replis `ui-rounded` / `SF Pro Rounded` pour garder l'aspect arrondi hors ligne.
- Échelle utilisée : titre de recette `1.8rem`, en-tête `1.35rem`, titres de bloc `1.15–1.2rem`, texte `1rem`, secondaire `.85–.9rem`. Les tuiles et cartes de la grille descendent à `.62–.78rem` pour tenir à 3-4 colonnes sur iPhone : ne pas descendre plus bas.
- Champs de saisie à `1rem` minimum (en dessous, iOS zoome à la saisie).

### Formes, ombres, espacements

- Rayons : `--radius` 16px (cartes, blocs, dialogues, galerie), 12px (boutons, champs, tuiles, vignettes), 10px (petits boutons), `999px` (pastilles, recherche, FAB, toast).
- Ombre unique `--shadow` (`0 2px 10px` brun à 10 %), plus forte seulement pour ce qui flotte (FAB, barre du bas, dialogues).
- Séparateurs de liste en pointillés `1px dashed var(--line)`.
- Marges de page 16px, largeur max 900px, grilles à espacement 8px (12px au-delà de 640px).

### Mise en page et ergonomie mobile

- Mobile d'abord, portrait. Accueil en grille 3 colonnes (4 à 640px, 5 à 900px), tuiles du panier en 4 colonnes (5 à 560px, 6 à 760px).
- Respecter les zones sûres iOS (`env(safe-area-inset-*)`) pour l'en-tête collant, le FAB, la barre « Il me faut… » et le toast.
- Cibles tactiles d'au moins 32px, 40px pour les boutons d'icône. Retour au toucher par `:active` (fond accent doux ou `scale(.96)` sur les tuiles), pas de survol requis.
- Actions destructrices réversibles : toast avec « Annuler » plutôt qu'une confirmation quand c'est possible.

### Mouvement

- Sobre et court (0,2 à 0,8 s). Seul moment expressif : l'écran de démarrage `#splash` (logo qui rebondit, lettres « NoutBook » une par une, cercle qui s'ouvre sur l'accueil).
- Respecter `prefers-reduced-motion` (le splash est alors masqué) et prévoir la même chose pour toute nouvelle animation.

### Iconographie

- Émojis plutôt qu'une bibliothèque d'icônes : aliments sur les tuiles, 🛒 pour le panier, ★ pour les favoris.
- L'ordinateur de l'utilisateur n'affiche pas les émojis récents. Préférer ≤ Emoji 11 ; pour un émoji récent, ajouter un repli en 3e élément dans `EMOJI_MAP`. Affichage via `shownEmoji()`.
- Pas d'émoji devant les titres « NoutBook » et « Liste de courses ».

### À éviter

- Nouvelles couleurs d'accent, dégradés, effets de verre, ombres lourdes, coins carrés.
- Polices non arrondies ou supplémentaires.
- Texte en anglais dans l'interface.
- Animations longues ou qui bloquent l'action.
- Bouton « Créer un compte » : les inscriptions sont fermées.

### Détails techniques à garder

- Garder `[hidden]{display:none !important}` (sinon `.btn{display:inline-block}` écrase `hidden`).
- Styles d'impression (`@media print`) : masquer en-tête, FAB, actions, splash et barre du bas.

## Fonctions à préserver

Catégories, recherche, favoris, photos multiples (couverture = 1re), panier rapide 🛒 (accueil et page recette), page panier façon Bring (tuiles rouges à acheter, vertes « Souvent achetés » et « Dans vos recettes », barre « Il me faut… », appui long, annuler), récap des recettes du panier (affiché seulement s'il y en a au moins une), regroupement des ingrédients et quantités, produits de base exclus par défaut, copier/partager la liste, PDF, export/import JSON, thème clair/sombre, impression, synchro temps réel et hors ligne.

## Tester avant de livrer

- Syntaxe : script inline d'`index.html`, `sync.js`, `sw.js`, `recipe-pdf.js`.
- Logique pure : extraire le bloc `PURE-START/PURE-END` et le tester avec node.
- Bout en bout dans Chromium (Playwright préinstallé), servi par `python3 -m http.server 8765`, avec `serviceWorkers: 'block'`. Vérifier que d'anciens enregistrements restent lisibles.
- Arrêter le serveur avec `kill $(pgrep -f "http.server 876[5]")`, jamais `pkill -f` avec un motif présent dans la commande elle-même.

## Avec l'utilisateur

Signaler tout point à risque, conseiller un export de secours (« ⋯ » → Exporter) avant une mise à jour importante, et dire quels fichiers ont changé.
