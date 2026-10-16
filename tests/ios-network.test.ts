import { describe, expect, it } from 'vitest';
import { isPrivateIPv4, localOrigin } from '../scripts/ios-network.mjs';

describe('iOS local development network', () => {
  it('binds only to loopback or an RFC1918 address', () => {
    for (const host of ['10.0.0.1', '172.16.0.1', '172.31.255.254', '192.168.1.102']) {
      expect(isPrivateIPv4(host)).toBe(true);
      expect(localOrigin(host)).toBe(`http://${host}:3001`);
    }
    expect(localOrigin('localhost')).toBe('http://localhost:3001');
    expect(localOrigin('127.0.0.1')).toBe('http://127.0.0.1:3001');
    for (const host of [
      '0.0.0.0',
      '8.8.8.8',
      '172.15.0.1',
      '172.32.0.1',
      '192.169.1.1',
      '192.168.1.256',
      '192.168.1.example.org',
      '192.168.1.1:3001',
      '::',
    ]) {
      expect(isPrivateIPv4(host)).toBe(false);
      expect(() => localOrigin(host)).toThrow();
    }
  });
});
