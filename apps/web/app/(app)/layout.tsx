import { AppHeader } from "@/components/app/app-header";
import { PageContainer } from "@/components/app/page-container";
import { Toaster } from "@/components/ui/sonner";

// The shell for every page after login (§7): a light canvas, the header and
// the shared container (AGENTS.md -> Inner screens).
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-dvh flex-1 flex-col bg-canvas">
      <AppHeader />
      <main className="flex-1 py-8 sm:py-12">
        <PageContainer>{children}</PageContainer>
      </main>
      <Toaster position="bottom-right" offset={24} />
    </div>
  );
}
