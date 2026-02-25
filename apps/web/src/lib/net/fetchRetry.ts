/**
 * Fetch with exponential backoff retry on 5xx or network errors.
 * Does NOT retry on 4xx (client errors are not transient).
 */
export async function fetchWithRetry(
  url: string,
  init: RequestInit,
  opts: { retries?: number; backoffMs?: number } = {},
): Promise<Response> {
  const { retries = 3, backoffMs = 1000 } = opts;
  let lastError: unknown = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, init);
      // Retry on server errors, not on client errors
      if (res.status >= 500 && attempt < retries) {
        await delay(backoffMs * Math.pow(2, attempt));
        continue;
      }
      return res;
    } catch (err: unknown) {
      lastError = err;
      if (attempt < retries) {
        await delay(backoffMs * Math.pow(2, attempt));
      }
    }
  }

  throw lastError ?? new Error("Request failed after retries");
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
