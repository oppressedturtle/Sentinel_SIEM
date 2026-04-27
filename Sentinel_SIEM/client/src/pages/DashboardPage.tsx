import { useEffect, useState } from "react";
import { AlertTriangle, Database, FileStack, ShieldAlert } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { api, formatDate } from "../api";
import { Badge, Panel, Table, Td, Th } from "../components/ui";

type DashboardStats = {
  metrics: { openAlerts: number; eventsCount: number; casesCount: number; sourceCount: number };
  sources: Array<{ id: string; name: string; type: string; status: string; lastSeenAt?: string }>;
  severityDistribution: Array<{ name: string; value: number }>;
  topHosts: Array<{ name: string; value: number }>;
  topUsers: Array<{ name: string; value: number }>;
  topIps: Array<{ name: string; value: number }>;
  categories: Array<{ name: string; value: number }>;
  alertsOverTime: Array<{ date: string; count: number }>;
};

const colors = ["#1f9fb4", "#2f9e66", "#c9831f", "#c94d4d", "#755cc9", "#6b7280"];

function Metric({ label, value, icon: Icon, tone }: { label: string; value: number; icon: typeof ShieldAlert; tone: string }) {
  return (
    <Panel>
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-normal text-slate-400">{label}</div>
          <div className="mt-2 text-3xl font-semibold">{value.toLocaleString()}</div>
        </div>
        <div className={`grid h-11 w-11 place-items-center rounded-md ${tone}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </Panel>
  );
}

export function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<DashboardStats>("/dashboards/stats").then(setStats).catch((err) => setError(err.message));
  }, []);

  if (error) {
    return <Panel><div className="text-sm text-red-200">{error}</div></Panel>;
  }

  if (!stats) {
    return <div className="text-sm text-slate-400">Loading overview</div>;
  }

  return (
    <div className="grid gap-5">
      <div>
        <h1 className="text-2xl font-semibold">Operations Overview</h1>
        <p className="mt-1 text-sm text-slate-400">Last 7 days</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Metric label="Open alerts" value={stats.metrics.openAlerts} icon={ShieldAlert} tone="bg-signal-red/15 text-red-200" />
        <Metric label="Events 7d" value={stats.metrics.eventsCount} icon={Database} tone="bg-signal-cyan/15 text-cyan-200" />
        <Metric label="Active cases" value={stats.metrics.casesCount} icon={FileStack} tone="bg-signal-violet/15 text-violet-200" />
        <Metric label="Sources" value={stats.metrics.sourceCount} icon={AlertTriangle} tone="bg-signal-green/15 text-emerald-200" />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Panel title="Alerts Over Time" className="xl:col-span-2">
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={stats.alertsOverTime}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="date" stroke="#94a3b8" tick={{ fontSize: 12 }} />
                <YAxis allowDecimals={false} stroke="#94a3b8" tick={{ fontSize: 12 }} />
                <Tooltip contentStyle={{ background: "#161b20", border: "1px solid rgba(255,255,255,0.12)" }} />
                <Line type="monotone" dataKey="count" stroke="#1f9fb4" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel title="Severity Distribution">
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={stats.severityDistribution} dataKey="value" nameKey="name" innerRadius={55} outerRadius={92} paddingAngle={3}>
                  {stats.severityDistribution.map((entry, index) => (
                    <Cell key={entry.name} fill={colors[index % colors.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ background: "#161b20", border: "1px solid rgba(255,255,255,0.12)" }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-wrap gap-2">
            {stats.severityDistribution.map((item) => (
              <Badge key={item.name} tone={item.name === "critical" || item.name === "high" ? "red" : item.name === "medium" ? "amber" : "green"}>
                {item.name} {item.value}
              </Badge>
            ))}
          </div>
        </Panel>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Panel title="Top Hosts">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.topHosts} layout="vertical" margin={{ left: 16 }}>
                <XAxis type="number" allowDecimals={false} stroke="#94a3b8" tick={{ fontSize: 12 }} />
                <YAxis type="category" dataKey="name" width={120} stroke="#94a3b8" tick={{ fontSize: 12 }} />
                <Tooltip contentStyle={{ background: "#161b20", border: "1px solid rgba(255,255,255,0.12)" }} />
                <Bar dataKey="value" fill="#1f9fb4" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel title="Top Users">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.topUsers} layout="vertical" margin={{ left: 16 }}>
                <XAxis type="number" allowDecimals={false} stroke="#94a3b8" tick={{ fontSize: 12 }} />
                <YAxis type="category" dataKey="name" width={110} stroke="#94a3b8" tick={{ fontSize: 12 }} />
                <Tooltip contentStyle={{ background: "#161b20", border: "1px solid rgba(255,255,255,0.12)" }} />
                <Bar dataKey="value" fill="#2f9e66" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel title="Top Source IPs">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.topIps} layout="vertical" margin={{ left: 16 }}>
                <XAxis type="number" allowDecimals={false} stroke="#94a3b8" tick={{ fontSize: 12 }} />
                <YAxis type="category" dataKey="name" width={120} stroke="#94a3b8" tick={{ fontSize: 12 }} />
                <Tooltip contentStyle={{ background: "#161b20", border: "1px solid rgba(255,255,255,0.12)" }} />
                <Bar dataKey="value" fill="#755cc9" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>

      <Panel title="Source Status">
        <Table>
          <thead>
            <tr><Th>Name</Th><Th>Type</Th><Th>Status</Th><Th>Last Seen</Th></tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {stats.sources.map((source) => (
              <tr key={source.id}>
                <Td>{source.name}</Td>
                <Td>{source.type}</Td>
                <Td><Badge tone={source.status === "healthy" ? "green" : "amber"}>{source.status}</Badge></Td>
                <Td>{formatDate(source.lastSeenAt)}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Panel>
    </div>
  );
}
