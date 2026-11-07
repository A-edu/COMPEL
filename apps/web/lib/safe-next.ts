export type UserRole = "DPO" | "COMPLIANCE_OFFICER";

const REVIEW_PATH = "/review";

// Where an account starts. Officers have no DPO screens, and DPOs have no
// review console (AGENTS.md -> Access rules 6).
export function homePath(role: UserRole | undefined): string {
  return role === "COMPLIANCE_OFFICER" ? REVIEW_PATH : "/requests";
}

function isReviewPath(path: string): boolean {
  return path === REVIEW_PATH || /^\/review[/?]/.test(path);
}

// Only same-origin relative paths are allowed as a post-login destination.
// Rejects protocol-relative ("//host"), backslash ("/\host") and anything
// with whitespace or control characters, which browsers may strip into one
// of those forms. A path for the other kind of account is dropped too: it
// can be left over from someone else's expired session.
export function safeNextPath(next: string | undefined, role: UserRole): string {
  if (
    !next ||
    !next.startsWith("/") ||
    next.startsWith("//") ||
    /[\\\u0000- \u007f]/.test(next) ||
    isReviewPath(next) !== (role === "COMPLIANCE_OFFICER")
  ) {
    return homePath(role);
  }
  return next;
}
