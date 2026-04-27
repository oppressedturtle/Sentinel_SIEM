import type { DetectionRule, Event } from "@prisma/client";
import { prisma } from "../db.js";
import { HttpError } from "../http.js";
import type { EventFilters } from "../types.js";
import { buildEventWhere } from "./search.js";

type RuleDefinition = {
  keyword?: string;
  filters?: EventFilters;
  threshold?: number;
  lookbackMinutes?: number;
  field?: string;
  operator?: "equals" | "not_equals" | "contains" | "greater_than" | "less_than";
  value?: string | number;
  compareField?: string;
  sequence?: Array<{ field: string; value: string }>;
  groupBy?: string;
};

export type RuleLike = Pick<DetectionRule, "id" | "name" | "type" | "severity" | "riskScore" | "definition" | "tags">;

// Rule execution is synchronous for the MVP; scheduling can call runRule from a worker later.
function ruleDefinition(rule: Pick<RuleLike, "definition">): RuleDefinition {
  return (rule.definition ?? {}) as RuleDefinition;
}

function lookbackDate(definition: RuleDefinition) {
  const minutes = definition.lookbackMinutes ?? 120;
  return new Date(Date.now() - minutes * 60_000);
}

function getEventField(event: Event, field?: string) {
  switch (field) {
    case "host":
      return event.host;
    case "userName":
    case "user":
      return event.userName;
    case "sourceIp":
      return event.sourceIp;
    case "destinationIp":
      return event.destinationIp;
    case "eventType":
      return event.eventType;
    case "severity":
      return event.severity;
    case "category":
      return event.category;
    case "message":
      return event.message;
    default:
      return field ? (event.normalized as Record<string, unknown>)?.[field] : undefined;
  }
}

function compareValues(left: unknown, operator: RuleDefinition["operator"], right: unknown) {
  const leftText = String(left ?? "").toLowerCase();
  const rightText = String(right ?? "").toLowerCase();

  switch (operator) {
    case "not_equals":
      return leftText !== rightText;
    case "contains":
      return leftText.includes(rightText);
    case "greater_than":
      return Number(left) > Number(right);
    case "less_than":
      return Number(left) < Number(right);
    case "equals":
    default:
      return leftText === rightText;
  }
}

async function findCandidateEvents(rule: RuleLike) {
  const definition = ruleDefinition(rule);
  return prisma.event.findMany({
    where: {
      ...buildEventWhere(definition.filters ?? {}),
      timestamp: { gte: lookbackDate(definition) }
    },
    orderBy: { timestamp: "asc" },
    take: 500
  });
}

function evaluateKeyword(rule: RuleLike, events: Event[]) {
  const definition = ruleDefinition(rule);
  const keyword = definition.keyword?.toLowerCase();
  if (!keyword) {
    return [];
  }

  return events.filter((event) => event.searchText.toLowerCase().includes(keyword));
}

function evaluateComparison(rule: RuleLike, events: Event[]) {
  const definition = ruleDefinition(rule);
  return events.filter((event) => {
    const left = getEventField(event, definition.field);
    const right = definition.compareField ? getEventField(event, definition.compareField) : definition.value;
    return compareValues(left, definition.operator, right);
  });
}

function evaluateSequence(rule: RuleLike, events: Event[]) {
  const definition = ruleDefinition(rule);
  const sequence = definition.sequence ?? [];
  if (sequence.length === 0) {
    return [];
  }

  const groupBy = definition.groupBy ?? "host";
  const groups = new Map<string, Event[]>();
  for (const event of events) {
    const groupValue = String(getEventField(event, groupBy) ?? "ungrouped");
    groups.set(groupValue, [...(groups.get(groupValue) ?? []), event]);
  }

  const matched = new Map<string, Event>();
  for (const groupEvents of groups.values()) {
    let cursor = 0;
    const groupMatches: Event[] = [];

    for (const event of groupEvents) {
      const expected = sequence[cursor];
      if (compareValues(getEventField(event, expected.field), "equals", expected.value)) {
        groupMatches.push(event);
        cursor += 1;
      }

      if (cursor === sequence.length) {
        for (const match of groupMatches) {
          matched.set(match.id, match);
        }
        break;
      }
    }
  }

  return Array.from(matched.values());
}

