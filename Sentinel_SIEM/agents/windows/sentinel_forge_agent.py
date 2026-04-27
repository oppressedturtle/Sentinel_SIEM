#!/usr/bin/env python3
"""
Sentinel Forge Windows endpoint agent.

Visible, defensive telemetry collector for authorized monitoring. It does not hide
itself, bypass controls, collect credentials, keylog, or perform offensive actions.
"""

from __future__ import annotations

import argparse
import datetime as dt
import getpass
import hashlib
import json
import os
import platform
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

AGENT_VERSION = "0.1.0"


def utc_now() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat()


def load_config(path: Path) -> dict[str, Any]:
    if not path.exists():
        raise SystemExit(f"Config file not found: {path}")
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def save_config(path: Path, config: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        json.dump(config, handle, indent=2)
        handle.write("\n")


def request_json(method: str, server_url: str, path: str, payload: dict[str, Any], api_key: str | None = None) -> dict[str, Any]:
    body = json.dumps(payload).encode("utf-8")
    headers = {"Content-Type": "application/json", "User-Agent": f"sentinel-forge-agent/{AGENT_VERSION}"}
    if api_key:
        headers["x-agent-key"] = api_key

    request = urllib.request.Request(
        f"{server_url.rstrip('/')}{path}",
        data=body,
        headers=headers,
        method=method,
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"{method} {path} failed with HTTP {exc.code}: {detail}") from exc


def system_info() -> dict[str, Any]:
    boot_time = None
    try:
        boot_text = run_powershell("(Get-CimInstance Win32_OperatingSystem).LastBootUpTime.ToUniversalTime().ToString('o')")
        boot_time = boot_text.strip().strip('"')
    except Exception:
        boot_time = None

    uptime_seconds = None
    if boot_time:
        try:
            boot = dt.datetime.fromisoformat(boot_time.replace("Z", "+00:00"))
            uptime_seconds = int((dt.datetime.now(dt.timezone.utc) - boot).total_seconds())
        except ValueError:
            uptime_seconds = None

    return {
        "hostname": socket.gethostname(),
        "os": platform.platform(),
        "osName": platform.system(),
        "osVersion": platform.version(),
        "architecture": platform.machine(),
        "username": getpass.getuser(),
        "uptimeSeconds": uptime_seconds,
    }


def enroll_if_needed(config_path: Path, config: dict[str, Any]) -> dict[str, Any]:
    if config.get("api_key") and config.get("agent_id"):
        return config

    enrollment_token = config.get("enrollment_token")
    if not enrollment_token:
        raise SystemExit("Config needs either api_key+agent_id or enrollment_token for first enrollment")

    info = system_info()
    payload = {
        "enrollmentToken": enrollment_token,
        "hostname": config.get("hostname") or info["hostname"],
        "osName": info["osName"],
        "osVersion": info["osVersion"],
        "architecture": info["architecture"],
        "username": info["username"],
        "version": AGENT_VERSION,
        "tags": config.get("tags", []),
        "systemInfo": info,
    }
    print(f"[agent] enrolling {payload['hostname']} with {config['server_url']}")
    response = request_json("POST", config["server_url"], "/api/agents/enroll", payload)
    config["agent_id"] = response["agentId"]
    config["api_key"] = response["apiKey"]
    config["collection"] = response.get("policy", config.get("collection", {}))
    save_config(config_path, config)
    print(f"[agent] enrolled as {config['agent_id']}; config updated at {config_path}")
    return config


def run_powershell(script: str) -> str:
    command = [
        "powershell.exe",
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        script,
    ]
    completed = subprocess.run(command, capture_output=True, text=True, timeout=60, check=False)
    if completed.returncode != 0:
        raise RuntimeError(completed.stderr.strip() or completed.stdout.strip())
    return completed.stdout.strip()


def parse_json_output(output: str) -> list[dict[str, Any]]:
    if not output:
        return []
    data = json.loads(output)
    if isinstance(data, list):
        return [item for item in data if isinstance(item, dict)]
    if isinstance(data, dict):
        return [data]
    return []


def ps_json(script: str) -> list[dict[str, Any]]:
    return parse_json_output(run_powershell(f"{script} | ConvertTo-Json -Depth 6"))


def collect_windows_events(config: dict[str, Any], seconds: int) -> tuple[list[dict[str, Any]], list[str]]:
    errors: list[str] = []
    events: list[dict[str, Any]] = []
    logs = config.get("collection", {}).get("windowsEventLogs", ["Security", "System", "Application"])
    max_events = int(config.get("collection", {}).get("maxWindowsEventsPerLog", 50))

    for log_name in logs:
        safe_log = str(log_name).replace("'", "''")
        script = (
            f"$start=(Get-Date).AddSeconds(-{int(seconds)}); "
            f"Get-WinEvent -FilterHashtable @{{LogName='{safe_log}'; StartTime=$start}} -MaxEvents {max_events} "
            "| Select-Object TimeCreated,LogName,ProviderName,Id,LevelDisplayName,Message,RecordId"
        )
        try:
            for row in ps_json(script):
                events.append(
                    {
                        "type": "windows_event",
                        "timestamp": row.get("TimeCreated"),
                        "channel": row.get("LogName"),
                        "provider": row.get("ProviderName"),
                        "event_id": row.get("Id"),
                        "level": row.get("LevelDisplayName"),
                        "record_id": row.get("RecordId"),
                        "message": row.get("Message"),
                    }
                )
        except Exception as exc:
            errors.append(f"Windows Event Log {log_name}: {exc}")

    return events, errors


def collect_processes() -> tuple[list[dict[str, Any]], list[str]]:
    script = (
        "Get-CimInstance Win32_Process | Select-Object "
        "Name,ProcessId,ParentProcessId,ExecutablePath,CreationDate,"
        "@{Name='User';Expression={try{($_.GetOwner().Domain + '\\\\' + $_.GetOwner().User)}catch{''}}}"
    )
    try:
        rows = ps_json(script)
    except Exception as exc:
        return [], [f"Process collection: {exc}"]

    events = []
    for row in rows:
        events.append(
            {
                "type": "process",
                "timestamp": utc_now(),
                "process_name": row.get("Name"),
                "pid": row.get("ProcessId"),
                "ppid": row.get("ParentProcessId"),
                "path": row.get("ExecutablePath"),
                "user": row.get("User"),
                "start_time": row.get("CreationDate"),
                "message": f"Process observed: {row.get('Name')} pid={row.get('ProcessId')}",
            }
        )
    return events, []


def collect_network() -> tuple[list[dict[str, Any]], list[str]]:
    script = (
        "$processes = @{}; Get-Process | ForEach-Object { $processes[$_.Id]=$_.ProcessName }; "
        "Get-NetTCPConnection | Select-Object LocalAddress,LocalPort,RemoteAddress,RemotePort,State,OwningProcess,"
        "@{Name='ProcessName';Expression={$processes[$_.OwningProcess]}}"
    )
    try:
        rows = ps_json(script)
    except Exception as exc:
        return [], [f"Network collection: {exc}"]

    events = []
    for row in rows:
        remote_ip = row.get("RemoteAddress")
        if remote_ip in (None, "0.0.0.0", "::", "::1", "127.0.0.1"):
            continue
        events.append(
            {
                "type": "network_connection",
                "timestamp": utc_now(),
                "local_ip": row.get("LocalAddress"),
                "local_port": row.get("LocalPort"),
                "remote_ip": remote_ip,
                "remote_port": row.get("RemotePort"),
                "protocol": "tcp",
                "state": row.get("State"),
                "pid": row.get("OwningProcess"),
                "process_name": row.get("ProcessName"),
                "message": f"Network connection {row.get('LocalAddress')}:{row.get('LocalPort')} -> {remote_ip}:{row.get('RemotePort')}",
            }
        )
    return events, []


def file_hash(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def load_state(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {"files": {}}
    try:
        with path.open("r", encoding="utf-8") as handle:
            return json.load(handle)
    except Exception:
        return {"files": {}}


def collect_fim(config: dict[str, Any], state_path: Path) -> tuple[list[dict[str, Any]], list[str]]:
    collection = config.get("collection", {})
    paths = [Path(item).expanduser() for item in collection.get("fimPaths", [])]
    max_files = int(collection.get("maxFimFiles", 500))
    state = load_state(state_path)
    known = state.setdefault("files", {})
    current: dict[str, dict[str, Any]] = {}
    events: list[dict[str, Any]] = []
    errors: list[str] = []
    inspected = 0

    for root in paths:
        if not root.exists():
            errors.append(f"FIM path does not exist: {root}")
            continue
        for file_path in root.rglob("*"):
            if inspected >= max_files:
                break
            if not file_path.is_file():
                continue
            inspected += 1
            try:
                stat = file_path.stat()
                encoded_path = str(file_path)
                metadata = {
                    "mtime": stat.st_mtime,
                    "size": stat.st_size,
                    "sha256": file_hash(file_path),
                }
                current[encoded_path] = metadata
                previous = known.get(encoded_path)
                if previous is None:
                    action = "created"
                elif previous.get("sha256") != metadata["sha256"] or previous.get("size") != metadata["size"]:
                    action = "modified"
                else:
                    continue
                events.append(
                    {
                        "type": "fim",
                        "timestamp": utc_now(),
                        "action": action,
                        "file_path": encoded_path,
                        "sha256": metadata["sha256"],
                        "size": metadata["size"],
                    }
                )
            except Exception as exc:
                errors.append(f"FIM {file_path}: {exc}")

    for encoded_path in set(known.keys()) - set(current.keys()):
        events.append(
            {
                "type": "fim",
                "timestamp": utc_now(),
                "action": "deleted",
                "file_path": encoded_path,
            }
        )

    save_config(state_path, {"files": current})
    return events, errors


def send_heartbeat(config: dict[str, Any], errors: list[str]) -> dict[str, Any]:
    info = system_info()
    payload = {
        "status": "degraded" if errors else "healthy",
        "version": AGENT_VERSION,
        "systemInfo": info,
        "metrics": {"errorCount": len(errors)},
        "errors": errors,
    }
    return request_json("POST", config["server_url"], "/api/agents/heartbeat", payload, config["api_key"])


def send_events(config: dict[str, Any], events: list[dict[str, Any]]) -> None:
    if not events:
        return
    payload = {"events": events}
    response = request_json("POST", config["server_url"], "/api/agents/events", payload, config["api_key"])
    print(
        "[agent] sent events "
        f"received={response.get('receivedCount')} accepted={response.get('acceptedCount')} rejected={response.get('rejectedCount')}"
    )


def collect_once(
    config: dict[str, Any],
    state_path: Path,
    windows_event_seconds: int,
    due: dict[str, bool],
) -> tuple[list[dict[str, Any]], list[str]]:
    collection = config.get("collection", {})
    events: list[dict[str, Any]] = []
    errors: list[str] = []

    if due.get("system") and collection.get("collectSystemInfo", True):
        info = system_info()
        events.append(
            {
                "type": "system_info",
                "timestamp": utc_now(),
                "message": f"System info for {info['hostname']}",
                **info,
            }
        )

    if due.get("windows"):
        win_events, win_errors = collect_windows_events(config, windows_event_seconds)
        events.extend(win_events)
        errors.extend(win_errors)

    if due.get("process") and collection.get("collectProcesses", True):
        process_events, process_errors = collect_processes()
        events.extend(process_events)
        errors.extend(process_errors)

    if due.get("network") and collection.get("collectNetwork", True):
        network_events, network_errors = collect_network()
        events.extend(network_events)
        errors.extend(network_errors)

    if due.get("fim"):
        fim_events, fim_errors = collect_fim(config, state_path)
        events.extend(fim_events)
        errors.extend(fim_errors)

    return events, errors


def main() -> int:
    parser = argparse.ArgumentParser(description="Visible Sentinel Forge defensive endpoint agent")
    parser.add_argument("--config", default=r"C:\ProgramData\SentinelForge\agent.json", help="Path to agent JSON config")
    parser.add_argument("--once", action="store_true", help="Enroll, heartbeat, collect once, send events, then exit")
    args = parser.parse_args()

    config_path = Path(args.config)
    state_path = config_path.with_suffix(".state.json")
    config = enroll_if_needed(config_path, load_config(config_path))
    last_run = {
        "heartbeat": 0.0,
        "system": 0.0,
        "windows": 0.0,
        "process": 0.0,
        "network": 0.0,
        "fim": 0.0,
    }

    print("[agent] Sentinel Forge endpoint agent running visibly in the foreground")
    print("[agent] Press Ctrl+C to stop")

    while True:
        cycle_errors: list[str] = []
        try:
            intervals = config.get("collection", {}).get("intervals", {})
            heartbeat_seconds = int(intervals.get("heartbeatSeconds", 60))
            interval_seconds = {
                "system": int(intervals.get("systemInfoSeconds", heartbeat_seconds)),
                "windows": int(intervals.get("windowsEventSeconds", 60)),
                "process": int(intervals.get("processSeconds", 120)),
                "network": int(intervals.get("networkSeconds", 120)),
                "fim": int(intervals.get("fimSeconds", 300)),
            }
            now = time.monotonic()
            due = {name: now - last_run[name] >= seconds for name, seconds in interval_seconds.items()}

            events, errors = collect_once(config, state_path, interval_seconds["windows"], due)
            cycle_errors.extend(errors)
            for name, is_due in due.items():
                if is_due:
                    last_run[name] = now

            if now - last_run["heartbeat"] >= heartbeat_seconds or cycle_errors:
                heartbeat_response = send_heartbeat(config, cycle_errors)
                last_run["heartbeat"] = now
                if heartbeat_response.get("policy"):
                    config["collection"] = heartbeat_response["policy"]
                    save_config(config_path, config)

            send_events(config, events)
            print(f"[agent] cycle complete events={len(events)} errors={len(cycle_errors)}")
        except KeyboardInterrupt:
            print("[agent] stopped by user")
            return 0
        except Exception as exc:
            print(f"[agent] error: {exc}", file=sys.stderr)
            cycle_errors.append(str(exc))
            try:
                send_heartbeat(config, cycle_errors)
            except Exception as heartbeat_exc:
                print(f"[agent] heartbeat failed: {heartbeat_exc}", file=sys.stderr)

        if args.once:
            return 0
        time.sleep(15)


if __name__ == "__main__":
    raise SystemExit(main())
