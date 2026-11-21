// npm run build : prépare tout le site (docs/) à partir de ra.config.json et du dossier contenus/
// - vérifie les fichiers, optimise les vidéos pour le mobile (ffmpeg), compile targets.mind (MindAR), rapport.
// Tous les chemins sont relatifs à la racine du projet (dossier parent de scripts/).
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import zlib from "node:zlib";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const P = (...a) => path.join(ROOT, ...a);
// Usage : npm run build            -> toutes les occurrences (dossiers de occurrences/)
//         npm run build -- <nom>   -> une seule occurrence
const OCC = P("occurrences");
const toutes = fs.existsSync(OCC) ? fs.readdirSync(OCC).filter((d) => fs.statSync(path.join(OCC, d)).isDirectory()) : [];
const SITE = process.argv[2];
if (!SITE) {
  if (!toutes.length) { console.error("Aucune occurrence dans occurrences/"); process.exit(1); }
  for (const s of toutes) execFileSync(process.execPath, [fileURLToPath(import.meta.url), s], { stdio: "inherit" });
  process.exit(0);
}
if (!toutes.includes(SITE)) { console.error(`Occurrence inconnue « ${SITE} ». Existantes : ${toutes.join(", ")}`); process.exit(1); }
if (!/^[a-z0-9-]+$/.test(SITE)) { console.error(`Nom d'occurrence invalide « ${SITE} » : minuscules, chiffres et tirets seulement (c'est une partie de l'adresse).`); process.exit(1); }
// dossier des contenus : « contenus/<nom> », ou à défaut un dossier de même nom sans tirets ni majuscules (ex. annivMael pour anniv-mael)
const norm = (x) => x.toLowerCase().replace(/[-_ ]/g, "");
const dossierContenus = fs.existsSync(P("contenus", SITE)) ? SITE : (fs.readdirSync(P("contenus")).find((d) => norm(d) === norm(SITE)) || SITE);
const CONTENUS = P("contenus", dossierContenus), DOCS = P("docs"), OUT = P("docs", SITE), CACHE = P(".cache", SITE), SRC = P("src");
const VIDEO = { largeurMax: 1280, crf: 28, audio: "128k" };
const MIN_POINTS = 300; // en dessous : avertissement (affiche pauvre en détails)

const log = (...a) => console.log(...a);
const fail = (msg) => { console.error("\n✖ STOP : " + msg + "\n"); process.exit(1); };
const mo = (n) => (n / 1048576).toFixed(1) + " Mo";

// ---------- outils ffmpeg / ffprobe ----------
function findTool(name) {
  const candidates = [process.env[name.toUpperCase()], name, `C:\\Program Files\\Shutter Encoder\\Library\\${name}.exe`].filter(Boolean);
  for (const c of candidates) {
    try { execFileSync(c, ["-version"], { stdio: "ignore" }); return c; } catch { /* suivant */ }
  }
  fail(`${name} est introuvable. Installez ffmpeg (winget install Gyan.FFmpeg) ou définissez la variable ${name.toUpperCase()}.`);
}
const FFMPEG = findTool("ffmpeg"), FFPROBE = findTool("ffprobe");

