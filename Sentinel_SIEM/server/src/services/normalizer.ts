import type { NormalizedEventInput } from "../types.js";

type RawEvent = Record<string, unknown>;
type Mapping = Record<string, string>;

// The normalized event shape intentionally mirrors common SIEM field families without binding to a vendor schema.
const severityMap: Record<string, string> = {
  "0": "low",
  "1": "low",
  "2": "low",
  "3": "medium",
  "4": "medium",
  "5": "high",
  "6": "critical",
  "7": "critical",
  info: "low",
  informational: "low",
  notice: "low",
  warning: "medium",
  warn: "medium",
  error: "high",
  err: "high",
  critical: "critical",
  crit: "critical",
  alert: "critical",
  emergency: "critical"
};

function getPath(source: RawEvent, path?: string) {
  if (!path) {
    return undefined;
  }

  return path.split(".").reduce<unknown>((value, key) => {
    if (value && typeof value === "object" && key in value) {
      return (value as RawEvent)[key];
    }

    return undefined;
  }, source);
}

function firstString(source: RawEvent, mapping: Mapping, field: string, candidates: string[]) {
  const mapped = getPath(source, mapping[field]);
  const value = mapped ?? candidates.map((candidate) => getPath(source, candidate)).find((candidate) => candidate !== undefined);
  if (value === undefined || value === null) {
    return null;
  }

  return String(value);
}

function normalizeSeverity(value?: string | null) {
  if (!value) {
    return "low";
  }

  return severityMap[value.toLowerCase()] ?? value.toLowerCase();
}

function normalizeTimestamp(value?: string | null) {
  if (!value) {
    return new Date();
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function toJsonObject(source: RawEvent) {
  return JSON.parse(JSON.stringify(source)) as RawEvent;
}

export function normalizeEvent(raw: RawEvent, mapping: Mapping = {}): NormalizedEventInput {
  const timestamp = normalizeTimestamp(
    firstString(raw, mapping, "timestamp", ["@timestamp", "timestamp", "time", "event_time", "date"])
  );
  const host = firstString(raw, mapping, "host", ["host", "hostname", "host.name", "asset.hostname", "device"]);
  const userName = firstString(raw, mapping, "userName", ["user", "username", "user.name", "principal.user", "actor.name"]);
  const sourceIp = firstString(raw, mapping, "sourceIp", ["sourceIp", "src_ip", "source.ip", "network.src_ip", "client.ip"]);
  const destinationIp = firstString(raw, mapping, "destinationIp", [
    "destinationIp",
    "dst_ip",
    "destination.ip",
    "network.dst_ip",
    "server.ip"
  ]);
  const eventType =
    firstString(raw, mapping, "eventType", ["eventType", "event.type", "event.action", "action", "type"]) ?? "unknown";
  const category = firstString(raw, mapping, "category", ["category", "event.category", "event.module"]);
  const severity = normalizeSeverity(firstString(raw, mapping, "severity", ["severity", "event.severity", "level", "priority"]));
  const message =
    firstString(raw, mapping, "message", ["message", "msg", "summary", "event.original"]) ??
    `${eventType} event observed`;

  const normalized: Record<string, unknown> = {
    "@timestamp": timestamp.toISOString(),
    event: { action: eventType, category, severity },
    message
  };
  if (host) normalized.host = { name: host };
  if (userName) normalized.user = { name: userName };
  if (sourceIp) normalized.source = { ip: sourceIp };
  if (destinationIp) normalized.destination = { ip: destinationIp };

  const searchText = [host, userName, sourceIp, destinationIp, eventType, category, severity, message, JSON.stringify(raw)]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return {
    timestamp,
    host,
    userName,
    sourceIp,
    destinationIp,
    eventType,
    category,
    severity,
    message,
    raw: toJsonObject(raw),
    normalized,
    searchText
  };
}

export function parseSyslogLine(line: string): RawEvent {
  const match = line.match(/^(?:<(?<priority>\d+)>)?(?<timestamp>\w{3}\s+\d{1,2}\s[\d:]+)?\s*(?<host>[\w.-]+)?\s*(?<process>[\w.-]+)?(?:\[\d+\])?:?\s*(?<message>.*)$/);
  const groups = match?.groups ?? {};
  const priority = groups.priority ? Number(groups.priority) : undefined;
  const severityCode = priority === undefined ? undefined : priority % 8;
  const timestamp = groups.timestamp ? `${new Date().getFullYear()} ${groups.timestamp}` : new Date().toISOString();

  return {
    timestamp,
    host: groups.host,
    process: groups.process,
    message: groups.message || line,
    severity: severityCode === undefined ? "low" : String(severityCode),
    eventType: "syslog",
    category: "system",
    original: line
  };
}
