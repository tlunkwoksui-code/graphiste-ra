// npm run test-fluidite -- <fake.mjpeg> : compare la fluidité de la vidéo en RA avec / sans lissage (caméra simulée en mouvement)
import http from "node:http"; import fs from "node:fs"; import path from "node:path"; import { fileURLToPath } from "node:url"; import puppeteer from "puppeteer-core";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."), DOCS = path.join(ROOT, "docs"), fake = path.resolve(process.argv[2]);
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".mp4": "video/mp4", ".jpg": "image/jpeg" };
const server = http.createServer((req, res) => {
  const f = path.join(DOCS, decodeURIComponent(req.url.split("?")[0]).replace(/^\//, "") || "index.html"), file = fs.existsSync(f) && fs.statSync(f).isFile() ? f : path.join(DOCS, "index.html");
  const st = fs.statSync(file), t = MIME[path.extname(file)] || "application/octet-stream", r = req.headers.range;
  if (r) { const [a, b] = r.replace("bytes=", "").split("-"), s = +a, e = b ? +b : st.size - 1; res.writeHead(206, { "Content-Type": t, "Content-Range": `bytes ${s}-${e}/${st.size}`, "Accept-Ranges": "bytes", "Content-Length": e - s + 1 }); fs.createReadStream(file, { start: s, end: e }).pipe(res); }
  else { res.writeHead(200, { "Content-Type": t, "Content-Length": st.size }); fs.createReadStream(file).pipe(res); }
}).listen(0, "127.0.0.1"); await new Promise((r) => server.once("listening", r)); const port = server.address().port;
const chrome = ["C:/Program Files/Google/Chrome/Application/chrome.exe"].find((p) => fs.existsSync(p));
async function essai(nom, qs, pageUrl = "") {
  const browser = await puppeteer.launch({ executablePath: chrome, headless: "new", args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--use-file-for-fake-video-capture=${fake}`, "--autoplay-policy=no-user-gesture-required", "--enable-unsafe-swiftshader", "--use-angle=swiftshader", "--ignore-gpu-blocklist", "--no-sandbox"] });
  const page = await browser.newPage(); await page.setViewport({ width: 800, height: 600 });
  page.on("pageerror", (e) => console.log("  [erreur page]", String(e).slice(0, 200))); page.on("console", (m) => { if (m.type() === "error") console.log("  [console]", m.text().slice(0, 150)); });
  await page.goto(`http://localhost:${port}/${pageUrl}?debug=1&${qs}`, { waitUntil: "networkidle0" }); await page.click("#demarrer");
  await new Promise((r) => setTimeout(r, 22000));
  const log = await page.evaluate(() => window.__dbg.log); await browser.close();
  // métrique : écart-type de l'accélération (différence seconde) de la position affichée, en largeurs d'affiche, à cadence d'image constante
  const stats = (col) => { const v = log.map((l) => [l[col], l[col + 1], l[col + 2]]); const acc = []; for (let i = 2; i < v.length; i++) acc.push(Math.hypot(v[i][0] - 2 * v[i - 1][0] + v[i - 2][0], v[i][1] - 2 * v[i - 1][1] + v[i - 2][1], v[i][2] - 2 * v[i - 1][2] + v[i - 2][2])); return acc.length ? Math.sqrt(acc.reduce((s, x) => s + x * x, 0) / acc.length) : NaN; };
  const ecart = log.length ? Math.sqrt(log.reduce((s, l) => s + (l[1] - l[4]) ** 2 + (l[2] - l[5]) ** 2 + (l[3] - l[6]) ** 2, 0) / log.length) : NaN;   // écart affiché/brut ~ retard
  const dur = log.length ? (log.at(-1)[0] - log[0][0]) / 1000 : 0;
  console.log(`${nom.padEnd(22)} images:${log.length} (${(log.length / dur).toFixed(0)} i/s)  secousse pose brute: ${stats(1).toExponential(2)}  pose affichée: ${stats(4).toExponential(2)}  écart/brut: ${ecart.toExponential(1)}`);
}
for (const v of (process.env.VERS || "v2,v3").split(",")) await essai(v + " " + (process.env.QS || ""), v === "v5" ? (process.env.QS || "") : "", v === "v5" ? "" : v + "/index.html");
server.close();
