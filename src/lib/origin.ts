import "server-only";

export function appOrigin(request?: Request) {
  const configured = process.env.APP_URL?.replace(/\/$/, "");
  if (configured) return configured;
  if (request) {
    const url = new URL(request.url);
    const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || url.host;
    const proto = request.headers.get("x-forwarded-proto") || url.protocol.replace(":", "");
    return `${proto}://${host}`;
  }
  return "http://localhost:3000";
}

export function demoHintsOn() {
  return process.env.DEMO_HINTS !== "off";
}
