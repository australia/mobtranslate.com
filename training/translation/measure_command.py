#!/usr/bin/env python3
"""Run one command and persist portable process-resource measurements."""

from __future__ import annotations

import argparse
import json
import resource
import subprocess
import time
from pathlib import Path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--stdout", type=Path, required=True)
    parser.add_argument("--stderr", type=Path, required=True)
    parser.add_argument("command", nargs=argparse.REMAINDER)
    args = parser.parse_args()
    if args.command[:1] == ["--"]:
        args.command = args.command[1:]
    if not args.command:
        parser.error("a command is required after --")
    return args


def main() -> None:
    args = parse_args()
    for path in (args.output, args.stdout, args.stderr):
        path.parent.mkdir(parents=True, exist_ok=True)

    started = time.monotonic()
    before = resource.getrusage(resource.RUSAGE_CHILDREN)
    with args.stdout.open("wb") as stdout, args.stderr.open("wb") as stderr:
        completed = subprocess.run(args.command, stdout=stdout, stderr=stderr, check=False)
    after = resource.getrusage(resource.RUSAGE_CHILDREN)
    result = {
        "schema_version": 1,
        "command": args.command,
        "exit_code": completed.returncode,
        "elapsed_seconds": time.monotonic() - started,
        "user_cpu_seconds": after.ru_utime - before.ru_utime,
        "system_cpu_seconds": after.ru_stime - before.ru_stime,
        "max_rss_kib": after.ru_maxrss,
        "major_page_faults": after.ru_majflt - before.ru_majflt,
        "minor_page_faults": after.ru_minflt - before.ru_minflt,
        "voluntary_context_switches": after.ru_nvcsw - before.ru_nvcsw,
        "involuntary_context_switches": after.ru_nivcsw - before.ru_nivcsw,
        "stdout": str(args.stdout),
        "stderr": str(args.stderr),
    }
    args.output.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(result, indent=2))
    raise SystemExit(completed.returncode)


if __name__ == "__main__":
    main()
