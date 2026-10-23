// Remounts on every navigation, so each page's content fades in (150 ms,
// none under reduced motion).
export default function AppTemplate({ children }: { children: React.ReactNode }) {
  return (
    <div className="motion-safe:animate-in motion-safe:fade-in motion-safe:duration-150">
      {children}
    </div>
  );
}
