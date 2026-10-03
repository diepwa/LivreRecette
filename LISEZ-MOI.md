# Mon livre de recettes — mise en route de la synchronisation

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

## 4. Premier lancement

1. Sur le premier téléphone : bouton « ⋯ » → Synchronisation → saisir un e-mail et un mot de passe
   → **Créer le compte**. Les recettes déjà présentes sur ce téléphone sont envoyées.
2. Sur le deuxième téléphone : « ⋯ » → même e-mail et même mot de passe → **Se connecter**.
   Les recettes et le panier apparaissent.

Utilisez bien **le même compte** sur les deux téléphones : c'est ce qui vous fait partager le même livre.

## Bon à savoir

- Pastille sur « ⋯ » : verte = synchronisé, orange = envoi en cours ou hors ligne, rouge = à vérifier.
- Hors ligne, tout reste utilisable ; les modifications partent au retour du réseau.
- En cas de modification simultanée de la même recette, la dernière enregistrée l'emporte.
- Photos : 6 maximum par recette, réduites automatiquement pour tenir dans la limite de 1 Mo par recette.
- Le bouton d'export reste utile comme copie de secours.
