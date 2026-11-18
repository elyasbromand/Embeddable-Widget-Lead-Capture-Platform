import { fetchJson, orNull } from "./fetchJson.js";

// ip-api.com: no key, 45 requests/minute, free endpoint is HTTP only.
// It answers 200 even on failure, with { status: "fail", message }, so the body must be checked too.
const BASE_URL = "http://ip-api.com/json";
const FIELDS = "status,message,countryCode,regionName,city";

export function createIpApiProvider({ baseUrl = BASE_URL } = {}) {
  return {
    name: "ip-api.com",
    async lookup(ip, { signal } = {}) {
      const url = `${baseUrl}/${encodeURIComponent(ip)}?fields=${FIELDS}`;
      const body = await fetchJson(url, { signal, providerName: this.name });
      if (body.status !== "success") {
        throw new Error(`${this.name} failed: ${body.message ?? "unknown reason"}`);
      }
      if (!orNull(body.countryCode)) {
        throw new Error(`${this.name} returned no country`);
      }
      return { country: body.countryCode, region: orNull(body.regionName), city: orNull(body.city) };
    },
  };
}
