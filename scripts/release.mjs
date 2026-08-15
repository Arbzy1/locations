/**
 * Semantic-version release manager for this monorepo.
 *
 * Adapted from a bash tag/changelog helper. This repo is Node throughout,
 * changelog lives at docs/changelog.md, and there is no WHATS-NEW or
 * worker/appVersion.ts sync. Implementation is Node so it runs in PowerShell.
 *
 *   npm run release              Patch bump (default)
 *   npm run release:patch
 *   npm run release:minor
 *   npm run release:major
 *   npm run release:set -- v1.2.3
 *   npm run release -- --current
 *   node scripts/release.mjs --minor --name beta --dry-run
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export const VERSION_PACKAGE_FILES = [
  "package.json",
  "apps/web/package.json",
  "apps/api/package.json",
  "packages/db/package.json",
];

export const CHANGELOG_PATH = "docs/changelog.md";
export const MARKETING_CHANGELOG_PATH = "apps/web/src/lib/marketing/changelog.ts";
export const LOCKFILE_PATH = "package-lock.json";

const TAG_RE = /^v\d+\.\d+\.\d+(?:-[a-zA-Z0-9-]+)?$/;
const SEMVER_RE = /^v?(\d+)\.(\d+)\.(\d+)(?:-([a-zA-Z0-9-]+))?$/;

/** @typedef {{ major: number, minor: number, patch: number, name: string }} Semver */
/** @typedef {{ increment: "major" | "minor" | "patch" | "set" | "", setTag: string, name: string, showCurrent: boolean, force: boolean, skipChangelog: boolean, noPush: boolean, dryRun: boolean, help: boolean }} ReleaseOpts */

export function usage() {
  return `Usage: node scripts/release.mjs [OPTIONS]
Manage release tags with semantic versioning and changelog promotion.

Options:
  --major           Increment major version (vX.0.0)
  --minor           Increment minor version (v0.X.0)
  --patch           Increment patch version (v0.0.X) (default)
  --name NAME       Append a pre-release suffix (e.g. beta)
  --set-tag TAG     Set a specific tag (vX.Y.Z or vX.Y.Z-NAME)
  --current         Show the latest release tag and exit
  --force           Replace an existing tag with the same name
  --skip-changelog  Skip docs/changelog.md and in-app changelog updates
  --no-push         Commit and tag locally, do not push
  --dry-run         Print the plan without writing, committing, or tagging
  --help            Show this help

npm scripts:
  npm run release
  npm run release:patch
  npm run release:minor
  npm run release:major
  npm run release:set -- v1.2.3
  npm run release -- --current
`;
}

/** @param {string[]} argv */
export function parseArgs(argv) {
  /** @type {ReleaseOpts} */
  const opts = {
    increment: "",
    setTag: "",
    name: "",
    showCurrent: false,
    force: false,
    skipChangelog: false,
    noPush: false,
    dryRun: false,
    help: false,
  };

  /** @param {string} next */
  function setIncrement(next) {
    if (opts.increment) {
      throw new Error("Cannot use multiple version flags together (--major, --minor, --patch, --set-tag)");
    }
    opts.increment = next;
  }

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") opts.help = true;
    else if (arg === "--major") setIncrement("major");
    else if (arg === "--minor") setIncrement("minor");
    else if (arg === "--patch") setIncrement("patch");
    else if (arg === "--current") opts.showCurrent = true;
    else if (arg === "--force") opts.force = true;
    else if (arg === "--skip-changelog") opts.skipChangelog = true;
    else if (arg === "--no-push") opts.noPush = true;
    else if (arg === "--dry-run" || arg === "--preview" || arg === "-n") opts.dryRun = true;
    else if (arg === "--name") {
      const value = argv[++i];
      if (!value || value.startsWith("-")) throw new Error("--name requires a value");
      opts.name = value;
    } else if (arg === "--set-tag") {
      const value = argv[++i];
      if (!value || value.startsWith("--")) throw new Error("--set-tag requires a tag like v1.2.3");
      opts.setTag = normalizeTag(value);
      setIncrement("set");
    } else if (SEMVER_RE.test(arg) && opts.increment === "set" && !opts.setTag) {
      opts.setTag = normalizeTag(arg);
    } else {
      throw new Error(`Unknown option ${arg}`);
    }
  }

  if (opts.showCurrent && (opts.increment || opts.name || opts.force || opts.skipChangelog)) {
    throw new Error("Cannot combine --current with other options");
  }

  if (opts.increment === "set") {
    if (!TAG_RE.test(opts.setTag)) {
      throw new Error("Tag must be in format vX.Y.Z or vX.Y.Z-NAME (e.g. v1.2.3 or v1.2.3-beta)");
    }
    if (opts.name) {
      throw new Error("Cannot use --name with --set-tag");
    }
  }

  if (!opts.increment && !opts.showCurrent && !opts.help) {
    opts.increment = "patch";
  }

  return opts;
}

