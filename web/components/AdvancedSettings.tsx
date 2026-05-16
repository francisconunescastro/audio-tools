"use client";

import { useState } from "react";

export type AdvancedState = {
  title: string;

  // Stabilizer
  bpm: string;
  strength: string;
  trimIntro: boolean;
  beatsPerBar: string;
  skipStabilize: boolean;

  // Chord chart
  key: string;
  timeSig: string;
  barsPerLine: string;
  noBpm: boolean;
  noKey: boolean;
  noMeter: boolean;
  subtitle: string;
  add7th: boolean;
  midBarThreshold: string;
  madmomFallback: boolean;
  madmomThreshold: string;
  keyTiebreak: boolean;
  keySnap: boolean;
  keySnapThreshold: string;
  halfTime: boolean;
  compound: boolean;

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
  bpm: "",
  strength: "1.0",
  trimIntro: true,
  beatsPerBar: "4",
  skipStabilize: false,

  key: "auto",
  timeSig: "",
  barsPerLine: "4",
  noBpm: false,
  noKey: false,
  noMeter: false,
  subtitle: "",
  add7th: false,
  midBarThreshold: "0.80",
  madmomFallback: true,
  madmomThreshold: "0.70",
  keyTiebreak: false,
  keySnap: false,
  keySnapThreshold: "0.65",
  halfTime: false,
  compound: false,

  skipStems: false,
  stemVocals: true,
  stemDrums: true,
  stemBass: true,
  stemGuitar: true,
  stemPiano: true,
  stemOther: true,
  stemModel: "htdemucs_6s",
};

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

      <fieldset disabled={disabled} className="px-4 pb-4 space-y-6 text-sm">
        <Section title="General">
          <Text  label="Title (chart heading)" placeholder="Filename" value={value.title} onChange={(v) => patch("title", v)} />
        </Section>

        <Section title="Beat stabilizer">
          <Row>
            <Text  label="BPM override" placeholder="auto" value={value.bpm} onChange={(v) => patch("bpm", v)} type="number" />
            <Text  label="Strength (0–1)" value={value.strength} onChange={(v) => patch("strength", v)} type="number" />
            <Text  label="Beats per bar" value={value.beatsPerBar} onChange={(v) => patch("beatsPerBar", v)} type="number" />
          </Row>
          <Row>
            <Check label="Trim intro to one bar before beat 1" checked={value.trimIntro} onChange={(v) => patch("trimIntro", v)} />
            <Check label="Skip stabilization" checked={value.skipStabilize} onChange={(v) => patch("skipStabilize", v)} />
          </Row>
        </Section>

        <Section title="Chord chart">
          <Row>
            <Text  label='Key (e.g. "c:major", "f:minor")' value={value.key} onChange={(v) => patch("key", v)} />
            <Text  label="Time signature (numerator)" placeholder="auto" value={value.timeSig} onChange={(v) => patch("timeSig", v)} type="number" />
            <Text  label="Bars per line" value={value.barsPerLine} onChange={(v) => patch("barsPerLine", v)} type="number" />
          </Row>
          <Row>
            <Check label="Hide BPM" checked={value.noBpm} onChange={(v) => patch("noBpm", v)} />
            <Check label="Hide key" checked={value.noKey} onChange={(v) => patch("noKey", v)} />
            <Check label="Hide meter" checked={value.noMeter} onChange={(v) => patch("noMeter", v)} />
          </Row>
          <Text label="Subtitle override (empty = default)" value={value.subtitle} onChange={(v) => patch("subtitle", v)} />
          <Row>
            <Check label="Add 7th chord qualities" checked={value.add7th} onChange={(v) => patch("add7th", v)} />
            <Check label="Madmom fallback on low-confidence bars" checked={value.madmomFallback} onChange={(v) => patch("madmomFallback", v)} />
            <Check label="Key tiebreak" checked={value.keyTiebreak} onChange={(v) => patch("keyTiebreak", v)} />
            <Check label="Key snap (non-diatonic → diatonic)" checked={value.keySnap} onChange={(v) => patch("keySnap", v)} />
          </Row>
          <Row>
            <Text label="Mid-bar threshold"   value={value.midBarThreshold}  onChange={(v) => patch("midBarThreshold", v)}  type="number" />
            <Text label="Madmom threshold"    value={value.madmomThreshold}  onChange={(v) => patch("madmomThreshold", v)}  type="number" />
            <Text label="Key-snap threshold"  value={value.keySnapThreshold} onChange={(v) => patch("keySnapThreshold", v)} type="number" />
          </Row>
          <Row>
            <Check label="Force half-time (every other beat)" checked={value.halfTime} onChange={(v) => patch("halfTime", v)} />
            <Check label="Force 6/8 (compound)" checked={value.compound} onChange={(v) => patch("compound", v)} />
          </Row>
        </Section>

        <Section title="Stem splitter">
          <Row>
            <Check label="Skip stems entirely (much faster)" checked={value.skipStems} onChange={(v) => patch("skipStems", v)} />
            <Select label="Model" value={value.stemModel} onChange={(v) => patch("stemModel", v)} options={[
              ["htdemucs_6s", "htdemucs_6s — 6 stems (default)"],
              ["htdemucs",    "htdemucs — 4 stems, faster"],
              ["htdemucs_ft", "htdemucs_ft — 4 stems, fine-tuned"],
              ["mdx_extra",   "mdx_extra — alt architecture"],
            ]} />
          </Row>
          <p className="text-xs text-neutral-500">Stems to keep (default: all)</p>
          <Row>
            <Check label="vocals" checked={value.stemVocals} onChange={(v) => patch("stemVocals", v)} />
            <Check label="drums"  checked={value.stemDrums}  onChange={(v) => patch("stemDrums", v)} />
            <Check label="bass"   checked={value.stemBass}   onChange={(v) => patch("stemBass", v)} />
            <Check label="guitar" checked={value.stemGuitar} onChange={(v) => patch("stemGuitar", v)} />
            <Check label="piano"  checked={value.stemPiano}  onChange={(v) => patch("stemPiano", v)} />
            <Check label="other"  checked={value.stemOther}  onChange={(v) => patch("stemOther", v)} />
          </Row>
        </Section>
      </fieldset>
    </details>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h3 className="text-xs uppercase tracking-wide text-neutral-500">{title}</h3>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap gap-3 items-end">{children}</div>;
}

