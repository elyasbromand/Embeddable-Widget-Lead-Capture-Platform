import { describe, it, expect, vi, afterEach } from "vitest";
import { createIpApiProvider } from "../src/integrations/geo/ipApiProvider.js";
import { createIpapiCoProvider } from "../src/integrations/geo/ipapiCoProvider.js";

// fetch is replaced with a stub, so these tests never touch the network.
const stubFetch = (status, body) =>
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status })));

afterEach(() => vi.unstubAllGlobals());

describe("ipApiProvider", () => {
  const provider = createIpApiProvider();

  it("maps a success body to { country, region, city }", async () => {
    stubFetch(200, { status: "success", countryCode: "US", regionName: "Virginia", city: "Ashburn" });
    await expect(provider.lookup("8.8.8.8")).resolves.toEqual({ country: "US", region: "Virginia", city: "Ashburn" });
  });

  it("throws on a 200 with status 'fail'", async () => {
    stubFetch(200, { status: "fail", message: "private range" });
    await expect(provider.lookup("10.0.0.1")).rejects.toThrow("private range");
  });

  it("throws on 429 (rate limited)", async () => {
    stubFetch(429, {});
    await expect(provider.lookup("8.8.8.8")).rejects.toThrow("429");
  });

  it("stores empty region/city as null", async () => {
    stubFetch(200, { status: "success", countryCode: "US", regionName: "", city: "" });
    await expect(provider.lookup("8.8.8.8")).resolves.toEqual({ country: "US", region: null, city: null });
  });
});

describe("ipapiCoProvider", () => {
  const provider = createIpapiCoProvider();

  it("maps a success body to { country, region, city }", async () => {
    stubFetch(200, { country_code: "US", region: "California", city: "Mountain View" });
    await expect(provider.lookup("8.8.8.8")).resolves.toEqual({ country: "US", region: "California", city: "Mountain View" });
  });

  it("throws on { error: true }", async () => {
    stubFetch(200, { error: true, reason: "Reserved IP Address" });
    await expect(provider.lookup("127.0.0.1")).rejects.toThrow("Reserved IP Address");
  });

  it("throws when the body is not JSON", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>oops</html>", { status: 200 })));
    await expect(provider.lookup("8.8.8.8")).rejects.toThrow();
  });
});