/** @param {string} value */
export function normalizeTag(value) {
  const raw = String(value || "").trim();
  if (/^\d+\.\d+\.\d+/.test(raw)) return `v${raw}`;
  return raw;
}

/** @param {string} input */
export function parseSemver(input) {
  const m = String(input || "").trim().match(SEMVER_RE);
  if (!m) return null;
  return {
    major: Number(m[1]),
    minor: Number(m[2]),
    patch: Number(m[3]),
    name: m[4] || "",
  };
}

/** @param {Semver} parsed */
export function formatTag(parsed) {
  const base = `v${parsed.major}.${parsed.minor}.${parsed.patch}`;
  return parsed.name ? `${base}-${parsed.name}` : base;
}

/** @param {string} name */
export function sanitizeName(name) {
  return String(name || "")
    .trim()
    .replace(/[^a-zA-Z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * @param {Semver} parsed
 * @param {"major" | "minor" | "patch"} increment
 */
export function bumpSemver(parsed, increment) {
  if (increment === "major") return { major: parsed.major + 1, minor: 0, patch: 0, name: "" };
  if (increment === "minor") return { major: parsed.major, minor: parsed.minor + 1, patch: 0, name: "" };
  return { major: parsed.major, minor: parsed.minor, patch: parsed.patch + 1, name: "" };
}

/** @param {string} markdown */
export function latestChangelogVersion(markdown) {
  /** @type {Semver[]} */
  const versions = [];
  for (const match of String(markdown || "").matchAll(/^## (\d+\.\d+\.\d+(?:-[a-zA-Z0-9-]+)?)\s*$/gm)) {
    const parsed = parseSemver(match[1]);
    if (parsed) versions.push(parsed);
  }
  return maxSemver(versions);
}

/** @param {Semver[]} versions */
export function maxSemver(versions) {
  const valid = (versions || []).filter(Boolean);
  if (!valid.length) return null;
  return [...valid].sort(
    (a, b) => b.major - a.major || b.minor - a.minor || b.patch - a.patch,
  )[0];
}

/**
 * Highest of git tag, package.json, and docs/changelog.md headings.
 *
 * @param {{ latestTag?: string, packageVersion?: string, changelogVersion?: Semver | null }} input
 */
export function resolveBaseVersion({ latestTag, packageVersion, changelogVersion }) {
  const fromTag = latestTag ? parseSemver(latestTag) : null;
  if (latestTag && !fromTag) throw new Error(`Invalid latest tag: ${latestTag}`);
  const fromPackage = parseSemver(packageVersion || "0.0.0");
  if (!fromPackage) throw new Error(`Invalid package.json version: ${packageVersion}`);
  const resolved = maxSemver([fromTag, fromPackage, changelogVersion || null]);
  if (!resolved) throw new Error("Could not resolve a base version");
  return resolved;
}

/**
 * @param {string} contents
 * @param {string} version  Semver without the v prefix
 */
export function bumpPackageJson(contents, version) {
  if (!/"version"\s*:\s*"[^"]*"/.test(contents)) {
    throw new Error("package.json has no version field");
  }
  return contents.replace(/("version"\s*:\s*")[^"]*(")/, `$1${version}$2`);
}

/**
 * Update root and workspace package versions in package-lock.json without
 * rewriting the whole file (avoids a noisy lockfile reformat).
 *
 * @param {string} contents
 * @param {string} version
 */
export function bumpLockfileVersions(contents, version) {
  const replacements = [
    [/^(\{\s*"name"\s*:\s*"locations"\s*,\s*"version"\s*:\s*")[^"]+/, `$1${version}`],
    [/(""\s*:\s*\{\s*"name"\s*:\s*"locations"\s*,\s*"version"\s*:\s*")[^"]+/, `$1${version}`],
    [/("apps\/api"\s*:\s*\{\s*"name"\s*:\s*"@locations\/api"\s*,\s*"version"\s*:\s*")[^"]+/, `$1${version}`],
    [/("apps\/web"\s*:\s*\{\s*"name"\s*:\s*"@locations\/web"\s*,\s*"version"\s*:\s*")[^"]+/, `$1${version}`],
    [/("packages\/db"\s*:\s*\{\s*"name"\s*:\s*"@locations\/db"\s*,\s*"version"\s*:\s*")[^"]+/, `$1${version}`],
  ];
  let out = contents;
  for (const [re, rep] of replacements) {
    const next = out.replace(re, rep);
    if (next === out) {
      throw new Error("Could not update a workspace version in package-lock.json");
    }
    out = next;
  }
  return out;
}

/** @param {string} text @param {number} [max] */
export function firstParagraph(text, max = 280) {
  const para = String(text || "")
    .trim()
    .split(/\n\s*\n/)[0]
    .replace(/\s+/g, " ")
    .trim();
  if (!para) return "";
  if (para.length <= max) return para;
  return `${para.slice(0, max - 3).replace(/\s+\S*$/, "")}...`;
}

/** @param {string[]} subjects */
export function changelogFromSubjects(subjects) {
  const lines = (subjects || [])
    .map((s) => String(s).trim())
    .filter(Boolean)
    .filter((s) => !/^merge\b/i.test(s))
    .slice(0, 30)
    .map((s) => `- ${s.replace(/^-+\s*/, "")}`);
  if (!lines.length) return "See git history for this release.";
  return lines.join("\n");
}

/**
 * Promote `## Unreleased` into `## X.Y.Z` and leave an empty Unreleased section.
 *
 * @param {string} markdown
 * @param {string} version  Without the v prefix
 * @param {string} fallbackBody
 */
export function promoteChangelog(markdown, version, fallbackBody) {
  const heading = `## ${version}`;
  const text = String(markdown || "").replace(/\r\n/g, "\n");
  const headingRe = new RegExp(`^${heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "m");
  if (headingRe.test(text)) {
    throw new Error(`${CHANGELOG_PATH} already has ${heading}`);
  }

  const unreleasedRe = /^## Unreleased[ \t]*\n/m;
  const match = text.match(unreleasedRe);
  const bodyFromFallback = String(fallbackBody || "").trim() || "See git history for this release.";

  if (!match || match.index === undefined) {
    const title = text.match(/^# [^\n]*\n?/);
    const insertAt = title ? title[0].length : 0;
    const before = text.slice(0, insertAt).replace(/\s*$/, "\n\n");
    const after = text.slice(insertAt).replace(/^\s*/, "");
    return `${before}## Unreleased\n\n${heading}\n\n${bodyFromFallback}\n\n${after}`.replace(/\n{3,}/g, "\n\n");
  }

  const afterHeading = text.slice(match.index + match[0].length);
  const nextIdx = afterHeading.search(/^## /m);
  const unreleasedBody = (nextIdx === -1 ? afterHeading : afterHeading.slice(0, nextIdx)).trim();
  const after = nextIdx === -1 ? "" : afterHeading.slice(nextIdx);
  const body = unreleasedBody || bodyFromFallback;
  const before = text.slice(0, match.index);
  return `${before}## Unreleased\n\n${heading}\n\n${body}\n\n${after}`.replace(/\n{3,}/g, "\n\n").replace(/\s*$/, "\n");
}

/**
 * Reset the Unreleased marketing entry and insert the new version after it.
 *
 * @param {string} source
 * @param {{ version: string, summary: string }} input
 */
export function updateMarketingChangelog(source, { version, summary }) {
  const marker = 'version: "Unreleased"';
  const markerIdx = source.indexOf(marker);
  if (markerIdx === -1) {
    throw new Error("Unreleased entry not found in marketing changelog.ts");
  }
  const objStart = source.lastIndexOf("{", markerIdx);
  let depth = 0;
  let objEnd = -1;
  for (let i = objStart; i < source.length; i++) {
    if (source[i] === "{") depth += 1;
    else if (source[i] === "}") {
      depth -= 1;
      if (depth === 0) {
        objEnd = i;
        break;
      }
    }
  }
  if (objEnd === -1) throw new Error("Could not parse Unreleased entry in marketing changelog.ts");

  let insertAt = objEnd + 1;
  if (source[insertAt] === ",") insertAt += 1;

  const unreleasedObj = `  {
    version: "Unreleased",
    summary: "Changes since the last tagged release.",
  }`;
  const releasedObj = `  {
    version: ${JSON.stringify(version)},
    summary: ${JSON.stringify(summary)},
  }`;
  return `${source.slice(0, objStart)}${unreleasedObj},\n${releasedObj},${source.slice(insertAt)}`;
}

/** @param {string} remoteUrl @param {string} tag */
export function githubReleaseUrl(remoteUrl, tag) {
  const m = String(remoteUrl || "").match(/github\.com[:/]([^/]+)\/([^/.]+?)(?:\.git)?$/i);
  if (!m) return "";
  return `https://github.com/${m[1]}/${m[2]}/releases/tag/${tag}`;
}

function git(args, opts = {}) {
  return execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    stdio: opts.capture ? ["ignore", "pipe", "pipe"] : "inherit",
  });
}

function gitOut(args) {
  return git(args, { capture: true }).trim();
}

function tryGitOut(args) {
  try {
    return gitOut(args);
  } catch {
    return "";
  }
}

function latestReleaseTag() {
  const local = tryGitOut(["tag", "--sort=-version:refname"])
    .split(/\r?\n/)
    .map((t) => t.trim())
    .filter((t) => TAG_RE.test(t));
  if (local[0]) return local[0];

  const remote = tryGitOut(["ls-remote", "--tags", "--refs", "origin"]);
  const remoteTags = remote
    .split(/\r?\n/)
    .map((line) => line.replace(/^.*refs\/tags\//, "").trim())
    .filter((t) => TAG_RE.test(t))
    .sort((a, b) => {
      const pa = parseSemver(a);
      const pb = parseSemver(b);
      if (!pa || !pb) return 0;
      return pb.major - pa.major || pb.minor - pa.minor || pb.patch - pa.patch;
    });
  return remoteTags[0] || "";
}

function commitSubjectsSince(tag) {
  const range = tag ? `${tag}..HEAD` : "HEAD";
  const out = tryGitOut(["log", range, "--pretty=format:%s"]);
  return out ? out.split(/\r?\n/) : [];
}

function readText(rel) {
  return readFileSync(join(root, rel), "utf8");
}

function writeText(rel, contents) {
  writeFileSync(join(root, rel), contents, "utf8");
}

function showCurrent(latestTag) {
  const currentCommit = gitOut(["rev-parse", "HEAD"]);
  if (!latestTag) {
    console.log("No releases found");
    return;
  }
  const tagCommit =
    tryGitOut(["rev-list", "-n", "1", latestTag]) ||
    tryGitOut(["ls-remote", "origin", `refs/tags/${latestTag}`]).split(/\s+/)[0] ||
    "";
  console.log(`Latest release tag: ${latestTag}`);
  if (tagCommit) console.log(`Tag points to commit: ${tagCommit}`);
  console.log(`Current commit: ${currentCommit}`);
  console.log(
    tagCommit && tagCommit === currentCommit
      ? "Status: Current commit is tagged"
      : "Status: Current commit is not tagged",
  );
}

function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    console.error("");
    console.error(usage());
    process.exit(1);
  }

  if (opts.help) {
    console.log(usage());
    return;
  }

  console.log("Syncing with remote tags...");
  try {
    git(["fetch", "--tags", "--force"], { capture: true });
  } catch {
    console.log("Could not fetch remote tags; using local tags.");
  }

  const latestTag = latestReleaseTag();
  const packageVersion = JSON.parse(readText("package.json")).version;
  const changelogVersion = existsSync(join(root, CHANGELOG_PATH))
    ? latestChangelogVersion(readText(CHANGELOG_PATH))
    : null;

  if (opts.showCurrent) {
    showCurrent(latestTag);
    return;
  }

  const newTag =
    opts.increment === "set"
      ? opts.setTag
      : formatTag({
          ...bumpSemver(resolveBaseVersion({ latestTag, packageVersion, changelogVersion }), opts.increment),
          name: sanitizeName(opts.name),
        });
  const versionNumber = newTag.slice(1);

  const existingLocal = tryGitOut(["tag", "-l", newTag]);
  const existingRemote = tryGitOut(["ls-remote", "origin", `refs/tags/${newTag}`]);
  if ((existingLocal || existingRemote) && !opts.force) {
    const message = `Tag ${newTag} already exists. Use --force to replace it.`;
    if (!opts.dryRun) throw new Error(message);
    console.log(message);
  }

  const dirty = tryGitOut(["status", "--porcelain", "--untracked-files=no"]);
  if (dirty && !opts.dryRun) {
    throw new Error("Working tree is not clean. Commit or stash changes first.");
  }

  const branch = tryGitOut(["branch", "--show-current"]);
  if (!branch && !opts.dryRun) {
    throw new Error("Detached HEAD. Check out a branch before releasing.");
  }

  const fallbackBody = changelogFromSubjects(commitSubjectsSince(latestTag));
  const files = [];

  console.log(
    latestTag
      ? `Current release tag: ${latestTag}`
      : "No existing tags. Using the highest of package.json and docs/changelog.md.",
  );
  console.log(`New tag: ${newTag}`);
  if (opts.dryRun) console.log("(dry run)");

  if (opts.dryRun) {
    console.log(`Would update version to ${versionNumber} in:`);
    for (const f of [...VERSION_PACKAGE_FILES, LOCKFILE_PATH]) console.log(`  ${f}`);
    if (!opts.skipChangelog) {
      console.log(`Would promote ${CHANGELOG_PATH} Unreleased -> ${versionNumber}`);
      console.log(`Would update ${MARKETING_CHANGELOG_PATH}`);
    }
    console.log(`Would commit, tag ${newTag}${opts.noPush ? ", and skip push" : `, and push ${branch || "HEAD"}`}`);
    return;
  }

  for (const rel of VERSION_PACKAGE_FILES) {
    writeText(rel, bumpPackageJson(readText(rel), versionNumber));
    files.push(rel);
  }
  if (existsSync(join(root, LOCKFILE_PATH))) {
    writeText(LOCKFILE_PATH, bumpLockfileVersions(readText(LOCKFILE_PATH), versionNumber));
    files.push(LOCKFILE_PATH);
  }
  console.log(`Updated package versions to ${versionNumber}`);

  if (!opts.skipChangelog) {
    if (!existsSync(join(root, CHANGELOG_PATH))) {
      writeText(
        CHANGELOG_PATH,
        `# Changelog\n\nAll notable changes to this project are documented in this file.\n\n## Unreleased\n`,
      );
    }
    const promoted = promoteChangelog(readText(CHANGELOG_PATH), versionNumber, fallbackBody);
    writeText(CHANGELOG_PATH, promoted);
    files.push(CHANGELOG_PATH);
    console.log(`Promoted ${CHANGELOG_PATH} Unreleased -> ${versionNumber}`);

    if (existsSync(join(root, MARKETING_CHANGELOG_PATH))) {
      const unreleasedMatch = promoted.match(/^## Unreleased\s*\n([\s\S]*?)(?=^## )/m);
      const versionHeading = versionNumber.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const releasedMatch = promoted.match(new RegExp(`^## ${versionHeading}\\s*\\n([\\s\\S]*?)(?=^## |\\s*$)`, "m"));
      const summary =
        firstParagraph(releasedMatch?.[1] || unreleasedMatch?.[1] || fallbackBody) ||
        `Release ${versionNumber}.`;
      writeText(
        MARKETING_CHANGELOG_PATH,
        updateMarketingChangelog(readText(MARKETING_CHANGELOG_PATH), {
          version: versionNumber,
          summary,
        }),
      );
      files.push(MARKETING_CHANGELOG_PATH);
      console.log(`Updated ${MARKETING_CHANGELOG_PATH}`);
    }
  }

  git(["add", "--", ...files]);
  if (tryGitOut(["status", "--porcelain"])) {
    git(["commit", "-m", `Release ${newTag}`]);
    console.log(`Committed version and changelog for ${newTag}`);
  } else {
    console.log("No version or changelog changes to commit");
  }

  if (existingLocal) git(["tag", "-d", newTag], { capture: true });
  if (existingRemote && opts.force) {
    try {
      git(["push", "origin", `:refs/tags/${newTag}`], { capture: true });
    } catch {
      console.log(`Could not delete remote tag ${newTag} (continuing)`);
    }
  }
  git(["tag", newTag]);
  console.log(`Created tag ${newTag}`);

  if (opts.noPush) {
    console.log("Skipping push (--no-push)");
    return;
  }

  console.log(`Pushing ${branch} and ${newTag}...`);
  git(["push", "origin", "HEAD"]);
  git(["push", "origin", newTag]);

  const remote = tryGitOut(["remote", "get-url", "origin"]);
  const url = githubReleaseUrl(remote, newTag);
  console.log(`Release ${newTag} created and pushed.`);
  if (url) console.log(`Tag URL: ${url}`);
  console.log("Next: review docs/changelog.md, then promote production with npm run deploy:prod when staging looks right.");
}

const invokedAsScript = /release\.mjs$/i.test(process.argv[1] ?? "");
if (invokedAsScript) {
  try {
    main();
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }
}
