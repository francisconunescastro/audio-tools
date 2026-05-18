"use client";

import type { AdvancedState } from "./AdvancedSettings";

// ---------------------------------------------------------------------------
// Song info — prominent metadata visible above the advanced panel.
//
// These are the headline knobs: the chart's title, subtitle, key, BPM, time
// signature, and (planned-feature) genre. Everything defaults to "auto" /
// "filename" so a user can leave them alone if they trust the detector.
// ---------------------------------------------------------------------------

// Major then minor, ordered by circle of fifths starting from C / Am.
// The value is the format chord_chart_render.py's --key flag expects.
export const KEY_OPTIONS: Array<[value: string, label: string]> = [
  ["auto",      "Auto-detect from audio"],
  // Major keys
  ["c:major",   "C major"],
  ["g:major",   "G major"],
  ["d:major",   "D major"],
  ["a:major",   "A major"],
  ["e:major",   "E major"],
  ["b:major",   "B major"],
  ["fis:major", "F♯ major"],
  ["des:major", "D♭ major"],
  ["aes:major", "A♭ major"],
  ["ees:major", "E♭ major"],
  ["bes:major", "B♭ major"],
  ["f:major",   "F major"],
  // Minor keys
  ["a:minor",   "A minor"],
  ["e:minor",   "E minor"],
  ["b:minor",   "B minor"],
  ["fis:minor", "F♯ minor"],
  ["cis:minor", "C♯ minor"],
  ["gis:minor", "G♯ minor"],
  ["ees:minor", "E♭ minor"],
  ["bes:minor", "B♭ minor"],
  ["f:minor",   "F minor"],
  ["c:minor",   "C minor"],
  ["g:minor",   "G minor"],
  ["d:minor",   "D minor"],
];

// User-visible time-signature choices. "6/8" maps to numerator=6 internally
// (chord_chart_render handles compound 6/8 when beats-per-bar arrives as 6).
export const TIME_SIG_OPTIONS: Array<[value: string, label: string]> = [
  ["auto", "Auto-detect"],
  ["2",    "2/4"],
  ["3",    "3/4"],
  ["4",    "4/4 — most common"],
  ["5",    "5/4"],
  ["6",    "6/8 — compound"],
];

export const GENRE_OPTIONS: Array<[value: string, label: string]> = [
  ["auto",       "Auto / unspecified"],
  ["pop_rock",   "Pop / Rock"],
  ["folk",       "Singer-songwriter / Folk"],
  ["jazz",       "Jazz"],
  ["rnb",        "R&B / Soul"],
  ["funk",       "Funk"],
  ["country",    "Country"],
  ["electronic", "Electronic / Hip-hop"],
  ["classical",  "Classical"],
];

type Props = {
  value: AdvancedState;
  onChange: (next: AdvancedState) => void;
  disabled?: boolean;
};

export function SongInfo({ value, onChange, disabled }: Props) {
  function patch<K extends keyof AdvancedState>(k: K, v: AdvancedState[K]) {
    onChange({ ...value, [k]: v });
  }

  return (
    <fieldset
      disabled={disabled}
      className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-4 py-4 space-y-4"
    >
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-medium">Song info</h2>
        <span className="text-xs text-neutral-500">All optional — auto-detected if blank</span>
      </div>
      <p className="text-xs text-neutral-500 -mt-2">
        These end up on the chord chart. The detector usually gets key, BPM, and meter right —
        override only if you know better, or to nudge a borderline case.
      </p>

      {/* Title spans the full width, subtitle below */}
      <div className="space-y-3">
        <TextField
          label="Title (chart heading)"
          placeholder="Filename will be used"
          value={value.title}
          onChange={(v) => patch("title", v)}
        />
        <TextField
          label="Subtitle override"
          placeholder="Default: Meter · Key · BPM"
          value={value.subtitle}
          onChange={(v) => patch("subtitle", v)}
        />
      </div>

      {/* Headline musical metadata: 4-up grid that wraps on narrow viewports */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SelectField
          label="Key"
          value={value.key}
          onChange={(v) => patch("key", v)}
          options={KEY_OPTIONS}
        />
        <TextField
          label="BPM"
          placeholder="auto"
          value={value.bpm}
          onChange={(v) => patch("bpm", v)}
          type="number"
        />
        <SelectField
          label="Time signature"
          value={value.timeSig || "auto"}
          onChange={(v) => patch("timeSig", v === "auto" ? "" : v)}
          options={TIME_SIG_OPTIONS}
        />
        <SelectField
          label="Genre"
          value={value.genre}
          onChange={(v) => patch("genre", v)}
          options={GENRE_OPTIONS}
        />
      </div>
      <p className="text-xs text-neutral-500 -mt-1">
        Genre is captured as metadata for now; future versions will tune chord vocabulary and
        harmony guides to the genre you pick.
      </p>
    </fieldset>
  );
}

// ---------- field primitives (local to this component, kept simple) ----------

function TextField({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: "text" | "number";
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-neutral-600 dark:text-neutral-400">{label}</span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="px-2 py-1.5 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950"
      />
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
    <label className="flex flex-col gap-1">
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
