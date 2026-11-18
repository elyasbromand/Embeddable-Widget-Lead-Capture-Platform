// A fake geo provider for tests and fault injection. Same shape as the real ones:
// lookup(ip, { signal }) resolves to { country, region, city } or throws.
//   mode "up"   -> resolves with `result`
//   mode "down" -> throws at once (like a refused connection)
//   mode "slow" -> never answers on its own; only the caller's AbortSignal ends it (like a hung provider)
export function createMockProvider({
  name = "mock",
  mode = "up",
  result = { country: "DE", region: "Berlin", city: "Berlin" },
} = {}) {
  return {
    name,
    calls: 0,
    setMode(next) {
      mode = next;
    },
    async lookup(ip, { signal } = {}) {
      this.calls += 1;
      if (mode === "down") throw new Error(`${name} is down`);
      if (mode === "slow") {
        return new Promise((_, reject) => {
          signal?.addEventListener("abort", () => reject(signal.reason), { once: true });
        });
      }
      return { ...result };
    },
  };
}
