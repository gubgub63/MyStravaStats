# SPEC.md — Stateless Strava Dashboard

## 1. Objectif du projet

Construire une application web permettant à un utilisateur de :

1. ouvrir le site sans créer de compte ;
2. cliquer sur **Connect with Strava** ;
3. s’authentifier directement via OAuth 2.0 chez Strava ;
4. autoriser l’application à lire ses données Strava ;
5. revenir sur le site avec une session sécurisée ;
6. consulter un dashboard généré à partir de ses activités Strava ;
7. se déconnecter et supprimer/révoquer son accès.

Le projet doit fonctionner **sans base de données utilisateur**.

Aucun compte local, mot de passe, table `users`, table `sessions` ou stockage permanent des activités ne doit être nécessaire pour le MVP.

L’application doit être conçue comme un dashboard **stateless côté serveur** : les identifiants OAuth nécessaires à la session sont conservés dans un cookie de session chiffré et inaccessible au JavaScript du navigateur.

---

## 2. Principes non négociables

Le LLM qui implémente ce projet DOIT respecter les règles suivantes.

### 2.1 Pas de base de données pour le MVP

Ne pas ajouter :

- PostgreSQL ;
- MySQL ;
- SQLite ;
- Supabase ;
- Firebase ;
- Redis pour stocker les sessions ;
- table utilisateurs ;
- stockage persistant des tokens Strava ;
- stockage persistant des activités.

Une base de données pourra être ajoutée plus tard, mais elle ne fait pas partie de cette spécification.

### 2.2 Pas de compte local

L’utilisateur ne crée jamais de compte sur l’application.

Il n’existe pas :

- d’adresse e-mail à saisir ;
- de mot de passe local ;
- de page d’inscription ;
- de mot de passe oublié ;
- de profil utilisateur propre au site.

L’identité de l’utilisateur est uniquement celle fournie par Strava pendant la session.

### 2.3 Les tokens Strava ne doivent jamais être exposés au frontend

INTERDIT :

```ts
localStorage.setItem("strava_token", token)
```

INTERDIT :

```ts
sessionStorage.setItem("strava_token", token)
```

INTERDIT également :

- token OAuth dans une URL ;
- token OAuth dans un query parameter ;
- token OAuth injecté dans le HTML ;
- token OAuth accessible depuis React ;
- refresh token retourné par une route API frontend ;
- logs contenant un access token, refresh token, authorization code ou client secret.

Les appels authentifiés vers Strava sont effectués **uniquement côté serveur**.

---

## 3. Stack recommandée

Stack de référence :

- **Next.js** avec App Router ;
- **TypeScript** ;
- React ;
- Tailwind CSS ;
- Recharts ou Apache ECharts pour les graphiques ;
- déploiement Vercel ou plateforme Node.js compatible ;
- API Strava V3 ;
- OAuth 2.0 Strava ;
- cookie de session chiffré côté serveur.

Le LLM peut remplacer une librairie par une alternative équivalente si cela améliore significativement l’implémentation, mais il ne doit pas changer l’architecture de sécurité.

---

## 4. Architecture générale

```text
Utilisateur
    |
    | 1. GET /
    v
Frontend Next.js
    |
    | 2. clic "Connect with Strava"
    v
GET /api/auth/strava
    |
    | 3. création d'un state OAuth aléatoire
    | 4. redirection
    v
Strava OAuth
    |
    | 5. authentification + consentement
    v
GET /api/auth/strava/callback?code=...&state=...
    |
    | 6. vérification du state
    | 7. échange du code côté serveur
    v
POST Strava /oauth/token
    |
    | access_token
    | refresh_token
    | expires_at
    | athlete
    | scopes
    v
Backend
    |
    | 8. crée une session chiffrée
    v
Cookie HttpOnly + Secure + SameSite
    |
    | 9. redirect /dashboard
    v
Dashboard
    |
    | GET /api/dashboard
    v
Backend
    |
    | déchiffre la session
    | rafraîchit le token si nécessaire
    | appelle l'API Strava
    v
Strava API
    |
    | activités + données athlète
    v
Backend
    |
    | normalisation + calcul des métriques
    v
Frontend
```

---

## 5. Configuration

Variables d’environnement attendues :

```env
STRAVA_CLIENT_ID=
STRAVA_CLIENT_SECRET=
STRAVA_REDIRECT_URI=http://localhost:3000/api/auth/strava/callback

SESSION_SECRET=

NEXT_PUBLIC_APP_URL=http://localhost:3000
```

