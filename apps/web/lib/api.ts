// The fetch wrapper every inner page uses. Paths are relative to /api, which
// Next.js rewrites to the API (same origin, so the session cookie is sent).
//
//   const me = await api<Me>("/auth/me");
//   await api("/requests", { form: formData });          // multipart
//   await api("/x", { method: "PATCH", json: { a: 1 } }); // JSON
//
// A 401 sends the browser to /login with the expired-session message and
// never settles, so callers simply stay in their loading state. Any other
// failure throws an ApiError carrying the API's { message }.

export const FALLBACK_ERROR = "Something went wrong. Please try again.";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export interface ApiOptions {
  method?: string;
  json?: unknown;
  form?: FormData;
  signal?: AbortSignal;
}

let redirecting = false;

export async function api<T = void>(
  path: string,
  { method, json, form, signal }: ApiOptions = {},
): Promise<T> {
  const headers: HeadersInit = {};
  let body: BodyInit | undefined;
  if (form) {
    // The browser sets the multipart boundary itself.
    body = form;
  } else if (json !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(json);
  }

  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method: method ?? (body ? "POST" : "GET"),
      headers,
      body,
      signal,
      credentials: "same-origin",
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new ApiError(0, FALLBACK_ERROR);
  }

  if (res.status === 401) return redirectToLogin();

  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { message?: unknown };
    throw new ApiError(
      res.status,
      typeof data.message === "string" ? data.message : FALLBACK_ERROR,
    );
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

// Sends the user to log in again, coming back to the current page after.
// Returns a promise that never settles.
function redirectToLogin(): Promise<never> {
  if (!redirecting) {
    redirecting = true;
    const next = window.location.pathname + window.location.search;
    // A full navigation on purpose: it drops all client state and the
    // router cache of the logged-out session, and this module has no router.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign(
      `/login?reason=expired&next=${encodeURIComponent(next)}`,
    );
  }
  return new Promise<never>(() => {});
}
