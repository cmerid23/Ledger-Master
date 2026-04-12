import { setAuthTokenGetter } from "@workspace/api-client-react";

// Setup base URL if needed (in dev usually proxy handles it, but good to have)
// setBaseUrl("/api");

// Set up the auth token getter
setAuthTokenGetter(() => {
  return localStorage.getItem("clearledger_token");
});

// Shared authenticated fetch helper
export function authFetch(url: string, opts: RequestInit = {}): Promise<Response> {
  const token = localStorage.getItem("clearledger_token") ?? "";
  return fetch(url, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(opts.headers as Record<string, string> ?? {}),
    },
  });
}
