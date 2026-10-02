export interface BatchOptions<T, R> {
  concurrency?: number;
  retries?: number;
  minTimeout?: number;
  maxTimeout?: number;
  onProgress?: (completed: number, total: number, item: T, result: R) => void;
  onError?: (error: unknown, item: T, index: number) => R | Promise<R>;
}

function getErrorStatus(error: unknown): number | null {
  if (!error || typeof error !== "object" || !("status" in error)) return null;
  const status = (error as { status?: unknown }).status;
  return typeof status === "number" ? status : null;
}

function getErrorCode(error: unknown): string | null {
  if (!error || typeof error !== "object" || !("code" in error)) return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : null;
}

export function isRateLimitError(error: unknown): boolean {
  if (getErrorStatus(error) === 429) return true;
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  return message.includes("rate limit") || message.includes("ratelimit_exceeded") || message.includes("quota");
}

function isRetryable(error: unknown): boolean {
  const status = getErrorStatus(error);
  if (status !== null) return [429, 500, 502, 503, 504].includes(status);
  return ["ECONNRESET", "ECONNREFUSED", "ETIMEDOUT", "EAI_AGAIN"].includes(getErrorCode(error) || "");
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export async function batchProcess<T, R>(
  items: T[],
  processor: (item: T, index: number) => Promise<R>,
  options: BatchOptions<T, R> = {},
): Promise<R[]> {
  const {
    concurrency = 2,
    retries = 3,
    minTimeout = 1000,
    maxTimeout = 8000,
    onProgress,
    onError,
  } = options;

  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new Error("Batch concurrency must be a positive integer.");
  }

  const results = new Array<R>(items.length);
  let nextIndex = 0;
  let completed = 0;

  const worker = async (): Promise<void> => {
    while (true) {
      const index = nextIndex++;
      if (index >= items.length) return;
      const item = items[index];
      let attempt = 0;

      while (true) {
        try {
          results[index] = await processor(item, index);
          break;
        } catch (error) {
          if (isRetryable(error) && attempt < retries) {
            await delay(Math.min(maxTimeout, minTimeout * 2 ** attempt));
            attempt += 1;
            continue;
          }
          if (!onError) throw error;
          results[index] = await onError(error, item, index);
          break;
        }
      }

      completed += 1;
      onProgress?.(completed, items.length, item, results[index]);
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker()),
  );
  return results;
}