import { expect, type APIRequestContext } from "@playwright/test";

export async function createSession(
  request: APIRequestContext,
  name = `e2e-${Date.now()}`,
): Promise<string> {
  const response = await request.post("/api/sessions", {
    data: {
      name,
    },
  });

  expect(response.status(), await response.text()).toBe(201);
  const json = (await response.json()) as { id: string };
  expect(typeof json.id).toBe("string");
  expect(json.id).not.toBe("");
  return json.id;
}
