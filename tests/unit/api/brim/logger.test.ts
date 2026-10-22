import { describe, expect, it } from "vitest";
import { createLogger, redact } from "@locations/api/brim/logger";

describe("redaction", () => {
  it("strips a VRM from nested payloads", () => {
    const lines: string[] = [];
    const log = createLogger((l) => lines.push(l));
    log.info({ vrm: "AB12CDE", nested: { registration: "XY98ZAB" }, note: "driver AB12CDE arrived" });
    const joined = lines.join("\n");
    expect(joined).not.toMatch(/AB12CDE/);
    expect(joined).not.toMatch(/XY98ZAB/);
    expect(joined).toMatch(/REDACTED_VRM/);
  });

  it("strips VES registrationNumber as well", () => {
    const out = redact({
      registrationNumber: "AB12CDE",
      registration_number: "XY98ZAB",
      plate: "AB12CDE",
    }) as {
      registrationNumber: string;
      registration_number: string;
      plate: string;
    };
    expect(out.registrationNumber).toBe("[REDACTED_VRM]");
    expect(out.registration_number).toBe("[REDACTED_VRM]");
    expect(out.plate).toBe("[REDACTED_VRM]");
  });

  it("does not log full address strings", () => {
    const out = redact({
      address: "10 Station Road, Crawley",
      formatted_address: "Victoria Street, London",
    }) as { address: string; formatted_address: string };
    expect(out.address).toBe("[REDACTED]");
    expect(out.formatted_address).toBe("[REDACTED]");
  });
});
