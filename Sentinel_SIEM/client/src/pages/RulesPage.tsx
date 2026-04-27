import { FormEvent, useEffect, useMemo, useState } from "react";
import { Download, Play, Save, TestTube2, Upload } from "lucide-react";
import { api, downloadJson, formatDate } from "../api";
import { Badge, Button, Field, Input, Panel, Select, SeverityBadge, Table, Td, Textarea, Th } from "../components/ui";

type Rule = {
  id: string;
  name: string;
  description: string;
  type: string;
  severity: string;
  riskScore: number;
  schedule: string;
  enabled: boolean;
  definition: Record<string, unknown>;
  mitreTactic?: string;
  mitreTechnique?: string;
  tags: string[];
  lastRunAt?: string;
  lastDurationMs?: number;
  lastError?: string;
  _count?: { alerts: number };
};

const defaultForm = {
  name: "New keyword detection",
  description: "",
  type: "keyword",
  severity: "medium",
  riskScore: 50,
  schedule: "manual",
  keyword: "powershell",
  threshold: 5,
  field: "eventType",
  operator: "contains",
  value: "failure",
  sequence: "login_failure,login_success,powershell_encoded_command",
  groupBy: "host",
  lookbackMinutes: 120,
  mitreTactic: "Execution",
  mitreTechnique: "T1059",
  tags: "custom,defensive"
};

