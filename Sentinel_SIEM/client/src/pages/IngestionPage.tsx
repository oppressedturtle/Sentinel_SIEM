import { FormEvent, useEffect, useMemo, useState } from "react";
import { Play, RefreshCw, UploadCloud } from "lucide-react";
import { api, formatDate } from "../api";
import { Badge, Button, Field, Input, Panel, Select, Table, Td, Textarea, Th } from "../components/ui";

type IngestionStatus = {
  sources: Array<{ id: string; name: string; type: string; parserType: string; status: string; lastSeenAt?: string }>;
  batches: Array<{ id: string; sourceName: string; sourceType: string; status: string; receivedCount: number; acceptedCount: number; rejectedCount: number; startedAt: string }>;
  errors: Array<{ id: string; message: string; line?: number; createdAt: string; batch: { sourceName: string } }>;
};

const sampleEvent = {
  timestamp: new Date().toISOString(),
  host: "workstation-42",
  user: "jdoe",
  sourceIp: "10.24.5.42",
  destinationIp: "203.0.113.55",
  eventType: "suspicious_dns_query",
  category: "network",
  severity: "medium",
  message: "DNS query to newly observed domain from analyst-submitted sample"
};

export function IngestionPage() {
  const [status, setStatus] = useState<IngestionStatus | null>(null);
  const [sourceName, setSourceName] = useState("Manual upload");
  const [sourceType, setSourceType] = useState("json");
  const [file, setFile] = useState<File | null>(null);
  const [apiPayload, setApiPayload] = useState(JSON.stringify({ events: [sampleEvent], sourceName: "Browser API sender" }, null, 2));
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const sourceOptions = useMemo(() => status?.sources ?? [], [status]);

  async function load() {
    const payload = await api<IngestionStatus>("/ingest/status");
    setStatus(payload);
  }

  useEffect(() => {
    void load();
  }, []);

  async function uploadFile(event: FormEvent) {
    event.preventDefault();
    if (!file) return;
    setBusy(true);
    setMessage("");
    const formData = new FormData();
    formData.append("file", file);
    formData.append("sourceName", sourceName);
    formData.append("sourceType", sourceType);
    try {
      const result = await api<{ acceptedCount: number; rejectedCount: number }>("/ingest/upload", {
        method: "POST",
        body: formData
      });
      setMessage(`Accepted ${result.acceptedCount}, rejected ${result.rejectedCount}`);
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  async function sendApiPayload() {
    setBusy(true);
    setMessage("");
    try {
      const result = await api<{ acceptedCount: number; rejectedCount: number }>("/ingest/events", {
        method: "POST",
        body: apiPayload
      });
      setMessage(`Accepted ${result.acceptedCount}, rejected ${result.rejectedCount}`);
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Ingestion failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Ingestion Center</h1>
          <p className="mt-1 text-sm text-slate-400">{status?.sources.length ?? 0} sources</p>
        </div>
        <Button icon={RefreshCw} variant="secondary" onClick={() => void load()}>Refresh</Button>
      </div>

      {message && <div className="rounded-md border border-white/10 bg-white/10 px-3 py-2 text-sm text-slate-200">{message}</div>}

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Upload Logs">
          <form className="grid gap-4" onSubmit={uploadFile}>
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Source name">
                <Input value={sourceName} onChange={(event) => setSourceName(event.target.value)} />
              </Field>
              <Field label="File type">
                <Select value={sourceType} onChange={(event) => setSourceType(event.target.value)}>
                  <option value="json">JSON</option>
                  <option value="csv">CSV</option>
                  <option value="syslog">Syslog</option>
                </Select>
              </Field>
            </div>
            <Field label="File">
              <Input type="file" accept=".json,.csv,.log,.txt" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
            </Field>
            <Button icon={UploadCloud} disabled={busy || !file} type="submit">Upload</Button>
          </form>
        </Panel>

        <Panel title="API Ingestion">
          <div className="grid gap-4">
            <Textarea value={apiPayload} onChange={(event) => setApiPayload(event.target.value)} className="min-h-64 font-mono text-xs" />
            <Button icon={Play} disabled={busy} onClick={() => void sendApiPayload()}>Send Events</Button>
          </div>
        </Panel>
      </div>

      <Panel title="Source Status">
        <Table>
          <thead>
            <tr><Th>Name</Th><Th>Type</Th><Th>Parser</Th><Th>Status</Th><Th>Last Seen</Th></tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {sourceOptions.map((source) => (
              <tr key={source.id}>
                <Td>{source.name}</Td>
                <Td>{source.type}</Td>
                <Td>{source.parserType}</Td>
                <Td><Badge tone={source.status === "healthy" ? "green" : "amber"}>{source.status}</Badge></Td>
                <Td>{formatDate(source.lastSeenAt)}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Panel>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Recent Batches">
          <Table>
            <thead>
              <tr><Th>Source</Th><Th>Status</Th><Th>Received</Th><Th>Accepted</Th><Th>Rejected</Th><Th>Started</Th></tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {status?.batches.map((batch) => (
                <tr key={batch.id}>
                  <Td>{batch.sourceName}</Td>
                  <Td><Badge tone={batch.status === "completed" ? "green" : batch.status === "failed" ? "red" : "amber"}>{batch.status}</Badge></Td>
                  <Td>{batch.receivedCount}</Td>
                  <Td>{batch.acceptedCount}</Td>
                  <Td>{batch.rejectedCount}</Td>
                  <Td>{formatDate(batch.startedAt)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Panel>
        <Panel title="Recent Errors">
          <Table>
            <thead>
              <tr><Th>Source</Th><Th>Line</Th><Th>Message</Th><Th>Time</Th></tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {status?.errors.map((error) => (
                <tr key={error.id}>
                  <Td>{error.batch.sourceName}</Td>
                  <Td>{error.line ?? "-"}</Td>
                  <Td className="max-w-md whitespace-normal">{error.message}</Td>
                  <Td>{formatDate(error.createdAt)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Panel>
      </div>
    </div>
  );
}
