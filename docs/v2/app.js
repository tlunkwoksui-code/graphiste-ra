// Graphiste & RA — page de réalité augmentée (MindAR image tracking + three.js)
// Une seule balise <video> sert toutes les affiches : la source n'est chargée qu'à la détection (économie de données),
// et le « Démarrer » (geste utilisateur) autorise le son pour la suite.
import * as THREE from "three";
import { MindARThree } from "mindar-image-three";

const $ = (s) => document.querySelector(s);
const q = new URLSearchParams(location.search);
const video = $("#v");
let cfg, mindar, anchors = [], root, videoMesh, fond, texture;
let cur = -1;            // index de l'affiche dont la vidéo est chargée
let suivie = false;      // l'affiche courante est-elle actuellement visible par la caméra ?
let pauseUtilisateur = false;
let SUIVI = {};          // réglages de suivi (ra.config.json « suivi », modifiables par l'URL pour les essais)
let cible = null;        // groupe MindAR de l'affiche courante (pose brute du suivi)
let premier = true;      // true = recaler la vidéo d'un coup (début de suivi), sans la faire glisser
let dernier = 0;
const lissee = { p: new THREE.Vector3(), q: new THREE.Quaternion(), s: new THREE.Vector3() };
const brute = { p: new THREE.Vector3(), q: new THREE.Quaternion(), s: new THREE.Vector3() };
const debugOn = q.has("debug"); const dbg = { frames: 0, maj: 0, t0: performance.now(), derniere: "", log: [] };
const geom = new THREE.PlaneGeometry(1, 1);

function afficherErreur(msg) {
  $("#erreurTexte").textContent = msg;
  $("#erreur").hidden = false; $("#accueil").hidden = true; $("#scan").hidden = true;
}
function messageCamera(e) {
  const n = e && (e.name || e.message || "");
  if (!window.isSecureContext) return "La caméra exige une connexion sécurisée (adresse en https://).";
  if (/NotAllowed|Permission|denied/i.test(n)) return "L'accès à la caméra a été refusé. Autorisez la caméra pour ce site (icône à gauche de l'adresse), puis touchez « Réessayer ».";
  if (/NotFound|DevicesNotFound|Overconstrained/i.test(n)) return "Aucune caméra utilisable n'a été trouvée sur cet appareil.";
  if (/NotReadable|TrackStart|Abort/i.test(n)) return "La caméra est utilisée par une autre application. Fermez-la puis touchez « Réessayer ».";
  return "Impossible de démarrer la caméra (" + (n || "erreur inconnue") + ").";
}

async function charger() {
  try {
    cfg = await (await fetch("ra.json", { cache: "no-cache" })).json();
    cfg.paires.forEach((p) => { p.quandAffichePerdue = "continuer"; });   // comportement figé de cette version
    SUIVI = { filterMinCF: 0.004, filterBeta: 1500, missTolerance: 20, warmupTolerance: 3, lissage: true, tauMin: 0.03, tauMax: 0.16, distRef: 0.12, angleRef: 0.15 };   // v2 figée : ne lit plus la config (réglages en dur)
    for (const k of Object.keys(SUIVI)) if (q.has(k)) SUIVI[k] = q.get(k) === "false" ? false : q.get(k) === "true" ? true : parseFloat(q.get(k));
    document.title = cfg.titre; $("#titre").textContent = cfg.titre; $("#consigne").textContent = cfg.consigne;
  } catch { $("#etat").textContent = "Configuration introuvable."; $("#demarrer").disabled = true; }
}

// ---------- mise en page de la vidéo sur l'affiche (calage) ----------
function caler(p) {
  const H = 1 / p.ratioImage, rI = p.ratioImage, rV = p.ratioVideo;
  texture.repeat.set(1, 1); texture.offset.set(0, 0);
  let vw = 1, vh = 1 / rV;
  if (p.calage === "remplir") {
    vw = 1; vh = H;
    if (rV > rI) { texture.repeat.x = rI / rV; texture.offset.x = (1 - texture.repeat.x) / 2; }
    else { texture.repeat.y = rV / rI; texture.offset.y = (1 - texture.repeat.y) / 2; }
  } else if (vh > H) { vh = H; vw = H * rV; }   // vidéo plus « haute » que l'affiche : on cale sur la hauteur
  videoMesh.scale.set(vw, vh, 1);
  fond.scale.set(1, H, 1); fond.visible = p.calage === "ajuster" && Math.abs(vw - 1) + Math.abs(vh - H) > 0.005;  // bandes noires
}