function probe(file) {
  const out = execFileSync(FFPROBE, ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height:format=duration", "-of", "json", file]).toString();
  const j = JSON.parse(out);
  return { width: j.streams[0].width, height: j.streams[0].height, duree: parseFloat(j.format.duration) };
}
function pngSize(file) { // lit la taille dans l'en-tête PNG (sans bibliothèque)
  const b = fs.readFileSync(file).subarray(0, 24);
  if (b.toString("ascii", 1, 4) !== "PNG") fail(`${path.basename(file)} n'est pas un vrai fichier PNG.`);
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
}
const sha = (parts) => crypto.createHash("sha1").update(parts.join("|")).digest("hex").slice(0, 16);
const fileSig = (f) => { const s = fs.statSync(f); return `${path.basename(f)}:${s.size}:${Math.round(s.mtimeMs)}`; };

// ---------- 1. config + présence des fichiers ----------
// réglages communs (ra.config.json à la racine) + réglages propres à l'occurrence (occurrences/<nom>/ra.config.json)
const lireJson = (f) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch (e) { fail(f + " est introuvable ou invalide : " + e.message); } };
const commun = lireJson(P("ra.config.json")), propre = lireJson(path.join(OCC, SITE, "ra.config.json"));
const cfg = { ...commun, ...propre, reglagesParDefaut: { ...commun.reglagesParDefaut, ...propre.reglagesParDefaut }, suivi: { ...commun.suivi, ...propre.suivi } };
if (!Array.isArray(cfg.paires)) fail(`occurrences/${SITE}/ra.config.json : la liste « paires » est absente.`);
const ecrireHtml = (src, dest) => { fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.writeFileSync(dest, fs.readFileSync(path.join(SRC, src), "utf8").replaceAll("{{V}}", sha([fs.readFileSync(path.join(SRC, "app.js"), "utf8"), fs.readFileSync(path.join(SRC, "style.css"), "utf8")]).slice(0, 8)).replaceAll("{{TITRE}}", (cfg.titre || SITE).replace(/&/g, "&amp;"))); };
if (!cfg.paires.length) {   // occurrence encore vide : page « bientôt disponible »
  fs.rmSync(OUT, { recursive: true, force: true });
  ecrireHtml("bientot.html", path.join(OUT, "index.html")); ecrireHtml("racine.html", path.join(DOCS, "index.html")); fs.writeFileSync(path.join(DOCS, ".nojekyll"), "");
  console.log(`
▶ ${SITE} : aucune affiche pour l'instant → page « bientôt disponible » (docs/${SITE}/).
`); process.exit(0);
}
const defauts = { boucle: false, quandAffichePerdue: "continuer", calage: "ajuster", zonesIgnorees: [], ...(cfg.reglagesParDefaut || {}) };
const ids = new Set();
for (const p of cfg.paires) {
  if (!/^[A-Za-z0-9_-]+$/.test(p.id || "")) fail(`id invalide « ${p.id} » : lettres sans accent, chiffres, tirets seulement (c'est le nom du fichier vidéo publié).`);
  if (ids.has(p.id)) fail(`id en double : ${p.id}`);
  ids.add(p.id);
  for (const k of ["image", "video"]) {
    if (!p[k] || !fs.existsSync(path.join(CONTENUS, p[k]))) fail(`fichier manquant pour « ${p.id} » : contenus/${SITE}/${p[k]}`);
  }
  const r = { ...defauts, ...p };
  if (!["continuer", "pause"].includes(r.quandAffichePerdue)) fail(`${p.id} : quandAffichePerdue doit être "continuer" ou "pause".`);
  if (!["ajuster", "remplir"].includes(r.calage)) fail(`${p.id} : calage doit être "ajuster" ou "remplir".`);
}
log(`\n▶ ${cfg.paires.length} affiche(s) pour « ${SITE} » — vérification…`);

// ---------- 2. dimensions et ratios (le calage gère un écart de ratio ; on ne déforme jamais) ----------
const items = cfg.paires.map((p) => {
  const img = pngSize(path.join(CONTENUS, p.image));
  const vid = probe(path.join(CONTENUS, p.video));
  const rImg = img.width / img.height, rVid = vid.width / vid.height;
  return { p, cfg: { ...defauts, ...p }, img, vid, rImg, rVid, ecart: Math.abs(rImg - rVid) / rImg };
});

