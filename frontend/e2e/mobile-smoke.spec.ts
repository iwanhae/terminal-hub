import { expect, test } from "@playwright/test";
import { createSession } from "./utilities";

test("mobile drawer opens and navigates", async ({ page, request }) => {
  const sessionId = await createSession(request);

  await page.goto("/");
  await page.getByTestId("mobile-menu-button").click();
  await expect(page.getByRole("dialog")).toBeVisible();

  await page
    .locator(`[data-testid="session-nav-item"][data-session-id="${sessionId}"]`)
    .click();

  await expect(page).toHaveURL(`/session/${sessionId}`);
});

test("terminal focuses on tap", async ({ page, request }) => {
  const sessionId = await createSession(request);

  await page.goto(`/session/${sessionId}`);
  await page.getByTestId("terminal-surface").click();
  await expect(page.locator(".xterm-helper-textarea")).toBeFocused();
});

test("extra keys send websocket input frames", async ({ page, request }) => {
  const sessionId = await createSession(request);

  const inputFrames: Array<{ type: string; data?: string }> = [];
  page.on("websocket", (ws) => {
    ws.on("framesent", (payload) => {
      try {
        const json = JSON.parse(payload);
        if (json && json.type === "input") inputFrames.push(json);
      } catch {
        // ignore non-JSON frames
      }
    });
  });

  await page.goto(`/session/${sessionId}`);

  await page.getByTestId("extra-key-tab").click();
  await expect
    .poll(() => inputFrames.some((f) => f.data === "\t"))
    .toBeTruthy();

  await page.getByTestId("extra-key-esc").click();
  await expect
    .poll(() => inputFrames.some((f) => f.data === "\u001B"))
    .toBeTruthy();
});

test("PWA artifacts exist and SW controls after reload", async ({ page, request }) => {
  await page.goto("/");

  const manifestResponse = await request.get("/manifest.webmanifest");
  expect(manifestResponse.status(), await manifestResponse.text()).toBe(200);
  const manifest = (await manifestResponse.json()) as {
    display?: string;
    icons?: Array<{ sizes?: string }>;
  };

  expect(manifest.display).toBe("standalone");
  const iconSizes = (manifest.icons ?? []).map((index) => index.sizes);
  expect(iconSizes).toContain("192x192");
  expect(iconSizes).toContain("512x512");

  await page.reload();
  await expect
    .poll(async () => {
      return page.evaluate(async () => {
        if (!("serviceWorker" in navigator)) return false;
        await navigator.serviceWorker.ready;
        return navigator.serviceWorker.controller !== null;
      });
    })
    .toBeTruthy();
});

test("viewport resize does not introduce page scroll", async ({ page }) => {
  await page.goto("/");
  await page.setViewportSize({ width: 390, height: 700 });

  await expect
    .poll(() =>
      page.evaluate(() => {
        const root = document.documentElement;
        return (
          root.scrollHeight <= window.innerHeight + 1 &&
          root.scrollWidth <= window.innerWidth + 1
        );
      }),
    )
    .toBeTruthy();
});
