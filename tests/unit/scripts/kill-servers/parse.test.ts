import { describe, expect, it } from "vitest";
import { PORTS, pidsFromNetstat } from "../../../../scripts/kill-servers.mjs";

describe("pidsFromNetstat", () => {
  it("reads IPv4 and IPv6 LISTENING pids for a port", () => {
    const out = [
      "  TCP    127.0.0.1:5173         0.0.0.0:0              LISTENING       12345",
      "  TCP    [::]:5173              [::]:0                 LISTENING       12345",
      "  TCP    127.0.0.1:8787         0.0.0.0:0              LISTENING       99",
      "  TCP    127.0.0.1:5173         127.0.0.1:60000        ESTABLISHED     111",
    ].join("\n");
    expect([...pidsFromNetstat(out, 5173)]).toEqual([12345]);
    expect([...pidsFromNetstat(out, 8787)]).toEqual([99]);
    expect([...pidsFromNetstat(out, 9229)]).toEqual([]);
  });

  it("covers Vite hops, Wrangler, and the inspector", () => {
    expect(PORTS).toEqual([5173, 5174, 5175, 5176, 5177, 5178, 5179, 8787, 9229]);
  });
});
