# Contribuer

Merci de contribuer à myStats. Ouvre une issue pour décrire un changement important, puis une pull request avec son objectif et les vérifications effectuées.

```sh
npm ci
npm run dev
```

`/demo` fonctionne sans identifiants Strava. Les instructions OAuth figurent dans le README.

Avant une pull request :

```sh
npm run lint
npm run typecheck
npm run test
npm run build
```

Conserve l’architecture sans base de données et l’authentification Strava exclusivement. Aucun token ne doit atteindre les composants React, les logs, un cache public ou le stockage JavaScript du navigateur. Les nouveaux calculs doivent utiliser les helpers d’unités et respecter les dates locales des activités.

Pour les captures et fixtures, utilise uniquement des données fictives. Ne joins jamais de `.env.local`, cookie, identifiant OAuth réel ou activité privée.
