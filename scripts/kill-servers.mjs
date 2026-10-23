/**
 * Free local Vite, Wrangler, and inspector ports (including leftover Vite
 * hops on 5174+ from before strictPort).
 *
 *   npm run dev:kill
 */
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

/** Vite :5173 plus a few hops, Wrangler :8787, Chrome DevTools inspector. */
export const PORTS = [5173, 5174, 5175, 5176, 5177, 5178, 5179, 8787, 9229];

/**
 * @param {string} out
 * @param {number} port
 * @returns {Set<number>}
 */
export function pidsFromNetstat(out, port) {
  /** @type {Set<number>} */
  const pids = new Set();
  const re = new RegExp(`[:\\[]${port}\\]?\\s+\\S+\\s+LISTENING\\s+(\\d+)`, "i");
  for (const line of out.split(/\r?\n/)) {
    const m = line.match(re);
    if (!m) continue;
    const pid = Number(m[1]);
    if (pid > 4) pids.add(pid);
  }
  return pids;
}

/** @returns {Map<number, Set<number>>} */
function snapshotWindows() {
  /** @type {Map<number, Set<number>>} */
  const map = new Map();
  for (const port of PORTS) map.set(port, new Set());
  try {
    const out = execFileSync("netstat", ["-ano", "-p", "tcp"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    for (const port of PORTS) map.set(port, pidsFromNetstat(out, port));
  } catch {
    // netstat unavailable
  }
  return map;
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
    execFileSync("taskkill", ["/PID", String(pid), "/T", "/F"], {
      stdio: ["ignore", "ignore", "ignore"],
    });
    return;
  }
  execFileSync("kill", ["-KILL", String(pid)], {
    stdio: ["ignore", "ignore", "ignore"],
  });
}

/** @returns {Map<number, Set<number>>} */
function snapshot() {
  if (process.platform === "win32") return snapshotWindows();
  /** @type {Map<number, Set<number>>} */
  const map = new Map();
  for (const port of PORTS) map.set(port, pidsOnUnix(port));
  return map;
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * @returns {number} processes killed
 */
export function killServers() {
  let killed = 0;
  /** @type {Set<number>} */
  const seen = new Set();
  for (let pass = 0; pass < 2; pass++) {
    if (pass === 1) sleep(200);
    /** @type {Map<number, number[]>} */
    const portsByPid = new Map();
    const listeners = snapshot();
    for (const port of PORTS) {
      for (const pid of listeners.get(port) ?? []) {
        if (seen.has(pid)) continue;
        const ports = portsByPid.get(pid) ?? [];
        ports.push(port);
        portsByPid.set(pid, ports);
      }
    }
    for (const [pid, ports] of portsByPid) {
      try {
        killPid(pid);
        seen.add(pid);
        console.log(`  killed pid ${pid} on :${ports.join(", :")}`);
        killed += 1;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (/not found|no running instance|ESRCH/i.test(message)) {
          seen.add(pid);
          continue;
        }
        console.error(`  could not kill pid ${pid} on :${ports.join(", :")}: ${message}`);
      }
    }
  }
  if (killed === 0) console.log("  No matching servers were running.");
  return killed;
}

function isCli() {
  const invoked = process.argv[1];
  if (!invoked) return false;
  return resolve(invoked) === resolve(fileURLToPath(import.meta.url));
}

if (isCli()) killServers();
