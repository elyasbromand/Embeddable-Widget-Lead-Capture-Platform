import { logger as defaultLogger } from "../logger.js";
import { isPublicIp } from "../integrations/geo/isPublicIp.js";
import { createIpApiProvider } from "../integrations/geo/ipApiProvider.js";
import { createIpapiCoProvider } from "../integrations/geo/ipapiCoProvider.js";
import { applyForcedDown } from "../integrations/geo/forceDown.js";
import { config } from "../config/index.js";

// Tries providers in order and returns the first result, or null when all fail.
// Never throws: a geo outage must not be able to fail a submission.
export function createGeoService({ providers, timeoutMs = 1500, logger = defaultLogger }) {
  return {
    async lookup(ip) {
      // No provider can locate a private/loopback address: skip the round trip and the quota.
      if (!isPublicIp(ip)) return null;

      for (const provider of providers) {
        try {
          // A new signal per provider, so a slow one cannot eat the next one's time.
          return await provider.lookup(ip, { signal: AbortSignal.timeout(timeoutMs) });
        } catch (err) {
          logger.warn({ provider: provider.name, error: err.message }, "Geo provider failed");
        }
      }
      return null;
    },
  };
}

// The app's instance. ip-api.com first (45/min, no daily cap), ipapi.co as backup (~1,000/day).
// Only this instance reads config; the factory above stays pure for tests.
export const geoService = createGeoService({
  providers: applyForcedDown([createIpApiProvider(), createIpapiCoProvider()], config.GEO_FORCE_DOWN),
});
