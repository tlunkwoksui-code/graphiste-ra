// node scripts/test-plein.mjs <fake.mjpeg> : vérifie les boutons « ⤢ Vidéo » / « ◀ Retour RA » (même place dans la barre du bas) et « ✕ Quitter » toujours visible en haut à droite.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."), DOCS = path.join(ROOT, "docs"), fake = path.resolve(process.argv[2]);
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".mp4": "video/mp4", ".jpg": "image/jpeg", ".mind": "application/octet-stream", ".gz": "application/gzip", ".webmanifest": "application/manifest+json" };
const server = http.createServer((req, res) => {
  let f = path.join(DOCS, decodeURIComponent(req.url.split("?")[0]).replace(/^\//, ""));
  if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, "index.html");
  if (!fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  const st = fs.statSync(f), t = MIME[path.extname(f)] || "application/octet-stream", r = req.headers.range;
  if (r) { const [a, b] = r.replace("bytes=", "").split("-"), s = +a, e = b ? +b : st.size - 1; res.writeHead(206, { "Content-Type": t, "Content-Range": `bytes ${s}-${e}/${st.size}`, "Accept-Ranges": "bytes", "Content-Length": e - s + 1 }); fs.createReadStream(f, { start: s, end: e }).pipe(res); }
  else { res.writeHead(200, { "Content-Type": t, "Content-Length": st.size }); fs.createReadStream(f).pipe(res); }
}).listen(0, "127.0.0.1");
await new Promise((r) => server.once("listening", r));
const port = server.address().port;
const chrome = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const browser = await puppeteer.launch({ executablePath: chrome, headless: "new", args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--use-file-for-fake-video-capture=${fake}`, "--autoplay-policy=no-user-gesture-required", "--enable-unsafe-swiftshader", "--use-angle=swiftshader", "--ignore-gpu-blocklist", "--no-sandbox"] });
const page = await browser.newPage();
await page.setViewport({ width: 412, height: 800 });
await page.goto(`http://127.0.0.1:${port}/prod-afpar-gra/`, { waitUntil: "load" });
await page.click("#demarrer");
const etat = () => page.evaluate(() => {
  const vis = (s) => { const e = document.querySelector(s); if (!e || e.hidden) return null; const r = e.getBoundingClientRect(); return r.width ? [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)] : null; };
  return { plein: vis("#plein"), retour: vis("#retour"), quitter: vis("#quitter"), enPlein: document.querySelector("#v").classList.contains("plein") };
});
for (let i = 0; i < 60; i++) { await new Promise((r) => setTimeout(r, 500)); if (await page.evaluate(() => !document.querySelector("#barre").hidden)) break; }
const a = await etat(); console.log("RA        :", JSON.stringify(a));
await page.click("#plein"); await new Promise((r) => setTimeout(r, 600));
const b = await etat(); console.log("plein     :", JSON.stringify(b));
await page.screenshot({ path: path.join(ROOT, ".cache", "test-plein.png") });
await page.click("#retour"); await new Promise((r) => setTimeout(r, 600));
const c = await etat(); console.log("retour RA :", JSON.stringify(c));
const ok = a.plein && !a.retour && a.quitter && b.retour && !b.plein && b.quitter && b.enPlein && Math.abs(b.retour[0] + b.retour[2] - a.plein[0] - a.plein[2]) <= 2 && Math.abs(b.retour[1] - a.plein[1]) <= 4 && c.plein && !c.retour && c.quitter && !c.enPlein;
console.log(ok ? "✔ « Retour RA » prend la place de « ⤢ Vidéo » ; « Quitter » reste en haut à droite" : "✖ comportement inattendu");
await browser.close(); server.close();
