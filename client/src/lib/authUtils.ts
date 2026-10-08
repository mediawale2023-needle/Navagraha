import { isApiError } from "./apiError";

export function isUnauthorizedError(error: unknown): boolean {
  return isApiError(error) && error.status === 401;
}
