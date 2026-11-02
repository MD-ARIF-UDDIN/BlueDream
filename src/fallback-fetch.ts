const PRIMARY_URL = (
  import.meta.env.VITE_SUPABASE_URL || 'https://Blue Dream.mdarifuddin040.workers.dev'
).replace(/\/$/, '');

const FALLBACK_URL = (
  import.meta.env.VITE_SUPABASE_FALLBACK_URL || 'https://hmcldcjapucbkjlfajrq.supabase.co'
).replace(/\/$/, '');

/**
 * Custom fetch implementation for Supabase client:
 * 1. Tries the primary URL (Cloudflare Worker) first.
 * 2. If it fails (network error, timeout, or Cloudflare 5xx/429 errors),
 *    it automatically retries using the original Supabase URL.
 */
export const fallbackFetch: typeof fetch = async (input, init) => {
  let urlStr = '';
  if (typeof input === 'string') {
    urlStr = input;
  } else if (input instanceof URL) {
    urlStr = input.toString();
  } else if (typeof Request !== 'undefined' && input instanceof Request) {
    urlStr = input.url;
  } else {
    urlStr = String(input);
  }

  // If request is not directed to primary URL, execute standard fetch
  if (!urlStr.startsWith(PRIMARY_URL)) {
    return fetch(input as any, init);
  }

  const fallbackUrlStr = urlStr.replace(PRIMARY_URL, FALLBACK_URL);

  // If input was a Request object, prepare cloned request for potential fallback
  let fallbackInput: any = fallbackUrlStr;
  let primaryInput: any = input;

  if (typeof Request !== 'undefined' && input instanceof Request) {
    try {
      const cloned = input.clone();
      fallbackInput = new Request(fallbackUrlStr, cloned);
      primaryInput = input;
    } catch {
      fallbackInput = fallbackUrlStr;
    }
  }

  // --- Attempt 1: Cloudflare Worker ---
  try {
    let controller: AbortController | null = null;
    let signal = init?.signal;

    // Apply a 6-second timeout on worker attempt
    if (typeof AbortController !== 'undefined') {
      controller = new AbortController();
      const timeoutId = setTimeout(() => {
        controller?.abort('Worker request timeout');
      }, 6000);

      const externalSignal = init?.signal;
      if (externalSignal) {
        externalSignal.addEventListener('abort', () => {
          clearTimeout(timeoutId);
          controller?.abort(externalSignal.reason);
        });
      }

      signal = controller.signal;

      const response = await fetch(primaryInput, { ...init, signal });
      clearTimeout(timeoutId);

      // Status codes that indicate Cloudflare worker failure or rate limiting:
      // 429 = Worker limit reached (100k daily)
      // 502/503/504 = Worker / upstream gateway error
      // 520-526 = Cloudflare edge error codes
      const isCloudflareError =
        response.status === 429 ||
        response.status === 502 ||
        response.status === 503 ||
        response.status === 504 ||
        (response.status >= 520 && response.status <= 526);

      if (isCloudflareError) {
        console.warn(
          `[Supabase] Cloudflare Worker returned status ${response.status}. Retrying via fallback Supabase URL...`
        );
        return fetch(fallbackInput, init);
      }

      return response;
    } else {
      const response = await fetch(primaryInput, init);
      if (
        response.status === 429 ||
        response.status === 502 ||
        response.status === 503 ||
        response.status === 504 ||
        (response.status >= 520 && response.status <= 526)
      ) {
        return fetch(fallbackInput, init);
      }
      return response;
    }
  } catch (err) {
    console.warn(
      '[Supabase] Cloudflare Worker failed or timed out. Falling back to original Supabase URL...',
      err
    );
    // --- Attempt 2: Fallback to original Supabase ---
    return fetch(fallbackInput, init);
  }
};
