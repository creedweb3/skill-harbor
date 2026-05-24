#!/usr/bin/env node
/** Run Vite UI only on :5173. */
import { spawn } from "node:child_process";
import { frontendDir, viteArgs, viteBin } from "./dev-constants.mjs";
import { forceStopDev } from "./free-ports.mjs";
import { DEV_PORTS } from "./dev-constants.mjs";

const skipStop = process.argv.includes("--skip-stop");

if (!skipStop) {
  await forceStopDev({ ports: [DEV_PORTS.ui] });
}

console.log(`[dev] UI → http://127.0.0.1:${DEV_PORTS.ui}/`);

const child = spawn(process.execPath, [viteBin, ...viteArgs], {
  cwd: frontendDir,
  shell: false,
  stdio: "inherit",
  env: { ...process.env, FORCE_COLOR: "1" },
});

child.on("exit", (code) => process.exit(code ?? 0));

process.on("SIGINT", () => {
  try {
    child.kill("SIGTERM");
  } catch {
    /* ignore */
  }
});
