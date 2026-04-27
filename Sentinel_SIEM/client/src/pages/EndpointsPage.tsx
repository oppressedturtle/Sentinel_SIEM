import { FormEvent, useEffect, useMemo, useState } from "react";
import { Copy, Download, KeyRound, RefreshCw, RotateCw, Save, ShieldOff } from "lucide-react";
import { api, downloadJson, formatDate } from "../api";
import { useAuth } from "../auth";
import { Badge, Button, Field, Input, Panel, Select, SeverityBadge, StatusBadge, Table, Td, Textarea, Th } from "../components/ui";

type Agent = {
  id: string;
  hostname: string;
  osName: string;
  osVersion?: string;
  architecture?: string;
  username?: string;
  ipAddress?: string;
  version: string;
  status: string;
  displayStatus: string;
  tags: string[];
  groupName?: string;
  apiKeyPrefix: string;
  policy: Record<string, unknown>;
  health: Record<string, unknown>;
  lastSeenAt?: string;
  lastHeartbeatAt?: string;
  lastError?: string;
  eventCount: number;
  _count?: { events: number; heartbeats: number };
  events?: EventRecord[];
  heartbeats?: Array<{ id: string; status: string; ipAddress?: string; createdAt: string; metrics: Record<string, unknown>; errors: unknown[] }>;
  errors?: Array<{ id: string; message: string; line?: number; createdAt: string; batch: { sourceName: string } }>;
};

type EventRecord = {
  id: string;
  timestamp: string;
  host?: string;
  userName?: string;
  sourceIp?: string;
  destinationIp?: string;
  eventType: string;
  category?: string;
  severity: string;
  message: string;
};

type EnrollmentToken = {
  id: string;
  name: string;
  tokenPrefix: string;
  status: string;
  tags: string[];
  policy: Record<string, unknown>;
  expiresAt?: string;
  usesRemaining?: number;
  createdAt: string;
  lastUsedAt?: string;
  _count?: { agents: number };
};

const defaultPolicy = {
  intervals: {
    heartbeatSeconds: 60,
    windowsEventSeconds: 60,
    processSeconds: 120,
    networkSeconds: 120,
    fimSeconds: 300
  },
  windowsEventLogs: ["Security", "System", "Application"],
  collectProcesses: true,
  collectNetwork: true,
  collectSystemInfo: true,
  fimPaths: []
};

