export function safeNext(value: string | null | undefined, fallback = "/jobs") {
  if (!value) return fallback;
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return fallback;
  return value;
}

export function safeSegment(input: string, fallback = "file") {
  const cleaned = input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w.\- ()]+/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+$/, "")
    .slice(0, 80);
  return cleaned || fallback;
}

export function slugify(input: string) {
  const s = input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return s || "tag";
}

export function excerpt(input: string, max = 140) {
  const one = input.replace(/\s+/g, " ").trim();
  if (one.length <= max) return one;
  return `${one.slice(0, max - 1)}…`;
}

export function mapsHref(query: string) {
  return `https://maps.google.com/?q=${encodeURIComponent(query)}`;
}

export function addressLine(address: string, city: string | null) {
  return city ? `${address}, ${city}` : address;
}
