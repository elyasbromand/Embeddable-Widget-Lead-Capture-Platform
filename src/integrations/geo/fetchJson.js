// Shared GET for geo providers: passes the caller's AbortSignal (the timeout lives in geoService)
// and turns any non-2xx status into a thrown error, so a provider either returns JSON or throws.
export async function fetchJson(url, { signal, providerName }) {
  const response = await fetch(url, {
    signal,
    headers: { accept: "application/json", "user-agent": "lead-capture-platform/0.1" },
  });
  if (!response.ok) {
    throw new Error(`${providerName} responded ${response.status}`);
  }
  return response.json();
}

// Providers send "" for unknown parts; we store null so "unknown" has one spelling.
export const orNull = (value) => (typeof value === "string" && value.trim() !== "" ? value : null);
