/** Shared dev server ports and paths for Skill Harbor scripts. */
import path from "node:path";
import { fileURLToPath } from "node:url";

export const DEV_PORTS = {
  ui: 5173,
  api: 8765,
};

export const ALL_DEV_PORTS = [DEV_PORTS.ui, DEV_PORTS.api];

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const frontendDir = path.join(root, "frontend");

export const viteBin = path.join(frontendDir, "node_modules", "vite", "bin", "vite.js");

export const viteArgs = ["--host", "127.0.0.1", "--port", String(DEV_PORTS.ui), "--strictPort"];

export const apiScript = path.join(root, "scripts", "dev-api.py");

export const pythonCmd = process.env.PYTHON || "python";
