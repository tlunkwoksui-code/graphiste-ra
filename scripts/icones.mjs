// npm run icones : crée une icône par défaut (occurrences/<nom>/icone.png, 1024x1024) pour chaque occurrence qui n'en a pas.
// Pour mettre VOTRE icône : remplacez simplement ce fichier par un PNG carré (1024x1024 conseillé), motif centré (les bords peuvent être rognés par le téléphone), puis npm run build.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."), OCC = path.join(ROOT, "occurrences");
const COULEURS = { "prod-afpar-gra": "#ffb84d", "chaine-teddy-lavedet": "#4dd0ff", "comm-afpar": "#7dff9a", "anniv-mael": "#ff7de0" };
const chrome = ["C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe"].find((p) => fs.existsSync(p));
if (!chrome) { console.error("Chrome introuvable (nécessaire pour dessiner l'icône)."); process.exit(1); }
const aFaire = fs.readdirSync(OCC).filter((d) => fs.statSync(path.join(OCC, d)).isDirectory() && !fs.existsSync(path.join(OCC, d, "icone.png")));
if (!aFaire.length) { console.log("Toutes les occurrences ont déjà une icône."); process.exit(0); }
const browser = await puppeteer.launch({ executablePath: chrome, headless: "new", args: ["--no-sandbox"] });
for (const nom of aFaire) {
  const teinte = COULEURS[nom] || `hsl(${parseInt(crypto.createHash("sha1").update(nom).digest("hex").slice(0, 4), 16) % 360} 90% 65%)`;
  const page = await browser.newPage(); await page.setViewport({ width: 1024, height: 1024 });
  await page.setContent(`<body style="margin:0"><svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
    <defs><radialGradient id="g" cx="50%" cy="25%" r="90%"><stop offset="0" stop-color="#1d2430"/><stop offset="1" stop-color="#0e1116"/></radialGradient></defs>
    <rect width="1024" height="1024" fill="url(#g)"/>
    <circle cx="512" cy="512" r="290" fill="none" stroke="${teinte}" stroke-width="64"/>
    <circle cx="512" cy="512" r="112" fill="${teinte}"/>
    <path d="M512 150 L512 215 M512 809 L512 874 M150 512 L215 512 M809 512 L874 512" stroke="${teinte}" stroke-width="40" stroke-linecap="round"/>
  </svg></body>`);
  await page.screenshot({ path: path.join(OCC, nom, "icone.png"), clip: { x: 0, y: 0, width: 1024, height: 1024 } });
  console.log("✔ icône créée :", path.join("occurrences", nom, "icone.png"), teinte);
  await page.close();
}
await browser.close();
