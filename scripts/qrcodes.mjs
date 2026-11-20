// npm run qrcodes : génère un QR code (PNG) par occurrence dans qrcodes/
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import QRCode from "qrcode";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASE = "https://tlunkwoksui-code.github.io/realite-augmentee/";
fs.mkdirSync(path.join(ROOT, "qrcodes"), { recursive: true });
for (const s of fs.readdirSync(path.join(ROOT, "occurrences"))) {
  const url = BASE + s + "/", out = path.join(ROOT, "qrcodes", `qr-${s}.png`);
  await QRCode.toFile(out, url, { width: 900, margin: 2, errorCorrectionLevel: "M" });
  console.log("✔", out, "→", url);
}
