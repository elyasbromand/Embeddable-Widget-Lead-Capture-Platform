import { describe, it, expect } from "vitest";
import { applyForcedDown } from "../src/integrations/geo/forceDown.js";
import { createMockProvider } from "../src/integrations/geo/mockProvider.js";

describe("applyForcedDown", () => {
  it("leaves providers alone when the list is empty", () => {
    const a = createMockProvider({ name: "ip-api.com" });
    expect(applyForcedDown([a], [])[0]).toBe(a);
  });

  it("makes a named provider throw without calling the real one", async () => {
    const a = createMockProvider({ name: "ip-api.com" });
    const b = createMockProvider({ name: "ipapi.co" });
    const [downA, keptB] = applyForcedDown([a, b], ["ip-api.com"]);

    await expect(downA.lookup("8.8.8.8")).rejects.toThrow("forced down");
    expect(a.calls).toBe(0);
    expect(downA.name).toBe("ip-api.com");
    expect(keptB).toBe(b);
  });
});