// ---------- 3. vidéos optimisées pour mobile (avec cache) ----------
fs.mkdirSync(CACHE, { recursive: true });
fs.mkdirSync(path.join(OUT, "videos"), { recursive: true });
fs.mkdirSync(path.join(OUT, "img"), { recursive: true });
for (const it of items) {
  const src = path.join(CONTENUS, it.p.video), out = path.join(OUT, "videos", it.p.id + ".mp4"), stamp = path.join(CACHE, it.p.id + ".video.sig");
  const sig = sha([fileSig(src), JSON.stringify(VIDEO), "v2-cote-max"]);
  if (fs.existsSync(out) && fs.existsSync(stamp) && fs.readFileSync(stamp, "utf8") === sig) { it.videoCache = true; }
  else {
    log(`  ⚙ optimisation de ${it.p.video} (plus grand côté 1280 px max, CRF ${VIDEO.crf})… patience`);
    const args = ["-y", "-loglevel", "error", "-i", src,
      "-vf", `scale='if(gt(iw,ih),min(${VIDEO.largeurMax},iw),-2)':'if(gt(iw,ih),-2,min(${VIDEO.largeurMax},ih))'`,
      "-c:v", "libx264", "-preset", "slow", "-crf", String(VIDEO.crf), "-profile:v", "high", "-level", "4.0", "-pix_fmt", "yuv420p",
      "-c:a", "aac", "-b:a", VIDEO.audio, "-ac", "2", "-movflags", "+faststart", out];
    execFileSync(FFMPEG, args, { stdio: "inherit" });
    fs.writeFileSync(stamp, sig);
  }
  it.videoPoids = fs.statSync(out).size; it.videoOut = probe(out);
  // vignette JPG de l'affiche (affichage de secours / poster vidéo)
  const jpg = path.join(OUT, "img", it.p.id + ".jpg");
  execFileSync(FFMPEG, ["-y", "-loglevel", "error", "-i", path.join(CONTENUS, it.p.image), "-vf", "scale=640:-2", "-q:v", "4", jpg]);
}

// ---------- 4. targets.mind (compilation hors ligne MindAR, sans le paquet « canvas ») ----------
const mindSig = sha(items.map((it) => fileSig(path.join(CONTENUS, it.p.image)) + ":" + it.p.id + JSON.stringify(it.cfg.zonesIgnorees || [])).concat(["mindar-1.2.5", "v2"]));
const mindOut = path.join(OUT, "targets.mind"), mindStamp = path.join(CACHE, "targets.sig"), statsFile = path.join(CACHE, "targets.stats.json");
let stats;
if (fs.existsSync(mindOut) && fs.existsSync(mindStamp) && fs.readFileSync(mindStamp, "utf8") === mindSig && fs.existsSync(statsFile)) {
  stats = JSON.parse(fs.readFileSync(statsFile, "utf8")); log("  ✔ targets.mind inchangé (cache)");
} else {
  log("  ⚙ compilation des cibles MindAR (peut prendre plusieurs minutes)…");
  const mod = pathToFileURL(P("node_modules", "mind-ar", "src", "image-target")).href;
  const { CompilerBase } = await import(mod + "/compiler-base.js");
  const { buildTrackingImageList } = await import(mod + "/image-list.js");
  const { extractTrackingFeatures } = await import(mod + "/tracker/extract-utils.js");
  await import(mod + "/detector/kernels/cpu/index.js");
  class Compilateur extends CompilerBase {
    createProcessCanvas(img) { return { getContext: () => ({ drawImage() {}, getImageData: () => ({ data: img.rgba }) }) }; }
    compileTrack({ progressCallback, targetImages, basePercent }) {
      const per = (100 - basePercent) / targetImages.length, list = []; let pc = 0;
      for (const t of targetImages) {
        const il = buildTrackingImageList(t);
        list.push(extractTrackingFeatures(il, () => { pc += per / il.length; progressCallback(basePercent + pc); }));
      }
      return Promise.resolve(list);
    }
  }
  const images = items.map((it) => { // décode le PNG en pixels RGBA via ffmpeg (aplati sur fond blanc)
    const raw = execFileSync(FFMPEG, ["-v", "error", "-i", path.join(CONTENUS, it.p.image), "-f", "rawvideo", "-pix_fmt", "rgba", "-"], { maxBuffer: 1 << 30 });
    const rgba = new Uint8ClampedArray(raw.buffer, raw.byteOffset, raw.length);
    // zones ignorées : éléments identiques sur plusieurs affiches (logos, textes communs) -> repeints en blanc UNIQUEMENT pour la détection
    for (const [zx, zy, zw, zh] of it.cfg.zonesIgnorees || []) {
      const x0 = Math.round(zx * it.img.width), x1 = Math.min(it.img.width, Math.round((zx + zw) * it.img.width));
      const y0 = Math.round(zy * it.img.height), y1 = Math.min(it.img.height, Math.round((zy + zh) * it.img.height));
      for (let y = y0; y < y1; y++) rgba.fill(255, (y * it.img.width + x0) * 4, (y * it.img.width + x1) * 4);
    }
    return { width: it.img.width, height: it.img.height, rgba };
  });
  const comp = new Compilateur();
  let last = -10;
  await comp.compileImageTargets(images, (p) => { if (p - last >= 10) { last = p; process.stdout.write(`    ${Math.round(p)} %\r`); } });
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(mindOut, Buffer.from(comp.exportData()));
  stats = comp.data.map((d) => {
    const kf = d.matchingData, gros = kf.reduce((a, b) => (b.width > a.width ? b : a), kf[0]);
    return { points: gros.maximaPoints.length + gros.minimaPoints.length, pointsTotal: kf.reduce((s, k) => s + k.maximaPoints.length + k.minimaPoints.length, 0), echelles: kf.length };
  });
  fs.writeFileSync(mindStamp, mindSig); fs.writeFileSync(statsFile, JSON.stringify(stats));
  log("  ✔ targets.mind compilé          ");
}

