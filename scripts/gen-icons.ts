import fs from "fs";
import path from "path";
import { renderMark } from "../src/lib/png.ts";

const dir = path.join(process.cwd(), "public", "icons");
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, "icon-192.png"), renderMark(192));
fs.writeFileSync(path.join(dir, "icon-512.png"), renderMark(512));
fs.writeFileSync(path.join(dir, "apple-touch-icon.png"), renderMark(180));
console.log("icons ok");
