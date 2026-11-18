import { describe, it, expect } from "vitest";
import { createMockProvider } from "../src/integrations/geo/mockProvider.js";
import { createGeoService } from "../src/services/geoService.js";

const PUBLIC_IP = "8.8.8.8";
const B_RESULT = { country: "FR", region: "Île-de-France", city: "Paris" };

// Records log calls so tests can check what was (and was not) logged, without real output.
function createFakeLogger() {
  const entries = [];
  const record = (level) => (obj, msg) => entries.push({ level, obj, msg });
  return { entries, info: record("info"), warn: record("warn"), error: record("error") };
}

describe("geoService.lookup", () => {
  it("returns null (and does not throw) when every provider is down", async () => {
    const a = createMockProvider({ name: "a", mode: "down" });
    const b = createMockProvider({ name: "b", mode: "down" });
    const geo = createGeoService({ providers: [a, b], logger: createFakeLogger() });

    await expect(geo.lookup(PUBLIC_IP)).resolves.toBeNull();
    expect(a.calls).toBe(1);
    expect(b.calls).toBe(1);
  });

  it("falls back to B when A is down", async () => {
    const a = createMockProvider({ name: "a", mode: "down" });
    const b = createMockProvider({ name: "b", mode: "up", result: B_RESULT });
    const geo = createGeoService({ providers: [a, b], logger: createFakeLogger() });

    await expect(geo.lookup(PUBLIC_IP)).resolves.toEqual(B_RESULT);
    expect(a.calls).toBe(1);
    expect(b.calls).toBe(1);
  });

  it("uses A when A is up and never calls B", async () => {
    const a = createMockProvider({ name: "a", mode: "up" });
    const b = createMockProvider({ name: "b", mode: "up", result: B_RESULT });
    const geo = createGeoService({ providers: [a, b], logger: createFakeLogger() });

    await expect(geo.lookup(PUBLIC_IP)).resolves.toEqual({ country: "DE", region: "Berlin", city: "Berlin" });
    expect(b.calls).toBe(0);
  });

  it("times out a slow A and falls back to B", async () => {
    const a = createMockProvider({ name: "a", mode: "slow" });
    const b = createMockProvider({ name: "b", mode: "up", result: B_RESULT });
    const geo = createGeoService({ providers: [a, b], timeoutMs: 50, logger: createFakeLogger() });

    const started = Date.now();
    await expect(geo.lookup(PUBLIC_IP)).resolves.toEqual(B_RESULT);
    // Without a timeout a hung provider would wait forever; with one we pay ~50 ms, not more.
    expect(Date.now() - started).toBeLessThan(500);
  });

  it("gives each provider its own timeout budget (one shared signal would fail B too)", async () => {
    const a = createMockProvider({ name: "a", mode: "slow" });
    // B answers after 30 ms. That fits in its own 50 ms budget, but not in what is left of a
    // signal that started before A and already fired during A's 50 ms.
    const b = {
      name: "b",
      lookup: (ip, { signal }) =>
        new Promise((resolve, reject) => {
          if (signal?.aborted) return reject(signal.reason);
          const timer = setTimeout(() => resolve(B_RESULT), 30);
          signal?.addEventListener("abort", () => {
            clearTimeout(timer);
            reject(signal.reason);
          }, { once: true });
        }),
    };
    const geo = createGeoService({ providers: [a, b], timeoutMs: 50, logger: createFakeLogger() });

    await expect(geo.lookup(PUBLIC_IP)).resolves.toEqual(B_RESULT);
  });

  it.each(["127.0.0.1", "::ffff:127.0.0.1", "10.0.0.5", "not-an-ip", undefined])(
    "returns null for %j without calling any provider",
    async (ip) => {
      const a = createMockProvider({ name: "a", mode: "up" });
      const geo = createGeoService({ providers: [a], logger: createFakeLogger() });

      await expect(geo.lookup(ip)).resolves.toBeNull();
      expect(a.calls).toBe(0);
    }
  );

  it("logs each failure as a warning with the provider name and reason, never the IP", async () => {
    const logger = createFakeLogger();
    const a = createMockProvider({ name: "a", mode: "down" });
    const b = createMockProvider({ name: "b", mode: "down" });
    const geo = createGeoService({ providers: [a, b], logger });

    await geo.lookup(PUBLIC_IP);

    const warnings = logger.entries.filter((e) => e.level === "warn");
    expect(warnings).toHaveLength(2);
    expect(JSON.stringify(warnings)).toContain("a is down");
    expect(JSON.stringify(logger.entries)).not.toContain(PUBLIC_IP);
  });
});