function Text({ label, value, onChange, type = "text", placeholder }: {
  label: string; value: string; onChange: (v: string) => void;
  type?: "text" | "number"; placeholder?: string;
}) {
  return (
    <label className="flex flex-col gap-1 min-w-[180px] flex-1">
      <span className="text-xs text-neutral-600 dark:text-neutral-400">{label}</span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="px-2 py-1 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950"
      />
    </label>
  );
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="inline-flex items-center gap-2 cursor-pointer">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

function Select({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void;
  options: [string, string][];
}) {
  return (
    <label className="flex flex-col gap-1 min-w-[260px] flex-1">
      <span className="text-xs text-neutral-600 dark:text-neutral-400">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="px-2 py-1 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950"
      >
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  );
}

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

    bpm: num(a.bpm),
    strength: num(a.strength),
    trimIntro: a.trimIntro,
    beatsPerBar: int(a.beatsPerBar),
    skipStabilize: a.skipStabilize || undefined,

    key: a.key && a.key !== "auto" ? a.key : undefined,
    timeSig: int(a.timeSig),
    barsPerLine: int(a.barsPerLine),
    noBpm: a.noBpm || undefined,
    noKey: a.noKey || undefined,
    noMeter: a.noMeter || undefined,
    subtitle: a.subtitle || undefined,
    add7th: a.add7th || undefined,
    midBarThreshold: num(a.midBarThreshold),
    madmomFallback: a.madmomFallback,
    madmomThreshold: num(a.madmomThreshold),
    keyTiebreak: a.keyTiebreak || undefined,
    keySnap: a.keySnap || undefined,
    keySnapThreshold: num(a.keySnapThreshold),
    halfTime: a.halfTime || undefined,
    compound: a.compound || undefined,

    skipStems: a.skipStems || undefined,
    stems: a.skipStems || allStems ? undefined : stems,
    stemModel: a.stemModel,
  };
}
