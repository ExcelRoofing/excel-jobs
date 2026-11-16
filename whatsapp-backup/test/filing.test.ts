import assert from "node:assert/strict";
import test from "node:test";
import { planFiling, logLine, shortId } from "../src/filing.ts";
import { detectTags } from "../src/tags.ts";
import { zonedParts } from "../src/time.ts";

const ZONE = "America/Vancouver";

test("Pacific date rolls back across midnight UTC", () => {
  const parts = zonedParts(Date.parse("2026-01-15T07:30:45.000Z"), ZONE);
  assert.equal(parts.day, "2026-01-14");
  assert.equal(parts.time, "233045");
  assert.equal(parts.clock, "23:30:45");
});

test("tag words in English and French, whole words only", () => {
  assert.deepEqual(detectTags("Avant le solin").map((tag) => tag.slug), ["before", "flashing"]);
  assert.deepEqual(detectTags("après").map((tag) => tag.slug), ["after"]);
  assert.deepEqual(detectTags("Apres la pluie").map((tag) => tag.slug), ["after"]);
  assert.deepEqual(detectTags("puits de lumière cassé").map((tag) => tag.slug), ["skylight"]);
  assert.deepEqual(detectTags("photo fin des travaux aujourd'hui").map((tag) => tag.slug), ["completion"]);
  assert.deepEqual(detectTags("#safety").map((tag) => tag.slug), ["safety"]);
  assert.deepEqual(detectTags("BEFORE").map((tag) => tag.slug), ["before"]);
  assert.deepEqual(detectTags("materials, sécurité").map((tag) => tag.slug), ["materials", "safety"]);
  assert.deepEqual(detectTags("dommages au solin").map((tag) => tag.slug), ["damage", "flashing"]);
  assert.deepEqual(detectTags("pendant").map((tag) => tag.slug), ["during"]);
  assert.deepEqual(detectTags("solaire").map((tag) => tag.slug), ["solar"]);
  assert.deepEqual(detectTags("beforehand the solarium").map((tag) => tag.slug), []);
  assert.deepEqual(detectTags("avantage").map((tag) => tag.slug), []);
  assert.deepEqual(detectTags("").map((tag) => tag.slug), []);
});

test("first tag in the caption picks the folder, and the name keeps time, sender, and file", () => {
  const plan = planFiling({
    groupName: "Chen / reroof",
    senderName: "Sam Crowe",
    timestampMs: Date.parse("2026-01-15T07:30:45.000Z"),
    timeZone: ZONE,
    originalName: "roof.jpg",
    mime: "image/jpeg",
    kind: "image",
    caption: "after then before",
    messageId: "111@g.us:abcd",
  });
  assert.equal(plan.folderTag, "After");
  assert.deepEqual(plan.tags.map((tag) => tag.slug), ["after", "before"]);
  assert.equal(plan.segments[0], "Chen reroof");
  assert.equal(plan.filename, "233045_after+before_Sam-Crowe_roof_abcd.jpg");
  assert.equal(plan.drivePath, "Chen reroof/2026-01-14/After/233045_after+before_Sam-Crowe_roof_abcd.jpg");
  assert.equal(shortId("111@g.us:abcd"), "abcd");
});

test("voice notes get a voice name when WhatsApp sends none", () => {
  const plan = planFiling({
    groupName: "Chen",
    senderName: "Sam",
    timestampMs: Date.parse("2026-06-15T19:00:00.000Z"),
    timeZone: ZONE,
    originalName: null,
    mime: "audio/ogg; codecs=opus",
    kind: "audio",
    caption: null,
    messageId: "g:voice",
  });
  assert.equal(plan.folderTag, null);
  assert.match(plan.filename, /^\d{6}_Sam_voice_oice\.ogg$/);
});

test("log lines keep one clock and do not break on extra spaces", () => {
  const line = logLine({
    timestampMs: Date.parse("2026-01-15T07:30:45.000Z"),
    timeZone: ZONE,
    senderName: "Sam\nCrowe",
    text: "On the roof\nnow",
  });
  assert.equal(line, "[23:30:45] Sam Crowe: On the roof now");
});