export function EndpointsPage() {
  const { hasPermission } = useAuth();
  const canManageAgents = hasPermission("agents:manage");
  const [agents, setAgents] = useState<Agent[]>([]);
  const [tokens, setTokens] = useState<EnrollmentToken[]>([]);
  const [selected, setSelected] = useState<Agent | null>(null);
  const [tokenName, setTokenName] = useState("Windows workstation enrollment");
  const [tokenTags, setTokenTags] = useState("windows,workstation");
  const [policyText, setPolicyText] = useState(JSON.stringify(defaultPolicy, null, 2));
  const [rawToken, setRawToken] = useState("");
  const [rawAgentKey, setRawAgentKey] = useState("");
  const [detailTags, setDetailTags] = useState("");
  const [detailGroup, setDetailGroup] = useState("");
  const [detailPolicy, setDetailPolicy] = useState(JSON.stringify(defaultPolicy, null, 2));
  const [message, setMessage] = useState("");

  const installCommand = useMemo(() => {
    const configPath = "C:\\ProgramData\\SentinelForge\\agent.json";
    return [
      "New-Item -ItemType Directory -Force C:\\ProgramData\\SentinelForge",
      `# Save the downloaded config to ${configPath}`,
      `py -3 agents\\windows\\sentinel_forge_agent.py --config ${configPath}`
    ].join("\n");
  }, []);

  async function load() {
    const [agentPayload, tokenPayload] = await Promise.all([
      api<{ agents: Agent[] }>("/agents"),
      canManageAgents ? api<{ tokens: EnrollmentToken[] }>("/agents/enrollment-tokens") : Promise.resolve({ tokens: [] })
    ]);
    setAgents(agentPayload.agents);
    setTokens(tokenPayload.tokens);
    if (!selected && agentPayload.agents[0]) {
      await openAgent(agentPayload.agents[0].id);
    }
  }

  async function openAgent(id: string) {
    const payload = await api<{ agent: Agent }>(`/agents/${id}`);
    setSelected(payload.agent);
    setDetailTags(payload.agent.tags.join(","));
    setDetailGroup(payload.agent.groupName ?? "");
    setDetailPolicy(JSON.stringify(payload.agent.policy ?? defaultPolicy, null, 2));
  }

  useEffect(() => {
    void load();
  }, []);

  async function generateToken(event: FormEvent) {
    event.preventDefault();
    const payload = await api<{ token: EnrollmentToken; rawToken: string }>("/agents/enrollment-tokens", {
      method: "POST",
      body: JSON.stringify({
        name: tokenName,
        tags: tokenTags.split(",").map((tag) => tag.trim()).filter(Boolean),
        policy: JSON.parse(policyText),
        usesRemaining: 25
      })
    });
    setRawToken(payload.rawToken);
    setMessage("Enrollment token generated. The raw value is shown once.");
    await load();
  }

  function downloadEnrollmentConfig() {
    const config = {
      server_url: window.location.origin,
      enrollment_token: rawToken || "PASTE_ENROLLMENT_TOKEN_HERE",
      api_key: "",
      agent_id: "",
      hostname: "",
      tags: tokenTags.split(",").map((tag) => tag.trim()).filter(Boolean),
      collection: JSON.parse(policyText)
    };
    downloadJson("sentinel-forge-agent.json", config);
  }

  async function updateAgent(data: Record<string, unknown>) {
    if (!selected) return;
    const payload = await api<{ agent: Agent; rawApiKey?: string }>(`/agents/${selected.id}`, {
      method: "PATCH",
      body: JSON.stringify(data)
    });
    if (payload.rawApiKey) setRawAgentKey(payload.rawApiKey);
    setSelected(payload.agent);
    setMessage("Agent updated");
    await load();
    await openAgent(selected.id);
  }

  async function savePolicy() {
    await updateAgent({
      tags: detailTags.split(",").map((tag) => tag.trim()).filter(Boolean),
      groupName: detailGroup || null,
      policy: JSON.parse(detailPolicy)
    });
  }

  function copy(text: string) {
    void navigator.clipboard.writeText(text);
    setMessage("Copied");
  }

  return (
    <div className="grid gap-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Endpoints</h1>
          <p className="mt-1 text-sm text-slate-400">{agents.length} enrolled agents</p>
        </div>
        <Button icon={RefreshCw} variant="secondary" onClick={() => void load()}>Refresh</Button>
      </div>
      {message && <div className="rounded-md border border-white/10 bg-white/10 px-3 py-2 text-sm text-slate-200">{message}</div>}

      <div className="grid gap-4 xl:grid-cols-[420px_1fr]">
        <div className="grid gap-4">
          {canManageAgents && (
            <>
              <Panel title="Enrollment Wizard">
                <form className="grid gap-3" onSubmit={generateToken}>
                  <Field label="Token name"><Input value={tokenName} onChange={(event) => setTokenName(event.target.value)} /></Field>
                  <Field label="Default tags"><Input value={tokenTags} onChange={(event) => setTokenTags(event.target.value)} /></Field>
                  <Field label="Collection policy"><Textarea value={policyText} onChange={(event) => setPolicyText(event.target.value)} className="min-h-64 font-mono text-xs" /></Field>
                  <Button icon={KeyRound} type="submit">Generate Token</Button>
                </form>
                {rawToken && (
                  <div className="mt-4 grid gap-3 rounded-md border border-signal-cyan/30 bg-signal-cyan/10 p-3">
                    <div className="break-all font-mono text-xs text-cyan-100">{rawToken}</div>
                    <div className="flex flex-wrap gap-2">
                      <Button icon={Copy} variant="secondary" onClick={() => copy(rawToken)}>Copy Token</Button>
                      <Button icon={Download} variant="secondary" onClick={downloadEnrollmentConfig}>Config</Button>
                    </div>
                  </div>
                )}
              </Panel>

              <Panel title="Windows Install Command">
                <div className="grid gap-3">
                  <pre className="whitespace-pre-wrap rounded-md border border-white/10 bg-ink-950/70 p-3 text-xs text-slate-200">{installCommand}</pre>
                  <Button icon={Copy} variant="secondary" onClick={() => copy(installCommand)}>Copy</Button>
                </div>
              </Panel>

              <Panel title="Enrollment Tokens">
                <div className="grid gap-2">
                  {tokens.map((token) => (
                    <div key={token.id} className="rounded-md border border-white/10 bg-white/[0.04] p-3 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium">{token.name}</span>
                        <Badge tone={token.status === "active" ? "green" : "amber"}>{token.status}</Badge>
                      </div>
                      <div className="mt-1 text-slate-400">{token.tokenPrefix} · {token._count?.agents ?? 0} agents · {token.usesRemaining ?? "unlimited"} uses</div>
                    </div>
                  ))}
                </div>
              </Panel>
            </>
          )}
        </div>

        <div className="grid gap-4">
          <Panel title="Agent Status Table">
            <Table>
              <thead>
                <tr><Th>Host</Th><Th>Status</Th><Th>OS</Th><Th>IP</Th><Th>Version</Th><Th>Tags</Th><Th>Last Seen</Th><Th>Events</Th></tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {agents.map((agent) => (
                  <tr key={agent.id} className="hover:bg-white/[0.03]">
                    <Td><button className="text-cyan-100 hover:underline" onClick={() => void openAgent(agent.id)}>{agent.hostname}</button></Td>
                    <Td><StatusBadge status={agent.displayStatus} /></Td>
                    <Td>{agent.osName}</Td>
                    <Td>{agent.ipAddress ?? "-"}</Td>
                    <Td>{agent.version}</Td>
                    <Td><div className="flex flex-wrap gap-1">{agent.tags.map((tag) => <Badge key={tag}>{tag}</Badge>)}</div></Td>
                    <Td>{formatDate(agent.lastSeenAt)}</Td>
                    <Td>{agent._count?.events ?? agent.eventCount}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Panel>

          <Panel title="Agent Detail">
            {selected ? (
              <div className="grid gap-5">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <div className="text-xl font-semibold">{selected.hostname}</div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <StatusBadge status={selected.displayStatus} />
                      <Badge>{selected.osName}</Badge>
                      <Badge>{selected.apiKeyPrefix}</Badge>
                    </div>
                  </div>
                  {canManageAgents && (
                    <div className="flex flex-wrap gap-2">
                      <Button variant="secondary" onClick={() => void updateAgent({ status: selected.status === "enabled" ? "disabled" : "enabled" })}>
                        {selected.status === "enabled" ? "Disable" : "Enable"}
                      </Button>
                      <Button icon={RotateCw} variant="secondary" onClick={() => void updateAgent({ rotateApiKey: true })}>Rotate Key</Button>
                      <Button icon={ShieldOff} variant="danger" onClick={() => void updateAgent({ revokeApiKey: true })}>Revoke</Button>
                    </div>
                  )}
                </div>

                {rawAgentKey && (
                  <div className="grid gap-2 rounded-md border border-signal-amber/30 bg-signal-amber/10 p-3">
                    <div className="text-sm text-amber-100">New agent API key. Store it in the agent config now.</div>
                    <div className="break-all font-mono text-xs text-amber-100">{rawAgentKey}</div>
                    <Button icon={Copy} variant="secondary" onClick={() => copy(rawAgentKey)}>Copy Key</Button>
                  </div>
                )}

                <div className="grid gap-3 md:grid-cols-2">
                  <Field label="Tags"><Input value={detailTags} onChange={(event) => setDetailTags(event.target.value)} /></Field>
                  <Field label="Group"><Input value={detailGroup} onChange={(event) => setDetailGroup(event.target.value)} /></Field>
                </div>
                {canManageAgents && (
                  <>
                    <Field label="Collection policy"><Textarea value={detailPolicy} onChange={(event) => setDetailPolicy(event.target.value)} className="min-h-56 font-mono text-xs" /></Field>
                    <div className="flex flex-wrap gap-2">
                      <Button icon={Save} onClick={() => void savePolicy()}>Save Policy</Button>
                      <Button icon={Download} variant="secondary" onClick={() => downloadJson(`${selected.hostname}-agent-config.json`, {
                        server_url: window.location.origin,
                        api_key: rawAgentKey || "ROTATE_AGENT_KEY_TO_FILL_THIS_VALUE",
                        agent_id: selected.id,
                        hostname: selected.hostname,
                        tags: selected.tags,
                        collection: selected.policy
                      })}>
                        Config
                      </Button>
                    </div>
                  </>
                )}

                <div className="grid gap-4 xl:grid-cols-2">
                  <section className="rounded-md border border-white/10 bg-white/[0.035]">
                    <div className="border-b border-white/10 px-4 py-3 text-sm font-semibold">Health</div>
                    <div className="p-4">
                    <div className="grid gap-2 text-sm">
                      <div>Last heartbeat: {formatDate(selected.lastHeartbeatAt)}</div>
                      <div>Last error: {selected.lastError ?? "-"}</div>
                      <pre className="max-h-64 overflow-auto rounded-md border border-white/10 bg-ink-950/70 p-3 text-xs">{JSON.stringify(selected.health, null, 2)}</pre>
                    </div>
                    </div>
                  </section>
                  <section className="rounded-md border border-white/10 bg-white/[0.035]">
                    <div className="border-b border-white/10 px-4 py-3 text-sm font-semibold">Ingestion Errors</div>
                    <div className="p-4">
                    <div className="grid gap-2">
                      {(selected.errors ?? []).map((error) => (
                        <div key={error.id} className="rounded-md border border-white/10 bg-white/[0.04] p-3 text-sm">
                          <div className="text-slate-400">{formatDate(error.createdAt)} · line {error.line ?? "-"}</div>
                          <div className="mt-1 text-red-200">{error.message}</div>
                        </div>
                      ))}
                      {(selected.errors ?? []).length === 0 && <div className="text-sm text-slate-400">No recent errors</div>}
                    </div>
                    </div>
                  </section>
                </div>

                <section className="rounded-md border border-white/10 bg-white/[0.035]">
                  <div className="border-b border-white/10 px-4 py-3 text-sm font-semibold">Event Stream</div>
                  <div className="p-4">
                  <Table>
                    <thead><tr><Th>Time</Th><Th>Type</Th><Th>Category</Th><Th>Severity</Th><Th>User</Th><Th>Destination</Th><Th>Message</Th></tr></thead>
                    <tbody className="divide-y divide-white/10">
                      {(selected.events ?? []).map((event) => (
                        <tr key={event.id}>
                          <Td>{formatDate(event.timestamp)}</Td>
                          <Td>{event.eventType}</Td>
                          <Td>{event.category ?? "-"}</Td>
                          <Td><SeverityBadge severity={event.severity} /></Td>
                          <Td>{event.userName ?? "-"}</Td>
                          <Td>{event.destinationIp ?? "-"}</Td>
                          <Td className="max-w-lg whitespace-normal">{event.message}</Td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                  </div>
                </section>
              </div>
            ) : (
              <div className="grid h-80 place-items-center text-sm text-slate-400">Select an endpoint</div>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
