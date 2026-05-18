import { z } from "zod";

export const MAX_BYTES = 50 * 1024 * 1024; // 50 MB
export const MAX_DURATION_SECONDS = 6 * 60;
export const ALLOWED_EXTENSIONS = new Set([".wav", ".mp3", ".m4a", ".aiff", ".aif", ".flac", ".ogg"]);

const stemOptions = ["vocals", "drums", "bass", "guitar", "piano", "other"] as const;

// Genre is captured as metadata on the job for now — the pipeline doesn't
// consume it yet. When the genre-aware chord vocabulary / harmony-guide work
// from the spec lands, this field is the hook point.
export const GENRE_OPTIONS = [
  "auto",
  "pop_rock",
  "folk",
  "jazz",
  "rnb",
  "funk",
  "country",
  "electronic",
  "classical",
] as const;

export const SettingsSchema = z.object({
  title: z.string().trim().max(200).optional(),
  openPdf: z.boolean().optional(),
  genre: z.enum(GENRE_OPTIONS).optional(),

  // Beat stabilizer
  bpm: z.number().positive().max(400).optional(),
  strength: z.number().min(0).max(1).optional(),
  trimIntro: z.boolean().optional(),
  beatsPerBar: z.number().int().min(2).max(12).optional(),
  skipStabilize: z.boolean().optional(),
  // Bypass the arrangement-level tempo-change guard. Default false — when a
  // sustained tempo shift is detected the pipeline stops with an EARLY_STOP
  // and the UI shows a dedicated error. Set true if you accept that the
  // warp will be musically wrong across the tempo boundary.
  allowTempoChange: z.boolean().optional(),

  // Chord chart
  key: z.string().trim().max(40).optional(),
  timeSig: z.number().int().min(2).max(12).optional(),
  barsPerLine: z.number().int().min(1).max(16).optional(),
  noBpm: z.boolean().optional(),
  noKey: z.boolean().optional(),
  noMeter: z.boolean().optional(),
  subtitle: z.string().max(200).optional(),
  add7th: z.boolean().optional(),
  midBarThreshold: z.number().min(0).max(1).optional(),
  madmomFallback: z.boolean().optional(),
  madmomThreshold: z.number().min(0).max(1).optional(),
  keyTiebreak: z.boolean().optional(),
  keySnap: z.boolean().optional(),
  keySnapThreshold: z.number().min(0).max(1).optional(),
  halfTime: z.boolean().optional(),
  compound: z.boolean().optional(),
  // Disable MSAF structural segmentation — no A/B/C rehearsal marks on the PDF
  // or in the MusicXML. Set this if MSAF mis-segments and the marks distract.
  skipSections: z.boolean().optional(),

  // Stems
  skipStems: z.boolean().optional(),
  stems: z.array(z.enum(stemOptions)).optional(),
  stemModel: z.enum(["htdemucs_6s", "htdemucs", "htdemucs_ft", "mdx_extra"]).optional(),
  sessionType: z.enum(["vocals", "guitar", "bass", "piano", "other"]).optional(),
});

export type Settings = z.infer<typeof SettingsSchema>;

export function extensionOf(filename: string): string {
  const i = filename.lastIndexOf(".");
  return i < 0 ? "" : filename.slice(i).toLowerCase();
}

export function sanitizeFilename(name: string): string {
  // Keep only safe chars; replace runs of unsafe ones with underscore.
  const base = name.replace(/[^A-Za-z0-9._-]+/g, "_");
  return base.replace(/^_+|_+$/g, "") || "input";
}

export function validateUpload(file: { name: string; size: number }):
  | { ok: true; ext: string }
  | { ok: false; status: 400; message: string } {
  const ext = extensionOf(file.name);
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return {
      ok: false,
      status: 400,
      message: `Unsupported file type "${ext || "(none)"}". Allowed: ${Array.from(ALLOWED_EXTENSIONS).join(", ")}.`,
    };
  }
  if (file.size > MAX_BYTES) {
    return {
      ok: false,
      status: 400,
      message: `File is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max is ${MAX_BYTES / 1024 / 1024} MB.`,
    };
  }
  return { ok: true, ext };
}
