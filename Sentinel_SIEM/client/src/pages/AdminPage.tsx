import { FormEvent, useEffect, useState } from "react";
import { KeyRound, Plus, RefreshCw } from "lucide-react";
import { api, formatDate } from "../api";
import { Badge, Button, Field, Input, Panel, Select, Table, Td, Th } from "../components/ui";

type User = { id: string; email: string; name: string; status: string; roles: string[]; createdAt: string };
type Role = { id: string; name: string; description: string; permissions: Array<{ permission: { key: string } }> };
type ApiKey = { id: string; name: string; prefix: string; scopes: string[]; status: string; createdAt: string; lastUsedAt?: string; user: { name: string } };
type Source = { id: string; name: string; type: string; status: string; parserType: string; lastSeenAt?: string };
type AuditLog = { id: string; action: string; entity: string; entityId?: string; createdAt: string; user?: { name: string } };
type Health = { status: string; database: string; counts: Record<string, number>; latestBatch?: { sourceName: string; status: string; startedAt: string } };

export function AdminPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [sources, setSources] = useState<Source[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [health, setHealth] = useState<Health | null>(null);
  const [newUser, setNewUser] = useState({ email: "", name: "", password: "", roleId: "" });
  const [keyName, setKeyName] = useState("External log sender");
  const [rawKey, setRawKey] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    const [usersPayload, rolesPayload, keysPayload, sourcesPayload, auditPayload, healthPayload] = await Promise.all([
      api<{ users: User[] }>("/admin/users"),
      api<{ roles: Role[] }>("/admin/roles"),
      api<{ apiKeys: ApiKey[] }>("/admin/api-keys"),
      api<{ sources: Source[] }>("/admin/sources"),
      api<{ auditLogs: AuditLog[] }>("/admin/audit-logs"),
      api<Health>("/admin/health")
    ]);
    setUsers(usersPayload.users);
    setRoles(rolesPayload.roles);
    setApiKeys(keysPayload.apiKeys);
    setSources(sourcesPayload.sources);
    setAuditLogs(auditPayload.auditLogs);
    setHealth(healthPayload);
    setNewUser((current) => ({ ...current, roleId: current.roleId || rolesPayload.roles[0]?.id || "" }));
  }

  useEffect(() => {
    void load();
  }, []);

  async function createUser(event: FormEvent) {
    event.preventDefault();
    await api("/admin/users", {
      method: "POST",
      body: JSON.stringify({
        email: newUser.email,
        name: newUser.name,
        password: newUser.password,
        roleIds: newUser.roleId ? [newUser.roleId] : []
      })
    });
    setNewUser({ email: "", name: "", password: "", roleId: roles[0]?.id || "" });
    setMessage("User created");
    await load();
  }

  async function createApiKey(event: FormEvent) {
    event.preventDefault();
    const payload = await api<{ rawKey: string }>("/admin/api-keys", {
      method: "POST",
      body: JSON.stringify({ name: keyName, scopes: ["events:write"] })
    });
    setRawKey(payload.rawKey);
    setMessage("API key created");
    await load();
  }

  return (
    <div className="grid gap-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Admin Settings</h1>
          <p className="mt-1 text-sm text-slate-400">{users.length} users</p>
        </div>
        <Button icon={RefreshCw} variant="secondary" onClick={() => void load()}>Refresh</Button>
      </div>
      {message && <div className="rounded-md border border-white/10 bg-white/10 px-3 py-2 text-sm text-slate-200">{message}</div>}

      <div className="grid gap-4 md:grid-cols-4">
        <Panel>
          <div className="text-xs uppercase tracking-normal text-slate-400">System</div>
          <div className="mt-2"><Badge tone={health?.status === "healthy" ? "green" : "amber"}>{health?.status ?? "unknown"}</Badge></div>
        </Panel>
        <Panel>
          <div className="text-xs uppercase tracking-normal text-slate-400">Users</div>
          <div className="mt-2 text-2xl font-semibold">{health?.counts.users ?? 0}</div>
        </Panel>
        <Panel>
          <div className="text-xs uppercase tracking-normal text-slate-400">Events</div>
          <div className="mt-2 text-2xl font-semibold">{health?.counts.events ?? 0}</div>
        </Panel>
        <Panel>
          <div className="text-xs uppercase tracking-normal text-slate-400">Alerts</div>
          <div className="mt-2 text-2xl font-semibold">{health?.counts.alerts ?? 0}</div>
        </Panel>
      </div>

      <div className="grid gap-4 xl:grid-cols-[420px_1fr]">
        <div className="grid gap-4">
          <Panel title="Create User">
            <form className="grid gap-3" onSubmit={createUser}>
              <Field label="Name"><Input value={newUser.name} onChange={(event) => setNewUser({ ...newUser, name: event.target.value })} /></Field>
              <Field label="Email"><Input value={newUser.email} type="email" onChange={(event) => setNewUser({ ...newUser, email: event.target.value })} /></Field>
              <Field label="Password"><Input value={newUser.password} type="password" onChange={(event) => setNewUser({ ...newUser, password: event.target.value })} /></Field>
              <Field label="Role">
                <Select value={newUser.roleId} onChange={(event) => setNewUser({ ...newUser, roleId: event.target.value })}>
                  {roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}
                </Select>
              </Field>
              <Button icon={Plus} type="submit" disabled={!newUser.email || !newUser.name || newUser.password.length < 8}>Create</Button>
            </form>
          </Panel>

          <Panel title="Create API Key">
            <form className="grid gap-3" onSubmit={createApiKey}>
              <Field label="Name"><Input value={keyName} onChange={(event) => setKeyName(event.target.value)} /></Field>
              <Button icon={KeyRound} type="submit">Generate</Button>
              {rawKey && <div className="break-all rounded-md border border-signal-cyan/30 bg-signal-cyan/10 p-3 font-mono text-xs text-cyan-100">{rawKey}</div>}
            </form>
          </Panel>
        </div>

        <div className="grid gap-4">
          <Panel title="Users">
            <Table>
              <thead><tr><Th>Name</Th><Th>Email</Th><Th>Roles</Th><Th>Status</Th><Th>Created</Th></tr></thead>
              <tbody className="divide-y divide-white/10">
                {users.map((user) => (
                  <tr key={user.id}>
                    <Td>{user.name}</Td>
                    <Td>{user.email}</Td>
                    <Td><div className="flex flex-wrap gap-1">{user.roles.map((role) => <Badge key={role}>{role}</Badge>)}</div></Td>
                    <Td><Badge tone={user.status === "active" ? "green" : "amber"}>{user.status}</Badge></Td>
                    <Td>{formatDate(user.createdAt)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Panel>

          <Panel title="API Keys">
            <Table>
              <thead><tr><Th>Name</Th><Th>Prefix</Th><Th>Scopes</Th><Th>User</Th><Th>Last Used</Th></tr></thead>
              <tbody className="divide-y divide-white/10">
                {apiKeys.map((key) => (
                  <tr key={key.id}>
                    <Td>{key.name}</Td>
                    <Td>{key.prefix}</Td>
                    <Td><div className="flex flex-wrap gap-1">{key.scopes.map((scope) => <Badge key={scope}>{scope}</Badge>)}</div></Td>
                    <Td>{key.user.name}</Td>
                    <Td>{formatDate(key.lastUsedAt)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Panel>

          <Panel title="Data Sources">
            <Table>
              <thead><tr><Th>Name</Th><Th>Type</Th><Th>Parser</Th><Th>Status</Th><Th>Last Seen</Th></tr></thead>
              <tbody className="divide-y divide-white/10">
                {sources.map((source) => (
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

          <Panel title="Roles">
            <Table>
              <thead><tr><Th>Name</Th><Th>Description</Th><Th>Permissions</Th></tr></thead>
              <tbody className="divide-y divide-white/10">
                {roles.map((role) => (
                  <tr key={role.id}>
                    <Td>{role.name}</Td>
                    <Td className="max-w-md whitespace-normal">{role.description}</Td>
                    <Td><div className="flex flex-wrap gap-1">{role.permissions.map((item) => <Badge key={item.permission.key}>{item.permission.key}</Badge>)}</div></Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Panel>

          <Panel title="Audit Log">
            <Table>
              <thead><tr><Th>Time</Th><Th>User</Th><Th>Action</Th><Th>Entity</Th></tr></thead>
              <tbody className="divide-y divide-white/10">
                {auditLogs.map((log) => (
                  <tr key={log.id}>
                    <Td>{formatDate(log.createdAt)}</Td>
                    <Td>{log.user?.name ?? "-"}</Td>
                    <Td>{log.action}</Td>
                    <Td>{log.entity}{log.entityId ? `/${log.entityId.slice(0, 8)}` : ""}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Panel>
        </div>
      </div>
    </div>
  );
}
