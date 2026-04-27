import { FormEvent, useEffect, useState } from "react";
import { Download, MessageSquare, Plus, RefreshCw } from "lucide-react";
import { api, formatDate } from "../api";
import { Badge, Button, Field, Input, Panel, Select, SeverityBadge, StatusBadge, Table, Td, Textarea, Th } from "../components/ui";

type CaseSummary = {
  id: string;
  title: string;
  status: string;
  severity: string;
  affectedHosts: string[];
  affectedUsers: string[];
  updatedAt: string;
  _count?: { alerts: number; events: number; comments: number };
};

type CaseDetail = CaseSummary & {
  description: string;
  alerts: Array<{ alert: { id: string; title: string; severity: string; status: string } }>;
  events: Array<{ event: { id: string; timestamp: string; host?: string; userName?: string; eventType: string; severity: string; message: string } }>;
  comments: Array<{ id: string; body: string; createdAt: string; user?: { name: string } }>;
  timeline: Array<{ id: string; kind: string; title: string; createdAt: string }>;
};

const emptyForm = {
  title: "",
  description: "",
  severity: "medium",
  affectedHosts: "",
  affectedUsers: ""
};

export function CasesPage() {
  const [cases, setCases] = useState<CaseSummary[]>([]);
  const [detail, setDetail] = useState<CaseDetail | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [comment, setComment] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    const payload = await api<{ cases: CaseSummary[] }>("/cases");
    setCases(payload.cases);
    if (!detail && payload.cases[0]) {
      await openCase(payload.cases[0].id);
    }
  }

  async function openCase(id: string) {
    const payload = await api<{ case: CaseDetail }>(`/cases/${id}`);
    setDetail(payload.case);
  }

  useEffect(() => {
    void load();
  }, []);

  async function createCase(event: FormEvent) {
    event.preventDefault();
    const payload = {
      title: form.title,
      description: form.description,
      severity: form.severity,
      affectedHosts: form.affectedHosts.split(",").map((item) => item.trim()).filter(Boolean),
      affectedUsers: form.affectedUsers.split(",").map((item) => item.trim()).filter(Boolean)
    };
    const result = await api<{ case: CaseSummary }>("/cases", { method: "POST", body: JSON.stringify(payload) });
    setForm(emptyForm);
    setMessage("Case created");
    await load();
    await openCase(result.case.id);
  }

  async function updateCase(data: Record<string, unknown>) {
    if (!detail) return;
    await api(`/cases/${detail.id}`, { method: "PATCH", body: JSON.stringify(data) });
    await openCase(detail.id);
    await load();
  }

  async function addComment(event: FormEvent) {
    event.preventDefault();
    if (!detail || !comment.trim()) return;
    await api(`/cases/${detail.id}/comments`, { method: "POST", body: JSON.stringify({ body: comment }) });
    setComment("");
    await openCase(detail.id);
  }

  function exportMarkdown() {
    if (!detail) return;
    window.location.href = `/api/cases/${detail.id}/report.md`;
  }

  return (
    <div className="grid gap-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Cases</h1>
          <p className="mt-1 text-sm text-slate-400">{cases.length} cases</p>
        </div>
        <Button icon={RefreshCw} variant="secondary" onClick={() => void load()}>Refresh</Button>
      </div>
      {message && <div className="rounded-md border border-white/10 bg-white/10 px-3 py-2 text-sm text-slate-200">{message}</div>}

      <div className="grid gap-4 xl:grid-cols-[360px_1fr]">
        <div className="grid gap-4">
          <Panel title="Create Case">
            <form className="grid gap-3" onSubmit={createCase}>
              <Field label="Title"><Input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></Field>
              <Field label="Description"><Textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></Field>
              <Field label="Severity">
                <Select value={form.severity} onChange={(event) => setForm({ ...form, severity: event.target.value })}>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </Select>
              </Field>
              <Field label="Affected hosts"><Input value={form.affectedHosts} onChange={(event) => setForm({ ...form, affectedHosts: event.target.value })} /></Field>
              <Field label="Affected users"><Input value={form.affectedUsers} onChange={(event) => setForm({ ...form, affectedUsers: event.target.value })} /></Field>
              <Button icon={Plus} type="submit" disabled={!form.title.trim()}>Create</Button>
            </form>
          </Panel>

          <Panel title="Case List">
            <div className="grid gap-2">
              {cases.map((caseRecord) => (
                <button
                  key={caseRecord.id}
                  className="rounded-md border border-white/10 bg-white/[0.04] p-3 text-left transition hover:bg-white/10"
                  onClick={() => void openCase(caseRecord.id)}
                >
                  <div className="font-medium text-slate-100">{caseRecord.title}</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <StatusBadge status={caseRecord.status} />
                    <SeverityBadge severity={caseRecord.severity} />
                    <Badge>{caseRecord._count?.events ?? 0} events</Badge>
                  </div>
                </button>
              ))}
            </div>
          </Panel>
        </div>

        <Panel
          title="Case Detail"
          actions={detail && <Button icon={Download} variant="secondary" onClick={exportMarkdown}>Markdown</Button>}
        >
          {detail ? (
            <div className="grid gap-5">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <div className="text-xl font-semibold">{detail.title}</div>
                  <p className="mt-2 max-w-3xl text-sm text-slate-300">{detail.description}</p>
                </div>
                <Select className="w-44" value={detail.status} onChange={(event) => void updateCase({ status: event.target.value })}>
                  <option value="open">Open</option>
                  <option value="investigating">Investigating</option>
                  <option value="contained">Contained</option>
                  <option value="closed">Closed</option>
                </Select>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-md border border-white/10 bg-white/[0.035] p-3">
                  <div className="text-xs uppercase tracking-normal text-slate-400">Affected hosts</div>
                  <div className="mt-2 flex flex-wrap gap-1">{detail.affectedHosts.map((item) => <Badge key={item}>{item}</Badge>)}</div>
                </div>
                <div className="rounded-md border border-white/10 bg-white/[0.035] p-3">
                  <div className="text-xs uppercase tracking-normal text-slate-400">Affected users</div>
                  <div className="mt-2 flex flex-wrap gap-1">{detail.affectedUsers.map((item) => <Badge key={item}>{item}</Badge>)}</div>
                </div>
                <div className="rounded-md border border-white/10 bg-white/[0.035] p-3">
                  <div className="text-xs uppercase tracking-normal text-slate-400">Updated</div>
                  <div className="mt-2 text-sm">{formatDate(detail.updatedAt)}</div>
                </div>
              </div>

              <div className="grid gap-4 xl:grid-cols-2">
                <Panel title="Alerts">
                  <Table>
                    <thead><tr><Th>Title</Th><Th>Severity</Th><Th>Status</Th></tr></thead>
                    <tbody className="divide-y divide-white/10">
                      {detail.alerts.map((item) => (
                        <tr key={item.alert.id}><Td>{item.alert.title}</Td><Td><SeverityBadge severity={item.alert.severity} /></Td><Td><StatusBadge status={item.alert.status} /></Td></tr>
                      ))}
                    </tbody>
                  </Table>
                </Panel>
                <Panel title="Timeline">
                  <div className="grid gap-2">
                    {detail.timeline.map((item) => (
                      <div key={item.id} className="rounded-md border border-white/10 bg-white/[0.04] p-3 text-sm">
                        <div className="flex justify-between gap-2"><span>{item.title}</span><Badge>{item.kind}</Badge></div>
                        <div className="mt-1 text-slate-400">{formatDate(item.createdAt)}</div>
                      </div>
                    ))}
                  </div>
                </Panel>
              </div>

              <Panel title="Evidence Events">
                <Table>
                  <thead><tr><Th>Time</Th><Th>Host</Th><Th>User</Th><Th>Type</Th><Th>Severity</Th><Th>Message</Th></tr></thead>
                  <tbody className="divide-y divide-white/10">
                    {detail.events.map((item) => (
                      <tr key={item.event.id}>
                        <Td>{formatDate(item.event.timestamp)}</Td>
                        <Td>{item.event.host ?? "-"}</Td>
                        <Td>{item.event.userName ?? "-"}</Td>
                        <Td>{item.event.eventType}</Td>
                        <Td><SeverityBadge severity={item.event.severity} /></Td>
                        <Td className="max-w-lg whitespace-normal">{item.event.message}</Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </Panel>

              <div className="grid gap-4 xl:grid-cols-2">
                <Panel title="Comments">
                  <div className="grid gap-2">
                    {detail.comments.map((item) => (
                      <div key={item.id} className="rounded-md border border-white/10 bg-white/[0.04] p-3 text-sm">
                        <div className="text-slate-400">{item.user?.name ?? "Unknown"} · {formatDate(item.createdAt)}</div>
                        <div className="mt-1">{item.body}</div>
                      </div>
                    ))}
                  </div>
                </Panel>
                <Panel title="Add Comment">
                  <form className="grid gap-3" onSubmit={addComment}>
                    <Textarea value={comment} onChange={(event) => setComment(event.target.value)} />
                    <Button icon={MessageSquare} type="submit" variant="secondary">Comment</Button>
                  </form>
                </Panel>
              </div>
            </div>
          ) : (
            <div className="grid h-96 place-items-center text-sm text-slate-400">No case selected</div>
          )}
        </Panel>
      </div>
    </div>
  );
}
