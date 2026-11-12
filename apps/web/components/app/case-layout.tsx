// A case's two columns: the dossier on the left and, on the right, the panel
// the reader acts in, which stays in view while they read (minmax(0,1fr) and
// 340 px, 24 px apart). Below lg the columns stack.
export function CaseLayout({
  children,
  aside,
}: {
  children: React.ReactNode;
  aside?: React.ReactNode;
}) {
  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="flex min-w-0 flex-col gap-6">{children}</div>
      {aside && (
        <div className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-[88px]">
          {aside}
        </div>
      )}
    </div>
  );
}