export function RulesPage() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [form, setForm] = useState(defaultForm);
  const [selected, setSelected] = useState<Rule | null>(null);
  const [testResult, setTestResult] = useState("");
  const [importJson, setImportJson] = useState("");
  const [message, setMessage] = useState("");

  const definition = useMemo(() => {
    if (form.type === "threshold") {
      return { filters: { category: form.value || undefined }, threshold: Number(form.threshold), lookbackMinutes: Number(form.lookbackMinutes) };
    }
    if (form.type === "field_comparison") {
      return { field: form.field, operator: form.operator, value: form.value, lookbackMinutes: Number(form.lookbackMinutes) };
    }
    if (form.type === "sequence") {
      return {
        groupBy: form.groupBy,
        sequence: form.sequence.split(",").map((value) => ({ field: "eventType", value: value.trim() })).filter((item) => item.value),
        lookbackMinutes: Number(form.lookbackMinutes)
      };
    }
    return { keyword: form.keyword, lookbackMinutes: Number(form.lookbackMinutes) };
  }, [form]);

  async function load() {
    const payload = await api<{ rules: Rule[] }>("/rules");
    setRules(payload.rules);
  }

  useEffect(() => {
    void load();
  }, []);

  function update<K extends keyof typeof defaultForm>(key: K, value: (typeof defaultForm)[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function fromRule(rule: Rule) {
    setSelected(rule);
    const def = rule.definition ?? {};
    setForm({
      ...defaultForm,
      name: rule.name,
      description: rule.description,
      type: rule.type,
      severity: rule.severity,
      riskScore: rule.riskScore,
      schedule: rule.schedule,
      keyword: String(def.keyword ?? defaultForm.keyword),
      threshold: Number(def.threshold ?? defaultForm.threshold),
      field: String(def.field ?? defaultForm.field),
      operator: String(def.operator ?? defaultForm.operator),
      value: String(def.value ?? defaultForm.value),
      sequence: Array.isArray(def.sequence) ? def.sequence.map((item) => String((item as { value?: string }).value)).join(",") : defaultForm.sequence,
      groupBy: String(def.groupBy ?? defaultForm.groupBy),
      lookbackMinutes: Number(def.lookbackMinutes ?? defaultForm.lookbackMinutes),
      mitreTactic: rule.mitreTactic ?? "",
      mitreTechnique: rule.mitreTechnique ?? "",
      tags: rule.tags.join(",")
    });
  }

  function payload() {
    return {
      name: form.name,
      description: form.description,
      type: form.type,
      severity: form.severity,
      riskScore: Number(form.riskScore),
      schedule: form.schedule,
      enabled: true,
      definition,
      mitreTactic: form.mitreTactic,
      mitreTechnique: form.mitreTechnique,
      tags: form.tags.split(",").map((tag) => tag.trim()).filter(Boolean)
    };
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    const path = selected ? `/rules/${selected.id}` : "/rules";
    const method = selected ? "PUT" : "POST";
    await api(path, { method, body: JSON.stringify(payload()) });
    setMessage(selected ? "Rule updated" : "Rule created");
    setSelected(null);
    await load();
  }

  async function testCurrent() {
    const result = await api<{ summary: string; wouldCreateAlerts: number }>("/rules/test", {
      method: "POST",
      body: JSON.stringify(payload())
    });
    setTestResult(`${result.summary} Alerts: ${result.wouldCreateAlerts}`);
  }

  async function run(rule: Rule) {
    const result = await api<{ matchedEvents: unknown[]; alertsCreated: number; durationMs: number }>(`/rules/${rule.id}/run`, { method: "POST" });
    setMessage(`Matched ${result.matchedEvents.length}, created ${result.alertsCreated} alerts in ${result.durationMs}ms`);
    await load();
  }

  async function importRule() {
    const parsed = JSON.parse(importJson);
    await api("/rules/import", { method: "POST", body: JSON.stringify(parsed) });
    setImportJson("");
    setMessage("Rule imported");
    await load();
  }

  return (
    <div className="grid gap-5">
      <div>
        <h1 className="text-2xl font-semibold">Detection Rules</h1>
        <p className="mt-1 text-sm text-slate-400">{rules.length} rules</p>
      </div>
      {message && <div className="rounded-md border border-white/10 bg-white/10 px-3 py-2 text-sm text-slate-200">{message}</div>}
      <div className="grid gap-4 xl:grid-cols-[420px_1fr]">
        <Panel title={selected ? "Edit Rule" : "Create Rule"}>
          <form className="grid gap-3" onSubmit={save}>
            <Field label="Name"><Input value={form.name} onChange={(event) => update("name", event.target.value)} /></Field>
            <Field label="Description"><Textarea value={form.description} onChange={(event) => update("description", event.target.value)} /></Field>
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Type">
                <Select value={form.type} onChange={(event) => update("type", event.target.value)}>
                  <option value="keyword">Keyword match</option>
                  <option value="threshold">Threshold</option>
                  <option value="field_comparison">Field comparison</option>
                  <option value="sequence">Sequence</option>
                </Select>
              </Field>
              <Field label="Severity">
                <Select value={form.severity} onChange={(event) => update("severity", event.target.value)}>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </Select>
              </Field>
              <Field label="Risk score"><Input type="number" value={form.riskScore} onChange={(event) => update("riskScore", Number(event.target.value))} /></Field>
              <Field label="Lookback minutes"><Input type="number" value={form.lookbackMinutes} onChange={(event) => update("lookbackMinutes", Number(event.target.value))} /></Field>
            </div>
            {form.type === "keyword" && <Field label="Keyword"><Input value={form.keyword} onChange={(event) => update("keyword", event.target.value)} /></Field>}
            {form.type === "threshold" && (
              <div className="grid gap-3 md:grid-cols-2">
                <Field label="Category filter"><Input value={form.value} onChange={(event) => update("value", event.target.value)} /></Field>
                <Field label="Threshold"><Input type="number" value={form.threshold} onChange={(event) => update("threshold", Number(event.target.value))} /></Field>
              </div>
            )}
            {form.type === "field_comparison" && (
              <div className="grid gap-3 md:grid-cols-3">
                <Field label="Field"><Input value={form.field} onChange={(event) => update("field", event.target.value)} /></Field>
                <Field label="Operator">
                  <Select value={form.operator} onChange={(event) => update("operator", event.target.value)}>
                    <option value="equals">Equals</option>
                    <option value="not_equals">Not equals</option>
                    <option value="contains">Contains</option>
                    <option value="greater_than">Greater than</option>
                    <option value="less_than">Less than</option>
                  </Select>
                </Field>
                <Field label="Value"><Input value={form.value} onChange={(event) => update("value", event.target.value)} /></Field>
              </div>
            )}
            {form.type === "sequence" && (
              <div className="grid gap-3 md:grid-cols-2">
                <Field label="Group by"><Input value={form.groupBy} onChange={(event) => update("groupBy", event.target.value)} /></Field>
                <Field label="Event sequence"><Input value={form.sequence} onChange={(event) => update("sequence", event.target.value)} /></Field>
              </div>
            )}
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="MITRE tactic"><Input value={form.mitreTactic} onChange={(event) => update("mitreTactic", event.target.value)} /></Field>
              <Field label="MITRE technique"><Input value={form.mitreTechnique} onChange={(event) => update("mitreTechnique", event.target.value)} /></Field>
            </div>
            <Field label="Tags"><Input value={form.tags} onChange={(event) => update("tags", event.target.value)} /></Field>
            {testResult && <div className="rounded-md border border-signal-cyan/30 bg-signal-cyan/10 px-3 py-2 text-sm text-cyan-100">{testResult}</div>}
            <div className="flex flex-wrap gap-2">
              <Button icon={Save} type="submit">{selected ? "Update" : "Create"}</Button>
              <Button icon={TestTube2} type="button" variant="secondary" onClick={() => void testCurrent()}>Test</Button>
              {selected && <Button type="button" variant="ghost" onClick={() => { setSelected(null); setForm(defaultForm); }}>New</Button>}
            </div>
          </form>
        </Panel>

        <div className="grid gap-4">
          <Panel title="Rule Health">
            <Table>
              <thead>
                <tr><Th>Name</Th><Th>Type</Th><Th>Severity</Th><Th>Risk</Th><Th>MITRE</Th><Th>Last Run</Th><Th>Alerts</Th><Th></Th></tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {rules.map((rule) => (
                  <tr key={rule.id} className="hover:bg-white/[0.03]">
                    <Td className="cursor-pointer" onClick={() => fromRule(rule)}>{rule.name}</Td>
                    <Td><Badge>{rule.type}</Badge></Td>
                    <Td><SeverityBadge severity={rule.severity} /></Td>
                    <Td>{rule.riskScore}</Td>
                    <Td>{[rule.mitreTactic, rule.mitreTechnique].filter(Boolean).join(" / ") || "-"}</Td>
                    <Td>{rule.lastError ? <Badge tone="red">error</Badge> : formatDate(rule.lastRunAt)}</Td>
                    <Td>{rule._count?.alerts ?? 0}</Td>
                    <Td>
                      <div className="flex gap-2">
                        <Button icon={Play} variant="secondary" onClick={() => void run(rule)}>Run</Button>
                        <Button icon={Download} variant="ghost" onClick={() => downloadJson(`${rule.name}.json`, { rule })}>Export</Button>
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Panel>

          <Panel title="Import Rule">
            <div className="grid gap-3">
              <Textarea value={importJson} onChange={(event) => setImportJson(event.target.value)} className="font-mono text-xs" />
              <Button icon={Upload} variant="secondary" disabled={!importJson.trim()} onClick={() => void importRule()}>Import</Button>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
