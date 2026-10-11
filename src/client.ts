export const BASE_URL = "https://stock.indianapi.in";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export interface ClientOptions {
  apiKey: string;
  baseUrl?: string;
  timeoutMs?: number;
  retries?: number;
  /** Default cache lifetime for GET responses. 0 disables caching. */
  cacheTtlMs?: number;
  fetchImpl?: typeof fetch;
}

type Params = Record<string, string | number | undefined>;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Thin client for the Indian Stock Market API: API-key auth, request timeout,
 * retry with backoff on 429/5xx, in-memory TTL cache and in-flight de-duplication.
 */
export class ApiClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly retries: number;
  private readonly cacheTtlMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly cache = new Map<string, { expires: number; data: unknown }>();
  private readonly inflight = new Map<string, Promise<unknown>>();

  constructor(private readonly options: ClientOptions) {
    this.baseUrl = options.baseUrl ?? BASE_URL;
    this.timeoutMs = options.timeoutMs ?? 20_000;
    this.retries = options.retries ?? 2;
    this.cacheTtlMs = options.cacheTtlMs ?? 60_000;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async get<T = any>(endpoint: string, params: Params = {}, ttlMs = this.cacheTtlMs): Promise<T> {
    const url = new URL(this.baseUrl + endpoint);
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== "") url.searchParams.set(key, String(value));
    }
    const key = url.toString();

    const hit = this.cache.get(key);
    if (hit && hit.expires > Date.now()) return hit.data as T;

    const pending = this.inflight.get(key);
    if (pending) return pending as Promise<T>;

    const request = this.fetchWithRetry(url)
      .then((data) => {
        if (ttlMs > 0) this.cache.set(key, { expires: Date.now() + ttlMs, data });
        return data as T;
      })
      .finally(() => this.inflight.delete(key));
    this.inflight.set(key, request);
    return request;
  }

  private async fetchWithRetry(url: URL): Promise<unknown> {
    if (!this.options.apiKey) {
      throw new ApiError("ISE_API_KEY is not set. Add it to src/.env or the environment.");
    }
    let lastError: unknown;
    for (let attempt = 0; attempt <= this.retries; attempt++) {
      if (attempt > 0) await sleep(400 * 2 ** (attempt - 1));
      try {
        const response = await this.fetchImpl(url, {
          headers: { "x-api-key": this.options.apiKey, accept: "application/json" },
          signal: AbortSignal.timeout(this.timeoutMs),
        });
        if (response.ok) return await response.json();

        const body = (await response.text().catch(() => "")).slice(0, 200);
        const error = new ApiError(describeStatus(response.status, url.pathname, body), response.status);
        if (response.status !== 429 && response.status < 500) throw error;
        lastError = error;
      } catch (error) {
        if (error instanceof ApiError && error.status !== undefined && error.status < 500 && error.status !== 429) {
          throw error;
        }
        lastError =
          error instanceof ApiError
            ? error
            : new ApiError(`Network error calling ${url.pathname}: ${(error as Error).message}`);
      }
    }
    throw lastError;
  }
}

function describeStatus(status: number, path: string, body: string): string {
  switch (status) {
    case 401:
    case 403:
      return `Authentication failed (HTTP ${status}). Check that ISE_API_KEY is valid.`;
    case 404:
      return `Not found (HTTP 404) for ${path}${body ? `: ${body}` : ""}`;
    case 422:
      return `Invalid parameters for ${path}: ${body}`;
    case 429:
      return `Rate limit or quota reached (HTTP 429) for ${path}.`;
    default:
      return `HTTP ${status} from ${path}${body ? `: ${body}` : ""}`;
  }
}
