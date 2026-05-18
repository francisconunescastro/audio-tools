"use client";

import { useState } from "react";

// ---------------------------------------------------------------------------
// Advanced settings — the second-tier knobs.
//
// Song-level metadata (title, subtitle, key, BPM, time signature, genre) is
// rendered separately by <SongInfo> above this panel. What lives here is the
// behavioural stuff most users never need to touch: warping strength, chord
// detection thresholds, stem model choice, etc.
//
// AdvancedState carries the whole settings payload (including SongInfo
// fields) because they share localStorage and submit together.
// ---------------------------------------------------------------------------

export type AdvancedState = {
  // Song info (edited by <SongInfo>)
  title: string;
  subtitle: string;
  bpm: string;
  key: string;
  timeSig: string;
  genre: string;

  // Beat stabilizer
  strength: string;
  trimIntro: boolean;
  beatsPerBar: string;
  skipStabilize: boolean;
  allowTempoChange: boolean;

  // Chord chart
  barsPerLine: string;
  noBpm: boolean;
  noKey: boolean;
  noMeter: boolean;
  add7th: boolean;
  midBarThreshold: string;
  madmomFallback: boolean;
  madmomThreshold: string;
  keyTiebreak: boolean;
  keySnap: boolean;
  keySnapThreshold: string;
  halfTime: boolean;
  compound: boolean;
  skipSections: boolean;

  // Stems
  skipStems: boolean;
  stemVocals: boolean;
  stemDrums: boolean;
  stemBass: boolean;
  stemGuitar: boolean;
  stemPiano: boolean;
  stemOther: boolean;
  stemModel: string;
};

export const DEFAULT_ADVANCED: AdvancedState = {
  title: "",
  subtitle: "",
  bpm: "",
  key: "auto",
  timeSig: "",
  genre: "auto",

  strength: "1.0",
  trimIntro: true,
  beatsPerBar: "auto",
  skipStabilize: false,
  allowTempoChange: false,

  barsPerLine: "4",
  noBpm: false,
  noKey: false,
  noMeter: false,
  add7th: false,
  midBarThreshold: "0.80",
  madmomFallback: true,
  madmomThreshold: "0.70",
  keyTiebreak: false,
  keySnap: false,
  keySnapThreshold: "0.65",
  halfTime: false,
  compound: false,
  skipSections: false,

  skipStems: false,
  stemVocals: true,
  stemDrums: true,
  stemBass: true,
  stemGuitar: true,
  stemPiano: true,
  stemOther: true,
  stemModel: "htdemucs_6s",
};

// Named presets for "Strength" — full lock by default, with reasonable middle
// grounds for songs you only want gently corrected.
const STRENGTH_OPTIONS: Array<[string, string]> = [
  ["1.0",  "Full lock — every beat snaps to grid (default)"],
  ["0.75", "Mostly locked — keep some original feel"],
  ["0.5",  "Half — split the difference"],
  ["0.25", "Light touch"],
  ["0",    "No warp — leave the audio alone"],
];

const BEATS_PER_BAR_OPTIONS: Array<[string, string]> = [
  ["auto", "Auto-detect from downbeats"],
  ["2",    "2"],
  ["3",    "3"],
  ["4",    "4 — most common"],
  ["6",    "6"],
];

const BARS_PER_LINE_OPTIONS: Array<[string, string]> = [
  ["2", "2 bars per line"],
  ["3", "3 bars per line"],
  ["4", "4 bars per line — default"],
  ["6", "6 bars per line"],
  ["8", "8 bars per line — denser"],
];

const STEM_MODEL_OPTIONS: Array<[string, string]> = [
  ["htdemucs_6s", "htdemucs_6s — 6 stems (vocals/drums/bass/guitar/piano/other)"],
  ["htdemucs",    "htdemucs — 4 stems, fastest"],
  ["htdemucs_ft", "htdemucs_ft — 4 stems, fine-tuned"],
  ["mdx_extra",   "mdx_extra — alternative model"],
];

type Props = {
  value: AdvancedState;
  onChange: (next: AdvancedState) => void;
  disabled?: boolean;
};

