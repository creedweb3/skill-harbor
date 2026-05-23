/**
 * Free dev ports before starting (Windows-friendly).
 * Stale uvicorn/vite listeners after a bad reload cause ERR_CONNECTION_REFUSED.
 */
import { execSync } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

/** @param {number} port */
export function freePort(port) {
  if (process.platform === "win32") {
    const pids = new Set();
    try {
      const output = execSync(`netstat -ano -p tcp | findstr :${port}`, {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      });
      for (const line of output.split(/\r?\n/)) {
        if (!line.includes("LISTENING")) continue;
        const parts = line.trim().split(/\s+/);
        const pid = parts[parts.length - 1];
        if (pid && /^\d+$/.test(pid) && pid !== "0") pids.add(pid);
      }
    } catch {
      return;
    }
    for (const pid of pids) {
      try {
        execSync(`taskkill /PID ${pid} /F /T`, { stdio: "ignore" });
        console.log(`[dev] freed port ${port} (pid ${pid})`);
      } catch {
        /* already exited */
      }
    }
    return;
  }

  try {
    execSync(`lsof -ti tcp:${port} | xargs -r kill -9`, { stdio: "ignore", shell: true });
  } catch {
    /* nothing listening */
  }
}

/** @param {number[]} ports */
export function freePorts(ports) {
  for (const port of ports) freePort(port);
}

/** @param {number[]} ports */
export async function freePortsAndWait(ports, ms = 1200) {
  freePorts(ports);
  await sleep(ms);
  freePorts(ports);
}

if (process.argv[1]?.endsWith("free-ports.mjs")) {
  await freePortsAndWait([5173, 8765]);
}
