import { DragEvent, useEffect, useState } from "react";
import { Copy, Download, Plus, Save, Upload } from "lucide-react";
import { api, downloadJson } from "../api";
import { Button, Field, Input, Panel, Select, Table, Td, Textarea, Th } from "../components/ui";

type Widget = {
  id?: string;
  type: string;
  title: string;
  query: Record<string, unknown>;
  position: Record<string, unknown>;
  options: Record<string, unknown>;
};

type Dashboard = {
  id: string;
  name: string;
  description: string;
  layout: Record<string, unknown>;
  isDefault: boolean;
  widgets: Widget[];
};

const emptyWidget = { type: "bar", title: "Top hosts", query: { metric: "topHosts" }, position: {}, options: {} };

export function DashboardBuilderPage() {
  const [dashboards, setDashboards] = useState<Dashboard[]>([]);
  const [selected, setSelected] = useState<Dashboard | null>(null);
  const [name, setName] = useState("Custom SOC View");
  const [description, setDescription] = useState("");
  const [widgets, setWidgets] = useState<Widget[]>([emptyWidget]);
  const [widgetTitle, setWidgetTitle] = useState("Severity distribution");
  const [widgetType, setWidgetType] = useState("pie");
  const [widgetMetric, setWidgetMetric] = useState("severityDistribution");
  const [importJson, setImportJson] = useState("");
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [message, setMessage] = useState("");

  async function load() {
    const payload = await api<{ dashboards: Dashboard[] }>("/dashboards");
    setDashboards(payload.dashboards);
    if (!selected && payload.dashboards[0]) {
      loadDashboard(payload.dashboards[0]);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function loadDashboard(dashboard: Dashboard) {
    setSelected(dashboard);
    setName(dashboard.name);
    setDescription(dashboard.description);
    setWidgets(dashboard.widgets.length ? dashboard.widgets : [emptyWidget]);
  }

  function addWidget() {
    setWidgets((current) => [
      ...current,
      { type: widgetType, title: widgetTitle, query: { metric: widgetMetric }, position: { order: current.length }, options: {} }
    ]);
  }

  function removeWidget(index: number) {
    setWidgets((current) => current.filter((_, itemIndex) => itemIndex !== index));
  }

  function onDrop(event: DragEvent, dropIndex: number) {
    event.preventDefault();
    if (dragIndex === null || dragIndex === dropIndex) return;
    setWidgets((current) => {
      const next = [...current];
      const [moved] = next.splice(dragIndex, 1);
      next.splice(dropIndex, 0, moved);
      return next;
    });
    setDragIndex(null);
  }

  async function save() {
    const payload = { name, description, layout: { columns: 12 }, widgets };
    if (selected) {
      const result = await api<{ dashboard: Dashboard }>(`/dashboards/${selected.id}`, { method: "PUT", body: JSON.stringify(payload) });
      setSelected(result.dashboard);
      setMessage("Dashboard updated");
    } else {
      const result = await api<{ dashboard: Dashboard }>("/dashboards", { method: "POST", body: JSON.stringify(payload) });
      setSelected(result.dashboard);
      setMessage("Dashboard created");
    }
    await load();
  }

  async function clone() {
    if (!selected) return;
    const result = await api<{ dashboard: Dashboard }>(`/dashboards/${selected.id}/clone`, { method: "POST" });
    loadDashboard(result.dashboard);
    setMessage("Dashboard cloned");
    await load();
  }

  async function importDashboard() {
    const parsed = JSON.parse(importJson);
    const result = await api<{ dashboard: Dashboard }>("/dashboards/import", { method: "POST", body: JSON.stringify(parsed) });
    setImportJson("");
    loadDashboard(result.dashboard);
    setMessage("Dashboard imported");
    await load();
  }

  return (
    <div className="grid gap-5">
      <div>
        <h1 className="text-2xl font-semibold">Dashboard Builder</h1>
        <p className="mt-1 text-sm text-slate-400">{dashboards.length} dashboards</p>
      </div>
      {message && <div className="rounded-md border border-white/10 bg-white/10 px-3 py-2 text-sm text-slate-200">{message}</div>}

      <div className="grid gap-4 xl:grid-cols-[360px_1fr]">
        <div className="grid gap-4">
          <Panel title="Dashboards">
            <div className="grid gap-2">
              {dashboards.map((dashboard) => (
                <button
                  key={dashboard.id}
                  onClick={() => loadDashboard(dashboard)}
                  className="rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-left text-sm hover:bg-white/10"
                >
                  <div className="font-medium">{dashboard.name}</div>
                  <div className="mt-1 text-slate-400">{dashboard.widgets.length} widgets</div>
                </button>
              ))}
            </div>
          </Panel>

          <Panel title="Import Dashboard">
            <div className="grid gap-3">
              <Textarea value={importJson} onChange={(event) => setImportJson(event.target.value)} className="font-mono text-xs" />
              <Button icon={Upload} variant="secondary" disabled={!importJson.trim()} onClick={() => void importDashboard()}>Import</Button>
            </div>
          </Panel>
        </div>

        <Panel
          title={selected ? selected.name : "New Dashboard"}
          actions={
            <div className="flex flex-wrap gap-2">
              <Button icon={Save} onClick={() => void save()}>Save</Button>
              <Button icon={Copy} variant="secondary" disabled={!selected} onClick={() => void clone()}>Clone</Button>
              <Button icon={Download} variant="secondary" disabled={!selected} onClick={() => selected && downloadJson(`${selected.name}.json`, { dashboard: selected })}>Export</Button>
              <Button icon={Plus} variant="ghost" onClick={() => { setSelected(null); setName("Custom SOC View"); setDescription(""); setWidgets([emptyWidget]); }}>New</Button>
            </div>
          }
        >
          <div className="grid gap-5">
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Name"><Input value={name} onChange={(event) => setName(event.target.value)} /></Field>
              <Field label="Description"><Input value={description} onChange={(event) => setDescription(event.target.value)} /></Field>
            </div>

            <div className="grid gap-3 rounded-md border border-white/10 bg-white/[0.035] p-3 md:grid-cols-4">
              <Field label="Widget title"><Input value={widgetTitle} onChange={(event) => setWidgetTitle(event.target.value)} /></Field>
              <Field label="Type">
                <Select value={widgetType} onChange={(event) => setWidgetType(event.target.value)}>
                  <option value="metric">Metric</option>
                  <option value="line">Line</option>
                  <option value="bar">Bar</option>
                  <option value="pie">Pie</option>
                </Select>
              </Field>
              <Field label="Metric">
                <Select value={widgetMetric} onChange={(event) => setWidgetMetric(event.target.value)}>
                  <option value="openAlerts">Open alerts</option>
                  <option value="alertsOverTime">Alerts over time</option>
                  <option value="topHosts">Top hosts</option>
                  <option value="topUsers">Top users</option>
                  <option value="topIps">Top IPs</option>
                  <option value="severityDistribution">Severity distribution</option>
                  <option value="categories">Event categories</option>
                </Select>
              </Field>
              <div className="flex items-end"><Button icon={Plus} type="button" variant="secondary" onClick={addWidget}>Add</Button></div>
            </div>

            <Table>
              <thead>
                <tr><Th>Order</Th><Th>Title</Th><Th>Type</Th><Th>Metric</Th><Th></Th></tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {widgets.map((widget, index) => (
                  <tr
                    key={`${widget.title}-${index}`}
                    draggable
                    onDragStart={() => setDragIndex(index)}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => onDrop(event, index)}
                    className="cursor-move hover:bg-white/[0.03]"
                  >
                    <Td>{index + 1}</Td>
                    <Td>{widget.title}</Td>
                    <Td>{widget.type}</Td>
                    <Td>{String(widget.query.metric ?? "-")}</Td>
                    <Td><Button variant="ghost" onClick={() => removeWidget(index)}>Remove</Button></Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        </Panel>
      </div>
    </div>
  );
}
