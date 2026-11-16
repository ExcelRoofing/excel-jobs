import { createServer } from "http";
import { loadEnvFile } from "../config.ts";

const PORT = 8765;
const REDIRECT = `http://127.0.0.1:${PORT}`;
const SCOPE = "https://www.googleapis.com/auth/drive";

loadEnvFile();

const clientId = (process.env.GOOGLE_OAUTH_CLIENT_ID || "").trim();
const clientSecret = (process.env.GOOGLE_OAUTH_CLIENT_SECRET || "").trim();
if (!clientId || !clientSecret) {
  console.error("Set GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET in whatsapp-backup/.env first.");
  console.error("The README has the click-by-click Google steps.");
  process.exit(1);
}

const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
authUrl.searchParams.set("client_id", clientId);
authUrl.searchParams.set("redirect_uri", REDIRECT);
authUrl.searchParams.set("response_type", "code");
authUrl.searchParams.set("scope", SCOPE);
authUrl.searchParams.set("access_type", "offline");
authUrl.searchParams.set("prompt", "consent");

console.log("Open this address in a browser on this same computer, signed in as the company Google account:");
console.log("");
console.log(authUrl.toString());
console.log("");
console.log("Google will warn that the app is not verified. That is expected for a private company tool.");
console.log("Choose Advanced, then continue. After you allow access, this window prints the refresh token.");
console.log("Waiting...");

const code = await new Promise<string>((resolve, reject) => {
  const server = createServer((req, res) => {
    const url = new URL(req.url || "/", REDIRECT);
    const value = url.searchParams.get("code");
    const error = url.searchParams.get("error");
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    if (!value) {
      res.end(`<p>Google did not return a code${error ? `: ${error}` : ""}. You can close this window and try again.</p>`);
      server.close();
      reject(new Error(error || "no code"));
      return;
    }
    res.end("<p>Signed in. You can close this window and go back to the terminal.</p>");
    server.close();
    resolve(value);
  });
  server.listen(PORT, "127.0.0.1");
  setTimeout(() => {
    server.close();
    reject(new Error("timed out waiting for Google. Run npm run auth again."));
  }, 5 * 60 * 1000).unref();
});

const response = await fetch("https://oauth2.googleapis.com/token", {
  method: "POST",
  headers: { "content-type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: REDIRECT,
    grant_type: "authorization_code",
  }),
});
const json = (await response.json()) as { refresh_token?: string; error?: string; error_description?: string };
if (!response.ok || !json.refresh_token) {
  console.error(json.error_description || json.error || `Google token exchange failed (${response.status})`);
  process.exit(1);
}

console.log("");
console.log("Put this line in whatsapp-backup/.env");
console.log("");
console.log(`GOOGLE_OAUTH_REFRESH_TOKEN=${json.refresh_token}`);
console.log("");
console.log("Then create a Drive folder named WhatsApp Backup and set GOOGLE_DRIVE_ROOT_FOLDER_ID to the id in its address.");