function allerA(i) {
  const p = cfg.paires[i];
  const nouvelle = cur !== i;
  cur = i;
  cible = anchors[i].group;
  if (nouvelle) {
    premier = true; pauseUtilisateur = false;
    video.src = p.video; video.loop = !!p.boucle; video.poster = p.vignette; video.load();
    caler(p);
    $("#chip").textContent = p.titre; $("#chip").hidden = false; $("#barre").hidden = false; $("#rejouer").hidden = true;
  }
  lire();
}

async function lire() {
  if (pauseUtilisateur) return;
  try { await video.play(); $("#son").hidden = true; }
  catch (e) {
    if (e && e.name === "NotAllowedError" && !video.muted) {     // son refusé : on lance en muet + bouton « Activer le son »
      video.muted = true;
      try { await video.play(); $("#son").hidden = false; } catch { /* sera relancé au toucher */ }
    }
  }
  majBarre();
}

function majBarre() {
  $("#pp").textContent = video.paused ? "▶" : "⏸";
  $("#mute").textContent = video.muted || video.volume === 0 ? "🔇" : "🔊";
}

// ---------- lissage de la pose, à chaque image affichée (60 Hz) ----------
// Le suivi MindAR ne fournit une nouvelle pose que ~10-20 fois par seconde : sans lissage la vidéo « saute » de pose en pose.
// Ici : lissage exponentiel dont la durée s'adapte au mouvement (comme un filtre « 1 euro »).
//  - affiche immobile : forte constante de temps (tauMax) -> les tremblements du suivi sont absorbés ;
//  - gros mouvement : faible constante de temps (tauMin) -> la vidéo suit sans traîner.
function lisser(dt) {
  if (!cible || !cible.visible) { if (root) root.visible = false; premier = true; return; }
  cible.matrix.decompose(brute.p, brute.q, brute.s);
  const cle = cible.matrix.elements[12].toFixed(5) + cible.matrix.elements[13].toFixed(5) + cible.matrix.elements[14].toFixed(5);
  if (debugOn && cle !== dbg.derniere) { dbg.derniere = cle; dbg.maj++; }
  if (premier || !SUIVI.lissage) { lissee.p.copy(brute.p); lissee.q.copy(brute.q); lissee.s.copy(brute.s); premier = false; }
  else {
    const d = brute.p.distanceTo(lissee.p) / (brute.s.x || 1), a = brute.q.angleTo(lissee.q);   // distance en « largeurs d'affiche »
    const k = Math.min(1, Math.max(d / SUIVI.distRef, a / SUIVI.angleRef));
    const tau = SUIVI.tauMax + (SUIVI.tauMin - SUIVI.tauMax) * k, f = 1 - Math.exp(-dt / tau);
    lissee.p.lerp(brute.p, f); lissee.q.slerp(brute.q, f); lissee.s.lerp(brute.s, f);
  }
  root.position.copy(lissee.p); root.quaternion.copy(lissee.q); root.scale.copy(lissee.s); root.visible = cur >= 0;
  if (debugOn) { const w = brute.s.x || 1; dbg.log.push([performance.now(), brute.p.x / w, brute.p.y / w, brute.p.z / w, lissee.p.x / w, lissee.p.y / w, lissee.p.z / w]); }
}
if (debugOn) {
  window.__dbg = dbg;
  const el = Object.assign(document.createElement("div"), { style: "position:fixed;top:60px;left:8px;z-index:50;background:#000a;color:#0f0;font:12px monospace;padding:4px 8px;border-radius:6px" });
  document.body.appendChild(el);
  setInterval(() => { const s = (performance.now() - dbg.t0) / 1000; el.textContent = `affichage ${(dbg.frames / s).toFixed(0)} i/s · suivi ${(dbg.maj / s).toFixed(1)} maj/s`; dbg.frames = 0; dbg.maj = 0; dbg.t0 = performance.now(); }, 1000);
}

