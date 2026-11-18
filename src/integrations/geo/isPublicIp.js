import net from "node:net";

// Addresses no geo provider can locate: looking them up only costs a round trip and quota.
const blocked = new net.BlockList();
blocked.addSubnet("0.0.0.0", 8, "ipv4"); //       "this network"
blocked.addSubnet("10.0.0.0", 8, "ipv4"); //      private
blocked.addSubnet("127.0.0.0", 8, "ipv4"); //     loopback
blocked.addSubnet("169.254.0.0", 16, "ipv4"); //  link-local
blocked.addSubnet("172.16.0.0", 12, "ipv4"); //   private
blocked.addSubnet("192.168.0.0", 16, "ipv4"); //  private
blocked.addAddress("::", "ipv6"); //              unspecified
blocked.addAddress("::1", "ipv6"); //             loopback
blocked.addSubnet("fc00::", 7, "ipv6"); //        unique local (private)
blocked.addSubnet("fe80::", 10, "ipv6"); //       link-local

// true only for an address worth sending to a provider. Never throws.
// IPv4-mapped IPv6 (::ffff:127.0.0.1, common in req.ip) is matched against the IPv4 ranges by BlockList.
export function isPublicIp(ip) {
  const version = net.isIP(ip ?? "");
  if (version === 0) return false;
  return !blocked.check(ip, version === 4 ? "ipv4" : "ipv6");
}
