import { fetchJson, orNull } from "./fetchJson.js";

// ipapi.co: no key, about 1,000 lookups a day on the free tier, HTTPS.
// Errors come back as { error: true, reason } (sometimes with a 200), so the body must be checked too.
const BASE_URL = "https://ipapi.co";

export function createIpapiCoProvider({ baseUrl = BASE_URL } = {}) {
  return {
    name: "ipapi.co",
    async lookup(ip, { signal } = {}) {
      const url = `${baseUrl}/${encodeURIComponent(ip)}/json/`;
      const body = await fetchJson(url, { signal, providerName: this.name });
      if (body.error) {
        throw new Error(`${this.name} failed: ${body.reason ?? "unknown reason"}`);
      }
      if (!orNull(body.country_code)) {
        throw new Error(`${this.name} returned no country`);
      }
      return { country: body.country_code, region: orNull(body.region), city: orNull(body.city) };
    },
  };
}
