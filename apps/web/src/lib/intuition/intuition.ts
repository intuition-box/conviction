import { API_URL_DEV, configureClient } from "@0xintuition/graphql";

const defaultApiUrl = process.env.NEXT_PUBLIC_INTUITION_GRAPHQL_URL ?? API_URL_DEV;
let configured = false;

export function ensureIntuitionGraphql() {
  if (configured) return;
  configureClient({ apiUrl: defaultApiUrl });
  configured = true;
}

export const intuitionGraphqlUrl = defaultApiUrl;
