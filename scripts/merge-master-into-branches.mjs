#!/usr/bin/env node
/**
 * Merge master into every other local branch so they include latest master.
 *
 * Usage:
 *   npm run git:merge-master
 *   npm run git:merge-master:preview
 *   npm run git:merge-master:fetch
 *   node scripts/merge-master-into-branches.mjs --base master --fetch --push
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function git(args, opts = {}) {
  return execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    stdio: opts.capture ? ["ignore", "pipe", "pipe"] : "inherit",
    ...opts,
  });
}

function gitOut(args) {
  return git(args, { capture: true }).trim();
}

function parseArgs(argv) {
  const opts = { base: "master", dryRun: false, fetch: false, push: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run" || a === "--preview" || a === "-n") opts.dryRun = true;
    else if (a === "--fetch" || a === "-f") opts.fetch = true;
    else if (a === "--push" || a === "-p") opts.push = true;
    else if (a === "--base" || a === "-b") {
      opts.base = argv[++i];
      if (!opts.base) {
        console.error("Missing value for --base");
        process.exit(1);
      }
    } else if (a === "--help" || a === "-h") {
      console.log(`Merge <base> into all other local branches via git merge.

Options:
  --base, -b <name>  Base branch to merge from (default: master)
  --fetch, -f        git fetch origin before merging
  --push, -p         push each successfully updated branch
  --preview, -n      print actions only

Examples:
  npm run git:merge-master
  npm run git:merge-master:preview
  node scripts/merge-master-into-branches.mjs --fetch --push
`);
      process.exit(0);
    } else {
      console.error(`Unknown option: ${a}`);
      process.exit(1);
    }
  }
  return opts;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const base = opts.base;

  const status = gitOut(["status", "--porcelain"]);
  if (status && !opts.dryRun) {
    console.error("Working tree is not clean. Commit or stash changes first.");
    process.exit(1);
  }
  if (status && opts.dryRun) {
    console.warn("Note: working tree is dirty (ignored for dry-run).");
  }

  const startBranch = gitOut(["branch", "--show-current"]);
  const localBranches = gitOut(["branch", "--format=%(refname:short)"])
    .split("\n")
    .map((b) => b.trim())
    .filter(Boolean);

  if (!localBranches.includes(base)) {
    console.error(`Base branch "${base}" not found locally.`);
    process.exit(1);
  }

  const targets = localBranches.filter((b) => b !== base);
  if (targets.length === 0) {
    console.log(`No other local branches to update from ${base}.`);
    return;
  }

  console.log(`Base: ${base}`);
  console.log(`Targets: ${targets.join(", ")}`);
  if (opts.dryRun) console.log("(dry run)");

  if (opts.fetch) {
    console.log("\nFetching origin...");
    if (!opts.dryRun) git(["fetch", "origin"]);
  }

  if (!opts.dryRun) {
    console.log(`\nUpdating ${base}...`);
    git(["checkout", base]);
    // Fast-forward local base if it tracks a remote
    try {
      const upstream = gitOut(["rev-parse", "--abbrev-ref", `${base}@{upstream}`]);
      if (upstream) {
        git(["merge", "--ff-only", upstream]);
      }
    } catch {
      // No upstream configured; continue with local base tip
    }
  }

  const results = [];

  for (const branch of targets) {
    console.log(`\n=== ${branch} ===`);
    if (opts.dryRun) {
      console.log(`Would: checkout ${branch} && merge ${base}`);
      results.push({ branch, ok: true, dryRun: true });
      continue;
    }

    try {
      git(["checkout", branch]);
      git(["merge", base, "-m", `Merge branch '${base}' into ${branch}`]);
      if (opts.push) {
        git(["push", "origin", branch]);
      }
      results.push({ branch, ok: true });
      console.log(`Merged ${base} into ${branch}`);
    } catch (err) {
      console.error(`Failed to merge ${base} into ${branch}`);
      try {
        git(["merge", "--abort"], { stdio: "ignore" });
      } catch {
        // no merge in progress
      }
      results.push({ branch, ok: false, error: String(err?.message || err) });
    }
  }

  if (!opts.dryRun && startBranch) {
    console.log(`\nRestoring branch ${startBranch}...`);
    try {
      git(["checkout", startBranch]);
    } catch {
      console.error(`Could not checkout ${startBranch}; left on current branch.`);
    }
  }

  const failed = results.filter((r) => !r.ok);
  console.log("\nSummary:");
  for (const r of results) {
    console.log(`  ${r.ok ? "ok" : "FAIL"}  ${r.branch}`);
  }

  if (failed.length) {
    console.error(
      `\n${failed.length} branch(es) need manual conflict resolution.`,
    );
    process.exit(1);
  }

  console.log("\nAll branches updated.");
}

main();
