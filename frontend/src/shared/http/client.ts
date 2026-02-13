const API_BASE_URL = "/api";

export async function apiFetch(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  return fetch(`${API_BASE_URL}${path}`, {
    credentials: "include",
    ...init,
  });
}

export async function throwApiError(
  response: Response,
  prefix: string,
): Promise<never> {
  const body = await response.text();
  const detail = body || response.statusText;
  throw new Error(`${prefix}: ${detail}`);
}