export async function testRule(ruleLike: RuleLike) {
  const events = await findCandidateEvents(ruleLike);
  const definition = ruleDefinition(ruleLike);

  if (ruleLike.type === "threshold") {
    const threshold = definition.threshold ?? 5;
    return {
      matchedEvents: events,
      wouldCreateAlerts: events.length >= threshold ? 1 : 0,
      summary: `${events.length} events matched threshold window; threshold is ${threshold}.`
    };
  }

  if (ruleLike.type === "keyword") {
    const matchedEvents = evaluateKeyword(ruleLike, events);
    return {
      matchedEvents,
      wouldCreateAlerts: Math.min(matchedEvents.length, 10),
      summary: `${matchedEvents.length} events matched keyword "${definition.keyword ?? ""}".`
    };
  }

  if (ruleLike.type === "field_comparison") {
    const matchedEvents = evaluateComparison(ruleLike, events);
    return {
      matchedEvents,
      wouldCreateAlerts: Math.min(matchedEvents.length, 10),
      summary: `${matchedEvents.length} events matched field comparison.`
    };
  }

  if (ruleLike.type === "sequence") {
    const matchedEvents = evaluateSequence(ruleLike, events);
    return {
      matchedEvents,
      wouldCreateAlerts: matchedEvents.length > 0 ? 1 : 0,
      summary: matchedEvents.length > 0 ? "Sequence matched in at least one group." : "No complete sequence matched."
    };
  }

  throw new HttpError(400, `Unsupported rule type: ${ruleLike.type}`);
}

async function createRuleAlert(rule: DetectionRule, eventIds: string[], title?: string) {
  return prisma.alert.create({
    data: {
      title: title ?? `${rule.name} detection`,
      status: "open",
      severity: rule.severity,
      riskScore: rule.riskScore,
      tags: rule.tags,
      ruleId: rule.id,
      events: {
        create: eventIds.slice(0, 20).map((eventId) => ({ eventId }))
      }
    }
  });
}

export async function runRule(ruleId: string) {
  const rule = await prisma.detectionRule.findUnique({ where: { id: ruleId } });
  if (!rule) {
    throw new HttpError(404, "Detection rule not found");
  }

  const started = Date.now();
  const execution = await prisma.ruleExecution.create({
    data: {
      ruleId: rule.id,
      status: "running"
    }
  });

  try {
    const result = await testRule(rule);
    let alertsCreated = 0;

    if (rule.type === "threshold") {
      const threshold = ruleDefinition(rule).threshold ?? 5;
      if (result.matchedEvents.length >= threshold) {
        await createRuleAlert(rule, result.matchedEvents.map((event) => event.id), `${rule.name}: threshold exceeded`);
        alertsCreated = 1;
      }
    } else if (rule.type === "sequence") {
      if (result.matchedEvents.length > 0) {
        await createRuleAlert(rule, result.matchedEvents.map((event) => event.id), `${rule.name}: sequence observed`);
        alertsCreated = 1;
      }
    } else {
      for (const event of result.matchedEvents.slice(0, 10)) {
        await createRuleAlert(rule, [event.id], `${rule.name}: ${event.host ?? event.sourceIp ?? event.eventType}`);
        alertsCreated += 1;
      }
    }

    const durationMs = Date.now() - started;
    await prisma.ruleExecution.update({
      where: { id: execution.id },
      data: {
        status: "success",
        completedAt: new Date(),
        durationMs,
        matchedEvents: result.matchedEvents.length,
        alertsCreated
      }
    });
    await prisma.detectionRule.update({
      where: { id: rule.id },
      data: { lastRunAt: new Date(), lastDurationMs: durationMs, lastError: null }
    });

    return { ...result, alertsCreated, durationMs };
  } catch (error) {
    const durationMs = Date.now() - started;
    const message = error instanceof Error ? error.message : "Unknown rule execution error";
    await prisma.ruleExecution.update({
      where: { id: execution.id },
      data: { status: "failed", completedAt: new Date(), durationMs, error: message }
    });
    await prisma.detectionRule.update({
      where: { id: rule.id },
      data: { lastRunAt: new Date(), lastDurationMs: durationMs, lastError: message }
    });
    throw error;
  }
}