// version compressée (gzip) : 2x plus légère à télécharger ; la page la décompresse elle-même (DecompressionStream)
fs.writeFileSync(mindOut + ".gz", zlib.gzipSync(fs.readFileSync(mindOut), { level: 9 }));

// ---------- 5. manifeste pour la page + copie du site ----------
const manifest = {
  titre: cfg.titre || "Graphiste & RA", suivi: cfg.suivi || {}, consigne: cfg.consigne || "Visez une affiche",
  paires: items.map((it) => ({
    id: it.p.id, titre: it.p.titre || it.p.id, video: `videos/${it.p.id}.mp4`, vignette: `img/${it.p.id}.jpg`,
    ratioImage: +it.rImg.toFixed(4), ratioVideo: +it.rVid.toFixed(4),
    boucle: !!it.cfg.boucle, quandAffichePerdue: it.cfg.quandAffichePerdue, calage: it.cfg.calage,
  })),
};
fs.writeFileSync(path.join(OUT, "ra.json"), JSON.stringify(manifest, null, 2));
// bibliothèques copiées localement (versions figées : three 0.160.0 + mind-ar 1.2.5) -> pas de dépendance à un CDN
const VEND = path.join(DOCS, "vendor"); fs.mkdirSync(path.join(VEND, "addons", "renderers"), { recursive: true });
fs.copyFileSync(P("node_modules", "three", "build", "three.module.js"), path.join(VEND, "three.module.js"));
fs.copyFileSync(P("node_modules", "three", "examples", "jsm", "renderers", "CSS3DRenderer.js"), path.join(VEND, "addons", "renderers", "CSS3DRenderer.js"));
const bundle = P("node_modules", "mind-ar", "dist", "mindar-image-three.prod.js");
const aFaire = ["mindar-image-three.prod.js"], faits = new Set();   // copie aussi les fichiers « ./xxx.js » référencés (récursif)
while (aFaire.length) {
  const nom = aFaire.pop(); if (faits.has(nom)) continue; faits.add(nom);
  const f = P("node_modules", "mind-ar", "dist", nom); fs.copyFileSync(f, path.join(VEND, nom));
  for (const m of fs.readFileSync(f, "utf8").matchAll(/"\.\/([A-Za-z0-9_.-]+\.js)"/g)) aFaire.push(m[1]);
}
// code commun (à la racine du site) + page propre à l'occurrence
for (const f of ["app.js", "style.css"]) fs.copyFileSync(path.join(SRC, f), path.join(DOCS, f));
ecrireHtml("occurrence.html", path.join(OUT, "index.html")); ecrireHtml("racine.html", path.join(DOCS, "index.html"));
// application installable (PWA) : icônes (créées depuis occurrences/<nom>/icone.png), manifeste, mini service worker
const icone = path.join(OCC, SITE, "icone.png");
const icones = [];
if (fs.existsSync(icone)) {
  for (const [nom, t] of [["icon-32.png", 32], ["icon-180.png", 180], ["icon-192.png", 192], ["icon-512.png", 512]]) {
    execFileSync(FFMPEG, ["-y", "-loglevel", "error", "-i", icone, "-vf", `scale=${t}:${t}:flags=lanczos`, path.join(OUT, nom)]);
  }
  icones.push({ src: "icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" }, { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" }, { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" });
} else log(`  ⚠ pas d'icône pour « ${SITE} » : lancez « npm run icones » (ou déposez occurrences/${SITE}/icone.png).`);
fs.writeFileSync(path.join(OUT, "manifest.webmanifest"), JSON.stringify({
  id: "./", name: cfg.titre || SITE, short_name: cfg.nomCourt || cfg.titre || SITE, description: cfg.consigne || "", start_url: "./", scope: "./",
  display: "fullscreen", display_override: ["fullscreen", "standalone"], background_color: "#0e1116", theme_color: "#0e1116", icons: icones,
}, null, 2));
fs.writeFileSync(path.join(OUT, "sw.js"), `// service worker minimal : rend le site installable ; tout passe par le réseau (jamais de vieille version en cache)
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});
`);
fs.writeFileSync(path.join(DOCS, ".nojekyll"), "");

