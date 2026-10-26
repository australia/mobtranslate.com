import Link from "next/link";
import {datasetStatusLabels} from "@/lib/research/quinkan/compendium";

export function CompendiumHeader({active, state}: {active: "datasets" | "algorithms" | "calibration"; state: string}) {
  return (
    <header className="opsHeader reportHeader">
      <Link className="opsBrand" href="/admin/research/quinkan" aria-label="Laura discovery atlas map">
        <span className="opsBrandMark" aria-hidden="true">LQ</span>
        <span><strong>Laura Discovery Atlas</strong><small>Data &amp; methods compendium</small></span>
      </Link>
      <div className="reportHeaderState"><i aria-hidden="true" /> {state}</div>
      <nav className="opsHeaderActions" aria-label="Atlas pages">
        <Link href="/admin/research/quinkan">Map</Link>
        <Link href="/admin/research/quinkan/reports">Field reports</Link>
        <Link href="/admin/research/quinkan/datasets" aria-current={active === "datasets" ? "page" : undefined}>Datasets</Link>
        <Link href="/admin/research/quinkan/algorithms" aria-current={active === "algorithms" ? "page" : undefined}>Algorithms</Link>
        <Link href="/admin/research/quinkan/calibration-report" aria-current={active === "calibration" ? "page" : undefined}>Calibration</Link>
        <Link href="/admin/research/quinkan/methodology">Methodology</Link>
      </nav>
    </header>
  );
}

export function StatusChip({status}: {status: string}) {
  return <span className="compChip" data-status={status}>{datasetStatusLabels[status] ?? status.replaceAll("_", " ")}</span>;
}

export function compendiumDate(utc: string | null): string {
  if (!utc) return "—";
  return new Date(utc).toLocaleDateString("en-AU", {day: "numeric", month: "short", year: "numeric", timeZone: "Australia/Brisbane"});
}

export function probabilityLabel(value: number | null): string {
  if (value === null) return "—";
  if (value < 0.0001) return "p < 0.0001";
  if (value < 0.001) return `p = ${value.toFixed(4)}`;
  return `p = ${value.toFixed(3)}`;
}