En production :

```env
STRAVA_REDIRECT_URI=https://example.com/api/auth/strava/callback
NEXT_PUBLIC_APP_URL=https://example.com
```

### Règles

`STRAVA_CLIENT_SECRET` :

- serveur uniquement ;
- jamais préfixé par `NEXT_PUBLIC_` ;
- jamais importé dans un Client Component ;
- jamais exposé dans une réponse HTTP ;
- jamais loggé.

`SESSION_SECRET` :

- doit être généré aléatoirement ;
- doit avoir une entropie élevée ;
- doit rester côté serveur ;
- doit être différent entre développement et production.

---

## 6. OAuth Strava

Utiliser OAuth 2.0 Authorization Code Flow.

### 6.1 Route de connexion

Créer :

```text
GET /api/auth/strava
```

Cette route :

1. génère un `state` cryptographiquement aléatoire ;
2. conserve ce `state` temporairement dans un cookie sécurisé dédié ;
3. construit l’URL d’autorisation Strava ;
4. redirige l’utilisateur vers Strava.

Exemple conceptuel :

```text
https://www.strava.com/oauth/authorize
    ?client_id=...
    &redirect_uri=...
    &response_type=code
    &approval_prompt=auto
    &scope=read,activity:read
    &state=RANDOM_STATE
```

Ne demander que les scopes réellement nécessaires.

### 6.2 Scopes

Pour un dashboard d’activités classique, commencer avec :

```text
read,activity:read
```

Si le dashboard doit également afficher les activités dont la visibilité est définie sur **Only You** ou des informations masquées par des privacy zones, utiliser :

```text
read,activity:read_all
```

Ne jamais demander :

```text
activity:write
```

si l’application ne modifie ni ne crée d’activité.

Le callback doit vérifier les scopes réellement accordés par l’utilisateur, car celui-ci peut refuser certains scopes.

---

## 7. Protection OAuth `state`

Le paramètre OAuth `state` est obligatoire dans cette application.

À chaque démarrage OAuth :

```ts
const state = crypto.randomUUID()
```

ou utiliser une génération cryptographiquement sûre équivalente.

Le state doit être :

- imprévisible ;
- court terme ;
- associé au navigateur ayant initié le login ;
- vérifié au callback ;
- supprimé après utilisation.

Si :

```text
callback.state !== stateStocké
```

l’authentification doit être refusée.

Réponse recommandée :

```http
400 Invalid OAuth state
```

Cela protège notamment contre certaines attaques de type CSRF / login CSRF.

---

## 8. Callback OAuth

Créer :

```text
GET /api/auth/strava/callback
```

Cas à gérer :

```text
?code=...
?scope=...
?state=...
```

et :

```text
?error=access_denied
```

### Flow

1. vérifier que `error` n’est pas présent ;
2. vérifier le `state` ;
3. vérifier la présence de `code` ;
4. appeler Strava côté serveur ;
5. échanger le code contre les tokens ;
6. vérifier les scopes accordés ;
7. créer la session ;
8. supprimer le cookie OAuth state ;
9. rediriger vers `/dashboard`.

Échange du code :

```http
POST https://www.strava.com/oauth/token
Content-Type: application/x-www-form-urlencoded
```

avec :

```text
client_id
client_secret
code
grant_type=authorization_code
```

Aucun de ces secrets ne doit transiter par React.

---

## 9. Modèle de session

La session minimale peut contenir :

```ts
type StravaSession = {
  accessToken: string
  refreshToken: string
  expiresAt: number

  athlete: {
    id: number
    firstname?: string
    lastname?: string
    profile?: string
  }

  scopes: string[]

  issuedAt: number
}
```

Ne pas mettre toutes les activités Strava dans le cookie.

Le cookie sert uniquement à conserver les informations nécessaires à l’authentification/session.

---

## 10. Stockage de la session

### Solution recommandée

Stocker la session dans un cookie **chiffré et authentifié**, et pas simplement encodé en Base64.

Utiliser une solution reconnue comme :

- une session scellée/chiffrée éprouvée ;
- JWE via une bibliothèque reconnue ;
- ou une bibliothèque de session utilisant un chiffrement authentifié.

Ne pas écrire un protocole cryptographique artisanal.

### Cookie

Le cookie de session doit être configuré avec :

```text
HttpOnly
Secure en production
SameSite=Lax
Path=/
```

Exemple :

```http
Set-Cookie: strava_session=<encrypted-value>;
HttpOnly;
Secure;
SameSite=Lax;
Path=/
```

