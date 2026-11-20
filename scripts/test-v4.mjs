// npm run test-v4 -- <fake-perte.mjpeg> : pause à la perte de l'affiche, reprise au retour, bouton Quitter, redémarrage
import http from "node:http"; import fs from "node:fs"; import path from "node:path"; import { fileURLToPath } from "node:url"; import puppeteer from "puppeteer-core";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."), DOCS = path.join(ROOT, "docs"), fake = path.resolve(process.argv[2]);
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".mp4": "video/mp4", ".jpg": "image/jpeg", ".webmanifest": "application/manifest+json" };
const server = http.createServer((req, res) => {
  const f = path.join(DOCS, decodeURIComponent(req.url.split("?")[0]).replace(/^\//, "") || "index.html"), file = fs.existsSync(f) && fs.statSync(f).isFile() ? f : path.join(DOCS, "index.html");
  const st = fs.statSync(file), t = MIME[path.extname(file)] || "application/octet-stream", r = req.headers.range;
  if (r) { const [a, b] = r.replace("bytes=", "").split("-"), s = +a, e = b ? +b : st.size - 1; res.writeHead(206, { "Content-Type": t, "Content-Range": `bytes ${s}-${e}/${st.size}`, "Accept-Ranges": "bytes", "Content-Length": e - s + 1 }); fs.createReadStream(file, { start: s, end: e }).pipe(res); }
  else { res.writeHead(200, { "Content-Type": t, "Content-Length": st.size }); fs.createReadStream(file).pipe(res); }
}).listen(0, "127.0.0.1"); await new Promise((r) => server.once("listening", r)); const port = server.address().port;
const browser = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: "new", args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--use-file-for-fake-video-capture=${fake}`, "--autoplay-policy=no-user-gesture-required", "--enable-unsafe-swiftshader", "--use-angle=swiftshader", "--ignore-gpu-blocklist", "--no-sandbox"] });
const page = await browser.newPage(); await page.setViewport({ width: 412, height: 800 });
page.on("pageerror", (e) => console.log("  [erreur page]", String(e).slice(0, 200)));
const etat = () => page.evaluate(() => { const v = document.querySelector("#v"); return { paused: v.paused, t: +v.currentTime.toFixed(2), scan: document.querySelector("#scan").hidden ? "" : document.querySelector("#scanTexte").textContent, quitter: !document.querySelector("#quitter").hidden, accueil: !document.querySelector("#accueil").hidden }; });
await page.goto(`http://localhost:${port}/`, { waitUntil: "networkidle0" }); await page.click("#demarrer");
let prev = "", log = [];
for (let i = 0; i < 70; i++) { await new Promise((r) => setTimeout(r, 500)); const s = await etat(); const k = (s.paused ? "PAUSE" : "LECTURE") + "|" + s.scan; if (k !== prev) { prev = k; log.push({ s: i / 2, ...s }); console.log(`  t+${i / 2}s`, JSON.stringify(s)); } }
const lect = log.filter((l) => l.paused === false).length, paus = log.filter((l) => l.paused).length;
console.log(lect >= 2 && paus >= 1 ? "✔ lecture → pause (affiche perdue) → reprise (affiche retrouvée)" : "✖ pas de cycle lecture/pause/reprise observé");
const tAvant = log.find((l) => l.paused)?.t, tReprise = log.filter((l) => !l.paused && l.t >= 0).at(-1)?.t; console.log("  temps vidéo à la pause:", tAvant, "→ après reprise:", tReprise, tReprise >= tAvant ? "(reprise sans redémarrer ✔)" : "(⚠ redémarrée ?)");
await page.click("#quitter"); await new Promise((r) => setTimeout(r, 800)); const q = await etat(); const vide = await page.evaluate(() => document.querySelector("#ar").children.length);
console.log(q.accueil && !q.quitter && vide === 0 ? "✔ Quitter : retour à l'accueil, caméra arrêtée" : "✖ Quitter incomplet " + JSON.stringify(q) + " enfants:" + vide);
await page.click("#demarrer"); let ok = false; for (let i = 0; i < 30 && !ok; i++) { await new Promise((r) => setTimeout(r, 1000)); ok = await page.evaluate(() => !document.querySelector("#chip").hidden); }
console.log(ok ? "✔ redémarrage après Quitter : affiche détectée" : "✖ redémarrage : pas de détection");
await browser.close(); server.close();
