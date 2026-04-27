import clsx from "clsx";
import type { LucideIcon } from "lucide-react";
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

export function Panel({ title, actions, children, className }: { title?: string; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={clsx("rounded-lg border border-white/10 bg-white/[0.045] shadow-panel", className)}>
      {(title || actions) && (
        <div className="flex min-h-14 items-center justify-between gap-3 border-b border-white/10 px-4">
          {title ? <h2 className="text-sm font-semibold text-slate-100">{title}</h2> : <span />}
          {actions}
        </div>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function Button({
  icon: Icon,
  children,
  variant = "primary",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { icon?: LucideIcon; variant?: "primary" | "secondary" | "danger" | "ghost" }) {
  return (
    <button
      className={clsx(
        "inline-flex h-9 items-center justify-center gap-2 rounded-md px-3 text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-signal-cyan disabled:cursor-not-allowed disabled:opacity-50",
        variant === "primary" && "bg-signal-cyan text-white hover:bg-cyan-600",
        variant === "secondary" && "border border-white/10 bg-white/10 text-slate-100 hover:bg-white/15",
        variant === "danger" && "bg-signal-red text-white hover:bg-red-600",
        variant === "ghost" && "text-slate-200 hover:bg-white/10",
        className
      )}
      {...props}
    >
      {Icon && <Icon className="h-4 w-4" />}
      {children}
    </button>
  );
}

export function IconButton({
  icon: Icon,
  label,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { icon: LucideIcon; label: string }) {
  return (
    <button
      aria-label={label}
      title={label}
      className={clsx(
        "inline-flex h-9 w-9 items-center justify-center rounded-md border border-white/10 bg-white/10 text-slate-100 transition hover:bg-white/15 focus:outline-none focus:ring-2 focus:ring-signal-cyan",
        className
      )}
      {...props}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={clsx(
        "h-9 w-full rounded-md border border-white/10 bg-ink-950/60 px-3 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-signal-cyan",
        props.className
      )}
    />
  );
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={clsx(
        "min-h-24 w-full rounded-md border border-white/10 bg-ink-950/60 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-signal-cyan",
        props.className
      )}
    />
  );
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={clsx(
        "h-9 w-full rounded-md border border-white/10 bg-ink-950/60 px-3 text-sm text-slate-100 outline-none focus:border-signal-cyan",
        props.className
      )}
    />
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid gap-1.5 text-xs font-medium uppercase tracking-normal text-slate-400">
      {label}
      {children}
    </label>
  );
}

export function Badge({ children, tone = "default" }: { children: ReactNode; tone?: "default" | "green" | "amber" | "red" | "violet" | "cyan" }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded px-2 py-0.5 text-xs font-medium",
        tone === "default" && "bg-white/10 text-slate-200",
        tone === "green" && "bg-signal-green/15 text-emerald-200",
        tone === "amber" && "bg-signal-amber/15 text-amber-200",
        tone === "red" && "bg-signal-red/15 text-red-200",
        tone === "violet" && "bg-signal-violet/15 text-violet-200",
        tone === "cyan" && "bg-signal-cyan/15 text-cyan-200"
      )}
    >
      {children}
    </span>
  );
}

export function SeverityBadge({ severity }: { severity?: string }) {
  const tone = severity === "critical" || severity === "high" ? "red" : severity === "medium" ? "amber" : "green";
  return <Badge tone={tone}>{severity ?? "low"}</Badge>;
}

export function StatusBadge({ status }: { status?: string }) {
  const tone = status === "closed" ? "green" : status === "investigating" ? "violet" : status === "acknowledged" ? "amber" : "cyan";
  return <Badge tone={tone}>{status ?? "open"}</Badge>;
}

export function Table({ children }: { children: ReactNode }) {
  return <div className="overflow-x-auto rounded-md border border-white/10"><table className="min-w-full divide-y divide-white/10 text-sm">{children}</table></div>;
}

export function Th({ children }: { children: ReactNode }) {
  return <th className="whitespace-nowrap px-3 py-2 text-left text-xs font-semibold uppercase tracking-normal text-slate-400">{children}</th>;
}

export function Td({ children, className }: { children: ReactNode; className?: string }) {
  return <td className={clsx("whitespace-nowrap px-3 py-2 text-slate-200", className)}>{children}</td>;
}

