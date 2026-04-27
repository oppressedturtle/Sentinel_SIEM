import type { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import { normalizeEvent } from "./normalizer.js";

export type AgentEventInput = Record<string, unknown>;

function asString(value: unknown) {
  return value === undefined || value === null ? undefined : String(value);
}

function agentEventType(raw: AgentEventInput) {
  const explicit = asString(raw.eventType ?? raw.event_type);
  if (explicit) return explicit;

  const type = asString(raw.type) ?? "agent_event";
  const channel = asString(raw.channel)?.toLowerCase();
  const eventId = asString(raw.event_id ?? raw.eventId);

  if (type === "windows_event" && channel && eventId) return `windows_${channel}_${eventId}`;
  if (type === "process") return "process_start";
  if (type === "network_connection") return "network_connection";
  if (type === "system_info") return "system_info";
  if (type === "fim") return `file_${asString(raw.action) ?? "changed"}`;
  return type;
}

function agentCategory(raw: AgentEventInput, eventType: string) {
  const category = asString(raw.category);
  if (category) return category;

  if (eventType === "windows_security_4625" || eventType === "windows_security_4624") return "authentication";
  if (eventType === "windows_security_4732" || eventType === "windows_security_4720") return "account_management";
  if (eventType === "windows_system_7045") return "service";
  if (eventType === "windows_security_1102") return "audit";
  if (eventType === "process_start") return "process";
  if (eventType === "network_connection") return "network";
  if (eventType.startsWith("file_")) return "file_integrity";
  return asString(raw.type) ?? "agent";
}

function agentSeverity(raw: AgentEventInput, eventType: string) {
  const severity = asString(raw.severity ?? raw.level);
  if (severity) return severity;

  if (["windows_security_1102", "windows_system_7045"].includes(eventType)) return "high";
  if (["windows_security_4625", "windows_security_4732"].includes(eventType)) return "medium";
  return "low";
}

function agentMessage(raw: AgentEventInput, eventType: string) {
  const message = asString(raw.message);
  if (message) return message;

  if (eventType === "process_start") return `Process started: ${asString(raw.process_name) ?? asString(raw.name) ?? "unknown"}`;
  if (eventType === "network_connection") {
    return `Network connection ${asString(raw.local_ip) ?? "-"}:${asString(raw.local_port) ?? "-"} -> ${asString(raw.remote_ip) ?? "-"}:${asString(raw.remote_port) ?? "-"}`;
  }
  if (eventType.startsWith("file_")) return `File integrity event for ${asString(raw.file_path) ?? "unknown path"}`;
  return `${eventType} observed by endpoint agent`;
}

export function normalizeAgentEvent(raw: AgentEventInput, agent: { id: string; hostname: string; tags: string[] }) {
  const eventType = agentEventType(raw);
  const enriched = {
    ...raw,
    timestamp: raw.timestamp ?? new Date().toISOString(),
    host: raw.host ?? raw.hostname ?? agent.hostname,
    user: raw.user ?? raw.username,
    sourceIp: raw.sourceIp ?? raw.source_ip ?? raw.local_ip,
    destinationIp: raw.destinationIp ?? raw.destination_ip ?? raw.remote_ip,
    eventType,
    category: agentCategory(raw, eventType),
    severity: agentSeverity(raw, eventType),
    message: agentMessage(raw, eventType),
    agent: {
      id: agent.id,
      hostname: agent.hostname,
      tags: agent.tags
    }
  };

  const normalized = normalizeEvent(enriched);
  normalized.normalized.agent = enriched.agent;
  return normalized;
}

export async function storeAgentEvents(
  events: AgentEventInput[],
  agent: { id: string; hostname: string; tags: string[]; dataSourceId?: string | null }
) {
  const batch = await prisma.ingestionBatch.create({
    data: {
      sourceName: `Agent ${agent.hostname}`,
      sourceType: "agent",
      status: "running",
      receivedCount: events.length,
      dataSourceId: agent.dataSourceId ?? undefined
    }
  });

  let acceptedCount = 0;
  let rejectedCount = 0;

  for (const [index, raw] of events.entries()) {
    try {
      const normalized = normalizeAgentEvent(raw, agent);
      await prisma.event.create({
        data: {
          timestamp: normalized.timestamp,
          host: normalized.host,
          userName: normalized.userName,
          sourceIp: normalized.sourceIp,
          destinationIp: normalized.destinationIp,
          eventType: normalized.eventType,
          category: normalized.category,
          severity: normalized.severity,
          message: normalized.message,
          raw: normalized.raw as Prisma.InputJsonValue,
          normalized: normalized.normalized as Prisma.InputJsonValue,
          searchText: normalized.searchText,
          dataSourceId: agent.dataSourceId ?? undefined,
          agentId: agent.id
        }
      });
      acceptedCount += 1;
    } catch (error) {
      rejectedCount += 1;
      await prisma.ingestionError.create({
        data: {
          batchId: batch.id,
          line: index + 1,
          message: error instanceof Error ? error.message : "Unknown agent event error",
          raw: JSON.parse(JSON.stringify(raw)) as Prisma.InputJsonValue
        }
      });
    }
  }

  await prisma.ingestionBatch.update({
    where: { id: batch.id },
    data: {
      status: rejectedCount > 0 && acceptedCount === 0 ? "failed" : rejectedCount > 0 ? "partial" : "completed",
      acceptedCount,
      rejectedCount,
      completedAt: new Date()
    }
  });

  await prisma.agent.update({
    where: { id: agent.id },
    data: {
      lastSeenAt: new Date(),
      eventCount: { increment: acceptedCount },
      lastError: rejectedCount > 0 ? `${rejectedCount} event(s) rejected in latest batch` : null
    }
  });

  return { batchId: batch.id, receivedCount: events.length, acceptedCount, rejectedCount };
}

