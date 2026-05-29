import type { LogKind } from "../hooks/useStudio";

export type ActivityStatus = "running" | "ok" | "err";

export type ConsoleLine = {
  id: string;
  ts: number;
  message: string;
  kind: LogKind;
};

export type UserActivity = {
  id: string;
  ts: number;
  finishedAt?: number;
  action: string;
  summary: string;
  status: ActivityStatus;
  logs: ConsoleLine[];
  read: boolean;
  archived: boolean;
};

export function isActiveInbox(activity: UserActivity): boolean {
  return !activity.archived;
}

export function isUnreadActivity(activity: UserActivity): boolean {
  return !activity.read && !activity.archived;
}

export function canArchiveActivity(activity: UserActivity): boolean {
  return !activity.archived && activity.read && activity.status !== "running";
}

let lineSeq = 0;
let activitySeq = 0;

export function createConsoleLine(message: string, kind: LogKind = "info"): ConsoleLine {
  lineSeq += 1;
  return {
    id: `${Date.now()}-L${lineSeq}`,
    ts: Date.now(),
    message,
    kind,
  };
}

export function createUserActivity(action: string): UserActivity {
  activitySeq += 1;
  return {
    id: `${Date.now()}-A${activitySeq}`,
    ts: Date.now(),
    action,
    summary: "In progress…",
    status: "running",
    logs: [],
    read: false,
    archived: false,
  };
}

export function formatActivityTime(ts: number): string {
  return new Date(ts).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function formatActivityTimeShort(ts: number): string {
  return new Date(ts).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function consoleLinesToText(lines: ConsoleLine[]): string {
  return lines
    .map((line) => `[${formatActivityTime(line.ts)}] ${kindPrefix(line.kind)}${line.message}`)
    .join("\n");
}

export function latestLogLine(activity: UserActivity): string | null {
  const last = activity.logs[activity.logs.length - 1];
  return last?.message ?? null;
}

function kindPrefix(kind: LogKind): string {
  if (kind === "ok") return "✓ ";
  if (kind === "err") return "✗ ";
  return "";
}