Pour le MVP, utiliser de préférence un **cookie de session navigateur** :

- aucun `Max-Age` permanent ;
- aucun stockage longue durée ;
- la session disparaît normalement à la fermeture de la session navigateur.

Une expiration serveur raisonnable doit également être intégrée dans la charge utile chiffrée afin de refuser les sessions trop anciennes.

---

## 11. Propriété importante du modèle stateless

Il n’y a pas de session stockée côté serveur.

Donc :

```text
request
   |
cookie chiffré
   |
serveur
   |
décryptage
   |
session Strava
```

Le serveur doit pouvoir traiter n’importe quelle requête à partir du cookie et de `SESSION_SECRET`.

### Conséquence

Si plusieurs instances/serverless functions exécutent l’application, elles doivent partager le même `SESSION_SECRET`.

---

## 12. Refresh des access tokens

Les access tokens Strava sont courts.

Avant chaque appel Strava :

```ts
if (shouldRefresh(session.expiresAt)) {
  session = await refreshStravaToken(session)
}
```

Prévoir une petite marge avant expiration, par exemple quelques minutes.

### Refresh

Effectuer côté serveur :

```http
POST https://www.strava.com/oauth/token
```

avec :

```text
client_id
client_secret
grant_type=refresh_token
refresh_token=<latest_refresh_token>
```

Après un refresh réussi, TOUJOURS remplacer dans la session :

```ts
session.accessToken = response.access_token
session.refreshToken = response.refresh_token
session.expiresAt = response.expires_at
```

Le refresh token retourné peut changer.

Il faut donc toujours conserver **le dernier refresh token retourné par Strava**.

Après mise à jour :

```text
réémettre le cookie de session chiffré
```

avec la nouvelle valeur.

---

## 13. Gestion des refreshs concurrents

Un dashboard peut déclencher plusieurs appels API simultanés.

Éviter autant que possible ce scénario :

```text
request A -> refresh ancien token
request B -> refresh ancien token
request C -> refresh ancien token
```

car un nouveau refresh token peut invalider l’ancien.

Pour le MVP :

- regrouper les appels nécessaires au dashboard dans une route backend principale ;
- rafraîchir le token UNE FOIS au début de la requête ;
- effectuer ensuite les appels Strava nécessaires avec le token actualisé.

Éviter que chaque widget du dashboard appelle indépendamment une route qui tente son propre refresh.

---

## 14. Client Strava côté serveur

Créer un module dédié, par exemple :

```text
src/lib/strava/client.ts
```

Responsabilités :

```ts
getValidSession()
refreshAccessToken()
stravaFetch()
getAthlete()
getActivities()
getAthleteStats()
```

Tous les appels Strava doivent passer par cette couche.

Exemple conceptuel :

