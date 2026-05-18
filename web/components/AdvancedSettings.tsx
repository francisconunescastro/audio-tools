"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

// ---------------------------------------------------------------------------
// Advanced settings — behavioural knobs most users never need to touch.
// AdvancedState carries the whole settings payload (including SongInfo fields)
// because they share localStorage and submit together.
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

  // Melody (lead sheets)
  quantizeMelody: boolean;
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

  quantizeMelody: true,
};

const STRENGTH_OPTIONS: Array<[string, string]> = [
  ["1.0",  "Full lock — every beat snaps to grid"],
  ["0.75", "Mostly locked"],
  ["0.5",  "Half"],
  ["0.25", "Light touch"],
  ["0",    "No warp — leave timing as-is"],
];

const BEATS_PER_BAR_OPTIONS: Array<[string, string]> = [
  ["auto", "Auto-detect"],
  ["2",    "2"],
  ["3",    "3"],
  ["4",    "4"],
  ["6",    "6"],
];

const BARS_PER_LINE_OPTIONS: Array<[string, string]> = [
  ["2", "2"],
  ["3", "3"],
  ["4", "4 — default"],
  ["6", "6"],
  ["8", "8"],
];

const STEM_MODEL_OPTIONS: Array<[string, string]> = [
  ["htdemucs_6s", "htdemucs_6s — 6 stems (default)"],
  ["htdemucs",    "htdemucs — 4 stems, fastest"],
  ["htdemucs_ft", "htdemucs_ft — 4 stems, fine-tuned"],
  ["mdx_extra",   "mdx_extra — alternative"],
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
    <div className="bg-ivory border border-warm-100">
      {/* Toggle header */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-5 py-3 text-left"
      >
        <span className="font-inter text-[10px] font-medium uppercase tracking-[0.12em] text-[#888888]">
          Advanced settings
        </span>
        <span className="flex items-center gap-1.5 font-inter text-xs text-[#888888]">
          {open ? "Hide" : "Defaults work for most songs"}
          {open
            ? <ChevronDown size={14} strokeWidth={2} />
            : <ChevronRight size={14} strokeWidth={2} />}
        </span>
      </button>

      {open && (
        <fieldset disabled={disabled} className="px-5 pb-6 space-y-8 border-t border-warm-100">

          {/* Beat stabilization */}
          <Section
            title="Beat stabilization"
            intro="Warps the audio to an even tempo grid, then trims the intro to bar 1."
          >
            <Row>
              <SelectField
                label="Warp strength"
                value={value.strength}
                onChange={(v) => patch("strength", v)}
                options={STRENGTH_OPTIONS}
              />
              <SelectField
                label="Beats per bar (intro trim)"
                value={value.beatsPerBar}
                onChange={(v) => patch("beatsPerBar", v)}
                options={BEATS_PER_BAR_OPTIONS}
              />
            </Row>
            <Row>
              <Check label="Trim intro to one bar before beat 1" checked={value.trimIntro} onChange={(v) => patch("trimIntro", v)} />
              <Check label="Skip stabilization entirely" checked={value.skipStabilize} onChange={(v) => patch("skipStabilize", v)} />
            </Row>
            <Row>
              <Check
                label="Allow tempo change (skip the multi-tempo guard)"
                checked={value.allowTempoChange}
                onChange={(v) => patch("allowTempoChange", v)}
              />
            </Row>
            <Hint>
              By default, processing stops if a sustained tempo change is detected — a single-tempo
              warp would mangle audio across the boundary. Enable this to proceed anyway.
            </Hint>
          </Section>

          {/* Chord chart */}
          <Section
            title="Chord chart"
            intro="Detects chords and renders a PDF + MusicXML lead sheet with section markers."
          >
            <Row>
              <SelectField
                label="Bars per line"
                value={value.barsPerLine}
                onChange={(v) => patch("barsPerLine", v)}
                options={BARS_PER_LINE_OPTIONS}
              />
            </Row>

            <SubLabel>Chart display</SubLabel>
            <Row>
              <Check label="Hide BPM"   checked={value.noBpm}   onChange={(v) => patch("noBpm", v)} />
              <Check label="Hide key"   checked={value.noKey}   onChange={(v) => patch("noKey", v)} />
              <Check label="Hide meter" checked={value.noMeter} onChange={(v) => patch("noMeter", v)} />
            </Row>

            <SubLabel>Chord detection</SubLabel>
            <Row>
              <Check label="Keep 7th qualities (maj7, m7, dom7)" checked={value.add7th}          onChange={(v) => patch("add7th", v)} />
              <Check label="Secondary model for low-confidence bars"  checked={value.madmomFallback}   onChange={(v) => patch("madmomFallback", v)} />
            </Row>
            <Row>
              <Check label="Refine key using chord frequencies" checked={value.keyTiebreak}      onChange={(v) => patch("keyTiebreak", v)} />
              <Check label="Snap out-of-key chords to diatonic" checked={value.keySnap}          onChange={(v) => patch("keySnap", v)} />
            </Row>

            <SubLabel>Rhythm overrides</SubLabel>
            <Row>
              <Check label="Force half-time" checked={value.halfTime}     onChange={(v) => patch("halfTime", v)} />
              <Check label="Force 6/8 compound feel" checked={value.compound}      onChange={(v) => patch("compound", v)} />
            </Row>
            <Row>
              <Check label="Skip section detection (no A/B/C marks)" checked={value.skipSections} onChange={(v) => patch("skipSections", v)} />
            </Row>

            {/* Expert threshold knobs */}
            <ExpertKnobs>
              <Row>
                <NumberField label="Mid-bar split threshold (0–1)"   value={value.midBarThreshold}  onChange={(v) => patch("midBarThreshold", v)} />
                <NumberField label="Madmom fallback threshold (0–1)" value={value.madmomThreshold}  onChange={(v) => patch("madmomThreshold", v)} />
                <NumberField label="Key-snap threshold (0–1)"        value={value.keySnapThreshold} onChange={(v) => patch("keySnapThreshold", v)} />
              </Row>
              <Hint>
                Confidence thresholds. Only adjust if the chart consistently misfires on your music.
              </Hint>
            </ExpertKnobs>
          </Section>

          {/* Stems */}
          <Section
            title="Stems"
            intro="Splits the song into separate WAV tracks using Demucs."
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
              <Check label="Skip stems entirely (much faster)" checked={value.skipStems} onChange={(v) => patch("skipStems", v)} />
            </Row>

            <SubLabel>Stems to include in ZIP</SubLabel>
            <Row>
              <Check label="Vocals" checked={value.stemVocals} onChange={(v) => patch("stemVocals", v)} />
              <Check label="Drums"  checked={value.stemDrums}  onChange={(v) => patch("stemDrums", v)} />
              <Check label="Bass"   checked={value.stemBass}   onChange={(v) => patch("stemBass", v)} />
              <Check label="Guitar" checked={value.stemGuitar} onChange={(v) => patch("stemGuitar", v)} />
              <Check label="Piano"  checked={value.stemPiano}  onChange={(v) => patch("stemPiano", v)} />
              <Check label="Other"  checked={value.stemOther}  onChange={(v) => patch("stemOther", v)} />
            </Row>
            <Hint>
              All stems are produced regardless; unchecking one removes it from the ZIP only.
            </Hint>
          </Section>

        </fieldset>
      )}
    </div>
  );
}

