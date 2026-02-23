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

  await page.getByTestId("extra-key-shift-tab").click();
  await expect
    .poll(() => inputFrames.some((f) => f.data === "\u001B[Z"))
    .toBeTruthy();

  await page.getByTestId("extra-key-page-up").click();
  await expect
    .poll(() => inputFrames.some((f) => f.data === "\u001B[5~"))
    .toBeTruthy();

  await page.getByTestId("extra-key-page-down").click();
  await expect
    .poll(() => inputFrames.some((f) => f.data === "\u001B[6~"))
    .toBeTruthy();
});

test("copy modal opens from mobile palette", async ({ page, request }) => {
  const sessionId = await createSession(request);

  await page.goto(`/session/${sessionId}`);
  await page.getByTestId("extra-key-copy").click();

  await expect(page.getByTestId("copy-text-modal")).toBeVisible();
  await expect(page.getByTestId("copy-text-content")).toBeVisible();
});

test("latched ctrl applies to the next native keypress", async ({
  page,
  request,
}) => {
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
  await page.getByTestId("terminal-surface").click();
  await page.getByTestId("extra-key-ctrl").click();
  await page.keyboard.press("t");

  await expect
    .poll(() => inputFrames.some((frame) => frame.data === "\u0014"))
    .toBeTruthy();

  const ctrlFramesCount = inputFrames.filter(
    (frame) => frame.data === "\u0014",
  ).length;

  await page.keyboard.press("t");
  await expect
    .poll(() => inputFrames.some((frame) => frame.data === "t"))
    .toBeTruthy();

  await expect
    .poll(
      () =>
        inputFrames.filter((frame) => frame.data === "\u0014").length ===
        ctrlFramesCount,
    )
    .toBeTruthy();
});

test("latched ctrl applies to ime-style insertText input", async ({
  page,
  request,
}) => {
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
  await page.getByTestId("terminal-surface").click();
  await page.getByTestId("extra-key-ctrl").click();
  await page.keyboard.insertText("c");

  await expect
    .poll(() => inputFrames.some((frame) => frame.data === "\u0003"))
    .toBeTruthy();

  const ctrlFramesCount = inputFrames.filter(
    (frame) => frame.data === "\u0003",
  ).length;

  await page.keyboard.insertText("c");
  await expect
    .poll(() => inputFrames.some((frame) => frame.data === "c"))
    .toBeTruthy();

  await expect
    .poll(
      () =>
        inputFrames.filter((frame) => frame.data === "\u0003").length ===
        ctrlFramesCount,
    )
    .toBeTruthy();
});

test("native keyboard input works after reconnect", async ({ page, request }) => {
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
  await page.getByTestId("terminal-surface").click();
  await page.keyboard.press("a");
  await expect
    .poll(() => inputFrames.some((frame) => frame.data === "a"))
    .toBeTruthy();

  await page.context().setOffline(true);
  try {
    await expect(page.getByText(/Reconnecting\.\.\./)).toBeVisible();

    await page.context().setOffline(false);
    await expect(page.getByText("Reconnected to terminal")).toBeVisible();

    await page.getByTestId("terminal-surface").click();
    await page.keyboard.press("b");
    await expect
      .poll(() => inputFrames.some((frame) => frame.data === "b"))
      .toBeTruthy();
  } finally {
    await page.context().setOffline(false);
  }
});

test("mobile key palette stays inside viewport after resize", async ({
  page,
  request,
}) => {
  const sessionId = await createSession(request);

  await page.goto(`/session/${sessionId}`);
  await expect(page.getByTestId("mobile-key-palette")).toBeVisible();

  await page.setViewportSize({ width: 390, height: 500 });

  await expect
    .poll(async () => {
      const box = await page.getByTestId("mobile-key-palette").boundingBox();
      if (box == undefined) return false;

      return (
        box.x >= 0 &&
        box.y >= 0 &&
        box.x + box.width <= 391 &&
        box.y + box.height <= 501
      );
    })
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
