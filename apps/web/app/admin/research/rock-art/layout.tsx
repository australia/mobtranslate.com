import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Archivo, Fragment_Mono, STIX_Two_Text } from "next/font/google";
import "./rock-art.css";

const archivo = Archivo({
  subsets: ["latin"],
  variable: "--font-archivo",
  axes: ["wdth"],
});

const fragmentMono = Fragment_Mono({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-fragment",
});

const stix = STIX_Two_Text({
  subsets: ["latin"],
  variable: "--font-stix",
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: "Rock Art Image Analysis Workbench",
  description:
    "An instrument for the analysis of rock-art photography: decorrelation stretch, colour-channel arithmetic and reproducible enhancement recipes, computed entirely in the browser.",
  robots: { index: false, follow: false, nocache: true },
};

export default function RockArtLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className={`ra-root antialiased ${archivo.variable} ${fragmentMono.variable} ${stix.variable}`}>
      {children}
    </div>
  );
}
