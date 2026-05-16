"use client";

import { useDropzone } from "react-dropzone";
import { useCallback } from "react";

const ACCEPT = {
  "audio/wav": [".wav"],
  "audio/mpeg": [".mp3"],
  "audio/mp4": [".m4a"],
  "audio/aiff": [".aiff", ".aif"],
  "audio/flac": [".flac"],
  "audio/ogg": [".ogg"],
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

  const rejectionMessage = fileRejections[0]?.errors[0]?.code === "file-too-large"
    ? `That file is larger than ${MAX_BYTES / 1024 / 1024} MB.`
    : fileRejections[0]?.errors[0]?.message;

  return (
    <div>
      <div
        {...getRootProps()}
        className={`
          rounded-xl border-2 border-dashed transition-colors
          flex flex-col items-center justify-center text-center
          p-10 cursor-pointer
          ${disabled ? "opacity-50 cursor-not-allowed" : ""}
          ${isDragActive
            ? "border-blue-500 bg-blue-50 dark:bg-blue-950/30"
            : "border-neutral-300 dark:border-neutral-700 hover:border-neutral-400"
          }
        `}
      >
        <input {...getInputProps()} />
        <div className="text-3xl mb-2">♫</div>
        <p className="text-base font-medium">
          {isDragActive ? "Drop the audio here" : "Drag an audio file here, or click to choose"}
        </p>
        <p className="text-sm text-neutral-500 mt-1">
          wav · mp3 · m4a · aiff · flac · ogg  ·  up to 50 MB · up to 6 min
        </p>
        {file && (
          <p className="mt-4 text-sm text-neutral-700 dark:text-neutral-300">
            <span className="font-mono">{file.name}</span>
            <span className="text-neutral-500"> · {(file.size / 1024 / 1024).toFixed(1)} MB</span>
          </p>
        )}
      </div>
      {rejectionMessage && (
        <p className="mt-2 text-sm text-red-600 dark:text-red-400">{rejectionMessage}</p>
      )}
    </div>
  );
}
