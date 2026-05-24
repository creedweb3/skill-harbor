#!/usr/bin/env node
/** Stop Skill Harbor dev servers (API :8765, UI :5173). */
import { forceStopDev } from "./free-ports.mjs";
import { ALL_DEV_PORTS } from "./dev-constants.mjs";

const argv = process.argv.slice(2);

function portsFromArgs() {
  if (argv.includes("--api")) return [ALL_DEV_PORTS[1]];
  if (argv.includes("--ui")) return [ALL_DEV_PORTS[0]];
  return ALL_DEV_PORTS;
}

await forceStopDev({ ports: portsFromArgs() });
