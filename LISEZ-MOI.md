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

1. Sur chaque téléphone : bouton « ⋯ » → Synchronisation → saisir l'e-mail et le mot de passe
   du compte partagé → **Se connecter**.
2. Le premier téléphone connecté envoie ses recettes ; le second les reçoit, ainsi que le panier.

Utilisez bien **le même compte** sur les deux téléphones : c'est ce qui vous fait partager le même livre.

## Bon à savoir

- Pastille sur « ⋯ » : verte = synchronisé, orange = envoi en cours ou hors ligne, rouge = à vérifier.
- Hors ligne, tout reste utilisable ; les modifications partent au retour du réseau.
- En cas de modification simultanée de la même recette, la dernière enregistrée l'emporte.
- Photos : 6 maximum par recette, réduites automatiquement pour tenir dans la limite de 1 Mo par recette.
- Le bouton d'export reste utile comme copie de secours.

## Liste de courses (style Bring)

- Bouton 🛒 sur chaque recette (accueil ou page de la recette) pour l'ajouter au panier.
- Page panier : tuiles rouges = à acheter ; on touche une tuile quand elle est dans le chariot (elle compte comme un achat).
- Tuiles vertes = produits à ajouter : « Souvent achetés » en tête (classés par nombre d'achats), puis les ingrédients de vos recettes.
- Barre « Il me faut… » : recherche d'un produit, ou ajout d'un produit libre avec le bouton ＋.
- Produits de base (sel, poivre, huile…) : jamais ajoutés automatiquement ; appui long sur une tuile pour changer.
- Les compteurs d'achats et les produits de base sont synchronisés entre vos deux téléphones.
