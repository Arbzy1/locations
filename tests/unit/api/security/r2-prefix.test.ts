import { describe, expect, it, vi } from "vitest";
import { deleteR2Prefix } from "@locations/api/r2-prefix";

describe("deleteR2Prefix", () => {
  it("pages until the listing is not truncated", async () => {
    const list = vi
      .fn()
      .mockResolvedValueOnce({
        objects: [{ key: "uploads/u/a.json" }, { key: "uploads/u/b.json" }],
        truncated: true,
        cursor: "page-2",
      })
      .mockResolvedValueOnce({
        objects: [{ key: "uploads/u/c.json" }],
        truncated: false,
      });
    const del = vi.fn(async () => undefined);
    const n = await deleteR2Prefix({ list, delete: del }, "uploads/u/");
    expect(n).toBe(3);
    expect(list).toHaveBeenCalledTimes(2);
    expect(list.mock.calls[1][0]).toMatchObject({ prefix: "uploads/u/", cursor: "page-2" });
    expect(del).toHaveBeenCalledWith("uploads/u/a.json");
    expect(del).toHaveBeenCalledWith("uploads/u/c.json");
  });
});
