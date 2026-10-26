import type { Metadata } from "next";
import Link from "next/link";
import {requireResearchAdminPage} from "@/lib/research/access";

export const metadata: Metadata = {
  title: "Case study: the damaged macropod — Rock Art Image Analysis Workbench",
  description:
    "A whole-figure completion hypothesis for a damaged kangaroo painting: sampled-pigment remnant, diffusion completion, per-pixel uncertainty, and an honest reading of what the model did and did not achieve.",
};

/* eslint-disable @next/next/no-img-element */
export default async function KangarooCase() {
  await requireResearchAdminPage();
  return (
    <main className="min-h-screen" style={{ fontFamily: "var(--font-serif)" }}>
      <header className="mx-auto flex max-w-4xl flex-wrap items-baseline justify-between gap-x-6 gap-y-2 px-5 pb-12 pt-6 sm:px-8">
        <Link href="/admin/research/rock-art" className="font-mono text-xs text-ra-ink-3 hover:text-ra-ink">
          ← rockpaintings.blah.dev
        </Link>
        <Link
          href="/admin/research/rock-art/workbench"
          className="border border-ra-line-strong px-3 py-1.5 font-mono text-xs text-ra-ink transition-colors hover:border-ra-ink"
        >
          open the workbench
        </Link>
      </header>

      <article className="mx-auto max-w-4xl px-5 sm:px-8">
        <p className="font-mono text-xs text-ra-ink-3">
          Case study · palimpsest interpretive engine v7 (known-layer conditioning, dropout-regularized) + remnant projection · updated 2026-08-20
        </p>
        <h1 className="mt-3 max-w-[26ch] text-[clamp(1.7rem,4.5vw,2.8rem)] font-semibold leading-[1.15] text-ra-ink">
          A damaged macropod, completed as a hypothesis
        </h1>

        <div className="mt-8 flex max-w-[68ch] flex-col gap-4 text-[1.02rem] leading-[1.75] text-ra-ink-2">
          <p>
            The panel below carries a large macropod in pale pigment, facing
            left: the body, tail and hind legs survive; the head, chest margin
            and forelegs are lost to surface damage on the left. It is a
            well-posed instance of the question this workbench&apos;s
            interpretive engine exists to answer —{" "}
            <em>what did the whole figure most plausibly look like, and where
            is any reconstruction guessing?</em>
          </p>
        </div>

        <figure className="mt-10">
          <img
            src="/api/admin/research/rock-art/case/kangaroo-original.jpg"
            alt="Photograph of a rock panel bearing a large pale macropod figure facing left; the head and foreleg region on the left is lost to surface damage"
            className="w-full border border-ra-line"
          />
          <figcaption className="mt-3 max-w-[75ch] text-sm leading-[1.65] text-ra-ink-3">
            <b className="text-ra-ink-2">Figure 1.</b> The full photograph,
            uncropped. Body mass, tapering tail (upper right) and hind legs
            survive; pigment dissolves into the damaged surface toward the
            left, where the head and forelegs belong. (An earlier revision of
            this analysis centre-cropped the frame and amputated part of that
            left zone — the reconstruction below uses the whole frame.)
          </figcaption>
        </figure>

        <section className="mt-14">
          <h2 className="text-xl font-semibold text-ra-ink">Method</h2>
          <div className="mt-3 flex max-w-[68ch] flex-col gap-4 leading-[1.75] text-ra-ink-2">
            <p>
              The figure&apos;s surviving pigment was selected by sampled-colour
              segmentation over the <em>entire uncropped frame</em> (Lab
              colour distance from sampled pigment; ~15% of the frame joins
              the remnant). That whole remnant then conditioned a diffusion
              completion model, sampled eight times; the per-pixel mean is the
              reconstruction and the per-pixel disagreement is its
              uncertainty. Non-square frames are reflection-padded rather than
              cropped, so no edge of the panel is excluded. The model (v6)
              learned restoration <em>self-supervised from this corpus&apos;
              own marks</em>: real pigment segments, composited onto real
              bare-rock texture and synthetically damaged, with the undamaged
              real layer as ground truth — no hand-designed shape vocabulary
              anywhere in the completion path, so nothing about the method is
              specific to known figure types.
            </p>
          </div>
        </section>

        <figure className="mt-10">
          <div className="overflow-x-auto">
            <img
              src="/api/admin/research/rock-art/case/kangaroo-analysis.jpg"
              alt="Four panels: the full frame, the completion overlaid, the added-pigment-only view, and the uncertainty map"
              className="w-full min-w-[720px] border border-ra-line"
            />
          </div>
          <figcaption className="mt-3 max-w-[75ch] text-sm leading-[1.65] text-ra-ink-3">
            <b className="text-ra-ink-2">Figure 2.</b> (a) the full frame;
            (b) the completion overlaid — the surviving remnant is
            mathematically preserved (RePaint-style projection clamps its true
            appearance during sampling, measured +86% completion accuracy on
            hidden regions; the v6 model additionally receives the remnant's
            layer appearance as input, worth a further +35% on hidden
            regions), so the reconstruction reads as the painting
            itself continuing into the damaged zone; (c) <em>only what the model added</em> (pale gold): interior
            healing plus the chest and foreleg-side extension — 47% of all
            additions lie in the left third, toward the damage (v6 heals more
            interior damage than v3 did, so proportionally more of its
            additions land inside the body); (d) the
            uncertainty map — the known body reads confidently dark while
            doubt concentrates along the boundary and the damaged left zone:
            the model marks its own inventions.
          </figcaption>
        </figure>

        <figure className="mt-10">
          <div className="overflow-x-auto">
            <img
              src="/api/admin/research/rock-art/case/kangaroo-zoom.jpg"
              alt="Zoom of the damaged head zone: original, completion, and uncertainty panels"
              className="w-full min-w-[720px] border border-ra-line"
            />
          </div>
          <figcaption className="mt-3 max-w-[75ch] text-sm leading-[1.65] text-ra-ink-3">
            <b className="text-ra-ink-2">Figure 3.</b> The damaged head zone,
            enlarged. The reconstruction follows the faint pale traces that
            genuinely survive on the rock and proposes the chest line and a
            head-side mass; the uncertainty panel shows exactly where the
            hypothesis leaves the evidence.
          </figcaption>
        </figure>

        <section className="mt-14">
          <h2 className="text-xl font-semibold text-ra-ink">Reading the result — honestly</h2>
          <div className="mt-3 flex max-w-[68ch] flex-col gap-4 leading-[1.75] text-ra-ink-2">
            <p>
              <b>What worked.</b> The figure is completed as a single animal:
              interior damage streaks are healed, the tail and legs are bound
              to the body, and the reconstruction extends into the damaged
              left side along surviving traces, proposing the chest line and a
              compact head-side mass — with the uncertainty map brightest
              precisely over those inventions. An earlier revision of this
              analysis failed to reach the head zone at all; the cause was
              embarrassingly literal — the pipeline&apos;s centre-crop had cut
              that part of the photograph out of the model&apos;s view.
            </p>
            <p>
              <b>What still falls short.</b> The head-side extension is a mass,
              not an articulated head with ears. On held-out panels the
              completion arc is measured, not felt: hidden-region overlap
              0.137 (v3 alone) → 0.255 (+remnant projection) → 0.272 (v6,
              which takes the surviving layer as input rather than
              re-deriving it) → 0.277 (v7) — doubled in three
              revisions — but inferring shape far beyond any surviving trace
              remains the open frontier. The model proposes <em>that</em> the
              figure continues leftward more confidently than <em>what
              exactly</em> it looked like — which is where an honest
              instrument should stop.
            </p>
            <p>
              <b>Why this is the right failure mode.</b> A tool that confidently
              paints a head with no surviving trace would be a hallucination
              engine. This one extends where evidence leads, abstains where it
              does not, and quantifies the difference.
            </p>
          </div>
        </section>

        <p className="mt-12 max-w-[68ch] border border-ra-red-deep bg-ra-red-deep/15 px-5 py-4 text-sm leading-[1.7] text-ra-ink-2">
          Everything on this page is a labelled <b>hypothesis</b> from an
          interpretive model — not evidence of what is on the rock, and not a
          restoration. The analytical record is the photograph. Rock art
          imagery may be culturally significant; this page is published by the
          photographer, and enhanced or reconstructed imagery of other sites
          should not be published without consulting their custodians.
        </p>

        <p className="mt-8 font-mono text-xs text-ra-ink-3">
          palimpsest v7 · trained on real pigment segments from this corpus
          (self-supervised, vocabulary-free) · decomposer step 87000 (256px) ·
          restorer step 320000 (128px, known-layer conditioned) · 8 samples ·
          40 DDIM steps · remnant projection · ΔE76 remnant selection
        </p>
      </article>

      <footer className="mx-auto mt-16 max-w-4xl border-t border-ra-line px-5 py-8 font-mono text-xs text-ra-ink-3 sm:px-8">
        <Link href="/admin/research/rock-art" className="hover:text-ra-ink">rockpaintings.blah.dev</Link> · try it on your own
        photograph in the <Link href="/admin/research/rock-art/workbench" className="text-ra-red-bright hover:underline">workbench</Link>
      </footer>
    </main>
  );
}
