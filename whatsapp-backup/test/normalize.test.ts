import assert from "node:assert/strict";
import test from "node:test";
import { normalizeMessage, toMillis, type NameBook } from "../src/normalize.ts";

const names: NameBook = {
  groupName: (jid) => jid,
  senderName: (jid, pushName) => pushName || jid,
};

test("group photo, voice note, document, and text are kept; a direct chat is not", () => {
  const photo = normalizeMessage(
    {
      key: { remoteJid: "111@g.us", participant: "16045550100@s.whatsapp.net", id: "abc", fromMe: false },
      messageTimestamp: 1_768_000_000,
      pushName: "Sam Crowe",
      message: { imageMessage: { caption: "Avant", mimetype: "image/jpeg", fileName: "roof.jpg" } },
    },
    names,
    () => false,
  );
  assert.equal(photo?.id, "111@g.us:abc");
  assert.equal(photo?.senderName, "Sam Crowe");
  assert.equal(photo?.caption, "Avant");
  assert.equal(photo?.media?.kind, "image");
  assert.equal(photo?.text, null);

  const voice = normalizeMessage(
    {
      key: { remoteJid: "111@g.us", participant: "16045550100@s.whatsapp.net", id: "aud" },
      messageTimestamp: { toNumber: () => 1_768_000_001 },
      pushName: "Sam",
      message: { audioMessage: { mimetype: "audio/ogg; codecs=opus", ptt: true } },
    },
    names,
    () => false,
  );
  assert.equal(voice?.media?.kind, "audio");

  const doc = normalizeMessage(
    {
      key: { remoteJid: "111@g.us", id: "doc", participant: "1@s.whatsapp.net" },
      messageTimestamp: 1_768_000_002,
      message: {
        documentWithCaptionMessage: {
          message: { documentMessage: { mimetype: "application/pdf", fileName: "quote.pdf", caption: "safety" } },
        },
      },
    },
    names,
    () => false,
  );
  assert.equal(doc?.media?.kind, "document");
  assert.equal(doc?.media?.originalName, "quote.pdf");
  assert.equal(doc?.caption, "safety");

  const text = normalizeMessage(
    {
      key: { remoteJid: "111@g.us", id: "txt", fromMe: true },
      messageTimestamp: 1_768_000_003,
      message: { conversation: "On site" },
    },
    names,
    () => false,
  );
  assert.equal(text?.text, "On site");
  assert.equal(text?.media, null);

  const direct = normalizeMessage(
    {
      key: { remoteJid: "16045550100@s.whatsapp.net", id: "dm" },
      messageTimestamp: 1_768_000_004,
      message: { conversation: "hello" },
    },
    names,
    () => false,
  );
  assert.equal(direct, null);
  assert.equal(toMillis(1_768_000_000), 1_768_000_000_000);
});

test("a known group id that is not @g.us is still backed up", () => {
  const message = normalizeMessage(
    {
      key: { remoteJid: "abc@lid", id: "z" },
      messageTimestamp: 10,
      message: { extendedTextMessage: { text: "bonjour" } },
    },
    names,
    (jid) => jid === "abc@lid",
  );
  assert.equal(message?.groupJid, "abc@lid");
  assert.equal(message?.text, "bonjour");
});
