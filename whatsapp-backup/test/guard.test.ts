import assert from "node:assert/strict";
import { readFileSync } from "fs";
import path from "path";
import test from "node:test";
import { fileURLToPath } from "url";

test("the WhatsApp adapter never calls an outgoing chat method", () => {
  const file = path.join(path.dirname(fileURLToPath(import.meta.url)), "../src/whatsapp.ts");
  const source = readFileSync(file, "utf8");
  const forbidden = [
    ".sendMessage(",
    ".readMessages(",
    ".sendPresenceUpdate(",
    ".chatModify(",
    ".relayMessage(",
    ".groupParticipantsUpdate(",
    ".sendReceipt(",
    ".sendReceipts(",
    ".logout(",
    ".rejectCall(",
  ];
  for (const call of forbidden) assert.equal(source.includes(call), false, call);
});
