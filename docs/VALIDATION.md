# État de validation

Vérifications effectuées le 6 octobre 2026. Ce document distingue les comportements vérifiés des étapes qui exigent les identifiants de l’application Strava et le compte d’hébergement.

## Vérifié

- Lecture de `idea.md`, `SPEC.md` et inspection du portfolio de référence.
- Accueil, aperçu explicitement fictif, thèmes clair/sombre, filtres, graphiques et activités récentes.
- Captures du README réalisées sur le build de production, avec données fictives exclusivement.
- Rendu à 390 px : aucun débordement horizontal, activités en cartes.
- `/dashboard` redirige vers l’accueil sans session ; `/api/dashboard` répond 401.
- Réponses privées en `private, no-store`, CSP avec nonce et en-têtes de sécurité présents sur l’aperçu hébergé.
- Cookie chiffré/authentifié, rotation des tokens et scopes validés dans les tests avec réponses Strava simulées.
- 45 tests : bornes inclusives des périodes personnalisées, filtrage par date locale, cache par dates, unités, semaines locales, OAuth, sessions, pagination, erreurs API, CSRF, révocation, isolation du cache, purge après invalidation et renouvellement après 401.
- Lint, TypeScript et build de production réussis ; premier pipeline GitHub exécuté avec succès.
- Aucun secret de session dans les fichiers JavaScript frontend examinés ; `.env.local` ignoré par Git et absent de l’export de déploiement.
- Aucune base de données ni stockage permanent des activités.

## À vérifier avec la configuration réelle

- Renseigner `STRAVA_CLIENT_SECRET` dans `.env.local`, puis réussir OAuth en local avec le compte de l’utilisateur.
- Vérifier que les activités réelles, volumes et périodes correspondent au compte Strava.
- Revendiquer l’aperçu temporaire ou créer un projet Vercel permanent, puis configurer les cinq variables d’environnement.
- Renseigner `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` et `VERCEL_TOKEN` dans GitHub pour activer le job de déploiement.
- Configurer le domaine de rappel Strava avec l’URL HTTPS permanente.
- Vérifier OAuth, cookie Secure/HttpOnly, maintien de la session, déconnexion et révocation sur cette URL.
- Revalider la capacité d’athlètes et les conditions d’ouverture publique de l’application auprès de Strava.

L’aperçu temporaire valide le déploiement et le rendu avec des données fictives. Il ne prouve pas une connexion Strava réelle et ne remplace pas l’hébergement permanent. Les tests OAuth simulés ne prouvent pas la validité des secrets ou du domaine de rappel.

## Saison trail locale — 13 octobre 2026

- 62 tests passent, dont 16 nouveaux tests couvrant temps multi-jours, exclusions des prédictions (DNF, dates futures, résultats anciens), extrapolation, segments GPX séparés, bruit d’altitude, sauts GPS, imports CSV, égalités de classement, calibration sans scores inventés, sauvegardes et adaptateurs publics.
- Lint, TypeScript, build de production et export statique GitHub Pages réussis. L’aperçu statique conserve sa navigation et n’annonce pas de route saison nécessitant un serveur.
- Navigateur : ajout d’un objectif UTLAC, récupération et analyse de son GPX réel, persistance après rechargement, saisie d’un résultat, courbe de progression, import CSV de référence, export/restauration JSON et rejet d’une sauvegarde invalide sans perte des données actuelles.
- Affichages clair/sombre et mobile 390 px inspectés. Débordement du tableau de résultats corrigé ; largeur finale de page 390 px. Aucun avertissement ou erreur JavaScript observé.
- Les cinq formats UTLAC renvoient leurs données depuis l’organisateur. Recherche UTMB réelle vérifiée ; import public de profil vérifié par l’API locale. Les scores individuels non publics sont conservés comme absents.
- Redirection OAuth Strava vérifiée vers Strava avec callback `http://localhost:3000/api/auth/strava/callback`. Autorisation avec le compte personnel, renouvellement et chargement des activités réelles non vérifiés pendant ce travail.
- ITRA reste en saisie manuelle avec lien vers la recherche officielle. Catalogue connecté limité à UTLAC ; les autres courses sont saisies manuellement. Les estimations mathématiques sont documentées et non validées sur un jeu de courses indépendant.
- Données utilisées pour la vérification uniquement : aucun objectif ou résultat de test conservé dans l’espace local du navigateur de vérification.

