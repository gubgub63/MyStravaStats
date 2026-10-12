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