// ---------- 6. rapport ----------
log("\n==================== RAPPORT ====================");
let avert = 0;
items.forEach((it, i) => {
  log(`\n#${i} ${it.p.id} — ${it.p.titre || ""}`);
  log(`   affiche : ${it.img.width}×${it.img.height}  ratio ${it.rImg.toFixed(3)}`);
  log(`   vidéo   : ${it.vid.width}×${it.vid.height}  ratio ${it.rVid.toFixed(3)}  (${it.vid.duree.toFixed(0)} s)  → optimisée ${it.videoOut.width}×${it.videoOut.height}, ${mo(it.videoPoids)}`);
  if (it.ecart > 0.01) log(`   ℹ ratios différents (écart ${(it.ecart * 100).toFixed(0)} %) : calage « ${it.cfg.calage} » → ${it.cfg.calage === "ajuster" ? "bandes noires sur l'affiche" : "vidéo recadrée"} (jamais déformée).`);
  const s = stats[i];
  if (s) {
    log(`   points caractéristiques : ${s.points} (échelle max), ${s.pointsTotal} au total sur ${s.echelles} échelles`);
    if (s.points < MIN_POINTS) { avert++; log(`   ⚠ AVERTISSEMENT : peu de points (< ${MIN_POINTS}) → reconnaissance risquée (trop d'aplats ?).`); }
  }
});
log(`\nvidéos : ${mo(items.reduce((s, it) => s + it.videoPoids, 0))} au total — targets.mind : ${mo(fs.statSync(mindOut).size)} (${mo(fs.statSync(mindOut + ".gz").size)} compressé)`);
log(avert ? `\n⚠ ${avert} affiche(s) à surveiller (voir ci-dessus).` : "\n✔ Aucun avertissement.");
log("docs/ régénéré.\n");
