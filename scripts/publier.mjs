// npm run publier : enregistre (commit) et envoie (push) le site vers GitHub. Pages se met à jour tout seul en ~1 minute.
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const git = (...a) => execFileSync("git", a, { cwd: ROOT, encoding: "utf8" });
const message = process.argv.slice(2).join(" ") || "Mise à jour " + new Date().toLocaleString("fr-FR");
git("add", "-A");
if (!git("status", "--porcelain").trim()) { console.log("Rien à publier : aucun changement depuis la dernière fois. Pensez à lancer « npm run build » d'abord."); process.exit(0); }
git("commit", "-q", "-m", message);
console.log(git("push", "origin", "main") || "✔ Envoyé.");
console.log("✔ Publié. Le site se met à jour dans ~1 minute : https://tlunkwoksui-code.github.io/graphiste-ra/");
