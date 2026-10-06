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
