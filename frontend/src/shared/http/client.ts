import { dispatchSessionInvalidEvent } from "../../features/auth/sessionEvents";

const API_BASE_URL = "/api";

interface ApiFetchOptions {
  skipAuthRedirect?: boolean;
}

export async function apiFetch(
  path: string,
  init?: RequestInit,
  options?: ApiFetchOptions,
): Promise<Response> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    credentials: "include",
    ...init,
  });

  if (response.status === 401 && options?.skipAuthRedirect !== true) {
    dispatchSessionInvalidEvent("http-401");
  }

  return response;
}

export async function throwApiError(
  response: Response,
  prefix: string,
): Promise<never> {
  const body = await response.text();
  const detail = body || response.statusText;
  throw new Error(`${prefix}: ${detail}`);
}
