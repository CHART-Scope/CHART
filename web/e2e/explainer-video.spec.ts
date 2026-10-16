import { readFileSync } from "node:fs";

import { expect, test, type Page } from "@playwright/test";

import { EXPLAINER_VIDEO_URL } from "../src/components/ExplainerVideo/source";
import { installFakeApi, json } from "./support/fakeApi";

// The explainer lives in the public model bucket; the test serves a 3-second cut
// of the real file at that URL so playback is exercised without the network.
// Failure modes: an eager 10 MB download, a missing poster, an unreachable
// bucket, and a dashboard card still showing "Video coming soon".
const CLIP = readFileSync(new URL("./fixtures/explainer-clip.mp4", import.meta.url));

async function serveVideo(page: Page, status = 200) {
  const requests: string[] = [];
  await page.route(EXPLAINER_VIDEO_URL, (route) => {
    requests.push(route.request().url());
    return status === 200
      ? route.fulfill({ status, contentType: "video/mp4", body: CLIP })
      : route.fulfill({ status, body: "missing" });
  });
  return requests;
}

async function expectPosterLoaded(page: Page) {
  const poster = await page
    .getByLabel("CHART explainer video")
    .evaluate((video: HTMLVideoElement) => video.poster);
  const response = await page.request.get(poster);
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("image/jpeg");
}

for (const width of [1440, 390]) {
  test(`landing explainer plays on demand at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    const api = await installFakeApi(page);
    api.on(/^\/api\/setup$/, (route) => json(route, { requiresOnboarding: false }));
    const requests = await serveVideo(page);
    await page.goto("/");

    const section = page.getByRole("region", { name: "CHART in 80 seconds" });
    const video = section.getByLabel("CHART explainer video");
    await video.scrollIntoViewIfNeeded();
    await expect(video).toBeVisible();
    await expect(video).toHaveAttribute("preload", "none");
    await expectPosterLoaded(page);
    expect(requests).toEqual([]);

    const box = await video.boundingBox();
    expect(box!.width / box!.height).toBeCloseTo(16 / 9, 1);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    ).toBe(true);

    await video.evaluate((element: HTMLVideoElement) => element.play());
    await expect
      .poll(() => video.evaluate((element: HTMLVideoElement) => element.currentTime))
      .toBeGreaterThan(0.2);
    expect(requests.length).toBeGreaterThan(0);
    await section.screenshot({ path: testInfo.outputPath("explainer.png") });
  });
}

test("an unreachable bucket leaves the poster and the page intact", async ({
  page,
}) => {
  const api = await installFakeApi(page);
  api.on(/^\/api\/setup$/, (route) => json(route, { requiresOnboarding: false }));
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await serveVideo(page, 404);
  await page.goto("/");

  const video = page.getByLabel("CHART explainer video");
  // play() never settles when every source fails, so start it and move on.
  await video.evaluate((element: HTMLVideoElement) => {
    void element.play().catch(() => {});
  });
  await expect
    .poll(() => video.evaluate((element: HTMLVideoElement) => element.networkState))
    .toBe(3); // NETWORK_NO_SOURCE
  await expect(video).toBeVisible();
  await expectPosterLoaded(page);
  await expect(
    page.getByRole("heading", { name: "Explore the CHART toolkit" }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("the dashboard science card shows the explainer", async ({ page }) => {
  await installFakeApi(page);
  const requests = await serveVideo(page);
  await page.goto("/dashboard/geo-in-mp?admin_unit=geo-in-mp-bhopal&outcome=lbw");

  const card = page.getByRole("region", { name: "Understanding the science" });
  await expect(card.getByText("Video coming soon")).toHaveCount(0);
  const video = card.getByLabel("CHART explainer video");
  await expect(video).toBeVisible();
  await expectPosterLoaded(page);
  expect(requests).toEqual([]);

  await video.evaluate((element: HTMLVideoElement) => element.play());
  await expect
    .poll(() => video.evaluate((element: HTMLVideoElement) => element.currentTime))
    .toBeGreaterThan(0.2);
  await card.screenshot({ path: "../outputs/e2e/web/dashboard-explainer.png" });
});