// ---------- démarrage ----------
async function demarrer() {
  $("#demarrer").disabled = true; $("#etat").textContent = "Démarrage de la caméra…";
  try {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error(window.isSecureContext ? "NotFound" : "insecure");
    // geste utilisateur : on prépare la vidéo (son autorisé pour la suite)
    video.muted = false; video.volume = 1;
    mindar = new MindARThree({
      container: $("#ar"), imageTargetSrc: "targets.mind", maxTrack: 1,
      uiLoading: "no", uiScanning: "no", uiError: "no",
      filterMinCF: SUIVI.filterMinCF, filterBeta: SUIVI.filterBeta,
      warmupTolerance: SUIVI.warmupTolerance, missTolerance: SUIVI.missTolerance,
    });
    const { renderer, scene, camera } = mindar;
    renderer.outputEncoding = THREE.sRGBEncoding;
    texture = new THREE.VideoTexture(video); texture.encoding = THREE.sRGBEncoding; texture.minFilter = THREE.LinearFilter;
    videoMesh = new THREE.Mesh(geom, new THREE.MeshBasicMaterial({ map: texture, toneMapped: false }));
    fond = new THREE.Mesh(geom, new THREE.MeshBasicMaterial({ color: 0x000000 }));
    videoMesh.position.z = 0.002; fond.position.z = 0.001;
    root = new THREE.Group(); root.add(fond); root.add(videoMesh); root.visible = false; root.matrixAutoUpdate = true; scene.add(root);

    cfg.paires.forEach((p, i) => {
      const a = mindar.addAnchor(i); anchors.push(a);
      a.onTargetFound = () => {
        if (i === cur) { suivie = true; if (p.quandAffichePerdue === "pause") lire(); }
        else { suivie = true; allerA(i); }
        $("#scan").hidden = true;
      };
      a.onTargetLost = () => {
        if (i !== cur) return;
        suivie = false;
        if (p.quandAffichePerdue === "pause") video.pause();
        $("#scan").hidden = false;
      };
    });
    await mindar.start();
    dernier = performance.now();
    renderer.setAnimationLoop(() => {
      const maintenant = performance.now(), dt = Math.min((maintenant - dernier) / 1000, 0.1); dernier = maintenant;
      lisser(dt); renderer.render(scene, camera); dbg.frames++;
    });
    $("#accueil").hidden = true; $("#scan").hidden = false;
  } catch (e) {
    console.error(e);
    afficherErreur(messageCamera(e));
  }
}

// ---------- contrôles ----------
video.addEventListener("timeupdate", () => { if (video.duration) $("#prog").value = Math.round((video.currentTime / video.duration) * 1000); });
video.addEventListener("play", () => { $("#rejouer").hidden = true; majBarre(); });
video.addEventListener("pause", majBarre);
video.addEventListener("volumechange", majBarre);
video.addEventListener("ended", () => { $("#rejouer").hidden = false; majBarre(); });
video.addEventListener("error", () => { if (cur >= 0) $("#chip").textContent = "⚠ Vidéo indisponible"; });

$("#pp").onclick = () => { if (video.paused) { pauseUtilisateur = false; if (video.ended) video.currentTime = 0; lire(); } else { pauseUtilisateur = true; video.pause(); } };
$("#mute").onclick = () => { video.muted = !video.muted; $("#son").hidden = true; majBarre(); };
$("#son").onclick = () => { video.muted = false; $("#son").hidden = true; majBarre(); };
$("#rejouer").onclick = () => { video.currentTime = 0; pauseUtilisateur = false; lire(); };
$("#prog").oninput = (e) => { if (video.duration) video.currentTime = (e.target.value / 1000) * video.duration; };
$("#plein").onclick = () => {
  video.classList.add("plein"); $("#retour").hidden = false; $("#chip").hidden = true;
  video.controls = false; lire();
  if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {});
};
$("#retour").onclick = () => {
  video.classList.remove("plein"); $("#retour").hidden = true; $("#chip").hidden = false;
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
};
$("#demarrer").onclick = demarrer;
$("#reessayer").onclick = () => location.reload();
charger();
