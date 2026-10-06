import 'server-only';
export const CACHE_TTL_MS = 10 * 60 * 1000;
export class PrivateCache<T> {
  private entries = new Map<string, { value: T; expires: number }>();
  private pending = new Map<string, Promise<T>>();
  constructor(
    private ttl = CACHE_TTL_MS,
    private maxEntries = 100,
  ) {}
  async get(key: string, load: () => Promise<T>): Promise<T> {
    const now = Date.now();
    for (const [k, v] of this.entries) if (v.expires <= now) this.entries.delete(k);
    const cached = this.entries.get(key);
    if (cached) return cached.value;
    const inflight = this.pending.get(key);
    if (inflight) return inflight;
    const promise = load()
      .then((value) => {
        if (this.pending.get(key) === promise) {
          if (this.entries.size >= this.maxEntries)
            this.entries.delete(this.entries.keys().next().value!);
          const entry = { value, expires: Date.now() + this.ttl };
          this.entries.set(key, entry);
          const timer = setTimeout(() => {
            if (this.entries.get(key) === entry) this.entries.delete(key);
          }, this.ttl);
          timer.unref?.();
        }
        return value;
      })
      .finally(() => {
        if (this.pending.get(key) === promise) this.pending.delete(key);
      });
    this.pending.set(key, promise);
    return promise;
  }
  deletePrefix(prefix: string) {
    for (const key of new Set([...this.entries.keys(), ...this.pending.keys()]))
      if (key.startsWith(prefix)) {
        this.entries.delete(key);
        this.pending.delete(key);
      }
  }
}
