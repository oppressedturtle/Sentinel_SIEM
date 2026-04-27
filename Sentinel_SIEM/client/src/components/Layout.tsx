import {
  Activity,
  Bell,
  FileStack,
  Gauge,
  LogOut,
  PanelsTopLeft,
  Search,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  UploadCloud,
  Users
} from "lucide-react";
import { NavLink, Outlet } from "react-router-dom";
import clsx from "clsx";
import { useAuth } from "../auth";
import { IconButton } from "./ui";

const navItems = [
  { path: "/", label: "Overview", icon: Gauge, permission: "dashboards:read" },
  { path: "/ingest", label: "Ingestion", icon: UploadCloud, permission: "events:write" },
  { path: "/search", label: "Search", icon: Search, permission: "events:read" },
  { path: "/rules", label: "Rules", icon: ShieldCheck, permission: "rules:read" },
  { path: "/alerts", label: "Alerts", icon: Bell, permission: "alerts:read" },
  { path: "/cases", label: "Cases", icon: FileStack, permission: "cases:read" },
  { path: "/dashboards", label: "Dashboards", icon: PanelsTopLeft, permission: "dashboards:read" },
  { path: "/settings", label: "Customization", icon: SlidersHorizontal, permission: "dashboards:read" },
  { path: "/admin", label: "Admin", icon: Users, permission: "admin:manage" }
];

export function Layout() {
  const { user, logout, hasPermission } = useAuth();

  return (
    <div className="min-h-screen bg-ink-950 text-slate-100">
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-white/10 bg-ink-900/95 px-3 py-4 lg:block">
        <div className="mb-5 flex items-center gap-3 px-2">
          <div className="grid h-10 w-10 place-items-center rounded-md bg-signal-cyan/20 text-cyan-100">
            <Activity className="h-5 w-5" />
          </div>
          <div>
            <div className="text-sm font-semibold">Sentinel Forge</div>
            <div className="text-xs text-slate-400">Defensive SIEM</div>
          </div>
        </div>
        <nav className="grid gap-1">
          {navItems
            .filter((item) => hasPermission(item.permission))
            .map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) =>
                  clsx(
                    "flex h-10 items-center gap-3 rounded-md px-3 text-sm transition",
                    isActive ? "bg-signal-cyan/15 text-cyan-100" : "text-slate-300 hover:bg-white/10 hover:text-white"
                  )
                }
                end={item.path === "/"}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </NavLink>
            ))}
        </nav>
      </aside>
      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-white/10 bg-ink-950/90 px-4 backdrop-blur lg:px-6">
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">{user?.name}</div>
            <div className="truncate text-xs text-slate-400">{user?.roles.join(" / ")}</div>
          </div>
          <div className="flex items-center gap-2">
            <IconButton icon={Settings} label="Settings" onClick={() => document.documentElement.classList.toggle("compact")} />
            <IconButton icon={LogOut} label="Sign out" onClick={() => void logout()} />
          </div>
        </header>
        <nav className="sticky top-16 z-10 flex gap-1 overflow-x-auto border-b border-white/10 bg-ink-950/95 px-3 py-2 lg:hidden">
          {navItems
            .filter((item) => hasPermission(item.permission))
            .map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) =>
                  clsx(
                    "flex h-9 shrink-0 items-center gap-2 rounded-md px-3 text-sm transition",
                    isActive ? "bg-signal-cyan/15 text-cyan-100" : "text-slate-300 hover:bg-white/10 hover:text-white"
                  )
                }
                end={item.path === "/"}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </NavLink>
            ))}
        </nav>
        <main className="p-4 lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
