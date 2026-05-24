#!/usr/bin/env node
/** Run API only (watchfiles → uvicorn on :8765). */
import { spawn } from "node:child_process";
import path from "node:path";
import { apiScript, DEV_PORTS, pythonCmd, root } from "./dev-constants.mjs";
import { forceStopDev } from "./free-ports.mjs";

const skipStop = process.argv.includes("--skip-stop");

if (!skipStop) {
  await forceStopDev({ ports: [DEV_PORTS.api] });
}

console.log(`[dev] API → http://127.0.0.1:${DEV_PORTS.api}`);

const child = spawn(pythonCmd, [apiScript], {
  cwd: path.join(root, "backend"),
  shell: false,
  stdio: "inherit",
  env: process.env,
});

child.on("exit", (code) => process.exit(code ?? 0));

process.on("SIGINT", () => {
  try {
    child.kill("SIGTERM");
  } catch {
    /* ignore */
  }
});
