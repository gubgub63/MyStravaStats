# Saison trail locale

Ouvre `/season` avec le serveur Next.js. La page est indépendante de la connexion Strava ; le lien **Saison trail** est disponible dans la navigation. La connexion OAuth existante permet de consulter les entraînements dans le tableau de bord. Elle ne transforme pas automatiquement les activités d’entraînement en résultats de course.

## Utilisation

1. Dans **Mon profil**, renseigne prénom et nom et recherche ton profil UTMB. La recherche publique peut renvoyer des homonymes : vérifie la fiche, puis choisis **C’est moi**. L’import récupère l’index général et les résultats publics disponibles. Les scores de course non publics restent vides. La synchronisation par identifiant évite les doublons et conserve les scores ITRA et le terrain ajoutés manuellement.
2. ITRA : utilise la recherche officielle, puis complète l’index et son lien source. Aucun accès automatisé ITRA fiable n’a été vérifié ; la page ne simule pas cette connexion.
3. Dans **Mes objectifs**, choisis une saison et ajoute des courses A (principales), B (préparation) ou C (plaisir). Deux à trois A sont conseillées, sans restriction arbitraire.
4. Recherche UTLAC, lac de Côme ou Lago di Como : les cinq formats sont connectés aux pages officielles de l’organisateur. Distance, D+, date, barrière finale et lien GPX sont lus à la demande. Les autres courses peuvent être saisies avec leur source.
5. Télécharge le GPX via la fiche ou importe un fichier avec altitudes. La distance organisateur reste la référence pour les projections. Distance et dénivelés mesurés apparaissent séparément. Un écart de distance supérieur à 5 % ou de D+ supérieur à 10 % est signalé. Le fichier publié peut être provisoire ou correspondre à un parcours différent : vérifie toujours l’édition sur le site officiel.
6. Définis le temps **écoulé**, pauses comprises. L’outil calcule min/km, km/h et km/min. Une projection personnelle apparaît dès qu’un résultat récent terminé comporte un temps.
7. Importe le classement complet d’une édition comparable de la même course pour obtenir un rang historique et calibrer les scores. CSV UTF-8 avec séparateur virgule ou point-virgule : `time,utmb,itra,status`. Temps H:MM:SS ; scores de course facultatifs ; `status=dnf`, `dns` ou `dsq` exclut un non-finisher. Le modèle téléchargé ne contient que les en-têtes, aucune donnée fictive.
8. **Ma progression** affiche les résultats de la saison sélectionnée, leur vitesse effort et les scores publiés ou saisis. Les résultats terminés sans temps et les abandons sont exclus de la vitesse ; les abandons sont exclus des courbes et prédictions.

## Conservation

Les profils, objectifs, notes, résultats, classements importés et résumés GPX sont enregistrés dans `localStorage`, versionnés et validés avec Zod. Ils restent dans ce navigateur, pour cet hôte et ce port. Le stockage local et celui de chaque identifiant Strava sont distincts. La déconnexion ne supprime pas une saison enregistrée. Exporte avant de changer d’espace et restaure la sauvegarde dans l’espace souhaité.

Les exports JSON permettent une sauvegarde ou un transfert ; la restauration remplace l’espace courant et rejette les fichiers invalides. Pas de base de données ni synchronisation entre appareils. Les GPX importés sont analysés dans le navigateur ; seul un résumé de 600 points environ est conservé, pas le XML complet. La recherche UTMB transmet le nom recherché au service UTMB via le serveur ; les réponses ne sont pas mises dans un cache public. Les adaptateurs ne visitent que les domaines fixes UTMB et UTLAC et n’utilisent pas de cookies de comptes UTMB/ITRA.

## Modèle myStats v1

Ces formules sont des heuristiques documentées, **non validées**, et ne constituent ni une mesure physiologique ni les formules officielles UTMB/ITRA.

- Kilomètres-effort : `E = distance_km + Dplus_m / 100`.
- Distance GPX : somme des distances de Haversine, sans relier les segments distincts. Analyse des pentes sur fenêtres d’au moins 30 m ; variations d’altitude inférieures à 3 m ignorées pour D+/D−. Ce filtre réduit le bruit mais peut sous-estimer des petites ondulations. Coordonnées, altitudes, taille, sauts GPS >5 km et traces <100 m sont contrôlés.
- Pentes marquées : `P = 100 × (0.65 × fraction_distance(|pente| > 0.15) + 0.35 × fraction_distance(pente < -0.20))`.
- Terrain saisi : `T = 0..4`, de roulant à très technique. Un GPX ne révèle pas automatiquement sol, boue, rochers ou exposition.
- Difficulté : `min(100, round(40 × ln(1 + E/30) + 0.35 × P + 5 × T))`. Sans GPX et/ou terrain, les composantes absentes sont omises : difficulté partielle, qui sous-estime potentiellement le parcours.
- Temps personnel : médiane des projections des trois résultats terminés les plus récents, datés dans les trois dernières années, avec `temps_reference × (E_cible/E_reference)^1.06`. Si les deux terrains sont connus, multiplicateur `(1+0.06×T_cible)/(1+0.06×T_reference)` ; sinon aucune correction terrain.
- Fourchette : au moins ±20 %, ±35 % si un rapport d’effort sort de `[0.5, 2]`, élargie à la dispersion des projections. Il ne s’agit pas d’un intervalle de confiance statistique. Météo, nuit, altitude et fatigue ne sont pas modélisées.
- Position historique : `1 + nombre de finishers strictement plus rapides`, donnant le même rang en cas d’égalité. Si le temps dépasse tous les finishers, affiche `N+1`. Fourchette de positions associée à ±10 % de temps. Elle porte uniquement sur les lignes importées, pas sur le peloton futur.
- Score de course estimé : `min(1000, round(médiane(temps_finisher × score_finisher)/temps_cible))`. Au moins trois scores positifs connus du fournisseur doivent se trouver dans `[temps_cible/1.5, temps_cible×1.5]`. Estimation empirique locale, **pas un futur index général**. Les points de qualification ITRA d’une course ne sont pas un score de performance.

Sources : [UTMB recherche](https://utmb.world/en/utmb-index/runner-search), [UTMB explication de l’index](https://utmb.world/en/utmb-index/info), [ITRA recherche](https://itra.run/Runners/FindARunner), [UTLAC organisateur](https://www.utlactrail.com/en/). Les formats publics et leurs accès peuvent changer ; les erreurs sont affichées et les saisies/imports restent disponibles.