export function AdvancedSettings({ value, onChange, disabled }: Props) {
  const [open, setOpen] = useState(false);

  function patch<K extends keyof AdvancedState>(key: K, v: AdvancedState[K]) {
    onChange({ ...value, [key]: v });
  }

  return (
    <details
      className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900"
      open={open}
      onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
    >
      <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium">
        Advanced settings <span className="text-neutral-500">— defaults work for most songs</span>
      </summary>

      <fieldset disabled={disabled} className="px-4 pb-4 space-y-8 text-sm">

        <Section
          title="Beat stabilization"
          intro="Warps the audio so every beat lands on an even tempo grid — then trims it so bar 1 starts at the beginning. Drop the result into a DAW at the detected BPM and it lines up."
        >
          <Row>
            <SelectField
              label="Warp strength"
              value={value.strength}
              onChange={(v) => patch("strength", v)}
              options={STRENGTH_OPTIONS}
            />
            <SelectField
              label="Beats per bar (for intro trim)"
              value={value.beatsPerBar}
              onChange={(v) => patch("beatsPerBar", v)}
              options={BEATS_PER_BAR_OPTIONS}
            />
          </Row>
          <Row>
            <Check label="Trim intro to one bar before beat 1" checked={value.trimIntro} onChange={(v) => patch("trimIntro", v)} />
            <Check label="Skip stabilization entirely (keep original timing)" checked={value.skipStabilize} onChange={(v) => patch("skipStabilize", v)} />
          </Row>
          <Row>
            <Check
              label="Allow tempo change (skip the multi-tempo guard)"
              checked={value.allowTempoChange}
              onChange={(v) => patch("allowTempoChange", v)}
            />
          </Row>
          <Hint>
            By default we stop processing if the song has a sustained tempo change (e.g. a
            ballad section that bumps into a faster chorus), because the single-tempo warp
            would mangle the audio across the boundary. Turn this on if you want to proceed
            anyway and accept the imperfect warp.
          </Hint>
        </Section>

        <Section
          title="Chord chart"
          intro="Detects chords using two neural networks and renders them as a PDF + MusicXML lead sheet. Bars are grouped into A / B / C sections automatically."
        >
          <Row>
            <SelectField
              label="Bars per line"
              value={value.barsPerLine}
              onChange={(v) => patch("barsPerLine", v)}
              options={BARS_PER_LINE_OPTIONS}
            />
          </Row>

          <SubsectionTitle>Display on the chart</SubsectionTitle>
          <Row>
            <Check label="Hide BPM" checked={value.noBpm} onChange={(v) => patch("noBpm", v)} />
            <Check label="Hide key" checked={value.noKey} onChange={(v) => patch("noKey", v)} />
            <Check label="Hide meter" checked={value.noMeter} onChange={(v) => patch("noMeter", v)} />
          </Row>

          <SubsectionTitle>Chord detection behaviour</SubsectionTitle>
          <Row>
            <Check label="Keep 7th chord qualities (maj7, m7, dom7)" checked={value.add7th} onChange={(v) => patch("add7th", v)} />
            <Check label="Use the secondary model to correct low-confidence bars" checked={value.madmomFallback} onChange={(v) => patch("madmomFallback", v)} />
          </Row>
          <Row>
            <Check label="Refine the detected key using chord frequencies" checked={value.keyTiebreak} onChange={(v) => patch("keyTiebreak", v)} />
            <Check label="Snap out-of-key chords to the nearest diatonic chord" checked={value.keySnap} onChange={(v) => patch("keySnap", v)} />
          </Row>

          <SubsectionTitle>Rhythm overrides</SubsectionTitle>
          <Row>
            <Check label="Force half-time (every other beat is the real beat)" checked={value.halfTime} onChange={(v) => patch("halfTime", v)} />
            <Check label="Force 6/8 (compound triple feel)" checked={value.compound} onChange={(v) => patch("compound", v)} />
          </Row>
          <Row>
            <Check
              label="Skip section detection (no A/B/C rehearsal marks on the PDF)"
              checked={value.skipSections}
              onChange={(v) => patch("skipSections", v)}
            />
          </Row>

          <ExpertKnobs>
            <Row>
              <NumberField label="Mid-bar split threshold (0–1)"   value={value.midBarThreshold}  onChange={(v) => patch("midBarThreshold", v)}  />
              <NumberField label="Madmom fallback threshold (0–1)" value={value.madmomThreshold}  onChange={(v) => patch("madmomThreshold", v)}  />
              <NumberField label="Key-snap threshold (0–1)"        value={value.keySnapThreshold} onChange={(v) => patch("keySnapThreshold", v)} />
            </Row>
            <Hint>
              Confidence thresholds. Bars below these values are eligible for the corresponding
              correction step. Defaults are tuned for typical material — only adjust if the
              chart consistently misfires on your kind of music.
            </Hint>
          </ExpertKnobs>
        </Section>

        <Section
          title="Stems"
          intro="Splits the song into separate vocal / drum / bass / instrument tracks using Demucs. Each stem becomes its own WAV in the output ZIP."
        >
          <Row>
            <SelectField
              label="Demucs model"
              value={value.stemModel}
              onChange={(v) => patch("stemModel", v)}
              options={STEM_MODEL_OPTIONS}
            />
          </Row>
          <Row>
            <Check label="Skip stems entirely (much faster — saves several minutes)" checked={value.skipStems} onChange={(v) => patch("skipStems", v)} />
          </Row>

          <SubsectionTitle>Stems to keep</SubsectionTitle>
          <Row>
            <Check label="vocals" checked={value.stemVocals} onChange={(v) => patch("stemVocals", v)} />
            <Check label="drums"  checked={value.stemDrums}  onChange={(v) => patch("stemDrums", v)} />
            <Check label="bass"   checked={value.stemBass}   onChange={(v) => patch("stemBass", v)} />
            <Check label="guitar" checked={value.stemGuitar} onChange={(v) => patch("stemGuitar", v)} />
            <Check label="piano"  checked={value.stemPiano}  onChange={(v) => patch("stemPiano", v)} />
            <Check label="other"  checked={value.stemOther}  onChange={(v) => patch("stemOther", v)} />
          </Row>
          <Hint>
            All six stems are produced regardless, then we report which ones are actually
            present in the mix. Unchecking a stem here removes it from the ZIP.
          </Hint>
        </Section>
      </fieldset>
    </details>
  );
}

