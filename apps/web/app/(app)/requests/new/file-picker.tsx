"use client";

import { FileText, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";

// The same rules and messages as the API's upload check.
const ALLOWED_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

const ACCEPT = [
  ".pdf",
  ".docx",
  ...Object.values(ALLOWED_TYPES),
].join(",");

export function fileError(file: File, maxUploadMb?: number): string | null {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!Object.hasOwn(ALLOWED_TYPES, ext) || ALLOWED_TYPES[ext] !== file.type) {
    return "Only PDF or DOCX files are allowed.";
  }
  if (maxUploadMb && file.size > maxUploadMb * 1024 * 1024) {
    return `Each file must be ${maxUploadMb} MB or smaller.`;
  }
  return null;
}

// A dashed drop area: a label around a visually hidden file input, so it
// stays keyboard-reachable; files can also be dropped onto it.
export function FileDrop({
  id,
  multiple,
  maxUploadMb,
  onFiles,
  onBlur,
  describedBy,
}: {
  id: string;
  multiple?: boolean;
  maxUploadMb?: number;
  onFiles: (files: File[]) => void;
  onBlur?: () => void;
  describedBy?: string;
}) {
  return (
    <label
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const input = e.currentTarget.querySelector("input");
        if (input?.disabled) return;
        const files = Array.from(e.dataTransfer.files);
        if (files.length) onFiles(multiple ? files : files.slice(0, 1));
      }}
      className="flex cursor-pointer flex-col items-center gap-1.5 rounded-lg border border-dashed border-neutral-300 px-6 py-7 text-center transition-colors focus-within:ring-3 focus-within:ring-ring/50 hover:bg-neutral-50 has-disabled:cursor-not-allowed has-disabled:opacity-50 has-disabled:hover:bg-transparent"
    >
      <Upload className="mb-1 size-5 text-neutral-500" aria-hidden />
      <span className="text-sm font-medium">
        {multiple ? "Choose PDF or DOCX files" : "Choose a PDF or DOCX file"}
      </span>
      {maxUploadMb && (
        <span className="text-xs text-muted-foreground">
          {`Up to ${maxUploadMb} MB${multiple ? " each" : ""}`}
        </span>
      )}
      <input
        id={id}
        type="file"
        className="sr-only"
        accept={ACCEPT}
        multiple={multiple}
        aria-describedby={describedBy}
        onBlur={onBlur}
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          // Cleared so choosing the same file again still fires onChange.
          e.target.value = "";
          if (files.length) onFiles(files);
        }}
      />
    </label>
  );
}

// A chosen file: its name, a remove button, and its error if any.
export function FileRow({
  file,
  error,
  onRemove,
}: {
  file: File;
  error: string | null;
  onRemove: () => void;
}) {
  return (
    <li className="flex flex-col gap-1">
      <div className="flex items-center gap-3 rounded-lg py-1.5 pr-1.5 pl-3 ring-1 ring-black/6">
        <FileText className="size-4 shrink-0 text-neutral-500" aria-hidden />
        <span className="min-w-0 flex-1 truncate text-sm" title={file.name}>
          {file.name}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={`Remove ${file.name}`}
          onClick={onRemove}
        >
          <X aria-hidden />
        </Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </li>
  );
}
