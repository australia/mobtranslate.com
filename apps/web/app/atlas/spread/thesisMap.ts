// How each movement thesis reframes the deep-time map — HONESTLY.
//
// This is authored, per-thesis framing content (each card in data/atlas/theses.json
// carries a `map_expression` describing exactly what its map should do). It is NOT a
// classifier or a brittle synonym table — it is the map-side rendering of nine
// specific, sourced scholarly cards. The contract, per the atlas honesty rules:
//   - only Pama-Nyungan is DATED ("the wind"); no thesis fabricates a second animation;
//   - Dixon's dissent DISABLES the wind (freeze) rather than adding an arrow;
//   - every other lens pins its honest framing note (timing mismatch, language-not-people,
//     correlation-not-cause, later-overlay) over the same one Bouckaert backbone.

import type { SpreadThesisLens } from '../../spread/SpreadClient';

export type ThesisMapConfig = Omit<SpreadThesisLens, 'id'>;

export const THESIS_MAP: Record<string, ThesisMapConfig> = {
  'bayesian-gulf-expansion': {
    mode: 'wind',
    chip:
      'This thesis IS the animation — the dated Bouckaert relaxed-random-walk “wind” from the Gulf Plains root (~5,578 BP). Deep-node arrows (~0.06–0.09 posterior) are drawn faint on purpose.',
  },
  'archaeogenetics-people-stayed': {
    mode: 'wind',
    overlayNote:
      'Populations were continuous ~50–65,000 years; the only Holocene gene-flow signal (NE Australia) is small and undated. The language moved — the people (largely) did not. The wind never depicts people arriving.',
  },
  'demic-vs-shift-punctuated': {
    mode: 'wind',
    chip:
      'The wind is the object of study here: did bodies move (demic) or did tongues (language shift)? Deep genetic continuity tips the mainstream answer toward mostly shift, with a small NE-Australia demic component.',
  },
  'spread-without-farming': {
    mode: 'wind',
    overlayNote:
      'There is no farming front to draw — unlike Anatolia-into-Europe, this is a hunter-gatherer spread. Every stream is a language-lineage vector, never a demic/agricultural wave.',
  },
  'small-tool-backed-artefact-dingo': {
    mode: 'wind',
    overlayNote:
      'The dingo (~3.1–3.3 ka) and the backed-artefact peak (~3.5 ka) POSTDATE the ~5,578 BP root and are pan-Australian — correlates in the same window, not shown to travel with the Pama-Nyungan lineage.',
  },
  'enso-climate-driver': {
    mode: 'wind',
    overlayNote:
      'Climate is NOT time-calibrated to the tree. ENSO onset (~4.5–4 ka) POSTDATES the ~5,578 BP root, and the population curve invoked for it shows CONTRACTION in that window — shown as correlation, not demonstrated cause.',
  },
  'mcconvell-kinship-loanword-wave': {
    mode: 'wind',
    overlayNote:
      'Kinship and “skin”-system waves are a LATER late-Holocene overlay (~last 1–2 kyr) that crosses family boundaries — social diffusion overprinting the tree, explicitly NOT the Bouckaert dated backbone.',
  },
  'analogy-morphological-change': {
    mode: 'wind',
    overlayNote:
      'A different KIND of answer: analogy is HOW the word-forms and paradigms were reshaped as the family diversified — a change in the grammar, not a line on the map. The wind shows where the family spread; analogy is the form-change carried along it, and leaves no dated geographic signal.',
  },
  'dixon-family-tree-rejection': {
    mode: 'freeze',
    banner:
      'The tree itself is contested. This animation is ONE model (Bouckaert et al. 2018), not established fact — on Dixon’s view Pama-Nyungan is a diffusion area (a Sprachbund), not a dated migration. So this lens DISABLES the dated wind rather than drawing another arrow.',
  },
};

/** Resolve an active thesis id into the lens the map engine consumes. */
export function resolveThesisLens(id: string | null): SpreadThesisLens | null {
  if (!id) return null;
  const cfg = THESIS_MAP[id];
  if (!cfg) return null;
  return { id, ...cfg };
}

/** Short label for the lens/legend chips (kept honest + calm). */
export const LENS_HINT =
  'Selecting a thesis reframes the map honestly: the Bouckaert “wind” is the only dated layer, every lens pins its own caveat, and Dixon’s dissent switches the animation off.';
