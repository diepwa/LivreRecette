# NoutBook — mise en route de la synchronisation

L'app fonctionne déjà seule (recettes stockées sur le téléphone). Pour partager le même livre
et le même panier entre deux téléphones, il faut connecter un projet Firebase gratuit.

## 1. Créer le projet Firebase (≈ 10 min, compte Google, aucune carte bancaire)

1. Aller sur https://console.firebase.google.com → « Ajouter un projet ».
   Nom : `livre-recettes` (au choix). Google Analytics : tu peux le désactiver.
2. **Authentication** → « Commencer » → onglet « Mode de connexion » →
   « E-mail/Mot de passe » → activer → Enregistrer.
3. **Firestore Database** → « Créer une base de données » → région Europe
   (par ex. `eur3` ou `europe-west9` Paris) → mode **production** → Activer.
4. Dans Firestore, onglet **Règles** : remplacer tout le contenu par celui du fichier
   `firestore.rules` → « Publier ».
5. Roue dentée (Paramètres du projet) → « Vos applications » → icône **Web `</>`** →
   donner un surnom → « Enregistrer l'application » (pas besoin de Firebase Hosting).
6. Copier l'objet `firebaseConfig` affiché.

## 2. Brancher l'app

Ouvrir `firebase-config.js` et remplacer les valeurs par celles copiées à l'étape 6.
(Ces valeurs ne sont pas secrètes : la protection vient des règles de l'étape 4.)

## 3. Mettre l'app en ligne (HTTPS)

Déposer tout le dossier sur un hébergement gratuit (Netlify Drop, GitHub Pages, Cloudflare Pages…).
Sur iPhone : ouvrir l'adresse dans Safari → Partager → « Sur l'écran d'accueil ».

## 4. Comptes et premier lancement

L'app ne propose volontairement **pas** de créer un compte : les inscriptions sont fermées côté Firebase
(Authentication → Paramètres → Actions des utilisateurs → « Activer la création (inscription) » décoché).
Le compte partagé se crée donc dans la console : Authentication → Utilisateurs → « Ajouter un utilisateur »
(si besoin, on peut temporairement rouvrir les inscriptions, puis les refermer).

1. Sur chaque téléphone : bouton « ⋯ » (Mon profil) → Connexion → saisir l'e-mail et le mot de passe
   du compte partagé → **Se connecter**.
2. Le premier téléphone connecté envoie ses recettes ; le second les reçoit, ainsi que le panier.

Utilisez bien **le même compte** sur les deux téléphones : c'est ce qui vous fait partager le même livre.

## Bon à savoir

- Pastille sur « ⋯ » : verte = synchronisé, orange = envoi en cours ou hors ligne, rouge = à vérifier.
- Hors ligne, tout reste utilisable ; les modifications partent au retour du réseau.
- En cas de modification simultanée de la même recette, la dernière enregistrée l'emporte.
- Photos : 6 maximum par recette, réduites automatiquement pour tenir dans la limite de 1 Mo par recette.
- Le bouton d'export (« ⋯ » → Sauvegarde) reste utile comme copie de secours.

## Mise à jour « listes et amis » : règles Firestore à republier

Cette version ajoute les listes, les amis et l'envoi de recettes. **Avant de l'utiliser, republie les règles** :
Firebase → Firestore Database → onglet **Règles** → remplacer tout le contenu par le nouveau fichier `firestore.rules` → « Publier ».
Sans cette étape, les listes marchent, mais la création d'un code d'ami et l'envoi de recettes sont refusés.

## Listes de recettes

- En haut de l'accueil, des onglets : **Tout le livre** (toutes les recettes, chacune une seule fois), **Partagées**, puis tes listes.
- « ＋ Liste » crée une liste. Sur une recette, bouton **Listes** pour la ranger dans une ou plusieurs listes.
- Une recette créée depuis l'onglet d'une liste y est rangée d'office.
- « Renommer ou supprimer » sous l'onglet d'une liste. Supprimer une liste ne supprime jamais ses recettes (et « Annuler » la fait revenir).
- Les listes sont synchronisées entre vos deux téléphones et comprises dans l'export de secours.

## Tags

- Dans le formulaire d'une recette, champ **Tags** : tape un nom (Épicé, Végétarien…) puis Entrée ou virgule. Les suggestions proposent d'abord les tags déjà utilisés.
- Touche l'icône d'un tag pour la changer. L'icône vaut pour toutes les recettes qui portent ce tag.
- Sur l'accueil, la rangée de tags filtre les recettes ; plusieurs tags = recettes qui les ont tous. Ça se combine avec la liste et la catégorie, et la recherche trouve aussi les tags.
- Les cartes affichent jusqu'à 3 icônes de tags. Une recette envoyée à un ami garde ses tags et leurs icônes.
- Les tags et leurs icônes sont synchronisés et compris dans l'export de secours. Rien à changer dans les règles Firestore.

## Amis et envoi de recettes

- Bouton « ⋯ » → page **Mon profil** : pseudo, connexion / déconnexion, amis et sauvegarde.
- Choisis d'abord ton **pseudo** : tes amis le voient, et s'il change, il change aussi chez eux.
- **Inviter** : « Créer un code d'invitation », puis « Envoyer l'invitation » (Messages, WhatsApp…). Le code est valable 7 jours.
- **Accepter** : ton ami ouvre NoutBook → « ⋯ » → « J'ai reçu un code », et tape le code. Vous êtes alors amis tous les deux
  (l'ami qui a créé le code doit ouvrir NoutBook une fois pour que l'amitié soit confirmée de son côté).
- Sur une recette : **Envoyer à un ami**. L'ami reçoit une **copie** dans son onglet « Partagées » : s'il la modifie, la tienne ne change pas.
- Chaque ami a son propre compte (créé dans la console Firebase, inscriptions toujours fermées).

## Importer des recettes depuis un texte

- « ＋ Nouvelle recette » → « Tu l’as déjà en texte ? », ou « ⋯ » → « Importer depuis un texte ».
- Colle le texte d’une recette (légende Instagram, page d’un site, note) ou de plusieurs à la suite. Le bouton « 📄 Fichiers texte » ajoute des fichiers `.txt`.
- L’app repère le titre, « Pour 4 personnes », les durées, les intertitres « Ingrédients », « Préparation », « Astuce »… Les conseils et l’intro vont dans « Notes », les hashtags qui correspondent à tes tags deviennent des tags.
- Plusieurs recettes : elles sont reconnues à chaque nouvel intertitre « Ingrédients ». Si deux recettes se mélangent, sépare-les par une ligne `---`.
- « Ranger dans » : choisis une liste existante ou crée-en une (« ＋ Nouvelle liste… ») ; toutes les recettes importées y vont, et l’accueil s’ouvre ensuite sur cette liste.
- Tu vérifies et corriges chaque recette avant de la créer. Une recette au même nom qu’une recette existante est décochée : rien n’est jamais remplacé.
- Tout se fait sur le téléphone, sans réseau. Les photos s’ajoutent ensuite depuis la recette (« Modifier »).

## Liste de courses (style Bring)

- Bouton 🛒 sur chaque recette (accueil ou page de la recette) pour l'ajouter au panier.
- Page panier : tuiles rouges = à acheter ; on touche une tuile quand elle est dans le chariot (elle compte comme un achat).
- Tuiles vertes = produits à ajouter : « Souvent achetés » en tête (classés par nombre d'achats), puis les ingrédients de vos recettes.
- Barre « Il me faut… » : recherche d'un produit, ou ajout d'un produit libre avec le bouton ＋.
- Produits de base (sel, poivre, huile…) : jamais ajoutés automatiquement ; appui long sur une tuile pour changer.
- Les compteurs d'achats et les produits de base sont synchronisés entre vos deux téléphones.

## Partager une recette en PDF

- Sur la page d'une recette : bouton « Partager en PDF ». Sur iPhone, la feuille de partage s'ouvre (Messages, WhatsApp, Mail, Fichiers…).
- Si le partage direct n'est pas possible, une fenêtre propose de télécharger / ouvrir le PDF.
- Fonctionne hors ligne (bibliothèque `vendor/pdf-lib.min.js` + `recipe-pdf.js`, à déposer avec le reste). Les émojis ne sont pas repris dans le PDF.

## Si l'icône n'apparaît pas sur l'iPhone

iOS récupère l'icône **au moment** de « Sur l'écran d'accueil ». Si la page n'était pas encore à jour à cet instant,
l'icône reste vide. Supprimer l'icône de l'écran d'accueil, ouvrir l'adresse dans Safari, la recharger, puis refaire
« Sur l'écran d'accueil ». (Icône utilisée : `icons/apple-touch-icon.png`, 180×180.)