## Espacements et projections — 14 octobre 2026

- Sélecteurs natifs conservant leur navigation clavier, avec indicateur à 12 px du bord et 40 px réservés au texte. Correction appliquée au filtre des sports, à la métrique hebdomadaire et aux champs de saison ; retour à l’apparence native en contraste forcé.
- Formulaires de saison en une colonne sous 520 px, contrôles de 44 px et texte de 16 px sur mobile, grilles à minimum nul, ordre visuel des onglets et de l’année aligné sur l’ordre du clavier.
- Classement UTLAC 120 de 2026 récupéré intégralement depuis les données publiques UTMB : 149 finishers après exclusion des non-finishers ; un objectif de 17 h se place au quatrième rang historique. Source et édition affichées ; scores non publics conservés absents.
- Synchronisation UTMB automatique sur nom complet exactement unique, avec sélection manuelle pour les homonymes. Recherche, import, projection personnelle et conservation de l’objectif existant vérifiés dans le navigateur.
- Le contrôle mécanique Impeccable des fichiers d’interface modifiés ne signale aucun défaut. Vérification du rendu des filtres et de la saison sur ordinateur et mobile ; pas de débordement horizontal observé.

## Index partagé et niveaux estimés — 14 octobre 2026

- L’index UTMB enregistré est affiché dans le tableau de bord ; les changements de stockage, le retour au premier plan et les mises à jour de saison rafraîchissent le profil. Le profil Strava propre au compte est prioritaire, avec repli sur le profil local uniquement si son nom complet correspond. Les identités différentes et les sauvegardes invalides sont exclues.
- Ajout d’un niveau personnel équivalent lorsque les scores de course historiques sont absents : index du fournisseur × temps personnel central projeté / temps visé. Les valeurs et fourchettes sont bornées ; les références insuffisantes restent explicites. Aucune conversion UTMB vers ITRA ; accès direct au champ ITRA lorsqu’il manque.
- Tests de référence pour monotonie au temps cible, conservation du niveau au temps prédit, priorité aux scores publiés, exclusion des parcours historiques différents, bornes extrêmes, absence de référence, isolation des profils et erreurs de stockage.
- Vérification dans le navigateur : index général partagé, niveau estimé visible pour l’objectif existant, ouverture directe du formulaire ITRA. Le niveau personnel est un modèle indicatif non validé, distinct du score et de l’index officiels.

## Auto-hébergement et accès public — 12 octobre 2026

- Ajout d’un build standalone, d’un Dockerfile sans secrets de build, de deux configurations Compose et d’un proxy HTTPS Caddy optionnel.
- Lint, génération des types, TypeScript, 46 tests et build de production réussis ; audit des dépendances de production sans vulnérabilité signalée.
- Correction du domaine de retour OAuth : il utilise la configuration validée au lancement, sans figer l’URL publique du build. Redirection vers un domaine HTTPS différent de celui du build vérifiée sur le serveur standalone compilé ; test de régression ajouté.
- Serveur standalone démarré et vérifié : accueil et `/demo` en HTTP 200, API privée sans session en HTTP 401 avec `private, no-store`.
- Aucun fichier `.env*` présent dans le dossier standalone généré ; contexte Docker et source de déploiement exclus des secrets.
- Les deux configurations Compose sont valides avec une configuration d’exemple. Le moteur Docker local est arrêté : construction de l’image et exécution des conteneurs non vérifiées.
- Nouvel aperçu Vercel accessible sans session Vercel : accueil et `/demo` en HTTP 200, API privée en HTTP 401. Tableau de bord de démonstration chargé dans le navigateur sans erreur JavaScript observée.
- Aperçu temporaire, avec expiration au 12 octobre 2026 à 19 h 35 UTC. Informations de revendication conservées uniquement dans `.vercel/anonymous.json`, ignoré par Git.
- Publication permanente de l’aperçu via GitHub Pages, avec un workflow dédié. Pages est activé sur le dépôt avec GitHub Actions comme source.
- Export statique vérifié localement sous `/MyStravaStats/` : filtres par sport et période, changement de métrique et navigation vers la confidentialité fonctionnels, sans erreur JavaScript observée. Les fichiers publics ne contiennent ni routes API, ni fichiers `.env*`, ni secrets de la configuration locale.
- La connexion Strava réelle reste réservée à la version serveur : les résumés fictifs sur GitHub Pages ne constituent pas une vérification OAuth. La configuration HTTPS/OAuth de l’auto-hébergement reste à vérifier sur le serveur cible.