// ---------- field primitives ----------

function Section({
  title,
  intro,
  children,
}: {
  title: string;
  intro: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <h3 className="text-xs uppercase tracking-wide text-neutral-500 font-medium">{title}</h3>
        <p className="text-xs text-neutral-600 dark:text-neutral-400 leading-relaxed">{intro}</p>
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function SubsectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] uppercase tracking-wide text-neutral-400 font-medium pt-1">
      {children}
    </p>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap gap-x-4 gap-y-2 items-end">{children}</div>;
}

function Hint({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-neutral-500 leading-relaxed">{children}</p>;
}

// Inner collapsible for the three numeric thresholds — most users never touch
// these, so we hide them behind a second toggle inside the chord chart section.
function ExpertKnobs({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <details
      className="pt-1"
      open={open}
      onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
    >
      <summary className="cursor-pointer select-none text-xs text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300">
        Expert tuning (confidence thresholds)
      </summary>
      <div className="pt-3 space-y-2">{children}</div>
    </details>
  );
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1 min-w-[200px] flex-1">
      <span className="text-xs text-neutral-600 dark:text-neutral-400">{label}</span>
      <input
        type="number"
        step="0.05"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="px-2 py-1.5 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950"
      />
    </label>
  );
}

function Check({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="inline-flex items-center gap-2 cursor-pointer">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<[string, string]>;
}) {
  return (
    <label className="flex flex-col gap-1 min-w-[240px] flex-1">
      <span className="text-xs text-neutral-600 dark:text-neutral-400">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="px-2 py-1.5 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950"
      >
        {options.map(([v, l]) => (
          <option key={v} value={v}>{l}</option>
        ))}
      </select>
    </label>
  );
}

// ---------- payload mapping ----------

export function toSettingsPayload(a: AdvancedState) {
  const stems: string[] = [];
  if (a.stemVocals) stems.push("vocals");
  if (a.stemDrums)  stems.push("drums");
  if (a.stemBass)   stems.push("bass");
  if (a.stemGuitar) stems.push("guitar");
  if (a.stemPiano)  stems.push("piano");
  if (a.stemOther)  stems.push("other");
  const allStems = stems.length === 6;

  function num(v: string): number | undefined {
    const f = parseFloat(v);
    return Number.isFinite(f) ? f : undefined;
  }
  function int(v: string): number | undefined {
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : undefined;
  }

  return {
    title: a.title || undefined,
    subtitle: a.subtitle || undefined,
    // "auto" is the sentinel for "don't pin a genre"; treat it as absent.
    genre: a.genre && a.genre !== "auto" ? a.genre : undefined,

    bpm: num(a.bpm),
    strength: num(a.strength),
    trimIntro: a.trimIntro,
    // beatsPerBar uses "auto" sentinel for "let the downbeat tracker decide".
    beatsPerBar: a.beatsPerBar === "auto" ? undefined : int(a.beatsPerBar),
    skipStabilize: a.skipStabilize || undefined,
    allowTempoChange: a.allowTempoChange || undefined,

    key: a.key && a.key !== "auto" ? a.key : undefined,
    timeSig: int(a.timeSig),
    barsPerLine: int(a.barsPerLine),
    noBpm: a.noBpm || undefined,
    noKey: a.noKey || undefined,
    noMeter: a.noMeter || undefined,
    add7th: a.add7th || undefined,
    midBarThreshold: num(a.midBarThreshold),
    madmomFallback: a.madmomFallback,
    madmomThreshold: num(a.madmomThreshold),
    keyTiebreak: a.keyTiebreak || undefined,
    keySnap: a.keySnap || undefined,
    keySnapThreshold: num(a.keySnapThreshold),
    halfTime: a.halfTime || undefined,
    compound: a.compound || undefined,
    skipSections: a.skipSections || undefined,

    skipStems: a.skipStems || undefined,
    stems: a.skipStems || allStems ? undefined : stems,
    stemModel: a.stemModel,
  };
}
