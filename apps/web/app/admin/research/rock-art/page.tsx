import Link from "next/link";
import DemoStretch from "@/components/research/rock-art/DemoStretch";
import {requireResearchAdminPage} from "@/lib/research/access";

const CAPABILITIES: [string, string][] = [
  [
    "Global decorrelation stretch",
    "Computed in CIELAB, sRGB, linear RGB or YCbCr from a covariance or correlation matrix, with continuous strength, an eigenvalue floor, a gain ceiling and percentile output mapping. The eigenvalues, component gains, condition number and full transform matrix are displayed alongside the result.",
  ],
  [
    "Region-derived statistics",
    "A rectangular region restricts the statistical estimate to the pixels that matter — a painted area, a clean patch of substrate — while the resulting transform is applied to the entire photograph.",
  ],
  [
    "Channel arithmetic",
    "Individual channels from Lab, YCbCr, HSV and linear RGB, and a typed expression language over them (R − G, log ratios, chromaticity indices) that is parsed and validated, with divide-by-zero protection and percentile normalisation.",
  ],
  [
    "Comparison",
    "The original is always one held key away. A draggable split divider and an alternating blink mode support the visual discrimination that this class of enhancement requires.",
  ],
  [
    "Reproducible export",
    "Full-resolution PNG export together with a recipe file recording the source's SHA-256, every parameter, the realised transform matrix and the engine version — sufficient to reproduce the derivative exactly, or to apply the identical transform to another photograph in a sequence.",
  ],
  [
    "Palimpsest decomposition (beta)",
    "An interpretive ML engine — trained purely on synthetic panels — proposes figure hypotheses through superimposition: visible-remnant and full-extent (amodal) masks, a condition diagnosis (faded, spalled, rubbed, lichen, occluded, unfinished), an automated Harris superimposition ordering, and diffusion-sampled completions carrying per-pixel uncertainty. Unlike everything above, this opt-in tab sends the photograph to this site's own server; outputs are labelled hypotheses, never evidence.",
  ],
];

const REFERENCES: { id: string; text: string; href?: string }[] = [
  {
    id: "gillespie1986",
    text: "Gillespie, A. R., Kahle, A. B. & Walker, R. E. 1986. Color enhancement of highly correlated images. I. Decorrelation and HSI contrast stretches. Remote Sensing of Environment 20 (3): 209–235.",
  },
  {
    id: "harman2005",
    text: "Harman, J. 2005 (rev. 2008). Using decorrelation stretch to enhance rock art images. Paper presented at the American Rock Art Research Association Annual Meeting. DStretch remains the reference implementation for the discipline.",
    href: "https://www.dstretch.com/",
  },
  {
    id: "lequellec2015",
    text: "Le Quellec, J.-L., Duquesnoy, F. & Defrasne, C. 2015. Digital image enhancement with DStretch®: Is complexity always necessary for efficiency? Digital Applications in Archaeology and Cultural Heritage 2 (2–3): 55–67.",
  },
];

