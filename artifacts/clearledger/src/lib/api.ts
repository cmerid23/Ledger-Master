import { setAuthTokenGetter, setBaseUrl } from "@workspace/api-client-react/custom-fetch";

// Setup base URL if needed (in dev usually proxy handles it, but good to have)
// setBaseUrl("/api");

// Set up the auth token getter
setAuthTokenGetter(() => {
  return localStorage.getItem("clearledger_token");
});
