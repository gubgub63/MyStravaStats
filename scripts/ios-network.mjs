import { isIP } from 'node:net';

export function isPrivateIPv4(host) {
  if (isIP(host) !== 4) return false;
  const [a, b] = host.split('.').map(Number);
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

export function localOrigin(host) {
  if (host !== 'localhost' && host !== '127.0.0.1' && !isPrivateIPv4(host))
    throw new Error('Choisis localhost ou une adresse IPv4 privée du Mac sur ton Wi-Fi.');
  return `http://${host}:3001`;
}
