import type {Metadata} from "next";
import type {ReactNode} from "react";
import "maplibre-gl/dist/maplibre-gl.css";
import "./quinkan.css";

export const metadata: Metadata = {
  title: "Laura Discovery Atlas",
  description: "An auditable environmental map workspace for the Laura–Quinkan cave and rock-art discovery research program.",
  robots: {index: false, follow: false, nocache: true},
};

export default function QuinkanAtlasLayout({children}: Readonly<{children: ReactNode}>) {
  return <div className="quinkan-root">{children}</div>;
}
