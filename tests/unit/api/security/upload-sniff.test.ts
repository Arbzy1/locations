import { describe, expect, it } from "vitest";
import { sniffTimelineJson } from "@locations/api/upload-sniff";

describe("sniffTimelineJson", () => {
  it("accepts a JSON array", () => {
    const buf = new TextEncoder().encode('[{"visit":{}}]').buffer;
    const result = sniffTimelineJson(buf);
    expect(result.ok).toBe(true);
  });

  it("rejects zip magic bytes", () => {
    const bytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0]);
    const result = sniffTimelineJson(bytes.buffer);
    expect(result.ok).toBe(false);
  });

  it("rejects non-JSON text", () => {
    const buf = new TextEncoder().encode("not json").buffer;
    const result = sniffTimelineJson(buf);
    expect(result.ok).toBe(false);
  });
});
