// npm run test-photo -- <photo.jpg> [largeur]  : teste la reconnaissance MindAR d'une photo contre targets.mind (hors navigateur)
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const base = pathToFileURL(path.join(ROOT, "node_modules", "mind-ar", "src", "image-target")).href;
const FFMPEG = ["ffmpeg", "C:\Program Files\Shutter Encoder\Library\ffmpeg.exe"].find((c) => { try { execFileSync(c, ["-version"], { stdio: "ignore" }); return true; } catch { return false; } });
const tf = await import("@tensorflow/tfjs");
await import(base + "/detector/kernels/cpu/index.js");
const { CropDetector } = await import(base + "/detector/crop-detector.js");
const { Matcher } = await import(base + "/matching/matcher.js");
const msgpack = await import("@msgpack/msgpack");
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, "ra.config.json"), "utf8"));
const { dataList } = msgpack.decode(new Uint8Array(fs.readFileSync(path.join(ROOT, "docs", "targets.mind"))));
const photo = path.resolve(process.argv[2]), W = parseInt(process.argv[3] || "1280", 10);
const probe = JSON.parse(execFileSync(FFMPEG.replace("ffmpeg", "ffprobe"), ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "json", photo]).toString()).streams[0];
const H = Math.round((W * probe.height) / probe.width);
const raw = execFileSync(FFMPEG, ["-v", "error", "-i", photo, "-vf", `scale=${W}:${H}`, "-f", "rawvideo", "-pix_fmt", "gray", "-"], { maxBuffer: 1 << 28 });
const input = tf.tensor(Uint8Array.from(raw), [H, W], "float32");
const det = new CropDetector(W, H, false);
const { featurePoints } = det.detect(input);
console.log(`photo ${path.basename(photo)} → ${W}×${H}, ${featurePoints.length} points détectés`);
const matcher = new Matcher(W, H, false);
dataList.forEach((d, i) => {
  const r = matcher.matchDetection(d.matchingData, featurePoints);
  console.log(`  cible #${i} ${cfg.paires[i]?.id} : ${r.keyframeIndex !== -1 ? "✔ RECONNUE (échelle " + r.keyframeIndex + ", " + (r.screenCoords?.length ?? "?") + " points appariés)" : "✖ non reconnue"}`);
});
