// node scripts/test-installable.mjs [occurrence] : demande à Chrome si la page est installable (manifeste, icônes, service worker)
import http from "node:http"; import fs from "node:fs"; import path from "node:path"; import { fileURLToPath } from "node:url"; import puppeteer from "puppeteer-core";
const DOCS = path.join(path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."), "docs"), SITE = process.argv[2] || "prod-afpar-gra";
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".webmanifest": "application/manifest+json" };
const server = http.createServer((req, res) => { let f = path.join(DOCS, decodeURIComponent(req.url.split("?")[0])); if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, "index.html"); if (!fs.existsSync(f)) { res.writeHead(404); return res.end(); } res.writeHead(200, { "Content-Type": MIME[path.extname(f)] || "application/octet-stream" }); fs.createReadStream(f).pipe(res); }).listen(0, "127.0.0.1");
await new Promise((r) => server.once("listening", r));
const b = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: "new", args: ["--no-sandbox"] });
const p = await b.newPage(); const c = await p.createCDPSession();
await p.goto(`http://127.0.0.1:${server.address().port}/${SITE}/`, { waitUntil: "networkidle0" });
await new Promise((r) => setTimeout(r, 1500));
const m = await c.send("Page.getAppManifest"); const e = await c.send("Page.getInstallabilityErrors");
console.log("manifeste :", m.url.split("/").slice(-2).join("/"), "· erreurs manifeste :", JSON.stringify(m.errors));
console.log("icônes :", JSON.stringify(JSON.parse(m.data).icons.map((i) => i.sizes + "/" + i.purpose)));
console.log(e.installabilityErrors.length ? "✖ erreurs d'installation : " + JSON.stringify(e.installabilityErrors) : "✔ la page est installable");
await b.close(); server.close();
