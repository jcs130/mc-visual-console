"""Sample established local client sockets to configured model gateways, without attributing requests."""
import ipaddress
import json
import subprocess
import time

PROCESS_SCRIPT = r"""
$settings = [Console]::In.ReadToEnd() | ConvertFrom-Json
$rows = Get-CimInstance Win32_Process -ErrorAction Stop | ForEach-Object {
  $line = ([string]$_.CommandLine).Replace('\', '/').ToLowerInvariant()
  $groups = @()
  foreach ($group in @('NEKO', 'MC')) {
    foreach ($path in $settings.$group) {
      if ($line.Contains(([string]$path).Replace('\', '/').ToLowerInvariant())) { $groups += $group; break }
    }
  }
  [pscustomobject]@{ id = [int]$_.ProcessId; parent = [int]$_.ParentProcessId; group = $(if ($groups.Count -eq 1) { $groups[0] } else { $null }) }
}
ConvertTo-Json -InputObject @($rows) -Compress
"""


def address(value):
    host, port = value.rsplit(":", 1)
    host = host.strip("[]")
    ip = ipaddress.ip_address(host)
    return str(ip.ipv4_mapped if isinstance(ip, ipaddress.IPv6Address) and ip.ipv4_mapped else ip), int(port)


def classify_sockets(stdout, processes, endpoints):
    owners = {int(row["id"]): row for row in processes}
    counts = {"NEKO": 0, "MC": 0, "unclassified": 0}
    seen = set()
    for line in stdout.splitlines():
        cells = line.split()
        if len(cells) < 5 or cells[0] != "TCP" or cells[3] != "ESTABLISHED":
            continue
        try:
            if address(cells[2]) not in endpoints:
                continue
            identity = cells[1], cells[2], cells[4]
            if identity in seen:
                continue
            seen.add(identity)
            pid, visited, group = int(cells[4]), set(), None
            while pid in owners and pid not in visited:
                visited.add(pid)
                row = owners[pid]
                if row.get("group") in ("NEKO", "MC"):
                    group = row["group"]
                    break
                pid = int(row["parent"])
            counts[group or "unclassified"] += 1
        except (ValueError, KeyError, TypeError):
            continue
    return counts


def sample_model_ingress(config):
    unknown = {"sampledAt": None, "freshForSeconds": 16, "scope": "local-to-model-gateway",
               "NEKO": None, "MC": None, "unclassified": None}
    try:
        endpoints = {address(f"{row['host']}:{row['port']}") for row in config.get("endpoints", [])}
        clients = {key: [path for path in config.get("clients", {}).get(key, [])
                         if isinstance(path, str) and 5 <= len(path) <= 260 and ("/" in path or "\\" in path)]
                   for key in ("NEKO", "MC")}
        if not endpoints or not all(clients.values()):
            return unknown
        flags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
        processes = subprocess.run(["powershell", "-NoProfile", "-NonInteractive", "-Command", PROCESS_SCRIPT],
                                   input=json.dumps(clients), capture_output=True, text=True, timeout=4, creationflags=flags)
        sockets = subprocess.run(["netstat", "-ano", "-p", "tcp"], capture_output=True, text=True, timeout=3, creationflags=flags)
        if processes.returncode or sockets.returncode:
            return unknown
        rows = json.loads(processes.stdout)
        if not isinstance(rows, list):
            return unknown
        counts = classify_sockets(sockets.stdout, rows, endpoints)
        return {**unknown, **counts, "sampledAt": time.time()}
    except (ValueError, OSError, TypeError, KeyError, subprocess.TimeoutExpired):
        return unknown
