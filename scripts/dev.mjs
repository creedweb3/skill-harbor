/**
 * Skill Harbor local dev: API (watchfiles → uvicorn) + Vite UI.
 * Always force-stops any prior dev instances before starting.
 */
import { spawn } from "node:child_process";
import http from "node:http";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import {
  apiScript,
  DEV_PORTS,
  frontendDir,
  pythonCmd,
  root,
  viteArgs,
  viteBin,
} from "./dev-constants.mjs";
import { forceStopDev, freePorts, portInUse } from "./free-ports.mjs";

const children = new Set();
let shuttingDown = false;
/** @type {import("node:child_process").ChildProcess | null} */
let uiChild = null;

function prefix(name, chunk) {
  const text = String(chunk);
  for (const line of text.split(/\r?\n/)) {
    if (line.length) process.stdout.write(`[${name}] ${line}\n`);
  }
}

/** @param {number} port @param {number} ms */
async function waitForHttp(port, ms = 12000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    const up = await new Promise((resolve) => {
      const req = http.get(`http://127.0.0.1:${port}/`, (res) => {
        res.resume();
        resolve(true);
      });
      req.on("error", () => resolve(false));
      req.setTimeout(600, () => {
        req.destroy();
        resolve(false);
      });
    });
    if (up) return true;
    await sleep(200);
  }
  return false;
}

/**
 * @param {string} name
 * @param {string} command
 * @param {string[]} args
 * @param {string} cwd
 * @param {{ stdio?: "pipe" | "inherit" }} [opts]
 */
function spawnNamed(name, command, args, cwd, opts = {}) {
  const stdio = opts.stdio ?? "pipe";
  const child = spawn(command, args, {
    cwd,
    shell: false,
    stdio,
    env: { ...process.env, FORCE_COLOR: "1" },
    windowsHide: stdio === "pipe",
  });
  children.add(child);

  if (stdio === "pipe") {
    child.stdout?.on("data", (d) => prefix(name, d));
    child.stderr?.on("data", (d) => prefix(name, d));
  }

  child.on("exit", (code, signal) => {
    children.delete(child);
    if (child === uiChild) uiChild = null;
    if (shuttingDown || signal === "SIGINT" || signal === "SIGTERM") return;

    if (name === "ui") {
      (async () => {
        if (await waitForHttp(DEV_PORTS.ui, 500)) {
          console.warn(
            `[dev] Vite wrapper exited (${code ?? signal}) but :${DEV_PORTS.ui} still responds — leaving it running.`
          );
          return;
        }
        console.error(
          `\n[dev] Vite stopped (${code ?? signal}). API still on :${DEV_PORTS.api} — run npm run dev to restart UI.`
        );
      })();
      return;
    }

    console.error(`\n[dev] ${name} exited (${code ?? signal}). Stopping.`);
    shutdown(code ?? 1);
  });

  return child;
}

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    try {
      child.kill("SIGTERM");
    } catch {
      /* ignore */
    }
  }
  freePorts([DEV_PORTS.ui, DEV_PORTS.api]);
  setTimeout(() => process.exit(code), 300);
}

/** @param {number} maxAttempts */
async function startVite(maxAttempts = 3) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (portInUse(DEV_PORTS.ui)) {
      console.warn(
        `[dev] :${DEV_PORTS.ui} busy (attempt ${attempt}/${maxAttempts}) — freeing…`
      );
      await forceStopDev({ ports: [DEV_PORTS.ui], quiet: true });
    }

    console.log(`[dev] Starting UI (Vite on :${DEV_PORTS.ui})…`);
    uiChild = spawnNamed("ui", process.execPath, [viteBin, ...viteArgs], frontendDir, {
      stdio: "inherit",
    });

    if (await waitForHttp(DEV_PORTS.ui, 15000)) {
      console.log(`[dev] UI ready → http://127.0.0.1:${DEV_PORTS.ui}/`);
      return true;
    }

    try {
      uiChild.kill("SIGTERM");
    } catch {
      /* ignore */
    }
    uiChild = null;
    await forceStopDev({ ports: [DEV_PORTS.ui], quiet: true });

    if (attempt < maxAttempts) {
      console.warn(`[dev] Vite not ready — retry ${attempt + 1}/${maxAttempts}…`);
      await sleep(800);
    }
  }

  console.error(`[dev] Could not start Vite on :${DEV_PORTS.ui}. Run npm run stop, then npm run dev.`);
  return false;
}

await forceStopDev();

console.log(`[dev] Starting API (watchfiles → uvicorn on :${DEV_PORTS.api})…`);
spawnNamed("api", pythonCmd, [apiScript], path.join(root, "backend"));

await sleep(600);

await startVite(3);

console.log(
  `[dev] Skill Harbor running\n` +
    `      UI:  http://127.0.0.1:${DEV_PORTS.ui}/\n` +
    `      API: http://127.0.0.1:${DEV_PORTS.api}/api/health`
);

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
