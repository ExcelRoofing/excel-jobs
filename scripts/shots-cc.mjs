import { chromium } from "playwright";
import fs from "fs";

const base = "http://127.0.0.1:3000";
const out = "/opt/cursor/artifacts";
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
  args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"],
});
const phone = {
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  permissions: ["geolocation", "camera", "microphone"],
  geolocation: { latitude: 49.2194, longitude: -122.5986 },
};
const context = await browser.newContext(phone);
const page = await context.newPage();
await page.goto(`${base}/login`);
await page.fill('input[name="email"]', "joel@excelroofing.ca");
await page.fill('input[name="password"]', "demo1234");
await page.getByRole("button", { name: "Sign in" }).click();
await page.waitForURL("**/jobs");

async function shot(name) {
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${out}/${name}.png` });
  console.log(name);
}

await page.goto(`${base}/map`);
await shot("phone_map");
await page.goto(`${base}/photos`);
await shot("phone_photo_search");
await page.goto(`${base}/activity`);
await shot("phone_activity");
await page.goto(`${base}/jobs`);
await page.getByRole("link", { name: /Chen reroof/ }).click();
await page.waitForURL(/\/jobs\/[0-9a-f-]{36}$/);
const jobUrl = page.url();
await page.goto(`${jobUrl}/feed`);
await shot("phone_feed");
await page.goto(`${jobUrl}/checklists`);
await shot("phone_checklists");
await page.goto(`${jobUrl}/compare`);
await shot("phone_compare");
await page.goto(`${jobUrl}/report`);
await shot("phone_report");
await page.goto(`${jobUrl}/photos`);
const photo = page.locator('a[href*="/photos/"]').first();
if (await photo.count()) {
  await photo.click();
  await page.waitForTimeout(600);
  await shot("phone_markup");
}
await page.goto(`${jobUrl}/capture`);
await page.waitForTimeout(1200);
await shot("phone_fast_camera");
await browser.close();
console.log("cc shots ok");
