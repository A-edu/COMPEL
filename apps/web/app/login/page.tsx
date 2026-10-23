import { ThreadsBackground } from "@/components/login/threads-background";
import { LoginCard } from "./login-card";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { reason, next } = await searchParams;

  return (
    <div className="dark relative isolate flex min-h-dvh flex-1 items-center justify-center bg-[#0a0a0a] px-4 py-12 text-foreground">
      <ThreadsBackground />
      <LoginCard
        expired={reason === "expired"}
        next={typeof next === "string" ? next : undefined}
      />
    </div>
  );
}