```ts
async function stravaFetch<T>(
  endpoint: string,
  session: StravaSession
): Promise<T> {
  const validSession = await ensureValidToken(session)

  const response = await fetch(
    `https://www.strava.com/api/v3${endpoint}`,
    {
      headers: {
        Authorization: `Bearer ${validSession.accessToken}`,
      },
      cache: "no-store",
    }
  )

  // gestion 401, 403, 429, 5xx...

  return response.json()
}
```

---

## 15. Routes attendues

### Auth

```text
GET /api/auth/strava
GET /api/auth/strava/callback
POST /api/auth/logout
POST /api/auth/disconnect
GET /api/auth/session
```

### Données

```text
GET /api/dashboard
GET /api/activities
GET /api/athlete
```

Pour le MVP, préférer :

```text
GET /api/dashboard
```

qui agrège les données nécessaires et évite de multiplier les appels Strava.

---

## 16. `/api/auth/session`

Doit retourner uniquement des informations non sensibles.

Exemple :

```json
{
  "authenticated": true,
  "athlete": {
    "id": 123456,
    "firstname": "John",
    "profile": "https://..."
  }
}
```

INTERDIT :

```json
{
  "accessToken": "...",
  "refreshToken": "..."
}
```

---

## 17. `/api/dashboard`

La route doit :

1. récupérer la session ;
2. vérifier qu’elle est valide ;
3. rafraîchir le token si nécessaire ;
4. récupérer les données Strava nécessaires ;
5. normaliser les activités ;
6. calculer les statistiques ;
7. renvoyer uniquement les données nécessaires au rendu.

Exemple de réponse :

```json
{
  "athlete": {
    "id": 123,
    "firstname": "John",
    "profile": "https://..."
  },
  "summary": {
    "distanceKm": 86.4,
    "elevationGainM": 3240,
    "movingTimeSeconds": 31200,
    "activityCount": 5
  },
  "weekly": [],
  "sports": [],
  "recentActivities": []
}
```

---

## 18. Pagination Strava

Ne pas supposer que toutes les activités arrivent dans une seule requête.

Créer une fonction capable de paginer :

```ts
async function getActivities(options: {
  after?: number
  before?: number
  maxPages?: number
})
```

Le MVP ne doit pas télécharger toute la vie sportive d’un utilisateur à chaque chargement.

### Fenêtre recommandée

Afficher par défaut les données récentes, par exemple :

```text
12 dernières semaines
```

ou :

```text
90 derniers jours
```

Puis proposer éventuellement :

```text
3 mois
6 mois
1 an
```

Éviter un import historique illimité sans action explicite de l’utilisateur.

---

## 19. Rate limits

Le backend doit surveiller les headers de rate limit renvoyés par Strava.

Gérer explicitement :

```http
429 Too Many Requests
```

En cas de `429` :

- ne pas boucler ;
- ne pas spammer Strava ;
- retourner une erreur propre au frontend ;
- afficher un message utilisateur clair.

Exemple :

```json
{
  "code": "STRAVA_RATE_LIMIT",
  "message": "La limite de requêtes Strava a été atteinte. Réessaie plus tard."
}
```

Les données récupérées durant une même requête peuvent être agrégées en mémoire.

Éviter tout polling inutile.

---

## 20. Cache

Comme aucune BDD n’est utilisée, le projet peut fonctionner sans cache persistant.

Par défaut :

```text
Cache-Control: private, no-store
```

sur les routes contenant des données Strava privées.

Ne jamais utiliser un cache partagé/public susceptible de servir les données d’un athlète à un autre.

Une optimisation future pourra ajouter un cache privé ou serveur correctement isolé, mais ce n’est pas requis pour le MVP.

---

## 21. Dashboard — MVP

Créer un dashboard moderne et responsive.

### Header

Afficher :

```text
avatar Strava
prénom
bouton Refresh
bouton Logout
```

### KPI cards

Afficher au minimum :

```text
Distance
Dénivelé positif
Temps d'activité
Nombre d'activités
```

Exemple :

```text
┌──────────────┐
│ 86.4 km      │
│ Distance     │
└──────────────┘

┌──────────────┐
│ 3 240 m      │
│ D+           │
└──────────────┘

┌──────────────┐
│ 8 h 42       │
│ Temps        │
└──────────────┘

