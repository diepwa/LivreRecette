# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

PWA installée sur l'écran d'accueil d'iPhone (Safari, mode `standalone`, portrait). L'usage est presque exclusivement sur iPhone ; l'ordinateur sert ponctuellement.

## Users

- **Utilisateurs principaux : deux personnes d'un même foyer** (dont Charles), qui partagent un compte. Les deux cuisinent et les deux font les courses : il n'y a pas de rôle « cuisinier » ou « acheteur » séparé.
- **Autres utilisateurs** : l'app a de plus en plus d'utilisateurs en dehors du foyer. Elle reste conçue d'abord pour le foyer principal.
- Les utilisateurs sont à l'aise avec la technologie.

Situations d'usage :

- **En cuisine** : retrouver une recette et la suivre d'un coup d'œil, mains occupées.
- **Au supermarché** : cocher vite, d'une main, parfois avec un réseau faible ou absent.
- **À la maison, avant les courses** : choisir les recettes de la semaine, ajuster le nombre de personnes, compléter la liste.

## Product Purpose

NoutBook remplace deux objets du quotidien par une seule app : le cahier de recettes familial et l'appli de courses (type Bring). La liste de courses se construit à partir des recettes choisies (ingrédients regroupés, quantités ajustées au nombre de personnes), complétée par les produits habituels.

Succès : l'app reste aussi simple qu'un cahier et une liste papier, les deux téléphones voient toujours le même livre et le même panier, et aucune mise à jour ne fait jamais perdre une recette, une photo, le panier ou l'historique d'achats.

## Positioning

Un seul objet, privé, qui relie les recettes du foyer à sa liste de courses : la liste vient des recettes choisies, sans compte public, sans publicité, et tout fonctionne hors ligne. Ni un site de recettes, ni une appli de courses générique.

## Operating Context

- Recettes saisies à la main par le foyer (titre, catégorie, temps, personnes, ingrédients, étapes, notes, jusqu'à 6 photos).
- Panier façon Bring : tuiles « à acheter », produits « Souvent achetés » classés par nombre d'achats, ingrédients des recettes, barre « Il me faut… », produits de base (sel, poivre, huile…) exclus par défaut.
- Partage actuel d'une recette vers l'extérieur : PDF envoyé par la feuille de partage iOS (Messages, WhatsApp, Mail, Fichiers). Copier/partager la liste de courses.
- Export/import JSON comme copie de secours, impression.

## Capabilities and Constraints

- Application statique sans build ni dépendance npm, hébergée sur GitHub Pages (https://diepwa.github.io/LivreRecette/). Le détail technique et les règles de mise à jour sont dans `CLAUDE.md`.
- Données locales (IndexedDB, localStorage) synchronisées en temps réel par Firebase (Auth e-mail/mot de passe, Firestore), avec fonctionnement complet hors ligne.
- Un compte partagé par foyer ; les inscriptions publiques sont fermées et l'app ne propose pas de créer un compte.
- Mises à jour jamais cassantes : noms internes de stockage figés, nouveaux champs optionnels, pas de changement d'adresse ni de scope.
- Limite de 1 Mo par recette dans Firestore : 6 photos maximum, recompressées.
- Interface entièrement en français, en tutoyant l'utilisateur.

**Décision ouverte : partage de recettes entre utilisateurs.** Charles veut créer un système de partage des recettes, car l'app a de plus en plus d'utilisateurs. Non décidé à ce jour : qui partage avec qui (entre foyers, avec un contact, lien public ou non), ce qui est partagé (copie de la recette ou recette vivante), comment cela s'articule avec le compte partagé et les inscriptions fermées, et comment les autres utilisateurs obtiennent un compte. À trancher avec Charles avant toute conception ; tout changement doit respecter les règles de données de `CLAUDE.md` (règles Firestore jamais assouplies sans raison, aucune perte de données).

## Brand Commitments

- Nom : **NoutBook** (anciennement « Mon livre de recettes »). Logo : un chat (`icons/nout.png`).
- Ton : chaleureux, familial, gourmand, un peu ludique ; tutoiement. Jamais froid ni « appli de productivité ».
- Émojis d'aliments plutôt qu'une bibliothèque d'icônes ; pas d'émoji devant les titres « NoutBook » et « Liste de courses ».

## Evidence on Hand

- Recettes réelles du foyer, uniquement dans les données des utilisateurs (pas dans le dépôt).
- Icônes et logo : `icons/` (dont `apple-touch-icon.png`, `nout.png`, `splash.png`).
- Mode d'emploi utilisateur : `LISEZ-MOI.md`.
- Aucun témoignage, chiffre d'usage, nombre d'utilisateurs ou avis publié : ne pas en inventer.

## Product Principles

1. **Ne jamais perdre une donnée.** Une amélioration qui met en risque une recette, une photo ou l'historique d'achats n'en vaut pas la peine.
2. **Aussi simple qu'un cahier et une liste papier.** Chaque ajout doit se faire d'une main, en un coup d'œil, sur iPhone.
3. **Le foyer d'abord.** Les nouveaux utilisateurs et le partage s'ajoutent sans compliquer l'usage quotidien des deux utilisateurs principaux.
4. **Privé par défaut.** Rien n'est public sans un geste explicite de l'utilisateur.
5. **Hors ligne comme en ligne.** Au supermarché sans réseau, tout doit marcher.