// ---------- layout primitives ----------

function Section({ title, intro, children }: { title: string; intro: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3 pt-5">
      <div className="space-y-1">
        <p className="font-inter text-[10px] font-medium uppercase tracking-[0.12em] text-[#888888]">{title}</p>
        <p className="font-inter text-xs text-[#6D6D6D] leading-relaxed">{intro}</p>
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function SubLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-inter text-[10px] font-medium uppercase tracking-[0.12em] text-[#B0B0B0] pt-1">
      {children}
    </p>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap gap-x-5 gap-y-2 items-end">{children}</div>;
}

function Hint({ children }: { children: React.ReactNode }) {
  return <p className="font-inter text-xs text-[#888888] leading-relaxed">{children}</p>;
}

function ExpertKnobs({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="pt-1">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="font-inter text-xs text-[#888888] hover:text-[#454545] flex items-center gap-1 transition-colors"
      >
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        Expert tuning — confidence thresholds
      </button>
      {open && <div className="pt-3 space-y-2">{children}</div>}
    </div>
  );
}

// ---------- field primitives ----------

function NumberField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex flex-col gap-1 min-w-[160px] flex-1">
      <span className="font-inter text-[10px] font-medium uppercase tracking-[0.12em] text-[#888888]">{label}</span>
      <input
        type="number"
        step="0.05"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="font-season text-sm text-ebony bg-white border border-warm-200 px-2.5 py-2 outline-none focus:border-ebony transition-colors"
      />
    </label>
  );
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="inline-flex items-center gap-2 cursor-pointer font-season text-sm text-[#454545]">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="accent-ebony w-3.5 h-3.5"
      />
      <span>{label}</span>
    </label>
  );
}

function SelectField({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: Array<[string, string]> }) {
  return (
    <label className="flex flex-col gap-1 min-w-[200px] flex-1">
      <span className="font-inter text-[10px] font-medium uppercase tracking-[0.12em] text-[#888888]">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="font-season text-sm text-ebony bg-white border border-warm-200 px-2.5 py-2 outline-none focus:border-ebony transition-colors appearance-none"
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
    title:    a.title    || undefined,
    subtitle: a.subtitle || undefined,
    genre:    a.genre && a.genre !== "auto" ? a.genre : undefined,

    bpm:              num(a.bpm),
    strength:         num(a.strength),
    trimIntro:        a.trimIntro,
    beatsPerBar:      a.beatsPerBar === "auto" ? undefined : int(a.beatsPerBar),
    skipStabilize:    a.skipStabilize    || undefined,
    allowTempoChange: a.allowTempoChange || undefined,

    key:               a.key && a.key !== "auto" ? a.key : undefined,
    timeSig:           int(a.timeSig),
    barsPerLine:       int(a.barsPerLine),
    noBpm:             a.noBpm    || undefined,
    noKey:             a.noKey    || undefined,
    noMeter:           a.noMeter  || undefined,
    add7th:            a.add7th   || undefined,
    midBarThreshold:   num(a.midBarThreshold),
    madmomFallback:    a.madmomFallback,
    madmomThreshold:   num(a.madmomThreshold),
    keyTiebreak:       a.keyTiebreak  || undefined,
    keySnap:           a.keySnap      || undefined,
    keySnapThreshold:  num(a.keySnapThreshold),
    halfTime:          a.halfTime  || undefined,
    compound:          a.compound  || undefined,
    skipSections:      a.skipSections || undefined,

    skipStems:    a.skipStems || undefined,
    stems:        a.skipStems || allStems ? undefined : stems,
    stemModel:    a.stemModel,

    quantizeMelody: a.quantizeMelody ? undefined : false, // only send when off
  };
}
