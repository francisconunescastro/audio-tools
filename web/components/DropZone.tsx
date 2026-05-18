"use client";

import { useDropzone } from "react-dropzone";
import { useCallback } from "react";
import { Music, X } from "lucide-react";

const ACCEPT = {
  "audio/wav":  [".wav"],
  "audio/mpeg": [".mp3"],
  "audio/mp4":  [".m4a"],
  "audio/aiff": [".aiff", ".aif"],
  "audio/flac": [".flac"],
  "audio/ogg":  [".ogg"],
};

const MAX_BYTES = 50 * 1024 * 1024;

type Props = {
  file: File | null;
  onFile: (f: File | null) => void;
  disabled?: boolean;
};

export function DropZone({ file, onFile, disabled }: Props) {
  const onDrop = useCallback((accepted: File[]) => {
    if (accepted.length > 0) onFile(accepted[0]);
  }, [onFile]);

  const { getRootProps, getInputProps, isDragActive, fileRejections } = useDropzone({
    onDrop,
    accept: ACCEPT,
    multiple: false,
    maxSize: MAX_BYTES,
    disabled,
  });

  const rejectionMessage =
    fileRejections[0]?.errors[0]?.code === "file-too-large"
      ? `That file is larger than ${MAX_BYTES / 1024 / 1024} MB.`
      : fileRejections[0]?.errors[0]?.message;

  return (
    <div>
      <div
        {...getRootProps()}
        className={[
          "relative border-2 border-dashed transition-colors",
          "flex flex-col items-center justify-center text-center",
          "py-14 px-8 cursor-pointer select-none",
          disabled ? "opacity-40 cursor-not-allowed pointer-events-none" : "",
          isDragActive
            ? "border-brand-yellow bg-[#FFFBEB]"
            : file
              ? "border-[#D1CFC5] bg-ivory"
              : "border-[#D1CFC5] bg-ivory hover:border-[#999682]",
        ].join(" ")}
      >
        <input {...getInputProps()} />

        {/* Icon */}
        <div className={[
          "mb-4 transition-colors",
          isDragActive ? "text-[#D77908]" : "text-[#999682]",
        ].join(" ")}>
          <Music size={32} strokeWidth={1.5} />
        </div>

        {/* Primary label */}
        <p className="font-season text-base font-semibold text-ebony">
          {isDragActive
            ? "Drop to upload"
            : file
              ? "File ready — change it by dropping another"
              : "Drag an audio file here, or click to choose"}
        </p>

        {/* Format hint */}
        {!file && (
          <p className="font-inter text-xs text-[#888888] mt-2 tracking-wide">
            wav · mp3 · m4a · aiff · flac · ogg &nbsp;·&nbsp; up to 50 MB · up to 6 min
          </p>
        )}

        {/* Selected file pill */}
        {file && (
          <div className="mt-4 flex items-center gap-2">
            <span className="inline-flex items-center gap-2 bg-ebony text-ivory font-inter text-xs px-3 py-1 rounded-full">
              <Music size={12} strokeWidth={2} />
              {file.name}
              <span className="text-[#999682]">
                {(file.size / 1024 / 1024).toFixed(1)} MB
              </span>
            </span>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onFile(null); }}
              className="p-1 rounded-full hover:bg-[#E7E5E0] transition-colors"
              aria-label="Remove file"
            >
              <X size={14} strokeWidth={2} className="text-[#888888]" />
            </button>
          </div>
        )}
      </div>

      {rejectionMessage && (
        <div className="mt-2 border-l-4 border-brand-pink bg-brand-pink-50 px-3 py-2">
          <p className="font-inter text-xs text-[#92313E]">{rejectionMessage}</p>
        </div>
      )}
    </div>
  );
}
