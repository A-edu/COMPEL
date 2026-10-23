const DEFAULT_PATH = "/requests";

// Only same-origin relative paths are allowed as a post-login destination.
// Rejects protocol-relative ("//host"), backslash ("/\host") and anything
// with whitespace or control characters, which browsers may strip into one
// of those forms.
export function safeNextPath(next: string | undefined): string {
  if (
    !next ||
    !next.startsWith("/") ||
    next.startsWith("//") ||
    /[\\\u0000- \u007f]/.test(next)
  ) {
    return DEFAULT_PATH;
  }
  return next;
}
