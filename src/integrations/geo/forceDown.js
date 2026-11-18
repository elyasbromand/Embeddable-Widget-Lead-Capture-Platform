// Fault injection (GEO_FORCE_DOWN): a named provider is swapped for one that throws at once,
// without touching the network. Lets the running server prove the fallback chain (Probe 4).
export function applyForcedDown(providers, downNames) {
  return providers.map((provider) =>
    downNames.includes(provider.name)
      ? {
          name: provider.name,
          async lookup() {
            throw new Error(`${provider.name} forced down (GEO_FORCE_DOWN)`);
          },
        }
      : provider
  );
}
