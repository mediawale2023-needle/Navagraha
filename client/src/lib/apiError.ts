/** An API failure with a message fit to show a person; the raw body is kept for diagnostics only. */
export class ApiError extends Error {
  readonly status: number;
  /** The form field the server says is at fault, when it names one. */
  readonly field?: string;
  readonly body: unknown;

  constructor(status: number, message: string, body: unknown, field?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
    this.field = field;
  }
}

const FALLBACK = (status: number) => `Something went wrong (${status}). Please try again.`;

/** Builds an ApiError from a status and response text without ever echoing raw JSON or HTML. */
export function toApiError(status: number, text: string, statusText = ''): ApiError {
  const trimmed = (text ?? '').trim();
  let body: unknown = trimmed;
  try {
    body = trimmed ? JSON.parse(trimmed) : null;
  } catch {
    body = trimmed;
  }
  if (body && typeof body === 'object' && !Array.isArray(body)) {
    const { message, field } = body as { message?: unknown; field?: unknown };
    const readable = typeof message === 'string' && message.trim() ? message.trim() : FALLBACK(status);
    return new ApiError(status, readable, body, typeof field === 'string' ? field : undefined);
  }
  // Plain-text bodies are shown only when short and clearly not markup.
  if (typeof body === 'string' && body && body.length <= 200 && !/[<>{}]/.test(body)) {
    return new ApiError(status, body, body);
  }
  if (!trimmed && statusText && !/[<>{}]/.test(statusText)) return new ApiError(status, `${statusText} (${status})`, null);
  return new ApiError(status, FALLBACK(status), body);
}

export function isApiError(err: unknown): err is ApiError {
  return err instanceof ApiError;
}
