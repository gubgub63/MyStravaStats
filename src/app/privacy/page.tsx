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
          demandées. Aucun parcours GPS n’est collecté.
        </p>
        <h2>Session et conservation</h2>
        <p>
          Les identifiants OAuth restent dans un cookie chiffré et authentifié, inaccessible au
          JavaScript. Le cookie est sécurisé en HTTPS en production, sans durée de conservation
          permanente dans le navigateur. La session est limitée à 24 heures ; certains navigateurs
          peuvent restaurer leurs cookies de session au redémarrage.
        </p>
        <p>
          Aucune base de données ni aucun stockage permanent des activités. Un cache privé en
          mémoire conserve les statistiques jusqu’à dix minutes, par session et période, pour
          limiter les appels Strava. Il disparaît au redémarrage du serveur et est purgé sur
          l’instance qui traite ta déconnexion. Sur plusieurs instances, les copies restantes
          expirent au bout de dix minutes au maximum. Les réponses privées ne sont jamais mises dans
          un cache public.
        </p>
        <h2>Cookies et services externes</h2>
        <p>
          Deux cookies servent à la session et à la vérification temporaire de la connexion OAuth
          (dix minutes). Le choix du thème est enregistré localement dans ton navigateur. Aucun
          service d’analyse, publicité ou suivi n’est intégré. Ton avatar est chargé auprès de
          Strava ; l’hébergeur traite les requêtes techniques nécessaires au fonctionnement du site.
        </p>
        <h2>Déconnexion et révocation</h2>
        <p>
          « Se déconnecter » supprime le cookie local. « Révoquer l’accès Strava » demande également
          à Strava de retirer l’autorisation. Tu peux toujours retirer cet accès depuis les
          applications autorisées dans tes paramètres Strava. En cas de cookie compromis, révoquer
          l’accès auprès de Strava invalide les identifiants ; une architecture sans stockage de
          session ne peut pas révoquer individuellement un cookie copié.
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
          Pour une question ou un problème, ouvre une issue dans{' '}
          <a href="https://github.com/gubgub63/MyStravaStats">le dépôt GitHub</a>. N’y joins aucun
          secret, cookie ou donnée privée.
        </p>
      </main>
      <Footer />
    </>
  );
}
