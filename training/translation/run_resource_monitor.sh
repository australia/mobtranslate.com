#!/usr/bin/env bash
set -euo pipefail

LOG_FILE="${1:-/workspace/logs/resource-monitor.csv}"
INTERVAL_SECONDS="${INTERVAL_SECONDS:-5}"

mkdir -p "$(dirname "$LOG_FILE")"

echo "timestamp,gpu_util_pct,gpu_mem_used_mib,gpu_mem_total_mib,gpu_power_w,gpu_power_limit_w,gpu_temp_c,python_cpu_pct,python_rss_mib,ram_used_mib,ram_total_mib,workspace_used_pct" > "$LOG_FILE"

while true; do
  timestamp="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  gpu_values="$(nvidia-smi --query-gpu=utilization.gpu,memory.used,memory.total,power.draw,power.limit,temperature.gpu --format=csv,noheader,nounits | head -n 1 | awk -F, '{for (i=1; i<=NF; i++) {gsub(/^ +| +$/, "", $i)}; print $1 "," $2 "," $3 "," $4 "," $5 "," $6}')"
  mem_values="$(free -m | awk '/^Mem:/ {print $3 "," $2}')"
  workspace_used_pct="$(df --output=pcent /workspace | tail -n 1 | tr -dc '0-9')"

  pids="$(pgrep -f '[t]rain_nllb_lora.py|[e]valuate_nllb_lora.py' || true)"
  if [[ -n "$pids" ]]; then
    pid_csv="$(printf '%s\n' "$pids" | paste -sd, -)"
    proc_values="$(ps -p "$pid_csv" -o pcpu=,rss= | awk '{cpu += $1; rss += $2} END {printf "%.1f,%.1f", cpu, rss / 1024}')"
  else
    proc_values="0.0,0.0"
  fi

  echo "$timestamp,$gpu_values,$proc_values,$mem_values,$workspace_used_pct" >> "$LOG_FILE"
  sleep "$INTERVAL_SECONDS"
done
