import { setAuthTokenGetter } from "@workspace/api-client-react";

const TOKEN_KEY = "clearledger_token";
const BUSINESS_KEY = "clearledger_business_id";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export function getBusinessId(): number | null {
  const v = localStorage.getItem(BUSINESS_KEY);
  return v ? Number(v) : null;
}

export function setBusinessId(id: number): void {
  localStorage.setItem(BUSINESS_KEY, String(id));
}

export function clearBusinessId(): void {
  localStorage.removeItem(BUSINESS_KEY);
}

// Initialize the auth token getter for the API client
setAuthTokenGetter(() => getToken());
