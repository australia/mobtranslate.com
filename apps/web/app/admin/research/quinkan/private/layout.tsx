import type {Metadata} from "next";
import type {ReactNode} from "react";
import "./quinkan-private.css";

export const metadata: Metadata = {
  title: "Quinkan private field workspace",
  description: "Authenticated, authorization-bound research workspace.",
  robots: {index: false, follow: false, nocache: true},
  referrer: "no-referrer",
};

// Every private page and route repeats the full authorization check itself;
// this layout only scopes the private workspace styles.
export default function QuinkanPrivateLayout({children}: Readonly<{children: ReactNode}>) {
  return <div className="quinkan-private-root">{children}</div>;
}
