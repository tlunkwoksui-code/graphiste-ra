// npm run test-croise : montre chaque affiche (son PNG réduit) à la reconnaissance MindAR et indique quelles cibles la reconnaissent.
// Idéal : chaque affiche ne reconnaît QUE sa propre cible (matrice diagonale). Un écart = risque de lancer la mauvaise vidéo.
import fs from "node:fs"; import path from "node:path"; import { execFileSync } from "node:child_process"; import { fileURLToPath, pathToFileURL } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const base = pathToFileURL(path.join(ROOT, "node_modules", "mind-ar", "src", "image-target")).href;
const FFMPEG = ["ffmpeg", "C:\Program Files\Shutter Encoder\Library\ffmpeg.exe"].find((c) => { try { execFileSync(c, ["-version"], { stdio: "ignore" }); return true; } catch { return false; } });
const tf = await import("@tensorflow/tfjs"); await import(base + "/detector/kernels/cpu/index.js");
const { CropDetector } = await import(base + "/detector/crop-detector.js"); const { Matcher } = await import(base + "/matching/matcher.js"); const msgpack = await import("@msgpack/msgpack");
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, "occurrences", process.env.SITE || "prod-afpar-gra", "ra.config.json"), "utf8"));
const { dataList } = msgpack.decode(new Uint8Array(fs.readFileSync(path.join(ROOT, "docs", process.env.SITE || "prod-afpar-gra", "targets.mind"))));
const LARGEUR = parseInt(process.argv[2] || "640", 10);
console.log(`Chaque ligne = une affiche montrée à la caméra (PNG réduit à ${LARGEUR} px de large) ; colonnes = cibles reconnues\n`);
for (const [i, p] of cfg.paires.entries()) {
  const file = path.join(ROOT, "contenus", process.env.SITE || "prod-afpar-gra", p.image);
  const pr = JSON.parse(execFileSync(FFMPEG.replace("ffmpeg", "ffprobe"), ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "json", file]).toString()).streams[0];
  const W = Math.min(LARGEUR, pr.width), H = Math.round((W * pr.height) / pr.width);
  const raw = execFileSync(FFMPEG, ["-v", "error", "-i", file, "-vf", `scale=${W}:${H}`, "-f", "rawvideo", "-pix_fmt", "gray", "-"], { maxBuffer: 1 << 28 });
  const { featurePoints } = new CropDetector(W, H, false).detect(tf.tensor(Uint8Array.from(raw), [H, W], "float32"));
  const matcher = new Matcher(W, H, false), reco = [];
  dataList.forEach((d, j) => { const r = matcher.matchDetection(d.matchingData, featurePoints); if (r.keyframeIndex !== -1) reco.push(cfg.paires[j].id + (r.screenCoords ? `(${r.screenCoords.length})` : "")); });
  const ok = reco.length === 1 && reco[0].startsWith(p.id);
  console.log(`${ok ? "✔" : reco.includes(p.id) || reco.some((r) => r.startsWith(p.id)) ? "⚠" : "✖"} ${p.id.padEnd(12)} (${featurePoints.length} pts) → ${reco.join(", ") || "aucune cible"}`);
}
