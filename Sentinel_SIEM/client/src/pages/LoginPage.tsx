import { FormEvent, useState } from "react";
import { LockKeyhole } from "lucide-react";
import { useAuth } from "../auth";
import { Button, Field, Input, Panel } from "../components/ui";

export function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState("admin@sentinelforge.local");
  const [password, setPassword] = useState("Password123!");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await login(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-screen place-items-center bg-ink-950 px-4 text-slate-100">
      <div className="w-full max-w-md">
        <div className="mb-5 flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-md bg-signal-cyan/20 text-cyan-100">
            <LockKeyhole className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">Sentinel Forge</h1>
            <p className="text-sm text-slate-400">SIEM console</p>
          </div>
        </div>
        <Panel>
          <form className="grid gap-4" onSubmit={onSubmit}>
            <Field label="Email">
              <Input value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="email" />
            </Field>
            <Field label="Password">
              <Input value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete="current-password" />
            </Field>
            {error && <div className="rounded-md border border-signal-red/30 bg-signal-red/10 px-3 py-2 text-sm text-red-200">{error}</div>}
            <Button type="submit" disabled={busy}>
              {busy ? "Signing in" : "Sign in"}
            </Button>
          </form>
        </Panel>
      </div>
    </div>
  );
}
