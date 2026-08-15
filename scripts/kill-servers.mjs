#!/usr/bin/env node
/**
 * Free local Vite (5173) and Wrangler (8787) ports.
 *
 *   npm run kill:servers
 */
import { execFileSync } from "node:child_process";

const PORTS = [5173, 8787];

/** @param {number} port */
function pidsOnWindows(port) {
  /** @type {Set<number>} */
  const pids = new Set();
  let out = "";
  try {
    out = execFileSync("netstat", ["-ano", "-p", "tcp"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return pids;
  }
  const re = new RegExp(`[:\\[]${port}\\]?\\s+\\S+\\s+LISTENING\\s+(\\d+)`, "i");
  for (const line of out.split(/\r?\n/)) {
    const m = line.match(re);
    if (!m) continue;
    const pid = Number(m[1]);
    if (pid > 4) pids.add(pid);
  }
  return pids;
}

/** @param {number} port */
function pidsOnUnix(port) {
  /** @type {Set<number>} */
  const pids = new Set();
  try {
    const out = execFileSync("lsof", ["-tiTCP:" + String(port), "-sTCP:LISTEN"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    for (const line of out.split(/\s+/)) {
      const pid = Number(line.trim());
      if (pid > 1) pids.add(pid);
    }
  } catch {
    // lsof exits 1 when nothing is listening
  }
  return pids;
}

/** @param {number} pid */
function killPid(pid) {
  if (process.platform === "win32") {
    execFileSync("taskkill", ["/PID", String(pid), "/F"], {
      stdio: ["ignore", "ignore", "ignore"],
    });
    return;
  }
  execFileSync("kill", ["-TERM", String(pid)], {
    stdio: ["ignore", "ignore", "ignore"],
  });
}

function main() {
  const find = process.platform === "win32" ? pidsOnWindows : pidsOnUnix;
  let killed = 0;
  for (const port of PORTS) {
    const pids = find(port);
    if (pids.size === 0) {
      console.log(`  :${port} is free`);
      continue;
    }
    for (const pid of pids) {
      try {
        killPid(pid);
        console.log(`  killed pid ${pid} on :${port}`);
        killed += 1;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`  could not kill pid ${pid} on :${port}: ${message}`);
      }
    }
  }
  if (killed === 0) console.log("  No matching servers were running.");
}

main();
