// npm run test-nav -- <fake.mjpeg> [url] : ouvre la page docs/ dans Chrome (caméra simulée par une photo), clique « Démarrer »,
// attend la détection et enregistre des captures dans .cache/test-nav/. Sert à vérifier toute la chaîne sans téléphone.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DOCS = path.join(ROOT, "docs"), OUT = path.join(ROOT, ".cache", "test-nav");
fs.mkdirSync(OUT, { recursive: true });
const fake = path.resolve(process.argv[2]);
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".mp4": "video/mp4", ".jpg": "image/jpeg", ".mind": "application/octet-stream" };

const server = http.createServer((req, res) => {
  const f = path.join(DOCS, decodeURIComponent(req.url.split("?")[0]).replace(/^\//, "") || "index.html");
  const ok = fs.existsSync(f) && fs.statSync(f).isFile(); if (!ok) console.log("  [404 → index]", req.url);
  const file = ok ? f : path.join(DOCS, "index.html");
  const stat = fs.statSync(file), type = MIME[path.extname(file)] || "application/octet-stream", range = req.headers.range;
  if (range) { // les vidéos ont besoin des requêtes « Range »
    const [a, b] = range.replace("bytes=", "").split("-"); const s = parseInt(a, 10), e = b ? parseInt(b, 10) : stat.size - 1;
    res.writeHead(206, { "Content-Type": type, "Content-Range": `bytes ${s}-${e}/${stat.size}`, "Accept-Ranges": "bytes", "Content-Length": e - s + 1 });
    fs.createReadStream(file, { start: s, end: e }).pipe(res);
  } else { res.writeHead(200, { "Content-Type": type, "Content-Length": stat.size, "Accept-Ranges": "bytes" }); fs.createReadStream(file).pipe(res); }
}).listen(0, "127.0.0.1");
await new Promise((r) => server.once("listening", r));
const port = server.address().port;

const chrome = ["C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe"].find((p) => fs.existsSync(p));
const browser = await puppeteer.launch({
  executablePath: chrome, headless: "new",
  args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--use-file-for-fake-video-capture=${fake}`,
    "--autoplay-policy=no-user-gesture-required", "--enable-unsafe-swiftshader", "--use-angle=swiftshader", "--ignore-gpu-blocklist", "--no-sandbox"],
});
const page = await browser.newPage();
const [vw, vh] = (process.env.VUE || "412x800").split("x").map(Number);
await page.setViewport({ width: vw, height: vh, deviceScaleFactor: 1 });
page.on("console", (m) => { if (m.type() === "error") console.log("  [console]", m.text().slice(0, 200)); });
page.on("pageerror", (e) => console.log("  [erreur page]", String(e).slice(0, 300)));
await page.goto(`http://localhost:${port}/`, { waitUntil: "networkidle0" });
await page.screenshot({ path: path.join(OUT, "1-accueil.png") });
await page.click("#demarrer");
const t0 = Date.now(); let found = false;
for (let i = 0; i < 60; i++) {
  await new Promise((r) => setTimeout(r, 1000));
  const st = await page.evaluate(() => ({ chip: document.querySelector("#chip").hidden ? "" : document.querySelector("#chip").textContent, scan: !document.querySelector("#scan").hidden, err: !document.querySelector("#erreur").hidden && document.querySelector("#erreurTexte").textContent,
    t: document.querySelector("#v").currentTime, paused: document.querySelector("#v").paused, src: document.querySelector("#v").src.split("/").pop() }));
  if (i % 5 === 0) console.log(`  t+${i}s`, JSON.stringify(st));
  if (st.err) { console.log("  ERREUR affichée :", st.err); break; }
  if (st.chip && st.src) { found = true; console.log(`✔ détectée en ${((Date.now() - t0) / 1000).toFixed(1)} s :`, JSON.stringify(st)); break; }
}
await new Promise((r) => setTimeout(r, 4000));
await page.screenshot({ path: path.join(OUT, "2-detection.png") });
console.log(found ? "→ capture : .cache/test-nav/2-detection.png" : "✖ aucune détection dans le délai");
await browser.close(); server.close();
