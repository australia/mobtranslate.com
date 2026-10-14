'use client';
import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import {
  hexFromArgb,
  sourceColorFromImage,
} from '@material/material-color-utilities';
import { Button } from '@mobtranslate/ui';
import { CodeBlock } from '../components/code-block';
import {
  buildColorProposal,
  initialColorInput,
  validateColorInput,
  type ColorProposalInput,
} from '../lib/color-proposal';
import './color-proposal.css';
import fixture from '../public/fixtures/color-source.json';

export function ColorProposalExample() {
  const id = useId();
  const [draft, setDraft] = useState(initialColorInput);
  const [coordinates, setCoordinates] = useState({
    hue: '49',
    chroma: '45',
    tone: '50',
  });
  const [proposal, setProposal] = useState(() =>
    buildColorProposal(initialColorInput),
  );
  const [roleName, setRoleName] = useState('primary'),
    [paletteName, setPaletteName] = useState('primary');
  const [ready, setReady] = useState(false),
    [status, setStatus] = useState(
      'Initial proposal. Shared Earth tokens are unchanged.',
    );
  const [extracting, setExtracting] = useState(false);
  const image = useRef<HTMLImageElement>(null),
    sourceEpoch = useRef(0),
    extractingRef = useRef(false);
  useEffect(() => {
    setReady(true);
    return () => {
      sourceEpoch.current++;
    };
  }, []);
  const number = (value: string) => (value.trim() === '' ? NaN : Number(value));
  const input: ColorProposalInput = {
    ...draft,
    hue: number(coordinates.hue),
    chroma: number(coordinates.chroma),
    tone: number(coordinates.tone),
  };
  const errors = validateColorInput(input),
    valid = errors.length === 0;
  const role =
    proposal.roles.find((candidate) => candidate.name === roleName) ??
    proposal.roles[0];
  const palette =
    proposal.palettes.find((candidate) => candidate.name === paletteName) ??
    proposal.palettes[0];
  const capture = () => {
    if (!valid) return;
    const next = buildColorProposal(input);
    setProposal(next);
    setRoleName((current) =>
      next.roles.some((candidate) => candidate.name === current)
        ? current
        : next.roles[0].name,
    );
    setStatus(
      'Captured a local color proposal. No shared token, source record or publication changed.',
    );
  };
  const extract = async () => {
    if (extractingRef.current || !image.current) return;
    const token = sourceEpoch.current,
      fixture = image.current;
    extractingRef.current = true;
    setExtracting(true);
    setStatus(
      'Reading the original local fixture and selecting a seed with the SDK.',
    );
    try {
      await fixture.decode();
      const sourceHex = hexFromArgb(await sourceColorFromImage(fixture));
      if (token !== sourceEpoch.current) {
        setStatus(
          'Source settings changed while extracting. Your draft source was retained.',
        );
        return;
      }
      setDraft((current) => ({ ...current, sourceMode: 'hex', sourceHex }));
      setStatus(
        `SDK selected ${sourceHex} from the local four-band fixture. Capture explicitly to generate a proposal.`,
      );
    } catch {
      if (token === sourceEpoch.current)
        setStatus(
          'Fixture seed extraction failed. The draft source and captured proposal are retained.',
        );
    } finally {
      extractingRef.current = false;
      setExtracting(false);
    }
  };
  const previewStyle = {
    backgroundColor: proposal.preview.surface,
    color: proposal.preview.onSurface,
    '--color-background': proposal.preview.surface,
    '--color-foreground': proposal.preview.onSurface,
    '--color-muted-foreground': proposal.preview.onSurface,
    '--color-primary': proposal.preview.primary,
    '--color-primary-foreground': proposal.preview.onPrimary,
    '--color-primary-hover': proposal.preview.primary,
    '--color-primary-active': proposal.preview.primary,
    '--color-ring': proposal.preview.onSurface,
  } as CSSProperties;
  const css = `/* Material role namespace only; not a complete MobTranslate theme. */\n.generated-color-proposal {\n${proposal.roles.map((value) => `  --proposal-${value.name.replaceAll('_', '-')}: ${value.hex};`).join('\n')}\n}`;
  const realized = (value: number) => value.toFixed(3);
  return (
    <div className="color-proposal-example space-y-4" data-color-proposal-ready={ready}>
      <p>
        Generate a captured proposal with Material Color Utilities 0.4.0. The
        algorithm’s platform parameter is phone; it does not detect your device
        or read a wallpaper. Preview theme is independent of this page’s
        light/dark theme.
      </p>
      <div>
        <img
          ref={image}
          src="/fixtures/color-source.svg"
          width={fixture.width}
          height={fixture.height}
          alt={fixture.description}
        />
        <p>
          Original vector fixture: {fixture.width}×{fixture.height} pixels. Band specification: {fixture.bands.map(band=>`${band.width}×${fixture.height} ${band.hex}`).join('; ')}. It is not a source photograph or cultural asset.
        </p>
        <div className="color-proposal-actions">
          <Button
            type="button"
            variant="outline"
            disabled={!ready}
            aria-disabled={extracting || undefined}
            aria-busy={extracting}
            data-color-extract
            onClick={extract}
          >
            Extract seed from local fixture
          </Button>
        </div>
      </div>
      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="font-semibold mb-3">Draft source and scheme</legend>
        <label htmlFor={`${id}-source-mode`}>
          Source mode
          <select
            id={`${id}-source-mode`}
            data-color-input="sourceMode"
            className="mt-input mt-2 w-full"
            disabled={!ready}
            value={draft.sourceMode}
            onChange={(event) => {
              sourceEpoch.current++;
              const sourceMode = event.currentTarget
                .value as ColorProposalInput['sourceMode'];
              setDraft((current) => ({ ...current, sourceMode }));
            }}
          >
            <option value="hex">Opaque sRGB hex</option>
            <option value="hct">Requested HCT coordinates</option>
          </select>
        </label>
        {draft.sourceMode === 'hex' ? (
          <label htmlFor={`${id}-source`}>
            Source hex
            <input
              id={`${id}-source`}
              data-color-input="sourceHex"
              className="mt-input mt-2 w-full"
              spellCheck={false}
              disabled={!ready}
              value={draft.sourceHex}
              aria-invalid={!/^#[\da-f]{6}$/i.test(draft.sourceHex)}
              aria-describedby={`${id}-help ${id}-errors`}
              onChange={(event) => {
                sourceEpoch.current++;
                const sourceHex = event.currentTarget.value;
                setDraft((current) => ({ ...current, sourceHex }));
              }}
            />
          </label>
        ) : (
          <div className="grid gap-3">
            {(['hue', 'chroma', 'tone'] as const).map((key) => (
              <label htmlFor={`${id}-${key}`} key={key}>
                Requested {key}
                <input
                  id={`${id}-${key}`}
                  data-color-input={key}
                  type="number"
                  min="0"
                  max={key === 'hue' ? 360 : key === 'chroma' ? 150 : 100}
                  step="any"
                  className="mt-input mt-2 w-full"
                  disabled={!ready}
                  value={coordinates[key]}
                  aria-invalid={
                    !Number.isFinite(input[key]) ||
                    input[key] < 0 ||
                    input[key] >
                      (key === 'hue' ? 360 : key === 'chroma' ? 150 : 100)
                  }
                  aria-describedby={`${id}-help ${id}-errors`}
                  onChange={(event) => {
                    sourceEpoch.current++;
                    const value = event.currentTarget.value;
                    setCoordinates((current) => ({ ...current, [key]: value }));
                  }}
                />
              </label>
            ))}
          </div>
        )}
        <label htmlFor={`${id}-variant`}>
          Scheme variant
          <select
            id={`${id}-variant`}
            data-color-input="variant"
            className="mt-input mt-2 w-full"
            disabled={!ready}
            value={draft.variant}
            onChange={(event) => {
              const variant = event.currentTarget
                .value as ColorProposalInput['variant'];
              setDraft((current) => ({ ...current, variant }));
            }}
          >
            <option value="tonal">Tonal spot</option>
            <option value="expressive">Expressive</option>
            <option value="fidelity">Fidelity</option>
          </select>
        </label>
        <label htmlFor={`${id}-spec`}>
          Requested specification
          <select
            id={`${id}-spec`}
            data-color-input="specVersion"
            className="mt-input mt-2 w-full"
            disabled={!ready}
            value={draft.specVersion}
            onChange={(event) => {
              const specVersion = event.currentTarget
                .value as ColorProposalInput['specVersion'];
              setDraft((current) => ({ ...current, specVersion }));
            }}
          >
            <option value="2025">2025</option>
            <option value="2021">2021</option>
          </select>
        </label>
        <label htmlFor={`${id}-contrast`}>
          Contrast level
          <select
            id={`${id}-contrast`}
            data-color-input="contrastLevel"
            className="mt-input mt-2 w-full"
            disabled={!ready}
            value={draft.contrastLevel}
            onChange={(event) => {
              const contrastLevel = Number(event.currentTarget.value);
              setDraft((current) => ({ ...current, contrastLevel }));
            }}
          >
            <option value="0">Standard (0)</option>
            <option value="0.5">Medium (0.5)</option>
            <option value="1">High (1)</option>
            <option value="-1">Low, experimental (−1)</option>
          </select>
        </label>
        <label className="flex items-center gap-3 min-h-11">
          <input
            data-color-input="isDark"
            type="checkbox"
            disabled={!ready}
            checked={draft.isDark}
            onChange={(event) => {
              const isDark = event.currentTarget.checked;
              setDraft((current) => ({ ...current, isDark }));
            }}
          />
          Generate a dark proposal
        </label>
        <label htmlFor={`${id}-custom`}>
          Custom color hex
          <input
            id={`${id}-custom`}
            data-color-input="customHex"
            className="mt-input mt-2 w-full"
            spellCheck={false}
            disabled={!ready}
            value={draft.customHex}
            aria-invalid={!/^#[\da-f]{6}$/i.test(draft.customHex)}
            aria-describedby={`${id}-help ${id}-errors`}
            onChange={(event) => {
              const customHex = event.currentTarget.value;
              setDraft((current) => ({ ...current, customHex }));
            }}
          />
        </label>
        <label className="flex items-center gap-3 min-h-11">
          <input
            data-color-input="harmonize"
            type="checkbox"
            disabled={!ready}
            checked={draft.harmonize}
            onChange={(event) => {
              const harmonize = event.currentTarget.checked;
              setDraft((current) => ({ ...current, harmonize }));
            }}
          />
          Harmonize this custom color toward the source
        </label>
      </fieldset>
      <p id={`${id}-help`}>
        Hex colors must use #RRGGBB. Requested hue is 0–360°, chroma 0–150 and
        tone 0–100. The sRGB gamut can reduce realized chroma; HCT is not HSL.
        Custom-color harmonization does not rewrite the generated semantic
        roles.
      </p>
      <p id={`${id}-errors`} data-color-errors>
        {valid
          ? 'Draft settings are valid; capture to apply them to the local proposal.'
          : errors.join(' ')}
      </p>
      <div className="color-proposal-actions">
        <Button
          type="button"
          data-color-capture
          disabled={!ready || !valid}
          onClick={capture}
        >
          Capture color proposal
        </Button>
      </div>
      <p role="status" data-color-status>
        {status}
      </p>
      <dl className="grid gap-3 sm:grid-cols-2" data-color-captured>
        <div>
          <dt>Captured variant/theme/contrast</dt>
          <dd>
            {proposal.input.variant}; {proposal.input.isDark ? 'dark' : 'light'}
            ; {proposal.input.contrastLevel}
          </dd>
        </div>
        <div>
          <dt>Requested → effective specification</dt>
          <dd data-color-spec>
            {proposal.requestedSpec} → {proposal.effectiveSpec}
          </dd>
        </div>
        <div>
          <dt>Realized source</dt>
          <dd data-color-source>{proposal.source.hex}</dd>
        </div>
        <div>
          <dt>Realized hue/chroma/tone</dt>
          <dd data-color-realized>
            {realized(proposal.source.hue)} / {realized(proposal.source.chroma)}{' '}
            / {realized(proposal.source.tone)}
          </dd>
        </div>
        <div>
          <dt>Captured custom color</dt>
          <dd data-color-custom>
            {proposal.custom.original.hex} → {proposal.custom.result.hex};
            harmonization {proposal.custom.harmonized ? 'enabled' : 'disabled'}
          </dd>
        </div>
        <div>
          <dt>Available role values</dt>
          <dd>
            {proposal.roles.length}, derived from the SDK’s current allColors
            collection
          </dd>
        </div>
      </dl>
      {proposal.input.requestedHct && (
        <p>
          Requested HCT: {proposal.input.requestedHct.hue} /{' '}
          {proposal.input.requestedHct.chroma} /{' '}
          {proposal.input.requestedHct.tone}. Compare the realized coordinates
          above; the request is not an achieved-gamut guarantee.
        </p>
      )}
      <p>
        SDK fallback is explicit. Some variants resolve a requested 2025 scheme
        through 2021 rules. A specification/variant name is not a conformance or
        contrast certificate.
      </p>
      {proposal.safePreview ? (
        <div
          data-color-preview
          className="color-proposal-preview"
          style={previewStyle}
        >
          <h3 className="font-semibold">Scoped action specimen</h3>
          <p>
            Only this surface and action use the captured role pairs.
            Hover/pressed keep the same fill here; a full state system needs
            additional design and verification.
          </p>
          <Button
            type="button"
            onClick={() =>
              setStatus(
                'Proposal action activated locally. The shared Earth theme and source records are unchanged.',
              )
            }
          >
            Activate proposal action
          </Button>
        </div>
      ) : (
        <p data-color-preview-suppressed>
          Text/action specimen suppressed: at least one proposed opaque text
          pair is below 4.5:1. All role values and measurements remain available
          in the neutral interface.
        </p>
      )}
      <label htmlFor={`${id}-role`}>
        Inspect a captured role
        <select
          id={`${id}-role`}
          data-color-role-select
          className="mt-input mt-2 w-full"
          value={role.name}
          onChange={(event) => setRoleName(event.currentTarget.value)}
        >
          {proposal.roles.map((value) => (
            <option key={value.name} value={value.name}>
              {value.name}
            </option>
          ))}
        </select>
      </label>
      <div data-color-role-detail>
        <p className="font-semibold">
          {role.name}: {role.hex}; realized tone {realized(role.tone)}
        </p>
        <span
          className="color-proposal-swatch"
          aria-hidden="true"
          style={{ backgroundColor: role.hex }}
        />
        <p>
          SDK background classification:{' '}
          {role.isBackground ? 'background' : 'not background'}. SDK
          contrast-curve target: {role.sdkTarget ?? 'not declared'}.
        </p>
        {role.backgrounds.length ? (
          <ul className="guidance-list">
            {role.backgrounds.map((background) => (
              <li key={background.name}>
                {background.name} ({background.hex}):{' '}
                {background.ratio.toFixed(3)}:1. AA normal-text threshold:{' '}
                {background.ratio >= 4.5 ? 'passes' : 'fails'}; 3:1 comparison:{' '}
                {background.ratio >= 3 ? 'passes' : 'fails'}.
              </li>
            ))}
          </ul>
        ) : (
          <p>
            No background relationship is declared for this role. The explorer
            does not invent a text pairing.
          </p>
        )}
      </div>
      <div
        className="doc-table"
        role="region"
        tabIndex={0}
        aria-label="Generated roles and declared background contrast"
      >
        <table>
          <thead>
            <tr>
              <th scope="col">Role</th>
              <th scope="col">Hex</th>
              <th scope="col">Declared backgrounds and ratios</th>
            </tr>
          </thead>
          <tbody>
            {proposal.roles.map((value) => (
              <tr key={value.name}>
                <th scope="row">{value.name}</th>
                <td>{value.hex}</td>
                <td>
                  {value.backgrounds.length
                    ? value.backgrounds
                        .map(
                          (background) =>
                            `${background.name}: ${background.ratio.toFixed(3)}:1`,
                        )
                        .join('; ')
                    : 'No declared pairing'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <label htmlFor={`${id}-palette`}>
        Inspect a captured tonal palette
        <select
          id={`${id}-palette`}
          data-color-palette-select
          className="mt-input mt-2 w-full"
          value={palette.name}
          onChange={(event) => setPaletteName(event.currentTarget.value)}
        >
          {proposal.palettes.map((value) => (
            <option key={value.name} value={value.name}>
              {value.name}
            </option>
          ))}
        </select>
      </label>
      <p>
        Palette key color: {palette.keyColor.hex}; realized HCT{' '}
        {realized(palette.keyColor.hue)} / {realized(palette.keyColor.chroma)} /{' '}
        {realized(palette.keyColor.tone)}.
      </p>
      <div
        className="doc-table"
        role="region"
        tabIndex={0}
        aria-label="Captured tonal palette"
      >
        <table>
          <thead>
            <tr>
              <th scope="col">Requested tone</th>
              <th scope="col">Realized hex/tone/chroma</th>
              <th scope="col">Swatch</th>
            </tr>
          </thead>
          <tbody>
            {palette.tones.map((value) => (
              <tr key={value.requestedTone}>
                <th scope="row">{value.requestedTone}</th>
                <td>
                  {value.hex}; {realized(value.tone)}; {realized(value.chroma)}
                </td>
                <td>
                  <span
                    className="color-proposal-swatch"
                    aria-hidden="true"
                    style={{ backgroundColor: value.hex }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <details data-color-full>
        <summary className="min-h-11 cursor-pointer">
          Full captured request, roles, palettes and custom color
        </summary>
        <CodeBlock language="json" code={JSON.stringify(proposal, null, 2)} />
      </details>
      <details>
        <summary className="min-h-11 cursor-pointer">
          Role namespace CSS export
        </summary>
        <CodeBlock language="css" code={css} />
      </details>
      <p className="text-sm">
        All measurements use opaque sRGB role values. They do not cover
        overlays, every interaction state, color perception or cultural
        authority. Extraction reads only the original local fixture; wallpaper,
        browser personal color and remote source records are not read.
      </p>
    </div>
  );
}
