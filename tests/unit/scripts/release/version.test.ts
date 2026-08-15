import { describe, expect, it } from "vitest";
import {
  bumpLockfileVersions,
  bumpPackageJson,
  bumpSemver,
  changelogFromSubjects,
  firstParagraph,
  formatTag,
  githubReleaseUrl,
  latestChangelogVersion,
  normalizeTag,
  parseArgs,
  parseSemver,
  promoteChangelog,
  resolveBaseVersion,
  sanitizeName,
  updateMarketingChangelog,
} from "../../../../scripts/release.mjs";

describe("parseArgs", () => {
  it("defaults to patch", () => {
    expect(parseArgs([]).increment).toBe("patch");
  });

  it("accepts npm release:set -- v1.2.3", () => {
    const opts = parseArgs(["--set-tag", "v1.2.3"]);
    expect(opts.increment).toBe("set");
    expect(opts.setTag).toBe("v1.2.3");
  });

  it("normalizes a tag without the v prefix", () => {
    expect(parseArgs(["--set-tag", "1.2.3"]).setTag).toBe("v1.2.3");
  });

  it("rejects combining bump flags", () => {
    expect(() => parseArgs(["--minor", "--major"])).toThrow(/multiple version flags/);
  });

  it("rejects --current with a bump", () => {
    expect(() => parseArgs(["--current", "--patch"])).toThrow(/--current/);
  });
});

describe("semver", () => {
  it("parses and formats tags", () => {
    expect(parseSemver("v1.2.3-beta")).toEqual({
      major: 1,
      minor: 2,
      patch: 3,
      name: "beta",
    });
    expect(formatTag({ major: 2, minor: 0, patch: 0, name: "rc1" })).toBe("v2.0.0-rc1");
  });

  it("bumps major, minor, and patch", () => {
    const base = { major: 1, minor: 4, patch: 9, name: "beta" };
    expect(bumpSemver(base, "major")).toEqual({ major: 2, minor: 0, patch: 0, name: "" });
    expect(bumpSemver(base, "minor")).toEqual({ major: 1, minor: 5, patch: 0, name: "" });
    expect(bumpSemver(base, "patch")).toEqual({ major: 1, minor: 4, patch: 10, name: "" });
  });

  it("uses package.json when no tags exist", () => {
    expect(formatTag(bumpSemver(resolveBaseVersion({ packageVersion: "1.0.0" }), "minor"))).toBe(
      "v1.1.0",
    );
  });

  it("reads the highest version heading from the changelog", () => {
    expect(
      formatTag(
        latestChangelogVersion(`# Changelog\n\n## Unreleased\n\n## 1.2.0\n\nEnv.\n\n## 1.1.0\n\nSaaS.\n`) ?? {
          major: 0,
          minor: 0,
          patch: 0,
          name: "",
        },
      ),
    ).toBe("v1.2.0");
  });

  it("uses the highest of tag, package.json, and changelog", () => {
    expect(
      formatTag(
        bumpSemver(
          resolveBaseVersion({
            latestTag: "v1.0.0",
            packageVersion: "1.0.0",
            changelogVersion: { major: 1, minor: 2, patch: 0, name: "" },
          }),
          "patch",
        ),
      ),
    ).toBe("v1.2.1");
  });

  it("sanitizes pre-release names", () => {
    expect(sanitizeName("rc 1!")).toBe("rc-1");
    expect(normalizeTag("2.0.0")).toBe("v2.0.0");
  });
});

describe("package files", () => {
  it("replaces only the top-level package.json version", () => {
    const input = `{
  "name": "locations",
  "version": "1.0.0",
  "dependencies": { "foo": "1.0.0" }
}`;
    expect(bumpPackageJson(input, "1.1.0")).toContain('"version": "1.1.0"');
    expect(bumpPackageJson(input, "1.1.0")).toContain('"foo": "1.0.0"');
  });

  it("updates workspace versions in the lockfile", () => {
    const lock = `{
  "name": "locations",
  "version": "1.0.0",
  "packages": {
    "": {
      "name": "locations",
      "version": "1.0.0"
    },
    "apps/api": {
      "name": "@locations/api",
      "version": "1.0.0"
    },
    "apps/web": {
      "name": "@locations/web",
      "version": "1.0.0"
    },
    "packages/db": {
      "name": "@locations/db",
      "version": "1.0.0"
    }
  }
}`;
    const next = bumpLockfileVersions(lock, "1.3.0");
    expect(next.match(/"version": "1.3.0"/g)?.length).toBe(5);
    expect(next).not.toContain('"version": "1.0.0"');
  });
});

describe("changelog", () => {
  it("promotes Unreleased notes into the new version heading", () => {
    const md = `# Changelog

## Unreleased

Colour moods in Settings.

## 1.2.0

Named Wrangler environments.
`;
    const next = promoteChangelog(md, "1.3.0", "- unused fallback");
    expect(next).toContain("## Unreleased\n\n## 1.3.0\n\nColour moods in Settings.");
    expect(next).toContain("## 1.2.0");
    expect(next).not.toMatch(/## Unreleased\n\nColour moods/);
  });

  it("uses git subjects when Unreleased is empty", () => {
    const md = `# Changelog

## Unreleased

## 1.2.0

Shipped.
`;
    const next = promoteChangelog(md, "1.2.1", changelogFromSubjects(["Fix auth", "Merge PR #4"]));
    expect(next).toContain("## 1.2.1\n\n- Fix auth\n");
    expect(next).not.toContain("Merge PR");
  });

  it("refuses to insert a version that already exists", () => {
    expect(() => promoteChangelog("## Unreleased\n\n## 1.2.0\n\nDone.\n", "1.2.0", "x")).toThrow(
      /already has/,
    );
  });

  it("truncates the first paragraph for the marketing summary", () => {
    expect(firstParagraph("Hello world.\n\nMore.", 20)).toBe("Hello world.");
    expect(firstParagraph("a ".repeat(200), 20)).toMatch(/\.\.\.$/);
  });

  it("resets Unreleased and inserts the released marketing entry", () => {
    const source = `export const CHANGELOG_ENTRIES: ChangelogEntry[] = [
  {
    version: "Unreleased",
    summary:
      "Public landing and demo tour.",
  },
  {
    version: "1.2.0",
    summary: "Named Wrangler environments.",
  },
];
`;
    const next = updateMarketingChangelog(source, {
      version: "1.3.0",
      summary: "Colour moods in Settings.",
    });
    expect(next).toContain('version: "Unreleased"');
    expect(next).toContain("Changes since the last tagged release.");
    expect(next).toContain('version: "1.3.0"');
    expect(next).toContain("Colour moods in Settings.");
    expect(next.indexOf("1.3.0")).toBeLessThan(next.indexOf("1.2.0"));
  });
});

describe("githubReleaseUrl", () => {
  it("parses ssh and https remotes", () => {
    expect(githubReleaseUrl("git@github.com:Arbzy1/locations.git", "v1.3.0")).toBe(
      "https://github.com/Arbzy1/locations/releases/tag/v1.3.0",
    );
    expect(githubReleaseUrl("https://github.com/Arbzy1/locations.git", "v1.3.0")).toBe(
      "https://github.com/Arbzy1/locations/releases/tag/v1.3.0",
    );
  });
});
