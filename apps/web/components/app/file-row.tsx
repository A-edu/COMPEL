import { Download, FileText } from "lucide-react";

// The file type from the name, for the tag. Uploads are PDF or DOCX only.
function fileType(name: string): string | null {
  const match = /\.(pdf|docx)$/i.exec(name);
  return match ? match[1].toUpperCase() : null;
}

// A document as a sunken row that downloads on click. The API sends it as an
// attachment, so a plain link keeps the page in place. Officers open
// documents through their own route (`basePath`).
export function FileRow({
  requestId,
  document,
  basePath = "/api/requests",
}: {
  requestId: string;
  document: { id: string; originalName: string };
  basePath?: string;
}) {
  const type = fileType(document.originalName);
  return (
    <a
      href={`${basePath}/${requestId}/documents/${document.id}`}
      download
      className="group flex items-center gap-3 rounded-lg bg-sunken px-3 py-2.5 ring-1 ring-hairline outline-none ring-inset transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      <span className="min-w-0 flex-1 truncate text-sm underline-offset-2 group-hover:underline">
        {document.originalName}
      </span>
      {type && (
        <span className="shrink-0 rounded-[4px] bg-card px-1.5 py-0.5 text-[11px] leading-none font-medium text-muted-foreground ring-1 ring-hairline ring-inset">
          {type}
        </span>
      )}
      <Download
        className="size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
        aria-hidden
      />
    </a>
  );
}