┌──────────────┐
│ 5            │
│ Activités    │
└──────────────┘
```

### Graphiques

MVP :

1. distance par semaine ;
2. D+ par semaine ;
3. temps d’entraînement par semaine ;
4. répartition par sport.

### Activités récentes

Afficher :

```text
nom
type
date
distance
D+
durée
allure/vitesse selon le sport
```

---

## 22. Dashboard — Trail / Running

Pour les activités de course et trail, prévoir des statistiques spécifiques :

```text
distance
D+
temps
allure moyenne
vitesse moyenne
longest run
highest elevation gain
nombre de sorties
charge hebdomadaire simple
```

### VAP

Une métrique de type VAP / allure ajustée à la pente peut être ajoutée comme fonctionnalité avancée.

Ne pas présenter une formule propriétaire comme étant la formule officielle Strava.

Si une VAP custom est utilisée :

- documenter la formule ;
- indiquer clairement qu’elle est calculée par l’application ;
- éviter de l’appeler "Strava GAP" si ce n’est pas exactement une donnée fournie par Strava.

---

## 23. Heatmap / carte

Fonctionnalité facultative.

Si les données d’activité nécessaires sont disponibles via l’API et les scopes accordés, permettre l’affichage de traces ou d’un résumé cartographique.

Attention :

- respecter les privacy zones ;
- ne jamais essayer de reconstruire les portions volontairement masquées ;
- ne pas exposer publiquement les parcours privés ;
- ne pas mettre les coordonnées privées dans un cache public.

Le MVP peut fonctionner sans heatmap.

---

## 24. Normalisation des unités

Les calculs internes peuvent utiliser les unités Strava/API.

Le frontend doit afficher :

```text
distance -> km
elevation -> m
temps -> h/min
running pace -> min/km
cycling speed -> km/h
```

Créer des helpers :

```text
metersToKm()
secondsToDuration()
metersPerSecondToKmH()
metersPerSecondToPace()
```

Ne pas dupliquer ces conversions dans plusieurs composants.

---

## 25. Logout

Créer :

```text
POST /api/auth/logout
```

Le logout simple doit :

1. détruire le cookie local ;
2. rediriger vers `/`.

Le logout local ne doit pas nécessairement révoquer l’autorisation Strava.

---

## 26. Disconnect Strava

Créer une action différente :

```text
POST /api/auth/disconnect
```

Cette action représente :

> Déconnecter complètement Strava de cette application.

Elle doit :

1. lire la session actuelle ;
2. révoquer l’autorisation/token côté Strava avec l’endpoint recommandé au moment de l’implémentation ;
3. supprimer le cookie ;
4. rediriger vers `/`.

Si la révocation échoue :

- supprimer malgré tout la session locale si c’est le choix utilisateur ;
- afficher/logguer une erreur non sensible ;
- ne jamais logger le token.

---

## 27. Gestion des erreurs

Créer des codes d’erreur applicatifs.

Exemples :

```text
NOT_AUTHENTICATED
OAUTH_ACCESS_DENIED
OAUTH_INVALID_STATE
OAUTH_TOKEN_EXCHANGE_FAILED
STRAVA_SCOPE_MISSING
STRAVA_TOKEN_REFRESH_FAILED
STRAVA_UNAUTHORIZED
STRAVA_FORBIDDEN
STRAVA_RATE_LIMIT
STRAVA_API_ERROR
INVALID_SESSION
```

Le frontend doit recevoir des messages propres.

Ne jamais renvoyer :

- stack trace en production ;
- access token ;
- refresh token ;
- client secret ;
- réponse brute contenant des secrets.

---

## 28. Gestion d’un token révoqué

Si Strava répond :

```http
401 Unauthorized
```

après une tentative de refresh raisonnable :

1. considérer la session comme invalide ;
2. supprimer le cookie ;
3. retourner :

```json
{
  "code": "NOT_AUTHENTICATED"
}
```

4. rediriger l’utilisateur vers la connexion.

Ne pas boucler indéfiniment sur le refresh.

---

## 29. Sécurité HTTP

En production, ajouter des headers de sécurité adaptés.

Minimum :

```text
Content-Security-Policy
X-Content-Type-Options: nosniff
Referrer-Policy
Permissions-Policy
```

Utiliser HTTPS exclusivement en production.

Ne jamais servir la session sur HTTP en production.

---

## 30. XSS

Le cookie `HttpOnly` protège la lecture directe du token par JavaScript, mais une XSS reste dangereuse.

Le projet doit donc :

- éviter `dangerouslySetInnerHTML` ;
- ne jamais injecter de HTML venant de Strava sans échappement ;
- utiliser la protection native React ;
- mettre en place une CSP raisonnable ;
- valider les données externes si nécessaire.

---

## 31. CSRF

Mesures minimales :

- OAuth `state` ;
- cookie `SameSite=Lax` ;
- routes modifiant l’état uniquement en `POST` ;
- vérifier `Origin` sur les endpoints sensibles lorsque pertinent.

Endpoints sensibles :

```text
POST /api/auth/logout
POST /api/auth/disconnect
```

---

## 32. Logs

Les logs peuvent contenir :

```text
request id
endpoint
status HTTP
latence
athlete id si nécessaire et si conforme à la politique du projet
rate limit restant
type d'erreur
```

Les logs NE DOIVENT JAMAIS contenir :

```text
access_token
refresh_token
client_secret
authorization code
cookie de session
Authorization header
```

Créer si nécessaire une fonction de redaction pour protéger les logs.

---

## 33. Validation runtime

Les réponses d’API externes ne doivent pas être considérées comme implicitement sûres.

Utiliser éventuellement :

```text
Zod
```

pour valider les structures critiques :

```text
OAuth token response
session payload
dashboard response
```

---

## 34. Pages

### `/`

Landing page simple.

Contenu :

```text
Logo / nom du projet
Titre
Description
"Connect with Strava"
Résumé des données utilisées
Lien privacy
```

CTA principal :

```text
Connect with Strava
```

### `/dashboard`

Si aucune session :

```text
redirect /
```

Si session valide :

```text
dashboard
```

Afficher un skeleton pendant le chargement.

---

## 35. UX de connexion

Le parcours doit être extrêmement simple :

```text
Landing
    ↓
Connect with Strava
    ↓
Consentement Strava
    ↓
