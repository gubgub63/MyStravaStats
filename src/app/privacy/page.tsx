import { Header, Footer } from '@/components/shell';
export const metadata = { title: 'Confidentialité' };
export default function PrivacyPage() {
  return (
    <>
      <Header />
      <main id="main" className="container prose">
        <span className="eyebrow">TES DONNÉES, POUR TOI</span>
        <h1>Confidentialité.</h1>
        <p>
          myStats est un projet open source qui affiche tes statistiques Strava. Tu t’authentifies
          directement auprès de Strava, sans créer de compte ici.
        </p>
        <h2>Ce que nous lisons</h2>
        <p>
          Ton prénom, ton identifiant et ton avatar Strava, ainsi que le nom, le sport, la date, la
          distance, le dénivelé et la durée des activités visibles de la période choisie. Les
          activités « Moi uniquement » et les données des zones de confidentialité ne sont pas
          demandées. Aucun parcours GPS Strava n’est collecté.
        </p>
        <h2>Session et conservation</h2>
        <p>
          Sans base configurée, les identifiants OAuth restent dans un cookie chiffré, inaccessible
          au JavaScript, avec une session limitée à 24 heures. Lorsque la synchronisation est
          activée, les identifiants Strava sont chiffrés sur le serveur et le navigateur reçoit
          uniquement une session révocable. L’iPhone conserve sa session myStats dans le Trousseau,
          pendant 30 jours au maximum avant reconnexion.
        </p>
        <p>
          Les activités ne sont pas enregistrées en base. Un cache privé en mémoire conserve les
          statistiques jusqu’à dix minutes pour limiter les appels Strava. Les saisons synchronisées
          — profil, historique d’index, objectifs, notes, résultats, classements et résumés GPX —
          sont conservées dans la base PostgreSQL de ton hébergeur, rattachées à ton identifiant
          Strava. Elles restent disponibles localement dans le navigateur ou sur l’iPhone. Les
          réponses privées ne sont jamais mises dans un cache public.
        </p>
        <h2>Cookies et services externes</h2>
        <p>
          La page « Saison trail » conserve ton profil, tes objectifs, tes notes, tes résultats, les
          classements importés et les résumés de traces GPX dans ce navigateur. Le stockage local et
          celui de chaque compte Strava sont distincts. Une déconnexion ne supprime pas ces saisons.
          Exporte une sauvegarde avant de supprimer les données du navigateur ou de changer
          d’appareil. Une restauration remplace les données de l’espace courant. Les fichiers GPX
          importés sont analysés sur ton appareil. Leur résumé et le tracé réduit sont inclus dans
          la saison synchronisée ; le fichier XML complet n’est pas envoyé au serveur. La recherche
          par nom transmet prénom et nom à UTMB via notre serveur ; les fiches de courses et traces
          disponibles sont demandées à l’organisateur UTLAC. Aucun mot de passe ni cookie de compte
          UTMB ou ITRA n’est demandé.
        </p>
        <p>
          Deux cookies servent à la session et à la vérification temporaire de la connexion OAuth
          (dix minutes). Le choix du thème est enregistré localement dans ton navigateur. Aucun
          service d’analyse, publicité ou suivi n’est intégré. Ton avatar est chargé auprès de
          Strava ; l’hébergeur traite les requêtes techniques nécessaires au fonctionnement du site.
        </p>
        <h2>Déconnexion et révocation</h2>
        <p>
          « Se déconnecter » retire la session courante. Avec la synchronisation activée, « Révoquer
          l’accès Strava » invalide aussi les sessions de tous tes appareils et demande à Strava de
          retirer l’autorisation. Les saisons enregistrées sont conservées. Tu peux également
          retirer l’accès dans tes paramètres Strava. Pour supprimer les données stockées par un
          hébergement, contacte son administrateur ; le code et la procédure de sauvegarde sont
          publics dans le dépôt.
        </p>
        <h2 id="calculs">Comment sont calculées les statistiques ?</h2>
        <p>
          Les distances sont additionnées en kilomètres. L’allure moyenne est le temps total en
          mouvement divisé par la distance totale des courses ; la vitesse utilise ces mêmes totaux.
          Les semaines vont du lundi au dimanche, selon la date locale de chaque activité. Le volume
          hebdomadaire et le temps d’activité servent de mesures simples de charge, sans
          interprétation physiologique.
        </p>
        <p>
          L’allure effort estimée est calculée par myStats : temps de course ÷ (distance en km +
          dénivelé positif en mètres ÷ 100). Elle suppose qu’un dénivelé de 100 m équivaut à 1 km
          d’effort. C’est une approximation : elle ne modélise ni la pente instantanée, ni les
          descentes, ni le terrain, et ne correspond pas à la VAP/GAP Strava. Les résumés
          d’activités ne suffisent pas à calculer une VAP précise.
        </p>
        <h2>Contact et code source</h2>
        <p>
          Les indices de pente et de difficulté et les projections de saison sont des approximations
          myStats dont les formules sont visibles dans chaque fiche objectif. Les estimations de
          place et de scores nécessitent un classement de référence importé. Elles ne représentent
          ni un classement futur garanti ni un index officiel UTMB/ITRA.
        </p>
        <p>
          Pour une question ou un problème, ouvre une issue dans{' '}
          <a href="https://github.com/gubgub63/MyStravaStats">le dépôt GitHub</a>. N’y joins aucun
          secret, cookie ou donnée privée.
        </p>
      </main>
      <Footer />
    </>
  );
}
