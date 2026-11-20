// node scripts/test-demarrage.mjs <fake.mjpeg> [occurrence]  : mesure le temps entre le clic « Démarrer » et la caméra visible (+ détail des étapes).
// Variables : NET=4g (réseau mobile simulé, défaut), NET=none ; CPU=4 (processeur ralenti x4, défaut 1) ; REPEAT=2 (2e passage = cache chaud) ; HASH=... pour tester une variante.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."), DOCS = path.join(ROOT, "docs");
const fake = path.resolve(process.argv[2]), SITE = process.argv[3] || "prod-afpar-gra";
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".mp4": "video/mp4", ".jpg": "image/jpeg", ".mind": "application/octet-stream", ".webmanifest": "application/manifest+json" };
const server = http.createServer((req, res) => {
  let f = path.join(DOCS, decodeURIComponent(req.url.split("?")[0]).replace(/^\//, ""));
  if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, "index.html");
  if (!fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  const stat = fs.statSync(f), type = MIME[path.extname(f)] || "application/octet-stream", range = req.headers.range;
  const h = { "Content-Type": type, "Accept-Ranges": "bytes", "Cache-Control": "public, max-age=600" };   // comme GitHub Pages (10 min)
  if (range) { const [a, b] = range.replace("bytes=", "").split("-"); const s = +a, e = b ? +b : stat.size - 1; res.writeHead(206, { ...h, "Content-Range": `bytes ${s}-${e}/${stat.size}`, "Content-Length": e - s + 1 }); fs.createReadStream(f, { start: s, end: e }).pipe(res); }
  else { res.writeHead(200, { ...h, "Content-Length": stat.size }); fs.createReadStream(f).pipe(res); }
}).listen(0, "127.0.0.1");
await new Promise((r) => server.once("listening", r));
const port = server.address().port;
const chrome = ["C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe"].find((p) => fs.existsSync(p));
const REPEAT = +(process.env.REPEAT || 1), NET = process.env.NET || "4g", CPU = +(process.env.CPU || 1);
const userData = fs.mkdtempSync(path.join(process.env.TEMP || ".", "ra-demarrage-"));
const browser = await puppeteer.launch({
  executablePath: chrome, headless: "new", userDataDir: userData,
  args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--use-file-for-fake-video-capture=${fake}`,
    "--autoplay-policy=no-user-gesture-required", "--enable-unsafe-swiftshader", "--use-angle=swiftshader", "--ignore-gpu-blocklist", "--no-sandbox"],
});
for (let pass = 1; pass <= REPEAT; pass++) {
  const page = await browser.newPage();
  await page.setViewport({ width: 412, height: 800, deviceScaleFactor: 1 });
  const cdp = await page.createCDPSession();
  if (NET === "4g" && pass === 1) await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 100, downloadThroughput: (6 * 1024 * 1024) / 8, uploadThroughput: (2 * 1024 * 1024) / 8 });
  else if (NET === "4g") await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 100, downloadThroughput: (6 * 1024 * 1024) / 8, uploadThroughput: (2 * 1024 * 1024) / 8 });
  if (CPU > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU });
  await page.evaluateOnNewDocument(() => {
    window.__m = {};
    const gum = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async (c) => { window.__m.gumDebut = performance.now(); const s = await gum(c); window.__m.gumFin = performance.now(); return s; };
    const iv2 = setInterval(() => { const v = document.querySelector("#ar video"); if (v && !window.__m.videoAjoutee) window.__m.videoAjoutee = performance.now(); if (v && v.readyState >= 2 && v.videoWidth && !window.__m.videoPrete) { window.__m.videoPrete = performance.now(); clearInterval(iv2); } }, 5);
    const iv = setInterval(() => { const a = document.querySelector("#accueil"); if (a && a.hidden && !window.__m.visible) { window.__m.visible = performance.now(); clearInterval(iv); } }, 16);
  });
  const t0 = Date.now();
  await page.goto(`http://127.0.0.1:${port}/${SITE}/${process.env.HASH || ""}`, { waitUntil: "load" });
  const tLoad = Date.now() - t0;
  await new Promise((r) => setTimeout(r, +(process.env.ATTENTE || 3000)));     // temps laissé à la page pour précharger avant le clic
  await page.evaluate(() => { window.__m.clic = performance.now(); });
  await page.click("#demarrer");
  for (let i = 0; i < 300; i++) { await new Promise((r) => setTimeout(r, 100)); if (await page.evaluate(() => window.__m.visible || !document.querySelector("#erreur").hidden)) break; }
  const m = await page.evaluate(() => {
    const r = performance.getEntriesByType("resource").filter((e) => /targets\.mind$/.test(e.name))[0];
    return { ...window.__m, mind: r ? { duree: r.responseEnd - r.startTime, taille: r.transferSize, debut: r.startTime } : null, err: !document.querySelector("#erreur").hidden };
  });
  const f = (x) => (x == null ? "—" : Math.round(x) + " ms");
  console.log(`passe ${pass} (réseau ${NET}, CPU x${CPU}) : chargement page ${tLoad} ms`);
  console.log(`   clic → caméra visible : ${m.visible ? f(m.visible - m.clic) : "ÉCHEC" + (m.err ? " (erreur affichée)" : "")}`);
  console.log(`   dont getUserMedia : ${f(m.gumFin - m.gumDebut)} (début +${f(m.gumDebut - m.clic)})   targets.mind : ${m.mind ? `téléchargé de +${Math.round(m.mind.debut - m.clic)} ms, ${Math.round(m.mind.duree)} ms, transfert ${m.mind.taille} o` : "—"}`);
  console.log(`   étapes (depuis le clic) : balise caméra +${f(m.videoAjoutee - m.clic)} · flux prêt +${f(m.videoPrete - m.clic)} · accueil masqué +${f(m.visible - m.clic)}`);
  await page.close();
}
await browser.close(); server.close(); fs.rmSync(userData, { recursive: true, force: true });
