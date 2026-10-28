# CLAUDE.md

NoutBook (anciennement « Mon livre de recettes ») : PWA de recettes et de liste de courses, en français, sans build ni dépendance npm. Hébergée sur GitHub Pages (https://diepwa.github.io/LivreRecette/) et installée sur les iPhone de deux utilisateurs qui partagent un seul compte Firebase.

**Règle absolue : une mise à jour ne doit jamais faire perdre de données** (recettes, photos, panier, historique d'achats). En cas de doute, ne pas changer.

## Fichiers

- `index.html` : toute l'app (HTML, CSS, JS inline). Logique pure entre `/*PURE-START*/` et `/*PURE-END*/` (`buildList`, `shopList`, `buildCatalog`, `normalizeShop`, `nameKey`, `EMOJI_MAP`…), testable avec node.
- `sync.js` : synchro Firebase (SDK 12.19.0 depuis gstatic, chargé à la demande). Sans config ou sans réseau, l'app reste en mode local.
- `firebase-config.js` : vraie config du projet `recettes-cedd9`. Ne pas la vider ni la remplacer par des valeurs d'exemple (ces valeurs ne sont pas secrètes).
- `firestore.rules` : accès réservé à `request.auth.uid == uid`. Ne jamais assouplir, sauf exceptions voulues par Charles : boîte aux lettres `inbox`, profils publics, annuaire `pseudos`, et **lecture seule des recettes par un ami** (`users/{uid}/recipes`, si `users/{uid}/friends/{moi}` existe ; depuis le 2026-10-28, pour voir la liste d'un ami).
- `recipe-pdf.js` + `vendor/pdf-lib.min.js` (pdf-lib 1.17.1, MIT) : export PDF d'une recette, hors ligne. Polices standard WinAnsi, les émojis sont retirés.
- `analytics.js` + `analytics-config.js` + `vendor/amplitude.min.js` (@amplitude/analytics-browser 2.48.1, MIT, empaqueté avec esbuild en module ESM) : statistiques d'usage anonymes, chargées à la demande. Clé du projet Amplitude de Charles (région EU) ; clé vide = désactivé. Appel depuis `index.html` par `track(nom, propriétés)`. `user_id` = uid Firebase du compte (`setUser` appelé par sync.js à la connexion/déconnexion), à la demande de Charles le 2026-10-28. Jamais d'e-mail, pseudo, titre ni contenu de recette dans les événements ; IP non enregistrée ; capture automatique d'Amplitude et configuration distante désactivées (seules les sessions). Événements : App ouverte, Écran vu (`ecran`), Bouton touché (`bouton` = id, onglet ou classe · conteneur ; `libelle` seulement pour les boutons à id fixe, sauf `CLICK_NO_LABEL`), Recette créée/modifiée, Recettes importées, Recette ajoutée au panier, Repas planifié, Ami ajouté, Recette partagée, Recette reçue, PDF téléchargé. Nouveau bouton avec un id dont le texte montre des données : l'ajouter à `CLICK_NO_LABEL`.
- `sw.js` : service worker (cache d'abord, mise à jour en arrière-plan).
- `manifest.json`, `icons/` (dont `apple-touch-icon.png` 180×180, `splash.png`, `nout.png`).
- `LISEZ-MOI.md` : mode d'emploi pour l'utilisateur (Firebase, installation iPhone, panier, PDF).

## Mise à jour de la PWA et du cache

- **À chaque modification d'un fichier servi, incrémenter `CACHE` dans `sw.js`** (actuellement `livre-recettes-v29`), sinon les téléphones gardent l'ancienne version.
- Tout nouveau fichier local doit être ajouté à `ASSETS` dans `sw.js`.
- Ne jamais mettre en cache les appels Firestore/Auth. Seuls le SDK versionné (`www.gstatic.com/firebasejs/`) et Google Fonts sont mis en cache hors origine.
- Ne pas changer `start_url`, `scope`, l'emplacement des fichiers ni le nom du dépôt : les données locales sont liées à l'adresse.
- Le nom et l'icône de l'écran d'accueil iOS sont figés à l'installation : les changer n'affecte pas une icône déjà installée (il faut la supprimer et refaire « Sur l'écran d'accueil »).

## Données (noms internes figés)

- IndexedDB `livre-recettes` (version 1, store `recipes`, keyPath `id`), localStorage `livre-courses`, marqueur d'export `app:"livre-recettes"`. Ne pas les renommer malgré le nom NoutBook. Pour changer le schéma : incrémenter la version IndexedDB avec un `onupgradeneeded` qui conserve l'existant.
- Firestore : `users/{uid}/recipes/{id}` et `users/{uid}/meta/shop`. Amis : annuaire `pseudos/{clé}` = `{uid, name}` (clé = `pseudoKey(nom)`, pseudo unique, réservé avant d'enregistrer le pseudo), ajout d'ami par pseudo (`addFriendByPseudo`, message `type:"friend"` avec `pseudo`), lien d'invitation `#/ajout/<pseudo>`. Les anciens codes d'invitation (`invites/`, `#/ami/<code>`) restent acceptés mais ne sont plus créés. `meta/shop` s'écrit avec `setDoc(..., {merge:true})` pour qu'un téléphone pas à jour n'efface pas les champs qu'il ne connaît pas.
- Tout nouveau champ est optionnel avec une valeur par défaut à la lecture. Ne jamais renommer ni supprimer un champ existant.
- Un document Firestore fait au plus 1 Mo : 6 photos max par recette, recompressées par `fitPhotos`. Ne pas augmenter sans autre stockage.
- Planning : localStorage `livre-planning` et Firestore `users/{uid}/meta/plan` (`setDoc` merge:true), `slots` = {`AAAA-MM-JJ_l|d`: {id, n, updated}} ; un repas retiré reste en `id:""` daté (fusion par `mergePlan`, le plus récent gagne). Les repas à venir (`upcomingMeals`, aujourd'hui compris) s'ajoutent à la sélection du panier sans toucher à `shop.sel` (`effectiveSel`, personnes additionnées) : un téléphone pas à jour ne les voit pas dans son panier. Planifier un repas remet ses ingrédients en « à acheter » (retire leurs clés de `have`).
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

- Papier crème et encre brune, comme un carnet de cuisine, mis en forme **à la manière d'iOS** (depuis le 2026-10-27, demande de Charles) : barres translucides floutées, police système, listes groupées façon Réglages, contrôle segmenté, alertes et feuilles d'action iOS (`iosAlert()`), retour au toucher immédiat. Les photos des recettes apportent la couleur ; l'interface reste sobre autour.
- Formes rondes et douces : polices arrondies, coins arrondis partout, pastilles en `999px`.
- Deux exceptions colorées assumées, propres au panier façon Bring : tuiles rouges « à acheter » et tuiles vert-bleu « catalogue ». Ne pas les ramener dans la palette brune.

### Palette

- Variables `:root` d'`index.html` : fond `#faf7f1`, carte `#ffffff`, encre `#33291f`, texte secondaire `--muted` `#85775f`, ligne `#e6dccb`, accent `#6b5238`, accent doux `#ece3d5`, ok `#4f7a4a`. Rouge danger `#c0392b`.
- Thème sombre (`prefers-color-scheme`) : fond `#1b1712`, carte `#26201a`, encre `#f0e8da`, accent `#d9c3a0`. Toute nouvelle couleur doit avoir sa valeur sombre.
- Panier : `--buy` `#e0555d` (sombre `#c94a52`), `--cat` `#4f8f85` (sombre `#3f7a71`). Couleurs de recette `--rc` dans le récap et les pastilles des tuiles.
- Toujours passer par les variables, pas de couleur en dur dans un nouveau composant.
- Pour changer la palette, modifier ensemble : `:root` et le bloc sombre, `<meta name="theme-color">`, `manifest.json` (`background_color`, `theme_color`), le splash (`#splash`), l'objet `C` de `recipe-pdf.js` et les icônes `icons/*`.

### Typographie

- Police système d'Apple : SF Pro (`--sans`, `-apple-system`) pour le texte, SF Pro Rounded (`--serif`, `ui-rounded`) pour les titres et l'avatar. Nunito (Google Fonts) ne sert que de repli hors appareils Apple. Fredoka n'est plus chargée.
- Approche iOS de la typo : grands titres `2.125rem` graisse 800 avec interlettrage négatif (`-.025em`), texte proche de `0`, petits titres de groupe en majuscules `.8125rem` gris.
- Échelle utilisée : titre de recette `1.8rem`, en-tête `1.35rem`, titres de bloc `1.15–1.2rem`, texte `1rem`, secondaire `.85–.9rem`. Les tuiles et cartes de la grille descendent à `.62–.78rem` pour tenir à 3-4 colonnes sur iPhone : ne pas descendre plus bas.
- Champs de saisie à `1rem` minimum (en dessous, iOS zoome à la saisie).

### Formes, ombres, espacements

- Rayons : 14px (vignettes, tuiles, alertes, fenêtres), 12px (blocs et listes groupées, boutons), 10–11px (champs, recherche, contrôle segmenté), `999px` (puces, bouton « Nouvelle recette », toast).
- Presque pas d'ombres : les blocs sont des listes groupées sur fond crème. Ombre seulement pour ce qui flotte (bouton « Nouvelle recette », fenêtres). Remplissages doux `--fill` (accent à 9 %) pour les boutons secondaires, puces et champs ; matériaux translucides `--glass` pour l'en-tête et les barres du bas, avec repli `prefers-reduced-transparency`.
- Séparateurs fins `.5px solid var(--hair)` (plus de pointillés). L'en-tête n'a de trait que quand le contenu défile dessous (`body.scrolled`).
- Icônes de l'en-tête, du panier des vignettes et du bouton « + » : petits SVG au trait teintés `--accent` (style SF Symbols). Les émojis d'aliments restent sur les tuiles et vignettes.
- Profil connecté façon Réglages : pseudo choisi au toucher de la ligne « Choisir ton pseudo » (alerte avec champ, rouverte tant que le pseudo est refusé) et modifiable au toucher (alerte de confirmation puis alerte avec champ ; pas de champ en ligne, car le « OK » du clavier iPhone ne l'envoyait pas), « Ajouter un ami » et « Inviter un ami » toujours actifs (sans pseudo, ils demandent d'abord d'en choisir un ; « Ajouter un ami » accepte aussi le lien ou le message d'invitation collé), « Chargement… » tant que le serveur n'a pas confirmé l'absence de pseudo, ami touché = ouverture de sa liste (le retrait se fait en bas de sa liste, après feuille de confirmation, pas de croix), « Ajouter un ami » (alerte avec champ pseudo) et « Inviter un ami » (feuille de partage : pseudo + lien), pas de textes d'aide sous les groupes, pas de bloc d'import (l'import reste dans « Nouvelle recette »).
- Marges de page 16px, largeur max 900px, grilles à espacement 8px (12px au-delà de 640px).

### Mise en page et ergonomie mobile

- Mobile d'abord, portrait. Accueil en grille 3 colonnes (4 à 640px, 5 à 900px), tuiles du panier en 4 colonnes (5 à 560px, 6 à 760px).
- Navigation par barre d'onglets fixe en bas (`#tabbar`, depuis le 2026-10-28) : Recettes (`#/`, ouvre sur « Ma liste »), Planning (`#/planning`, semaine du lundi au dimanche, déjeuner et dîner), Listes (`#/listes`, choix de la liste affichée, renommer/supprimer via « ⋯ »), Panier (`#/courses`), Profil (`#/profil`). Pages racines : grand titre dans l'en-tête et « + » en haut à droite (plus de bouton flottant « Nouvelle recette »). La barre est masquée dans les formulaires (`chrome({bar:false})`) et quand le clavier est ouvert (`body.kb`).
- Respecter les zones sûres iOS (`env(safe-area-inset-*)`) pour l'en-tête collant, la barre d'onglets, la barre « Il me faut… » (posée sur la barre d'onglets) et le toast.
- Zoom désactivé (viewport `user-scalable=no` + blocage du pincement en JS, double-tap coupé par `touch-action:manipulation`) : tout doit rester lisible sans zoomer. Les photos de la fiche ne s'ouvrent plus en grand au toucher (retiré le 2026-10-27 à la demande de Charles).
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
- Fiche recette (depuis le 2026-10-28) : sous le titre, une rangée d'icônes rondes sans texte (libellé en `aria-label`) : Panier (bascule), Favori (bascule, étoile pleine), Listes, Partager (copie à un ami, icône avion en papier façon Instagram). En bas de page, trois icônes : Télécharger (PDF), Modifier et Supprimer (rouge, feuille de confirmation iOS).
- Liste d'un ami (`#/amis/<uid>`, fiche `#/amis/<uid>/r/<id>`) : sa « Ma liste » (ses recettes sans celles qu'il a reçues), en lecture seule, lue une fois par `getDocs` (cache mémoire de 2 min, pas d'écoute en temps réel pour ménager le quota gratuit). Ouverte depuis Profil → Mes amis ou Listes → « Listes de mes amis ». « Retirer de mes amis » est en bas de cette page.
- Styles d'impression (`@media print`, plus de bouton Imprimer mais l'impression du navigateur reste propre) : masquer en-tête, barre d'onglets, actions, splash et barre du bas.

## Fonctions à préserver

Catégories, recherche, favoris, photos multiples (couverture = 1re), panier rapide 🛒 (accueil et page recette), page panier façon Bring (tuiles rouges à acheter, vertes « Souvent achetés » et « Dans vos recettes », barre « Il me faut… », appui long, annuler), récap des recettes du panier (affiché seulement s'il y en a au moins une), regroupement des ingrédients et quantités, produits de base exclus par défaut, copier/partager la liste, PDF (bouton « Télécharger »), envoi d'une copie à un ami (bouton « Partager »), thème clair/sombre, synchro temps réel et hors ligne.

## Tester avant de livrer

- Syntaxe : script inline d'`index.html`, `sync.js`, `sw.js`, `recipe-pdf.js`.
- Logique pure : extraire le bloc `PURE-START/PURE-END` et le tester avec node.
- Bout en bout dans Chromium (Playwright préinstallé), servi par `python3 -m http.server 8765`, avec `serviceWorkers: 'block'`. Vérifier que d'anciens enregistrements restent lisibles.
- Arrêter le serveur avec `kill $(pgrep -f "http.server 876[5]")`, jamais `pkill -f` avec un motif présent dans la commande elle-même.

## Avec l'utilisateur

Signaler tout point à risque et dire quels fichiers ont changé. Le bouton d'export/import JSON du profil a été retiré le 2026-10-27 à la demande de Charles (les données sont dans Firestore) ; les recettes restent aussi en local dans IndexedDB.
