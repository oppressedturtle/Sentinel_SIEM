import { FormEvent, useEffect, useState } from "react";
import { Plus, RefreshCw } from "lucide-react";
import { api } from "../api";
import { Badge, Button, Field, Input, Panel, Select, Table, Td, Textarea, Th } from "../components/ui";

type SettingsPayload = {
  customFields: Array<{ id: string; name: string; fieldType: string; appliesTo: string; description: string; enabled: boolean }>;
  customSchemas: Array<{ id: string; name: string; description: string; fields: string[] }>;
  themes: Array<{ id: string; name: string; mode: string; density: string; colors: Record<string, string> }>;
  retentionPolicies: Array<{ id: string; name: string; target: string; days: number; enabled: boolean }>;
  notificationChannels: Array<{ id: string; name: string; type: string; enabled: boolean; config: Record<string, unknown> }>;
  alertStatuses: string[];
  severityLevels: string[];
  ruleTemplates: Array<{ name: string; type: string }>;
  futureConnectors: string[];
};

export function SettingsPage() {
  const [settings, setSettings] = useState<SettingsPayload | null>(null);
  const [fieldName, setFieldName] = useState("asset_criticality");
  const [fieldType, setFieldType] = useState("string");
  const [appliesTo, setAppliesTo] = useState("event");
  const [channelName, setChannelName] = useState("Pager webhook");
  const [channelConfig, setChannelConfig] = useState('{"url":"https://hooks.example.invalid/pager","method":"POST"}');
  const [message, setMessage] = useState("");

  async function load() {
    const payload = await api<SettingsPayload>("/settings");
    setSettings(payload);
  }

  useEffect(() => {
    void load();
  }, []);

  async function addField(event: FormEvent) {
    event.preventDefault();
    await api("/settings/custom-fields", {
      method: "POST",
      body: JSON.stringify({ name: fieldName, fieldType, appliesTo, description: "Custom enrichment field" })
    });
    setMessage("Custom field created");
    await load();
  }

  async function addChannel(event: FormEvent) {
    event.preventDefault();
    await api("/settings/notification-channels", {
      method: "POST",
      body: JSON.stringify({ name: channelName, type: "webhook", config: JSON.parse(channelConfig), enabled: true })
    });
    setMessage("Notification channel created");
    await load();
  }

  function applyTheme(mode: string, density: string) {
    document.documentElement.classList.toggle("light", mode === "light");
    document.documentElement.classList.toggle("compact", density === "compact");
    document.documentElement.classList.toggle("comfortable", density !== "compact");
  }

  if (!settings) {
    return <div className="text-sm text-slate-400">Loading customization</div>;
  }

  return (
    <div className="grid gap-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Customization</h1>
          <p className="mt-1 text-sm text-slate-400">{settings.customFields.length} custom fields</p>
        </div>
        <Button icon={RefreshCw} variant="secondary" onClick={() => void load()}>Refresh</Button>
      </div>
      {message && <div className="rounded-md border border-white/10 bg-white/10 px-3 py-2 text-sm text-slate-200">{message}</div>}

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Custom Fields">
          <div className="grid gap-4">
            <form className="grid gap-3 md:grid-cols-4" onSubmit={addField}>
              <Field label="Name"><Input value={fieldName} onChange={(event) => setFieldName(event.target.value)} /></Field>
              <Field label="Type">
                <Select value={fieldType} onChange={(event) => setFieldType(event.target.value)}>
                  <option value="string">String</option>
                  <option value="number">Number</option>
                  <option value="boolean">Boolean</option>
                  <option value="json">JSON</option>
                </Select>
              </Field>
              <Field label="Applies to">
                <Select value={appliesTo} onChange={(event) => setAppliesTo(event.target.value)}>
                  <option value="event">Event</option>
                  <option value="alert">Alert</option>
                  <option value="case">Case</option>
                  <option value="asset">Asset</option>
                </Select>
              </Field>
              <div className="flex items-end"><Button icon={Plus} type="submit">Add</Button></div>
            </form>
            <Table>
              <thead><tr><Th>Name</Th><Th>Type</Th><Th>Scope</Th><Th>Status</Th></tr></thead>
              <tbody className="divide-y divide-white/10">
                {settings.customFields.map((field) => (
                  <tr key={field.id}><Td>{field.name}</Td><Td>{field.fieldType}</Td><Td>{field.appliesTo}</Td><Td><Badge tone={field.enabled ? "green" : "amber"}>{field.enabled ? "enabled" : "disabled"}</Badge></Td></tr>
                ))}
              </tbody>
            </Table>
          </div>
        </Panel>

        <Panel title="Themes">
          <div className="grid gap-3">
            {settings.themes.map((theme) => (
              <div key={theme.id} className="flex flex-col gap-3 rounded-md border border-white/10 bg-white/[0.04] p-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="font-medium">{theme.name}</div>
                  <div className="mt-1 text-sm text-slate-400">{theme.mode} · {theme.density}</div>
                </div>
                <div className="flex items-center gap-2">
                  {Object.entries(theme.colors ?? {}).slice(0, 4).map(([key, value]) => (
                    <span key={key} title={key} className="h-6 w-6 rounded border border-white/20" style={{ background: value }} />
                  ))}
                  <Button variant="secondary" onClick={() => applyTheme(theme.mode, theme.density)}>Apply</Button>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Notification Channels">
          <div className="grid gap-4">
            <form className="grid gap-3" onSubmit={addChannel}>
              <Field label="Name"><Input value={channelName} onChange={(event) => setChannelName(event.target.value)} /></Field>
              <Field label="Webhook config"><Textarea value={channelConfig} onChange={(event) => setChannelConfig(event.target.value)} className="font-mono text-xs" /></Field>
              <Button icon={Plus} type="submit">Add Channel</Button>
            </form>
            <Table>
              <thead><tr><Th>Name</Th><Th>Type</Th><Th>Status</Th></tr></thead>
              <tbody className="divide-y divide-white/10">
                {settings.notificationChannels.map((channel) => (
                  <tr key={channel.id}><Td>{channel.name}</Td><Td>{channel.type}</Td><Td><Badge tone={channel.enabled ? "green" : "amber"}>{channel.enabled ? "enabled" : "disabled"}</Badge></Td></tr>
                ))}
              </tbody>
            </Table>
          </div>
        </Panel>

        <Panel title="Retention">
          <Table>
            <thead><tr><Th>Name</Th><Th>Target</Th><Th>Days</Th><Th>Status</Th></tr></thead>
            <tbody className="divide-y divide-white/10">
              {settings.retentionPolicies.map((policy) => (
                <tr key={policy.id}><Td>{policy.name}</Td><Td>{policy.target}</Td><Td>{policy.days}</Td><Td><Badge tone={policy.enabled ? "green" : "amber"}>{policy.enabled ? "enabled" : "disabled"}</Badge></Td></tr>
              ))}
            </tbody>
          </Table>
        </Panel>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Panel title="Schemas">
          <div className="grid gap-2">
            {settings.customSchemas.map((schema) => (
              <div key={schema.id} className="rounded-md border border-white/10 bg-white/[0.04] p-3 text-sm">
                <div className="font-medium">{schema.name}</div>
                <div className="mt-1 text-slate-400">{schema.fields.length} fields</div>
              </div>
            ))}
          </div>
        </Panel>
        <Panel title="Statuses And Severities">
          <div className="grid gap-3">
            <div className="flex flex-wrap gap-2">{settings.alertStatuses.map((item) => <Badge key={item}>{item}</Badge>)}</div>
            <div className="flex flex-wrap gap-2">{settings.severityLevels.map((item) => <Badge key={item} tone={item === "critical" || item === "high" ? "red" : item === "medium" ? "amber" : "green"}>{item}</Badge>)}</div>
          </div>
        </Panel>
        <Panel title="Connectors">
          <div className="flex flex-wrap gap-2">
            {settings.futureConnectors.map((connector) => <Badge key={connector} tone="violet">{connector}</Badge>)}
          </div>
        </Panel>
      </div>
    </div>
  );
}