export default async function Home() {
  await requireResearchAdminPage();
  return (
    <main className="min-h-screen" style={{ fontFamily: "var(--font-serif)" }}>
      {/* Running head */}
      <header className="mx-auto flex max-w-4xl flex-wrap items-baseline justify-between gap-x-6 gap-y-2 px-5 pb-14 pt-6 sm:px-8">
        <span className="font-mono text-xs text-ra-ink-3">rockpaintings.blah.dev</span>
        <nav className="flex items-baseline gap-5 font-mono text-xs text-ra-ink-2">
          <Link href="/admin/research/rock-art/case/kangaroo" className="hover:text-ra-ink">
            case study
          </Link>
          <a href="#method" className="hover:text-ra-ink">
            method
          </a>
          <a href="#capabilities" className="hover:text-ra-ink">
            capabilities
          </a>
          <a href="#references" className="hover:text-ra-ink">
            references
          </a>
          <Link
            href="/admin/research/rock-art/workbench"
            className="border border-ra-line-strong px-3 py-1.5 text-ra-ink transition-colors hover:border-ra-ink"
          >
            open the workbench
          </Link>
        </nav>
      </header>

      {/* Title block */}
      <section className="mx-auto max-w-4xl px-5 sm:px-8">
        <p className="font-mono text-xs text-ra-ink-3">
          Browser edition v0.1 · engine 0.1.0 · analytical pipeline fully
          in-browser · optional ML analysis on this site&apos;s own server
        </p>
        <h1 className="mt-4 max-w-[24ch] text-[clamp(2rem,5vw,3.4rem)] font-semibold leading-[1.12] text-ra-ink">
          Rock Art Image Analysis Workbench
        </h1>

        <div className="mt-10 grid gap-x-10 gap-y-3 sm:grid-cols-[7rem_1fr]">
          <span className="pt-1 font-mono text-xs text-ra-ink-3">Abstract</span>
          <div className="flex max-w-[68ch] flex-col gap-4 text-[1.05rem] leading-[1.75] text-ra-ink-2">
            <p>
              Painted marks on rock are frequently invisible, or nearly so, in
              ordinary photographs: pigment fades, substrate colour varies, and
              illumination is uneven. Their recovery is a problem of colour
              statistics, not of restoration. This workbench implements the
              standard analytical methods — decorrelation stretch after
              Gillespie et&nbsp;al. [1], as established for rock art by Harman's
              DStretch [2] — together with colour-channel arithmetic, split and
              blink comparison, and reproducible processing recipes.
            </p>
            <p>
              Every analytical operation is a deterministic, inspectable
              transformation of the recorded pixels. Nothing is generated or
              inpainted; a figure that appears under the stretch was present in
              the photograph. The analytical pipeline runs entirely in the
              browser — photographs are decoded, hashed and analysed locally
              and originals are never modified. One clearly-marked exception:
              the optional <em>palimpsest</em> tab sends the image to this
              site&apos;s own server for ML inference (processed in memory, not
              retained), and everything it returns is labelled hypothesis, not
              evidence.
            </p>
          </div>
        </div>
      </section>

      {/* Figure 1 */}
      <section className="mx-auto mt-14 max-w-4xl px-5 sm:px-8">
        <DemoStretch />
        <div className="mt-8 flex flex-wrap items-baseline gap-4">
          <Link
            href="/admin/research/rock-art/workbench"
            className="border border-ra-red bg-ra-red-deep/30 px-4 py-2.5 text-sm text-ra-ink transition-colors hover:bg-ra-red-deep/60"
          >
            Open the workbench
          </Link>
          <span className="font-mono text-xs text-ra-ink-3">
            works on your own photographs, or on the panel of Figure&nbsp;1
          </span>
        </div>
      </section>

      {/* Method */}
      <section id="method" className="mx-auto mt-20 max-w-4xl px-5 sm:px-8">
        <h2 className="text-xl font-semibold text-ra-ink">1 · Method</h2>
        <div className="mt-4 flex max-w-[68ch] flex-col gap-4 leading-[1.75] text-ra-ink-2">
          <p>
            Let <i>X</i> be the pixels of the photograph (or of a selected
            region) expressed in a chosen colour space. From their mean μ and
            covariance <i>C</i> = <i>V</i>Λ<i>V</i><sup>T</sup>, the engine
            constructs a variance-equalising transform and blends it with the
            identity under a continuous strength α:
          </p>
          <div className="overflow-x-auto border border-ra-line bg-ra-bg-deep px-5 py-4 font-mono text-sm leading-loose text-ra-ink">
            T &nbsp;=&nbsp; V&thinsp;·&thinsp;diag(&thinsp;s<sub>i</sub> / √(λ
            <sub>i</sub> + ε)&thinsp;)&thinsp;·&thinsp;V<sup>T</sup>
            <br />
            y &nbsp;=&nbsp; μ + (x − μ)&thinsp;·&thinsp;((1 − α)&thinsp;I + α
            &thinsp;T)
          </div>
          <p>
            with an eigenvalue floor ε and a bound on the per-component gain
            protecting against ill-conditioned statistics. The result is mapped
            to the display range by percentile clipping. Interactive preview
            runs on a ≤2.2-megapixel pyramid level; export replays the
            <em> identical transform matrix</em> over the full-resolution
            pixels, so preview and derivative are mathematically the same
            operation, and the matrix itself is preserved in the recipe for
            reuse across a photographic sequence.
          </p>
          <p>
            The output is a false-colour analytical image. It is to be read as
            evidence of colour separation, not as a picture of the panel — which
            is why the original is kept one held key away at all times.
          </p>
        </div>
      </section>

      {/* Capabilities */}
      <section id="capabilities" className="mx-auto mt-20 max-w-4xl px-5 sm:px-8">
        <h2 className="text-xl font-semibold text-ra-ink">2 · Capabilities</h2>
        <dl className="mt-6 divide-y divide-ra-line border-y border-ra-line">
          {CAPABILITIES.map(([name, detail]) => (
            <div key={name} className="grid gap-2 py-5 sm:grid-cols-[14rem_1fr] sm:gap-8">
              <dt className="font-semibold text-ra-ink">{name}</dt>
              <dd className="max-w-[68ch] text-[0.95rem] leading-[1.7] text-ra-ink-2">
                {detail}
              </dd>
            </div>
          ))}
        </dl>
        <p className="mt-5 max-w-[68ch] font-mono text-xs leading-relaxed text-ra-ink-3">
          Planned, following the programme's full requirements document:
          localised (windowed) decorrelation stretch, PCA and ICA, illumination
          correction, candidate-pigment probability masks, annotation layers,
          image registration, collection-scale batch processing, and in-browser
          (ONNX) palimpsest inference to retire the server exception.
        </p>
      </section>

      {/* Principles */}
      <section className="mx-auto mt-20 max-w-4xl px-5 sm:px-8">
        <h2 className="text-xl font-semibold text-ra-ink">3 · Operating principles</h2>
        <div className="mt-6 max-w-[68ch] border border-ra-red-deep bg-ra-red-deep/15 px-6 py-5">
          <ul className="flex flex-col gap-3 leading-[1.7] text-ra-ink-2">
            <li>
              <b className="text-ra-ink">Originals are immutable.</b> Every result
              is a derivative; the source file is read once, hashed, and never
              written.
            </li>
            <li>
              <b className="text-ra-ink">Every result is reproducible.</b> A
              derivative without its recipe is an opinion; exports carry the
              parameters, the realised matrix and the engine version.
            </li>
            <li>
              <b className="text-ra-ink">Enhancement is not reconstruction.</b>{" "}
              No generative model touches the analytical pipeline.
            </li>
            <li>
              <b className="text-ra-ink">Parameters remain inspectable.</b>{" "}
              Presets are named parameter sets and resolve to visible controls.
            </li>
            <li>
              <b className="text-ra-ink">Offline by design.</b> No accounts, no
              telemetry, no cloud processing.
            </li>
          </ul>
        </div>
      </section>

      {/* References */}
      <section id="references" className="mx-auto mt-20 max-w-4xl px-5 sm:px-8">
        <h2 className="text-xl font-semibold text-ra-ink">References</h2>
        <ol className="mt-5 flex max-w-[75ch] flex-col gap-3">
          {REFERENCES.map((r, i) => (
            <li
              key={r.id}
              className="grid grid-cols-[2rem_1fr] gap-2 text-[0.95rem] leading-[1.7] text-ra-ink-2"
            >
              <span className="font-mono text-xs leading-[1.9] text-ra-ink-3">
                [{i + 1}]
              </span>
              <span>
                {r.text}
                {r.href && (
                  <>
                    {" "}
                    <a
                      href={r.href}
                      className="font-mono text-xs text-ra-red-bright underline decoration-ra-red-deep underline-offset-4 hover:decoration-ra-red-bright"
                      rel="noopener noreferrer"
                      target="_blank"
                    >
                      dstretch.com
                    </a>
                  </>
                )}
              </span>
            </li>
          ))}
        </ol>
      </section>

      <footer className="mx-auto mt-20 flex max-w-4xl flex-col gap-2 border-t border-ra-line px-5 py-8 font-mono text-xs leading-relaxed text-ra-ink-3 sm:px-8">
        <span>
          Respect country and culture. Rock art imagery may be restricted under
          the law and custom of its custodians; consult them before publishing
          enhanced images of sites. The panel of Figure&nbsp;1 is synthetic for
          exactly this reason.
        </span>
        <span>rockpaintings.blah.dev · browser edition v0.1 · all processing local</span>
      </footer>
    </main>
  );
}