Dashboard
```

Aucune étape intermédiaire d’inscription.

---

## 36. Confidentialité

Comme le projet ne possède pas de BDD :

- les activités ne sont pas persistées par l’application ;
- les informations sont récupérées à la demande depuis Strava ;
- les tokens sont conservés uniquement dans la session chiffrée ;
- les données du dashboard disparaissent du serveur à la fin de la requête, hors logs techniques explicitement autorisés.

Une page de confidentialité doit expliquer clairement ce fonctionnement.

---

## 37. Données analytiques

Par défaut, ne pas envoyer à un service analytics tiers :

- nom des activités ;
- GPS ;
- token ;
- données privées ;
- profil complet ;
- détails d’entraînement.

Si une solution analytics est ajoutée, utiliser uniquement des événements produit non sensibles du type :

```text
landing_view
strava_login_started
strava_login_success
dashboard_loaded
logout
```

---

## 38. Webhooks Strava

Pour un MVP strictement stateless, le dashboard fonctionne sans polling permanent et récupère les données à la demande.

Cependant, avant une ouverture publique à plusieurs utilisateurs, vérifier les exigences Strava en vigueur concernant les webhooks et la désautorisation.

Prévoir l’architecture pour pouvoir ajouter :

```text
GET /api/strava/webhook
POST /api/strava/webhook
```

Le webhook ne doit pas devenir une raison d’ajouter une BDD tant qu’aucun besoin fonctionnel ne le justifie.

---

## 39. Limitation importante du modèle sans BDD

À chaque nouvelle session ou actualisation importante, les données doivent être relues depuis Strava.

Exemple :

```text
Dashboard
   ↓
GET /api/dashboard
   ↓
Strava activities page 1
Strava activities page 2
...
   ↓
calcul
   ↓
response
```

Cela signifie :

- plus d’appels API ;
- dépendance aux rate limits ;
- pas d’historique local ;
- pas de calcul asynchrone long terme ;
- pas de comparaison avec un snapshot ancien stocké localement.

Cette limitation est acceptée pour le MVP.

---

## 40. Évolution future avec BDD

NE PAS implémenter maintenant.

Une V2 pourra ajouter :

```text
PostgreSQL
```

pour :

```text
users
oauth_credentials
activities
activity_snapshots
aggregations
```

et éventuellement :

```text
Redis
queues
webhooks
background jobs
```

Utilités futures :

- historique complet ;
- moins d’appels Strava ;
- dashboard plus rapide ;
- synchronisation en arrière-plan ;
- comparaison de périodes ;
- statistiques avancées ;
- recommandations ;
- notifications.

Cette V2 ne doit pas compliquer inutilement le MVP.

---

## 41. Arborescence suggérée

```text
src/
├── app/
│   ├── page.tsx
│   ├── dashboard/
│   │   └── page.tsx
│   └── api/
│       ├── auth/
│       │   ├── strava/
│       │   │   ├── route.ts
│       │   │   └── callback/
│       │   │       └── route.ts
│       │   ├── session/
│       │   │   └── route.ts
│       │   ├── logout/
│       │   │   └── route.ts
│       │   └── disconnect/
│       │       └── route.ts
│       └── dashboard/
│           └── route.ts
│
├── components/
│   ├── dashboard/
│   │   ├── KpiCard.tsx
│   │   ├── WeeklyDistanceChart.tsx
│   │   ├── WeeklyElevationChart.tsx
│   │   ├── SportDistributionChart.tsx
│   │   └── RecentActivities.tsx
│   └── auth/
│       └── ConnectStravaButton.tsx
│
├── lib/
│   ├── auth/
│   │   ├── session.ts
│   │   └── oauth-state.ts
│   ├── strava/
│   │   ├── client.ts
│   │   ├── oauth.ts
│   │   ├── types.ts
│   │   └── normalize.ts
│   ├── dashboard/
│   │   ├── aggregate.ts
│   │   └── types.ts
│   └── utils/
│       ├── units.ts
│       └── errors.ts
│
└── middleware.ts
```

L’arborescence peut évoluer si l’implémentation Next.js le justifie.

---

## 42. Types principaux

Exemple :

```ts
type DashboardActivity = {
  id: number
  name: string
  sportType: string
  startDate: string

  distanceKm: number
  elevationGainM: number
  movingTimeSeconds: number

  averageSpeedMps?: number
  paceSecondsPerKm?: number
}

type DashboardSummary = {
  distanceKm: number
  elevationGainM: number
  movingTimeSeconds: number
  activityCount: number
}

