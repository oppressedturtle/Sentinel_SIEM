import { FormEvent, useEffect, useState } from "react";
import { CheckCircle2, FilePlus2, MessageSquare, RefreshCw, ShieldOff } from "lucide-react";
import { api, formatDate } from "../api";
import { Badge, Button, Field, Input, Panel, Select, SeverityBadge, StatusBadge, Table, Td, Textarea, Th } from "../components/ui";

type Alert = {
  id: string;
  title: string;
  status: string;
  severity: string;
  riskScore: number;
  tags: string[];
  falsePositive: boolean;
  falsePositiveNote?: string;
  createdAt: string;
  owner?: { name: string };
  rule?: { name: string; mitreTactic?: string; mitreTechnique?: string };
  _count?: { events: number; comments: number; cases: number };
};

type AlertDetail = Alert & {
  events: Array<{ event: { id: string; timestamp: string; host?: string; eventType: string; message: string; severity: string } }>;
  comments: Array<{ id: string; body: string; createdAt: string; user?: { name: string } }>;
  cases: Array<{ case: { id: string; title: string } }>;
};

export function AlertsPage() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [detail, setDetail] = useState<AlertDetail | null>(null);
  const [status, setStatus] = useState("");
  const [comment, setComment] = useState("");
  const [caseTitle, setCaseTitle] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    const payload = await api<{ alerts: Alert[] }>(`/alerts${status ? `?status=${status}` : ""}`);
    setAlerts(payload.alerts);
  }

  async function openDetail(alertId: string) {
    const payload = await api<{ alert: AlertDetail }>(`/alerts/${alertId}`);
    setDetail(payload.alert);
    setCaseTitle(payload.alert.title);
  }

  useEffect(() => {
    void load();
  }, [status]);

  function toggle(id: string) {
    setSelectedIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  async function bulk(action: "acknowledge" | "investigate" | "close" | "reopen") {
    if (selectedIds.length === 0) return;
    await api("/alerts/bulk", { method: "POST", body: JSON.stringify({ alertIds: selectedIds, action }) });
    setSelectedIds([]);
    await load();
    setMessage("Bulk action applied");
  }

  async function updateDetail(data: Record<string, unknown>) {
    if (!detail) return;
    const payload = await api<{ alert: Alert }>(`/alerts/${detail.id}`, { method: "PATCH", body: JSON.stringify(data) });
    setDetail({ ...detail, ...payload.alert });
    await load();
  }

  async function addComment(event: FormEvent) {
    event.preventDefault();
    if (!detail || !comment.trim()) return;
    await api(`/alerts/${detail.id}/comments`, { method: "POST", body: JSON.stringify({ body: comment }) });
    setComment("");
    await openDetail(detail.id);
  }

  async function createCase() {
    if (!detail) return;
    const eventIds = detail.events.map((item) => item.event.id);
    await api("/cases", {
      method: "POST",
      body: JSON.stringify({
        title: caseTitle,
        description: detail.title,
        severity: detail.severity,
        status: "open",
        affectedHosts: Array.from(new Set(detail.events.map((item) => item.event.host).filter(Boolean))),
        alertIds: [detail.id],
        eventIds
      })
    });
    setMessage("Case created");
    await openDetail(detail.id);
  }

  return (
    <div className="grid gap-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Alert Queue</h1>
          <p className="mt-1 text-sm text-slate-400">{alerts.length} alerts</p>
        </div>
        <Button icon={RefreshCw} variant="secondary" onClick={() => void load()}>Refresh</Button>
      </div>
      {message && <div className="rounded-md border border-white/10 bg-white/10 px-3 py-2 text-sm text-slate-200">{message}</div>}

      <div className="grid gap-4 xl:grid-cols-[1fr_440px]">
        <Panel
          title="Queue"
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <Select className="w-40" value={status} onChange={(event) => setStatus(event.target.value)}>
                <option value="">All</option>
                <option value="open">Open</option>
                <option value="acknowledged">Acknowledged</option>
                <option value="investigating">Investigating</option>
                <option value="closed">Closed</option>
              </Select>
              <Button variant="secondary" onClick={() => void bulk("acknowledge")}>Ack</Button>
              <Button variant="secondary" onClick={() => void bulk("investigate")}>Investigate</Button>
              <Button variant="secondary" onClick={() => void bulk("close")}>Close</Button>
            </div>
          }
        >
          <Table>
            <thead>
              <tr><Th></Th><Th>Title</Th><Th>Status</Th><Th>Severity</Th><Th>Risk</Th><Th>Owner</Th><Th>Rule</Th><Th>Events</Th><Th>Created</Th></tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {alerts.map((alert) => (
                <tr key={alert.id} className="hover:bg-white/[0.03]">
                  <Td><input type="checkbox" checked={selectedIds.includes(alert.id)} onChange={() => toggle(alert.id)} /></Td>
                  <Td>
                    <button className="text-left text-cyan-100 hover:underline" onClick={() => void openDetail(alert.id)}>{alert.title}</button>
                    <div className="mt-1 flex flex-wrap gap-1">{alert.tags.map((tag) => <Badge key={tag}>{tag}</Badge>)}</div>
                  </Td>
                  <Td><StatusBadge status={alert.status} /></Td>
                  <Td><SeverityBadge severity={alert.severity} /></Td>
                  <Td>{alert.riskScore}</Td>
                  <Td>{alert.owner?.name ?? "-"}</Td>
                  <Td>{alert.rule?.name ?? "-"}</Td>
                  <Td>{alert._count?.events ?? 0}</Td>
                  <Td>{formatDate(alert.createdAt)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Panel>

        <Panel title="Alert Detail">
          {detail ? (
            <div className="grid gap-4">
              <div>
                <div className="text-lg font-semibold">{detail.title}</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <StatusBadge status={detail.status} />
                  <SeverityBadge severity={detail.severity} />
                  <Badge tone="violet">Risk {detail.riskScore}</Badge>
                  {detail.falsePositive && <Badge tone="amber">false positive</Badge>}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {["open", "acknowledged", "investigating", "closed"].map((nextStatus) => (
                  <Button key={nextStatus} variant="secondary" onClick={() => void updateDetail({ status: nextStatus })}>
                    {nextStatus}
                  </Button>
                ))}
              </div>
              <Button icon={ShieldOff} variant="secondary" onClick={() => void updateDetail({ falsePositive: !detail.falsePositive, falsePositiveNote: "Marked during alert review" })}>
                {detail.falsePositive ? "Clear False Positive" : "False Positive"}
              </Button>
              <div className="grid gap-2">
                <Field label="Case title"><Input value={caseTitle} onChange={(event) => setCaseTitle(event.target.value)} /></Field>
                <Button icon={FilePlus2} onClick={() => void createCase()}>Create Case</Button>
              </div>
              <div>
                <h3 className="mb-2 text-sm font-semibold">Related Events</h3>
                <div className="grid gap-2">
                  {detail.events.map((item) => (
                    <div key={item.event.id} className="rounded-md border border-white/10 bg-white/[0.04] p-3 text-sm">
                      <div className="flex justify-between gap-2">
                        <span>{item.event.host ?? "-"}</span>
                        <SeverityBadge severity={item.event.severity} />
                      </div>
                      <div className="mt-1 text-slate-400">{formatDate(item.event.timestamp)} · {item.event.eventType}</div>
                      <div className="mt-1 text-slate-200">{item.event.message}</div>
                    </div>
                  ))}
                </div>
              </div>
              <form className="grid gap-2" onSubmit={addComment}>
                <Field label="Comment"><Textarea value={comment} onChange={(event) => setComment(event.target.value)} /></Field>
                <Button icon={MessageSquare} type="submit" variant="secondary">Comment</Button>
              </form>
              <div className="grid gap-2">
                {detail.comments.map((item) => (
                  <div key={item.id} className="rounded-md border border-white/10 bg-white/[0.04] p-3 text-sm">
                    <div className="text-slate-400">{item.user?.name ?? "Unknown"} · {formatDate(item.createdAt)}</div>
                    <div className="mt-1">{item.body}</div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="grid h-80 place-items-center text-sm text-slate-400">
              <CheckCircle2 className="mb-2 h-8 w-8 text-slate-500" />
              Select an alert
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