## Native iOS and synchronization — 14 October 2026

- Native SwiftUI app targets iOS 17+, with four tabs, Swift Charts, MapKit, SwiftData and Keychain session storage. The Xcode project and shared scheme are checked in; personal signing settings are not.
- 94 TypeScript tests pass both with embedded PostgreSQL (PGlite) and PostgreSQL 16 in Docker. Coverage includes atomic revision writes, concurrent writers, identity isolation, session hashing/revocation/expiry, CSRF, encrypted credentials and one-time PKCE-bound OAuth handoff.
- 10 Swift core tests pass against shared TypeScript/Swift fixtures, including old backup decoding, explicit JSON nulls, GPX/CSV validation, index history and leap-year reference boundaries.
- 10 native storage/network tests pass in Simulator: restart, independent scopes, corrupted-storage preservation, backup restoration, offline retry, bearer authentication and two-device conflict resolution. One UI test creates a race and checks its target scenario and navigation.
- Web lint, TypeScript checks, production build, static Pages export and production dependency audit pass. Native simulator compilation and UI flow pass. The Docker image builds and starts with PostgreSQL; `/api/health` responds successfully, anonymous private API reads return 401, migrations are idempotent, and a logical dump was restored to a separate validation database.
- A separate local iOS backend can run on port 3001 using `npm run ios:setup` and `npm run dev:ios`; it has its own PostgreSQL volume, secrets, cookies and build directory. Existing port-3000 browser storage and sessions are not migrated silently.
- Private Wi-Fi development verified: setup can select an RFC1918 Mac address without rotating secrets or replacing seasons, the backend binds to that interface, health and native OAuth-start use the LAN origin, and anonymous session reads remain unauthorized. Debug device build and ten Simulator tests pass with private-IP validation; Release compiles with no HTTP ATS exceptions. One additional TypeScript test covers allowed and rejected bind addresses. Installation of this LAN update on the physical phone remains pending because Xcode reports it unavailable; the user must rebuild with Run and complete Strava's callback-domain configuration and authorization.
- Not certified by these checks: a production hostname/TLS deployment, live native Strava authorization completed by the user, and production end-to-end synchronization on the user's physical phone. The requested handoff uses Simulator. Public UTMB/UTLAC source access remains subject to upstream availability.

## Native interaction refinements — 14 October 2026

- Dashboard overview displays five activities; the searchable detail list has twenty rows per page. A synthetic 55-activity UI scenario verifies that the overview omits activity six, page two starts at activity 21, and full-period statistics remain available.
- UTMB/ITRA progression defaults to course scores, with a visible selector for dated general index observations. A score edit from 590 to 642 immediately updates the chart while the general index remains 587. Changing metrics also rebuilds the plotted series on iOS 17, avoiding stale axes/data. DNF and other-season results stay excluded.
- Haptics use native iOS 17 sensory feedback, with a Profile preference. Successful persistence triggers save feedback; failed validation does not. Initial/background dashboard loading does not vibrate. Physical vibration cannot be validated in Simulator.
- Eleven Swift core tests and twelve native store/API tests pass. UI coverage includes pagination, score editing and graph refresh, the separate general index, race creation, light/dark appearance, large accessible text and landscape on iPhone simulators (iOS 17.5 and iOS 26). Release compilation passes; synthetic UI transports and sessions are excluded from Release.

## Suppression de Ma progression — 16 octobre 2026

La page web et l’onglet iPhone de progression ont été retirés, avec leurs graphiques, calculs de séries et tests dédiés. Les scénarios UI iPhone couvrent désormais les écrans restants. Les résultats, les index du profil et leur historique restent compatibles avec les sauvegardes et la synchronisation ; les estimations de course continuent à utiliser les résultats. Les validations historiques des graphiques ci-dessus concernent la version antérieure à cette suppression.