type WeeklyMetric = {
  week: string
  distanceKm: number
  elevationGainM: number
  movingTimeSeconds: number
  activityCount: number
}
```

---

## 43. Calculs

### Distance

```ts
distanceKm = distanceMeters / 1000
```

### Vitesse

```ts
speedKmH = speedMetersPerSecond * 3.6
```

### Allure

```ts
paceSecondsPerKm =
  distanceMeters > 0
    ? movingTimeSeconds / (distanceMeters / 1000)
    : null
```

### Agrégation semaine

Utiliser une semaine cohérente, idéalement ISO :

```text
lundi -> dimanche
```

Ne pas agréger naïvement avec des chaînes de dates dépendantes de la locale.

---

## 44. Fuseaux horaires

Les dates Strava peuvent être fournies dans différents formats/champs.

Le projet doit :

- conserver les timestamps correctement ;
- afficher la date de manière cohérente ;
- éviter de modifier le jour d’une activité à cause d’une conversion UTC incorrecte ;
- privilégier les informations temporelles propres à l’activité lorsqu’elles sont disponibles.

---

## 45. Performance

Objectifs :

- un seul refresh token par chargement si nécessaire ;
- minimiser les requêtes Strava ;
- paginer uniquement autant que nécessaire ;
- agréger côté serveur ;
- envoyer au frontend uniquement les champs utiles.

Ne pas envoyer des objets Strava bruts de plusieurs centaines de Ko si le dashboard n’en utilise qu’une partie.

---

## 46. Accessibilité

Minimum :

- boutons avec labels explicites ;
- focus visible ;
- graphiques accompagnés de valeurs textuelles ;
- contraste suffisant ;
- navigation clavier ;
- états loading/error compréhensibles.

---

## 47. Responsive

Le dashboard doit fonctionner correctement :

```text
mobile
tablet
desktop
```

Priorité mobile :

- KPI cards en grille responsive ;
- graphiques scrollables ou redimensionnés ;
- tableau d’activités transformé en cards si nécessaire.

---

## 48. Tests minimum

### Unit tests

Tester :

```text
conversion distance
conversion pace
agrégation semaine
normalisation activité
détection token expiré
validation session
```

### Auth tests

Tester :

```text
OAuth callback sans code
OAuth callback access_denied
state manquant
state invalide
scope manquant
token exchange failed
refresh failed
session absente
```

### API tests

Tester :

```text
401 Strava
403 Strava
429 Strava
500 Strava
pagination
activité avec distance = 0
```

---

## 49. Definition of Done

Le MVP est terminé lorsque :

- [ ] la landing page fonctionne ;
- [ ] le bouton Connect with Strava fonctionne ;
- [ ] OAuth Strava fonctionne en local ;
- [ ] OAuth Strava fonctionne en production ;
- [ ] le `state` OAuth est validé ;
- [ ] le client secret n’est jamais exposé ;
- [ ] aucun token n’est dans `localStorage` ;
- [ ] aucun token n’est dans `sessionStorage` ;
- [ ] la session utilise un cookie HttpOnly ;
- [ ] la session est chiffrée/authentifiée ;
- [ ] le cookie est Secure en production ;
- [ ] les access tokens expirés sont refreshés ;
- [ ] le nouveau refresh token remplace systématiquement l’ancien ;
- [ ] aucune BDD n’est nécessaire ;
- [ ] `/dashboard` est inaccessible sans session ;
- [ ] les activités Strava s’affichent ;
- [ ] distance totale s’affiche ;
- [ ] D+ total s’affiche ;
- [ ] temps total s’affiche ;
- [ ] nombre d’activités s’affiche ;
- [ ] graphique hebdomadaire fonctionne ;
- [ ] liste d’activités récentes fonctionne ;
- [ ] les rate limits sont gérés ;
- [ ] les erreurs 401 sont gérées ;
- [ ] logout supprime la session ;
- [ ] disconnect peut révoquer l’accès Strava ;
- [ ] aucun secret n’apparaît dans les logs ;
- [ ] les routes privées utilisent `no-store` ;
- [ ] le site est responsive ;
- [ ] le site fonctionne sans compte local.

---

## 50. Ce que le LLM ne doit PAS faire

Ne pas décider spontanément :

> "Je vais ajouter Supabase pour gérer les utilisateurs."

Ne pas ajouter :

```text
Auth.js Credentials
Clerk
Firebase Auth
Supabase Auth
email/password auth
```

L’authentification est Strava OAuth uniquement.

Ne pas stocker :

```text
access_token dans localStorage
refresh_token dans localStorage
access_token dans sessionStorage
refresh_token dans sessionStorage
```

Ne pas envoyer les tokens à React.

Ne pas ajouter une BDD simplement parce que c’est une architecture habituelle.

Ne pas récupérer toutes les activités historiques à chaque page load.

Ne pas demander de scopes Strava inutiles.

Ne pas exposer de données privées dans un cache CDN/public.

Ne pas considérer Base64 comme du chiffrement.

---

## 51. Priorités d’implémentation

Le LLM doit développer dans cet ordre :

### Phase 1 — Foundation

```text
Next.js
TypeScript
Tailwind
env validation
landing page
```

### Phase 2 — OAuth

```text
/api/auth/strava
OAuth state
callback
token exchange
encrypted session cookie
```

Tester entièrement la connexion avant de continuer.

### Phase 3 — Strava client

```text
stravaFetch
token refresh
getAthlete
getActivities
pagination
error handling
```

### Phase 4 — Dashboard data

```text
normalisation
agrégation
/api/dashboard
```

### Phase 5 — UI

```text
KPI
charts
recent activities
responsive
loading
errors
```

### Phase 6 — Security

```text
headers
CSRF hardening
log redaction
rate limits handling
logout
disconnect
```

### Phase 7 — Tests

```text
unit
auth
API/error flows
```

---

## 52. Instructions données au coding agent

Lorsqu’un LLM/coding agent reçoit ce fichier, il doit :

1. lire l’intégralité du `SPEC.md` avant de modifier le projet ;
2. inspecter le repository existant ;
3. préserver les choix déjà compatibles avec cette spec ;
4. ne pas ajouter de BDD ;
5. ne pas créer d’authentification locale ;
6. implémenter les fonctionnalités par petites étapes ;
7. exécuter lint, typecheck et tests après les changements ;
8. corriger les erreurs qu’il introduit ;
9. ne jamais créer de faux secrets ;
10. fournir un `.env.example` sans valeurs sensibles ;
11. documenter dans le README la création d’une application Strava ;
12. signaler explicitement toute contrainte Strava qui empêcherait une exigence de cette spec.

---

## 53. Commande de validation finale

Avant de considérer la tâche terminée, vérifier au minimum :

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

Si le repository utilise d’autres commandes, utiliser leurs équivalents.

Aucune erreur TypeScript ne doit être ignorée via :

```ts
// @ts-ignore
```

simplement pour faire passer le build.

---

## 54. Sources Strava à vérifier pendant l’implémentation

La documentation Strava est la source de vérité pour les comportements OAuth/API susceptibles d’évoluer.

Documentation officielle :

- Authentication: https://developers.strava.com/docs/authentication/
- Getting Started: https://developers.strava.com/docs/getting-started/
- Rate Limits: https://developers.strava.com/docs/rate-limits/
- API Reference: https://developers.strava.com/docs/reference/
- API Agreement: https://www.strava.com/legal/api

Points vérifiés lors de la rédaction de cette spec en octobre 2026 :

- Strava utilise OAuth 2.0 ;
- l’authorization code est court terme et à usage unique ;
- les access tokens expirent environ 6 heures après leur création ;
- le refresh renvoie un refresh token qu’il faut considérer comme pouvant changer ;
- l’application doit toujours conserver/utiliser le refresh token le plus récent ;
- les scopes effectivement accordés peuvent différer des scopes demandés ;
- Strava applique des limites de requêtes sur des fenêtres courtes et quotidiennes ;
- les nouvelles applications démarrent avec une capacité d’athlètes limitée ;
- l’accès multi-utilisateurs à plus grande échelle peut nécessiter une validation/revue Strava.

Toujours revalider la documentation officielle si l’implémentation est faite longtemps après la rédaction de ce fichier.

---

# Résumé architectural

Le principe central du projet est :

```text
NO ACCOUNT
NO DATABASE
NO PASSWORD
NO TOKEN IN JAVASCRIPT

STRAVA OAUTH
      ↓
SERVER
      ↓
ENCRYPTED HTTPONLY SESSION COOKIE
      ↓
SERVER-SIDE STRAVA API CALLS
      ↓
DASHBOARD
```

Le navigateur ne possède jamais directement les credentials OAuth exploitables par JavaScript.

Le backend reste la seule couche autorisée à communiquer avec Strava en utilisant l’access token et le refresh token.

Cette règle doit être conservée pendant toute l’implémentation.

