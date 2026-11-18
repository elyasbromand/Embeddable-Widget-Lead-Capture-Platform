import { describe, it, expect } from "vitest";
import { isPublicIp } from "../src/integrations/geo/isPublicIp.js";

describe("isPublicIp", () => {
  it.each([
    "8.8.8.8",
    "2001:4860:4860::8888",
    "172.32.0.1", // just outside 172.16.0.0/12
    "172.15.255.255", // just below it
  ])("%s is public", (ip) => {
    expect(isPublicIp(ip)).toBe(true);
  });

  it.each([
    "127.0.0.1",
    "::1",
    "::ffff:127.0.0.1", // IPv4-mapped loopback, what req.ip often looks like
    "::ffff:192.168.1.5",
    "10.1.2.3",
    "192.168.0.10",
    "172.16.0.1",
    "172.31.255.255", // last address in 172.16.0.0/12
    "169.254.1.1",
    "0.0.0.0",
    "::",
    "fd12:3456::1",
    "fe80::1",
  ])("%s is not public", (ip) => {
    expect(isPublicIp(ip)).toBe(false);
  });

  it.each(["not-an-ip", "", undefined, null, "8.8.8.8 ", "999.1.1.1"])(
    "%j is rejected without throwing",
    (ip) => {
      expect(isPublicIp(ip)).toBe(false);
    }
  );
});
