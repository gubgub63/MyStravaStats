import { Header, Footer } from '@/components/shell';
export const metadata = { title: 'Confidentialité de l’aperçu' };

export default function PrivacyPage() {
  return (
    <>
      <Header />
      <main id="main" className="container prose">
        <h1>Confidentialité de l’aperçu.</h1>
        <p>
          Cet aperçu public utilise uniquement des activités fictives. Il ne se connecte pas à
          Strava et ne charge aucune donnée personnelle d’athlète.
        </p>
        <p>
          Le thème est enregistré dans ton navigateur. Aucun cookie de session Strava ni outil
          d’analyse n’est utilisé. GitHub Pages héberge les fichiers et traite les requêtes
          techniques nécessaires pour les afficher.
        </p>
        <h2 id="calculs">Comment sont calculées les statistiques ?</h2>
        <p>
          L’allure moyenne correspond au temps total en mouvement divisé par la distance des
          courses. Les semaines vont du lundi au dimanche, selon la date locale des activités.
        </p>
        <p>
          L’allure effort estimée divise le temps par la distance en kilomètres plus le dénivelé
          positif en mètres divisé par 100. Cette approximation ne modélise ni les descentes, ni la
          pente instantanée, ni le terrain ; elle ne correspond pas à la VAP/GAP Strava.
        </p>
        <h2>Connecter tes propres activités</h2>
        <p>
          La connexion Strava nécessite la version complète sur un serveur. Le{' '}
          <a href="https://github.com/gubgub63/MyStravaStats/blob/main/docs/self-hosting.md">
            guide d’auto-hébergement
          </a>{' '}
          explique son installation et la configuration de ton application Strava.
        </p>
      </main>
      <Footer />
    </>
  );
}
