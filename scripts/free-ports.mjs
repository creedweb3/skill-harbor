/**
 * Force-stop Skill Harbor dev processes and free ports (Windows + Unix).
 */
import { execSync } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { ALL_DEV_PORTS } from "./dev-constants.mjs";

/** @param {string} line @param {number} port */
function lineListensOnPort(line, port) {
  if (!line.includes("LISTENING")) return false;
  const m = line.match(/:(\d+)\s/);
  return m !== null && Number(m[1]) === port;
}

/** @param {number} port */
export function portInUse(port) {
  if (process.platform === "win32") {
    try {
      const output = execSync("netstat -ano -p tcp", {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      });
      return output.split(/\r?\n/).some((line) => lineListensOnPort(line, port));
    } catch {
      return false;
    }
  }
  try {
    execSync(`lsof -iTCP:${port} -sTCP:LISTEN`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/** @param {number} port @param {boolean} [quiet] */
export function freePort(port, quiet = false) {
  if (process.platform === "win32") {
    const pids = new Set();
    try {
      const output = execSync("netstat -ano -p tcp", {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      });
      for (const line of output.split(/\r?\n/)) {
        if (!lineListensOnPort(line, port)) continue;
        const parts = line.trim().split(/\s+/);
        const pid = parts[parts.length - 1];
        if (pid && /^\d+$/.test(pid) && pid !== "0") pids.add(pid);
      }
    } catch {
      return;
    }
    const self = String(process.pid);
    for (const pid of pids) {
      if (pid === self) continue;
      try {
        execSync(`taskkill /PID ${pid} /F /T`, { stdio: "ignore" });
        if (!quiet) console.log(`[dev] freed port ${port} (pid ${pid})`);
      } catch {
        /* already exited */
      }
    }
    return;
  }

  try {
    execSync(`lsof -ti tcp:${port} | xargs -r kill -9`, { stdio: "ignore", shell: true });
    if (!quiet) console.log(`[dev] freed port ${port}`);
  } catch {
    /* nothing listening */
  }
}

/**
 * Kill prior Skill Harbor dev processes by command line (before port sweep).
 * @param {boolean} [quiet]
 */
export function killDevProcesses(quiet = false) {
  const self = process.pid;
  const markers = [
    "vite.js",
    "uvicorn main:app",
    "watchfiles",
    "dev-api.py",
    "scripts/dev.mjs",
    "scripts/run-api.mjs",
    "scripts/run-ui.mjs",
    "skill-harbor-ui",
  ];

  if (process.platform === "win32") {
    const markerList = markers.map((m) => `'${m.replace(/'/g, "''")}'`).join(", ");
    const ps = `
      $self = ${self}
      $markers = @(${markerList})
      Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
        Where-Object {
          $_.ProcessId -ne $self -and $_.CommandLine -and (
            $cmd = $_.CommandLine
            ($markers | Where-Object { $cmd -like "*$_*" }).Count -gt 0
          )
        } |
        ForEach-Object {
          if (-not $quiet) { Write-Host "[dev] stopping pid $($_.ProcessId)" }
          Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
        }
    `.replace(/\$quiet/g, quiet ? "$true" : "$false");
    try {
      execSync(`powershell -NoProfile -ExecutionPolicy Bypass -Command ${JSON.stringify(ps)}`, {
        stdio: quiet ? "ignore" : ["ignore", "pipe", "ignore"],
      });
    } catch {
      /* ignore */
    }
    return;
  }

  const rootHint = "cursor-skills-studio";
  for (const marker of markers) {
    try {
      execSync(`pkill -f "${rootHint}.*${marker}" 2>/dev/null || true`, {
        stdio: "ignore",
        shell: true,
      });
    } catch {
      /* ignore */
    }
  }
}

/** @param {number[]} ports @param {boolean} [quiet] */
export function freePorts(ports, quiet = false) {
  for (const port of ports) freePort(port, quiet);
}

/**
 * Force-stop all known dev processes and wait until ports are free.
 * @param {{ ports?: number[], waitMs?: number, quiet?: boolean }} [opts]
 */
export async function forceStopDev(opts = {}) {
  const ports = opts.ports ?? ALL_DEV_PORTS;
  const quiet = opts.quiet ?? false;
  const waitMs = opts.waitMs ?? 1500;

  if (!quiet) {
    console.log(`[dev] Force-stopping prior dev processes (ports ${ports.join(", ")})…`);
  }

  killDevProcesses(quiet);
  await sleep(400);
  freePorts(ports, quiet);
  await sleep(waitMs);
  freePorts(ports, quiet);

  const deadline = Date.now() + 6000;
  while (Date.now() < deadline) {
    const busy = ports.filter((p) => portInUse(p));
    if (busy.length === 0) {
      if (!quiet) console.log("[dev] Ports clear.");
      return true;
    }
    if (!quiet) console.warn(`[dev] Still busy: ${busy.join(", ")} — retrying…`);
    killDevProcesses(true);
    freePorts(busy, quiet);
    await sleep(500);
  }

  const stillBusy = ports.filter((p) => portInUse(p));
  if (stillBusy.length) {
    console.warn(`[dev] Could not free port(s): ${stillBusy.join(", ")}`);
    return false;
  }
  return true;
}

/** @param {string[]} argv */
function portsFromArgs(argv) {
  if (argv.includes("--api")) return [ALL_DEV_PORTS[1]];
  if (argv.includes("--ui")) return [ALL_DEV_PORTS[0]];
  return ALL_DEV_PORTS;
}

if (process.argv[1]?.endsWith("free-ports.mjs")) {
  await forceStopDev({ ports: portsFromArgs(process.argv.slice(2)) });
}
