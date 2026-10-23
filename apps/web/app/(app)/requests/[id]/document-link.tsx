import { Download, FileText } from "lucide-react";

// A filename that downloads on click. The API sends it as an attachment,
// so a plain link keeps the page in place.
export function DocumentLink({
  requestId,
  document,
}: {
  requestId: string;
  document: { id: string; originalName: string };
}) {
  return (
    <a
      href={`/api/requests/${requestId}/documents/${document.id}`}
      download
      className="group flex items-center gap-3 rounded-lg px-2 py-2 outline-none transition-colors hover:bg-neutral-50 focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <FileText className="size-4 shrink-0 text-neutral-500" aria-hidden />
      <span className="min-w-0 flex-1 truncate text-sm">
        {document.originalName}
      </span>
      <Download
        className="size-4 shrink-0 text-neutral-400 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
        aria-hidden
      />
    </a>
  );
}
