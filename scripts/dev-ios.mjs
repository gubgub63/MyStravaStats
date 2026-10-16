import { localOrigin } from './ios-network.mjs';
process.loadEnvFile('.env.ios.local');
const origin = new URL(process.env.NEXT_PUBLIC_APP_URL);
if (origin.origin !== localOrigin(origin.hostname))
  throw new Error('Relance npm run ios:setup avec une adresse locale valide.');
process.argv = [process.execPath, 'next', 'dev', '--port', '3001', '--hostname', origin.hostname];
await import('next/dist/bin/next');
