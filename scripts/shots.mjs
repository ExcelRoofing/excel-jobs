import { chromium } from "playwright";
import fs from "fs";

const base = process.env.BASE_URL || "http://127.0.0.1:3000";
const out = "/opt/cursor/artifacts";
fs.mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
const phone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };

async function login(email) {
  const context = await browser.newContext({
    ...phone,
    geolocation: { latitude: 49.2194, longitude: -122.5986 },
    permissions: ["geolocation"],
  });
  const page = await context.newPage();
  await page.goto(`${base}/login`);
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', "demo1234");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/jobs");
  return { context, page };
}

async function shot(page, name) {
  await page.waitForTimeout(400);
  const file = `${out}/${name}.png`;
  await page.screenshot({ path: file, fullPage: false });
  console.log(name);
}

const joel = await login("joel@excelroofing.ca");
await shot(joel.page, "phone_jobs");
await joel.page.getByRole("link", { name: /Chen reroof/ }).click();
await joel.page.waitForURL("**/jobs/**");
await shot(joel.page, "phone_job");
await joel.page.getByRole("link", { name: "Job chat" }).click();
await joel.page.waitForTimeout(600);
await shot(joel.page, "phone_chat");
await joel.page.goto(joel.page.url().replace(/\/chat$/, ""));
await joel.page.getByRole("link", { name: /^Photos/ }).click();
await shot(joel.page, "phone_photos");
await joel.page.getByRole("link", { name: "Damage" }).click();
await joel.page.waitForTimeout(300);
await shot(joel.page, "phone_photos_damage");
await joel.page.getByRole("link", { name: "Take photo" }).click();
await shot(joel.page, "phone_capture");

const png = fs.readFileSync("/tmp/house.png");
await joel.page.locator('input[type="file"]').last().setInputFiles({ name: "roof.png", mimeType: "image/png", buffer: png });
await joel.page.waitForTimeout(800);
await joel.page.getByRole("button", { name: "Before" }).click();
await shot(joel.page, "phone_capture_ready");

await joel.page.goto(`${base}/jobs`);
await joel.page.getByRole("link", { name: /Chen reroof/ }).click();
await joel.page.getByRole("link", { name: "Files" }).click();
await shot(joel.page, "phone_files");
await joel.page.getByRole("link", { name: "Back to job" }).click();
await joel.page.getByRole("link", { name: /customer link/i }).click();
await shot(joel.page, "phone_share");
const portalUrl = await joel.page.locator(".mono").innerText();

await joel.page.goto(`${base}/chats`);
await shot(joel.page, "phone_chats");
await joel.page.goto(`${base}/alerts`);
await shot(joel.page, "phone_alerts");

await joel.context.setOffline(true);
await joel.page.goto(`${base}/jobs`).catch(() => undefined);
await joel.page.goto(`${base}/outbox`).catch(() => undefined);
await joel.context.setOffline(false);

const offline = await browser.newContext(phone);
const offPage = await offline.newPage();
await offPage.goto(`${base}/login`);
await offPage.fill('input[name="email"]', "sam.crowe@demo.excelroofing.ca");
await offPage.fill('input[name="password"]', "demo1234");
await offPage.getByRole("button", { name: "Sign in" }).click();
await offPage.waitForURL("**/jobs");
await shot(offPage, "phone_jobs_crew");
await offPage.getByRole("link", { name: /Chen reroof/ }).click();
await offPage.getByRole("link", { name: "Take photo" }).click();
await offPage.locator('input[type="file"]').last().setInputFiles({ name: "queued.png", mimeType: "image/png", buffer: png });
await offPage.getByRole("button", { name: "Flashing" }).click();
await offPage.context().setOffline(true);
await offPage.getByRole("button", { name: "Save photo" }).click();
await offPage.waitForTimeout(800);
await shot(offPage, "phone_offline_queue");

const portal = await browser.newContext(phone);
const portalPage = await portal.newPage();
await portalPage.goto(portalUrl.trim());
await portalPage.waitForTimeout(500);
await shot(portalPage, "phone_portal");

const thedy = await browser.newContext(phone);
const fr = await thedy.newPage();
await fr.goto(`${base}/login`);
await fr.fill('input[name="email"]', "thedy@excelroofing.ca");
await fr.fill('input[name="password"]', "demo1234");
await fr.getByRole("button", { name: "Sign in" }).click();
await fr.waitForURL("**/jobs");
await shot(fr, "phone_jobs_fr");

await browser.close();
console.log("shots ok", portalUrl);
