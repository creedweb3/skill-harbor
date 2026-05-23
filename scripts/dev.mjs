/**
 * Stable local dev: API reload via watchfiles (not uvicorn --reload) + auto-restart UI if it dies.
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { freePortsAndWait } from "./free-ports.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const children = new Set();
let shuttingDown = false;

function prefix(name, chunk) {
  const text = String(chunk);
  for (const line of text.split(/\r?\n/)) {
    if (line.length) process.stdout.write(`[${name}] ${line}\n`);
  }
}

function spawnNamed(name, shellCommand, cwd, { restart = false } = {}) {
  const child = spawn(shellCommand, {
    cwd,
    shell: true,
    env: { ...process.env, FORCE_COLOR: "1" },
    windowsHide: true,
  });
  children.add(child);

  child.stdout?.on("data", (d) => prefix(name, d));
  child.stderr?.on("data", (d) => prefix(name, d));

  child.on("exit", (code, signal) => {
    children.delete(child);
    if (shuttingDown || signal === "SIGINT" || signal === "SIGTERM") return;
    if (!restart) {
      console.error(`\n[dev] ${name} exited (${code ?? signal}). Stopping.`);
      shutdown(code ?? 1);
      return;
    }
    console.warn(`\n[dev] ${name} exited (${code ?? signal}). Restarting in 2s…`);
    setTimeout(async () => {
      if (name === "ui") await freePortsAndWait([5173], 600);
      spawnNamed(name, shellCommand, cwd, { restart });
    }, 2000);
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
  setTimeout(() => process.exit(code), 300);
}

console.log("[dev] Skill Harbor — freeing ports 5173 & 8765…");
await freePortsAndWait([5173, 8765]);

console.log("[dev] Starting API (watchfiles → uvicorn on :8765, reloads on .py changes)…");
spawnNamed(
  "api",
  `python "${path.join(root, "scripts", "dev-api.py")}"`,
  path.join(root, "backend")
);

console.log("[dev] Starting UI (Vite on :5173)…");
spawnNamed("ui", "npm run dev", path.join(root, "frontend"), { restart: true });

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
