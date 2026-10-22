import { describe, expect, it } from "vitest";
import { decodeVrmKey, decryptVrm, encryptVrm, hashVrm } from "@locations/api/brim/vrm-crypto";

const KEY = decodeVrmKey("AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE")!;

describe("vrm crypto", () => {
  it("hashes and encrypts without putting the plate in the ciphertext envelope as plaintext", async () => {
    expect(KEY.byteLength).toBe(32);
    const hash = await hashVrm(KEY, "AB12CDE");
    expect(hash).not.toMatch(/AB12CDE/i);
    expect(hash.length).toBeGreaterThan(20);
    const packed = await encryptVrm(KEY, "AB12CDE");
    expect(packed.startsWith("v1:")).toBe(true);
    expect(packed).not.toMatch(/AB12CDE/i);
    const roundTrip = await decryptVrm(KEY, packed);
    expect(roundTrip).toBe("AB12CDE");
  });
});
