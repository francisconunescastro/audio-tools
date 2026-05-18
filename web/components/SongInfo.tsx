"use client";

import type { AdvancedState } from "./AdvancedSettings";

// ---------------------------------------------------------------------------
// Song info — prominent metadata visible above the advanced panel.
// ---------------------------------------------------------------------------

export const KEY_OPTIONS: Array<[value: string, label: string]> = [
  ["auto",      "Auto-detect"],
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
      className="bg-ivory border border-warm-100 px-5 py-4 space-y-4"
    >
      {/* Header row */}
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-inter text-[10px] font-medium uppercase tracking-[0.12em] text-[#888888]">
          Song info
        </span>
        <span className="font-inter text-xs text-[#888888]">
          All optional — auto-detected if blank
        </span>
      </div>

      {/* Title + subtitle */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <TextField
          label="Title"
          placeholder="Filename will be used"
          value={value.title}
          onChange={(v) => patch("title", v)}
        />
        <TextField
          label="Subtitle"
          placeholder="Default: Meter · Key · BPM"
          value={value.subtitle}
          onChange={(v) => patch("subtitle", v)}
        />
      </div>

      {/* Musical metadata grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
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
    </fieldset>
  );
}

// ---------- field primitives ----------

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
      <span className="font-inter text-[10px] font-medium uppercase tracking-[0.12em] text-[#888888]">
        {label}
      </span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="font-season text-sm text-ebony bg-white border border-warm-200 px-2.5 py-2 placeholder:text-[#B0B0B0] focus:border-ebony transition-colors outline-none"
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
      <span className="font-inter text-[10px] font-medium uppercase tracking-[0.12em] text-[#888888]">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="font-season text-sm text-ebony bg-white border border-warm-200 px-2.5 py-2 focus:border-ebony transition-colors outline-none appearance-none"
      >
        {options.map(([v, l]) => (
          <option key={v} value={v}>{l}</option>
        ))}
      </select>
    </label>
  );
}
