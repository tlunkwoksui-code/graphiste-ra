// npm run build : prépare tout le site (docs/) à partir de ra.config.json et du dossier contenus/
// - vérifie les fichiers, optimise les vidéos pour le mobile (ffmpeg), compile targets.mind (MindAR), rapport.
// Tous les chemins sont relatifs à la racine du projet (dossier parent de scripts/).
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const P = (...a) => path.join(ROOT, ...a);
const CONTENUS = P("contenus"), DOCS = P("docs"), CACHE = P(".cache"), SRC = P("src");
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
if (!fs.existsSync(P("ra.config.json"))) fail("ra.config.json est introuvable à la racine du projet.");
let cfg;
try { cfg = JSON.parse(fs.readFileSync(P("ra.config.json"), "utf8")); } catch (e) { fail("ra.config.json n'est pas un JSON valide : " + e.message); }
if (!Array.isArray(cfg.paires) || !cfg.paires.length) fail("ra.config.json : la liste « paires » est vide.");
const defauts = { boucle: false, quandAffichePerdue: "continuer", calage: "ajuster", zonesIgnorees: [], ...(cfg.reglagesParDefaut || {}) };
const ids = new Set();
for (const p of cfg.paires) {
  if (!/^[A-Za-z0-9_-]+$/.test(p.id || "")) fail(`id invalide « ${p.id} » : lettres sans accent, chiffres, tirets seulement (c'est le nom du fichier vidéo publié).`);
  if (ids.has(p.id)) fail(`id en double : ${p.id}`);
  ids.add(p.id);
  for (const k of ["image", "video"]) {
    if (!p[k] || !fs.existsSync(path.join(CONTENUS, p[k]))) fail(`fichier manquant pour « ${p.id} » : contenus/${p[k]}`);
  }
  const r = { ...defauts, ...p };
  if (!["continuer", "pause"].includes(r.quandAffichePerdue)) fail(`${p.id} : quandAffichePerdue doit être "continuer" ou "pause".`);
  if (!["ajuster", "remplir"].includes(r.calage)) fail(`${p.id} : calage doit être "ajuster" ou "remplir".`);
}
log(`\n▶ ${cfg.paires.length} affiche(s) dans ra.config.json — vérification…`);

// ---------- 2. dimensions et ratios (le calage gère un écart de ratio ; on ne déforme jamais) ----------
const items = cfg.paires.map((p) => {
  const img = pngSize(path.join(CONTENUS, p.image));
  const vid = probe(path.join(CONTENUS, p.video));
  const rImg = img.width / img.height, rVid = vid.width / vid.height;
  return { p, cfg: { ...defauts, ...p }, img, vid, rImg, rVid, ecart: Math.abs(rImg - rVid) / rImg };
});

// ---------- 3. vidéos optimisées pour mobile (avec cache) ----------
fs.mkdirSync(CACHE, { recursive: true });
fs.mkdirSync(P("docs", "videos"), { recursive: true });
fs.mkdirSync(P("docs", "img"), { recursive: true });
for (const it of items) {
  const src = path.join(CONTENUS, it.p.video), out = path.join(DOCS, "videos", it.p.id + ".mp4"), stamp = path.join(CACHE, it.p.id + ".video.sig");
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
  const jpg = path.join(DOCS, "img", it.p.id + ".jpg");
  execFileSync(FFMPEG, ["-y", "-loglevel", "error", "-i", path.join(CONTENUS, it.p.image), "-vf", "scale=640:-2", "-q:v", "4", jpg]);
}

// ---------- 4. targets.mind (compilation hors ligne MindAR, sans le paquet « canvas ») ----------
const mindSig = sha(items.map((it) => fileSig(path.join(CONTENUS, it.p.image)) + ":" + it.p.id + JSON.stringify(it.cfg.zonesIgnorees || [])).concat(["mindar-1.2.5", "v2"]));
const mindOut = path.join(DOCS, "targets.mind"), mindStamp = path.join(CACHE, "targets.sig"), statsFile = path.join(CACHE, "targets.stats.json");
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
  fs.mkdirSync(DOCS, { recursive: true });
  fs.writeFileSync(mindOut, Buffer.from(comp.exportData()));
  stats = comp.data.map((d) => {
    const kf = d.matchingData, gros = kf.reduce((a, b) => (b.width > a.width ? b : a), kf[0]);
    return { points: gros.maximaPoints.length + gros.minimaPoints.length, pointsTotal: kf.reduce((s, k) => s + k.maximaPoints.length + k.minimaPoints.length, 0), echelles: kf.length };
  });
  fs.writeFileSync(mindStamp, mindSig); fs.writeFileSync(statsFile, JSON.stringify(stats));
  log("  ✔ targets.mind compilé          ");
}

// ---------- 5. manifeste pour la page + copie du site ----------
const manifest = {
  titre: cfg.titre || "Graphiste & RA", suivi: cfg.suivi || {}, consigne: cfg.consigne || "Visez une affiche",
  paires: items.map((it) => ({
    id: it.p.id, titre: it.p.titre || it.p.id, video: `videos/${it.p.id}.mp4`, vignette: `img/${it.p.id}.jpg`,
    ratioImage: +it.rImg.toFixed(4), ratioVideo: +it.rVid.toFixed(4),
    boucle: !!it.cfg.boucle, quandAffichePerdue: it.cfg.quandAffichePerdue, calage: it.cfg.calage,
  })),
};
fs.writeFileSync(path.join(DOCS, "ra.json"), JSON.stringify(manifest, null, 2));
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
if (fs.existsSync(SRC)) fs.cpSync(SRC, DOCS, { recursive: true });
if (fs.existsSync(P("versions"))) fs.cpSync(P("versions"), DOCS, { recursive: true });   // versions figées : docs/v2/ ...
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
log(`\nvidéos : ${mo(items.reduce((s, it) => s + it.videoPoids, 0))} au total — targets.mind : ${mo(fs.statSync(mindOut).size)}`);
log(avert ? `\n⚠ ${avert} affiche(s) à surveiller (voir ci-dessus).` : "\n✔ Aucun avertissement.");
log("docs/ régénéré.\n");
