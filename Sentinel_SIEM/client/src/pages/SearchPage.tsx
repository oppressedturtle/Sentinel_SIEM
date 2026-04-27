import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link2, Save, Search as SearchIcon } from "lucide-react";
import { api, formatDate } from "../api";
import { Button, Field, Input, Panel, Select, SeverityBadge, Table, Td, Th } from "../components/ui";

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

type CaseRecord = { id: string; title: string };
type SavedSearch = { id: string; name: string; query: Record<string, string> };

const initialFilters = {
  q: "",
  host: "",
  userName: "",
  sourceIp: "",
  destinationIp: "",
  eventType: "",
  severity: "",
  category: ""
};

export function SearchPage() {
  const [filters, setFilters] = useState(initialFilters);
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([]);
  const [cases, setCases] = useState<CaseRecord[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [caseId, setCaseId] = useState("");
  const [name, setName] = useState("New saved search");
  const [message, setMessage] = useState("");

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) {
      if (value) params.set(key, value);
    }
    params.set("pageSize", "100");
    return params.toString();
  }, [filters]);

  async function load() {
    const [eventPayload, savedPayload, casePayload] = await Promise.all([
      api<{ events: EventRecord[]; total: number }>(`/events?${queryString}`),
      api<{ savedSearches: SavedSearch[] }>("/events/saved-searches"),
      api<{ cases: CaseRecord[] }>("/cases")
    ]);
    setEvents(eventPayload.events);
    setTotal(eventPayload.total);
    setSavedSearches(savedPayload.savedSearches);
    setCases(casePayload.cases);
    setCaseId((current) => current || casePayload.cases[0]?.id || "");
  }

  useEffect(() => {
    void load();
  }, []);

  async function onSearch(event: FormEvent) {
    event.preventDefault();
    await load();
  }

  async function saveSearch() {
    const query = Object.fromEntries(Object.entries(filters).filter(([, value]) => value));
    await api("/events/saved-searches", { method: "POST", body: JSON.stringify({ name, query }) });
    setMessage("Saved search created");
    await load();
  }

  async function attachToCase() {
    if (!caseId || selected.length === 0) return;
    await api("/events/attach-to-case", {
      method: "POST",
      body: JSON.stringify({ caseId, eventIds: selected })
    });
    setMessage(`Attached ${selected.length} events`);
    setSelected([]);
  }

  function updateFilter(key: keyof typeof initialFilters, value: string) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function toggleEvent(id: string) {
    setSelected((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  return (
    <div className="grid gap-5">
      <div>
        <h1 className="text-2xl font-semibold">Event Search</h1>
        <p className="mt-1 text-sm text-slate-400">{total.toLocaleString()} matching events.</p>
      </div>

      {message && <div className="rounded-md border border-white/10 bg-white/10 px-3 py-2 text-sm text-slate-200">{message}</div>}

      <Panel title="Query Builder">
        <form className="grid gap-3" onSubmit={onSearch}>
          <div className="grid gap-3 md:grid-cols-4">
            <Field label="Query">
              <Input value={filters.q} onChange={(event) => updateFilter("q", event.target.value)} placeholder="powershell 10.24" />
            </Field>
            <Field label="Host">
              <Input value={filters.host} onChange={(event) => updateFilter("host", event.target.value)} />
            </Field>
            <Field label="User">
              <Input value={filters.userName} onChange={(event) => updateFilter("userName", event.target.value)} />
            </Field>
            <Field label="Severity">
              <Select value={filters.severity} onChange={(event) => updateFilter("severity", event.target.value)}>
                <option value="">Any</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </Select>
            </Field>
            <Field label="Source IP">
              <Input value={filters.sourceIp} onChange={(event) => updateFilter("sourceIp", event.target.value)} />
            </Field>
            <Field label="Destination IP">
              <Input value={filters.destinationIp} onChange={(event) => updateFilter("destinationIp", event.target.value)} />
            </Field>
            <Field label="Event type">
              <Input value={filters.eventType} onChange={(event) => updateFilter("eventType", event.target.value)} />
            </Field>
            <Field label="Category">
              <Input value={filters.category} onChange={(event) => updateFilter("category", event.target.value)} />
            </Field>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button icon={SearchIcon} type="submit">Search</Button>
            <Button type="button" variant="secondary" onClick={() => setFilters(initialFilters)}>Clear</Button>
          </div>
        </form>
      </Panel>

      <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
        <Panel
          title="Events"
          actions={
            <div className="flex items-center gap-2">
              <Select className="w-52" value={caseId} onChange={(event) => setCaseId(event.target.value)}>
                {cases.map((caseRecord) => <option key={caseRecord.id} value={caseRecord.id}>{caseRecord.title}</option>)}
              </Select>
              <Button icon={Link2} variant="secondary" disabled={!caseId || selected.length === 0} onClick={() => void attachToCase()}>
                Attach
              </Button>
            </div>
          }
        >
          <Table>
            <thead>
              <tr><Th></Th><Th>Time</Th><Th>Host</Th><Th>User</Th><Th>Source</Th><Th>Destination</Th><Th>Type</Th><Th>Severity</Th><Th>Message</Th></tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {events.map((event) => (
                <tr key={event.id} className="hover:bg-white/[0.03]">
                  <Td><input type="checkbox" checked={selected.includes(event.id)} onChange={() => toggleEvent(event.id)} /></Td>
                  <Td>{formatDate(event.timestamp)}</Td>
                  <Td>{event.host ?? "-"}</Td>
                  <Td>{event.userName ?? "-"}</Td>
                  <Td>{event.sourceIp ?? "-"}</Td>
                  <Td>{event.destinationIp ?? "-"}</Td>
                  <Td>{event.eventType}</Td>
                  <Td><SeverityBadge severity={event.severity} /></Td>
                  <Td className="max-w-lg whitespace-normal">{event.message}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Panel>

        <Panel title="Saved Searches">
          <div className="grid gap-3">
            <Field label="Name">
              <Input value={name} onChange={(event) => setName(event.target.value)} />
            </Field>
            <Button icon={Save} variant="secondary" onClick={() => void saveSearch()}>Save</Button>
            <div className="grid gap-2">
              {savedSearches.map((savedSearch) => (
                <button
                  key={savedSearch.id}
                  className="rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-left text-sm text-slate-200 transition hover:bg-white/10"
                  onClick={() => setFilters({ ...initialFilters, ...(savedSearch.query as typeof initialFilters) })}
                >
                  {savedSearch.name}
                </button>
              ))}
            </div>
          </div>
        </Panel>
      </div>
    </div>
  );
}

