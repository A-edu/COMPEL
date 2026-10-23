import { AppHeader } from "@/components/app-header";
import { Toaster } from "@/components/ui/sonner";

// The shell for every page after login (§7). Light theme.
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <AppHeader />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6">
        {children}
      </main>
      <Toaster position="top-center" />
    </>
  );
}
