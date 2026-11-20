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
let perteTimer = null;   // la pause à la perte de l'affiche n'a lieu qu'après une courte confirmation (évite les micro-coupures)
let pleinParVideo = false;
let enMarche = false;
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

// ---------- préchargement des cibles (dès l'ouverture de la page, pendant que l'utilisateur lit l'accueil) ----------
// targets.mind.gz (2x plus léger) est téléchargé puis décompressé ; MindAR le relit ensuite depuis la mémoire (adresse blob:) : plus aucune attente au clic.
const ciblesPretes = (async () => {
  try {
    if ("DecompressionStream" in window) {
      const r = await fetch("targets.mind.gz");
      if (r.ok) return URL.createObjectURL(new Blob([await new Response(r.body.pipeThrough(new DecompressionStream("gzip"))).arrayBuffer()]));
    }
    const r = await fetch("targets.mind");
    if (r.ok) return URL.createObjectURL(await r.blob());
  } catch { /* on laissera MindAR télécharger lui-même */ }
  return "targets.mind";
})();
// MindAR demande « ra:cibles » : on lui sert le fichier préchargé (ou on attend qu'il arrive) sans bloquer l'ouverture de la caméra
const fetchNatif = window.fetch.bind(window);
window.fetch = (u, ...a) => (u === "ra:cibles" ? ciblesPretes.then((url) => fetchNatif(url)) : fetchNatif(u, ...a));

async function charger() {
  try {
    cfg = await (await fetch("ra.json", { cache: "no-cache" })).json();
    SUIVI = { filterMinCF: 0.004, filterBeta: 1500, missTolerance: 20, warmupTolerance: 3, lissage: true, tauMin: 0.08, tauMax: 0.30, distRef: 0.12, angleRef: 0.15, zoneMorte: 0.005, prediction: 0.5, predMax: 0.09, mediane: 5, ...(cfg.suivi || {}) };
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

// ---------- v3 : stabilisation + prédiction + lissage de la pose, à chaque image affichée (60 Hz) ----------
// Le suivi MindAR ne fournit une nouvelle pose que ~10-20 fois par seconde. Trois étages :
//  1. zone morte : une micro-variation de la pose (tremblement du suivi) est ignorée -> affiche immobile = vidéo immobile ;
//  2. prédiction : entre deux mises à jour, on prolonge le mouvement à la vitesse mesurée (plafonnée) -> plus de « marches d'escalier » ni de retard ;
//  3. lissage exponentiel adaptatif (fort au repos, léger en mouvement) pour gommer le reste.
const hist = [];   // dernières poses brutes distinctes (pour la médiane)
const _mp = new THREE.Vector3(), _mq = new THREE.Quaternion();
const med = (a) => { const b = a.slice().sort((x, y) => x - y); return b[(b.length - 1) >> 1]; };
function medianePose(pos, quat) {
  const N = Math.max(1, Math.round(SUIVI.mediane || 1));
  hist.push({ p: pos.clone(), q: quat.clone() }); while (hist.length > N) hist.shift();
  if (hist.length < 3) { _mp.copy(pos); _mq.copy(quat); return; }
  _mp.set(med(hist.map((h) => h.p.x)), med(hist.map((h) => h.p.y)), med(hist.map((h) => h.p.z)));
  const ref = hist[hist.length - 1].q, qs = hist.map((h) => (h.q.dot(ref) < 0 ? { x: -h.q.x, y: -h.q.y, z: -h.q.z, w: -h.q.w } : h.q));
  _mq.set(med(qs.map((h) => h.x)), med(qs.map((h) => h.y)), med(qs.map((h) => h.z)), med(qs.map((h) => h.w))).normalize();
}
const etat = { ok: false, pos: new THREE.Vector3(), quat: new THREE.Quaternion(), t: 0, vel: new THREE.Vector3(), omega: new THREE.Vector3() };
const _dq = new THREE.Quaternion(), _axe = new THREE.Vector3(), _pred = new THREE.Vector3(), _qp = new THREE.Quaternion();
function lisser(dt) {
  if (!cible || !cible.visible) { if (root) root.visible = false; premier = true; etat.ok = false; hist.length = 0; return; }
  const now = performance.now() / 1000;
  cible.matrix.decompose(brute.p, brute.q, brute.s);
  const w = brute.s.x || 1;
  const cle = cible.matrix.elements[12].toFixed(5) + cible.matrix.elements[13].toFixed(5) + cible.matrix.elements[14].toFixed(5) + cible.matrix.elements[0].toFixed(5);
  if (cle !== dbg.derniere) {
    dbg.derniere = cle; dbg.maj++;
    medianePose(brute.p, brute.q);
    if (!etat.ok) { etat.pos.copy(_mp); etat.quat.copy(_mq); etat.t = now; etat.vel.set(0, 0, 0); etat.omega.set(0, 0, 0); etat.ok = true; }
    else {
      const du = Math.max(now - etat.t, 1e-3);
      const dp = _mp.distanceTo(etat.pos) / w, da = _mq.angleTo(etat.quat);
      if (SUIVI.zoneMorte && dp < SUIVI.zoneMorte && da < SUIVI.zoneMorte * 4) {
        etat.vel.multiplyScalar(0.5); etat.omega.multiplyScalar(0.5);            // 1. micro-variation : on garde la pose précédente
        etat.t = now;
      } else {
        const vNouv = _mp.clone().sub(etat.pos).divideScalar(du);
        _dq.copy(_mq).multiply(etat.quat.clone().invert()); if (_dq.w < 0) { _dq.x *= -1; _dq.y *= -1; _dq.z *= -1; _dq.w *= -1; }
        const ang = 2 * Math.acos(Math.min(1, _dq.w)), sn = Math.sqrt(Math.max(1 - _dq.w * _dq.w, 0));
        _axe.set(sn > 1e-4 ? _dq.x / sn : 0, sn > 1e-4 ? _dq.y / sn : 0, sn > 1e-4 ? _dq.z / sn : 0);
        const oNouv = _axe.multiplyScalar(ang / du);
        etat.vel.lerp(vNouv, 0.6); etat.omega.lerp(oNouv, 0.6);
        etat.pos.copy(_mp); etat.quat.copy(_mq); etat.t = now;
      }
    }
  }
  // 2. prédiction (âge de la dernière pose, plafonné ; la vitesse s'éteint si le suivi n'a plus rien de neuf)
  const age = Math.min(now - etat.t, SUIVI.predMax);
  const amort = Math.max(0, 1 - Math.max(0, now - etat.t - SUIVI.predMax) / 0.25);
  _pred.copy(etat.pos).addScaledVector(etat.vel, age * amort * SUIVI.prediction);
  _qp.copy(etat.quat); const om = etat.omega.length();
  if (om > 1e-5 && SUIVI.prediction) { _axe.copy(etat.omega).normalize(); _dq.setFromAxisAngle(_axe, om * age * amort * SUIVI.prediction); _qp.premultiply(_dq); }
  if (premier || !SUIVI.lissage) { lissee.p.copy(_pred); lissee.q.copy(_qp); lissee.s.copy(brute.s); premier = false; }
  else {
    const d = _pred.distanceTo(lissee.p) / w, a = _qp.angleTo(lissee.q);
    const k = Math.min(1, Math.max(d / SUIVI.distRef, a / SUIVI.angleRef));
    const tau = SUIVI.tauMax + (SUIVI.tauMin - SUIVI.tauMax) * k, f = 1 - Math.exp(-dt / tau);
    lissee.p.lerp(_pred, f); lissee.q.slerp(_qp, f); lissee.s.lerp(brute.s, f);
  }
  root.position.copy(lissee.p); root.quaternion.copy(lissee.q); root.scale.copy(lissee.s); root.visible = cur >= 0;
  if (debugOn) dbg.log.push([performance.now(), brute.p.x / w, brute.p.y / w, brute.p.z / w, lissee.p.x / w, lissee.p.y / w, lissee.p.z / w]);
}
if (debugOn) {
  window.__dbg = dbg;
  const el = Object.assign(document.createElement("div"), { style: "position:fixed;top:60px;left:8px;z-index:50;background:#000a;color:#0f0;font:12px monospace;padding:4px 8px;border-radius:6px" });
  document.body.appendChild(el);
  setInterval(() => { const s = (performance.now() - dbg.t0) / 1000; el.textContent = `affichage ${(dbg.frames / s).toFixed(0)} i/s · suivi ${(dbg.maj / s).toFixed(1)} maj/s`; dbg.frames = 0; dbg.maj = 0; dbg.t0 = performance.now(); }, 1000);
}

// ---------- démarrage ----------
function enVideoSeule() { return video.classList.contains("plein"); }
function pleinEcranNavigateur() {   // équivalent de F11 : doit être appelé dans un geste de l'utilisateur
  const el = document.documentElement, f = el.requestFullscreen || el.webkitRequestFullscreen;
  if (f && !document.fullscreenElement && !document.webkitFullscreenElement) { try { const r = f.call(el, { navigationUI: "hide" }); if (r && r.catch) r.catch(() => {}); } catch { /* refusé : tant pis */ } }
}
function majBoutonsEcran() {
  const plein = !!(document.fullscreenElement || document.webkitFullscreenElement), peut = !!(document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen);
  $("#fsnav").hidden = !(enMarche && peut && !plein && !enVideoSeule());
}
async function demarrer() {
  pleinEcranNavigateur();
  $("#demarrer").disabled = true; $("#etat").textContent = "Démarrage de la caméra…";
  try {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error(window.isSecureContext ? "NotFound" : "insecure");
    // geste utilisateur : on prépare la vidéo (son autorisé pour la suite)
    video.muted = false; video.volume = 1;
    mindar = new MindARThree({
      container: $("#ar"), imageTargetSrc: "ra:cibles", maxTrack: 1,
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
        clearTimeout(perteTimer);
        if (i === cur) { suivie = true; if (p.quandAffichePerdue === "pause" && !video.ended && !enVideoSeule()) lire(); }   // reprise là où la vidéo s'était arrêtée
        else { suivie = true; allerA(i); }
        $("#scan").hidden = true;
      };
      a.onTargetLost = () => {
        if (i !== cur) return;
        suivie = false;
        if (p.quandAffichePerdue === "pause" && !enVideoSeule()) {
          clearTimeout(perteTimer);
          perteTimer = setTimeout(() => { if (!suivie) video.pause(); }, 350);
        }
        if (!enVideoSeule()) { $("#scanTexte").textContent = p.quandAffichePerdue === "pause" ? "Affiche perdue — la vidéo reprendra" : "Recherche de l'affiche…"; $("#scan").hidden = false; }
      };
    });
    // la caméra s'affiche dès qu'elle est prête ; MindAR finit de s'initialiser derrière (la reconnaissance démarre juste après)
    let cameraVisible = false;
    const montrerCamera = () => { if (cameraVisible) return; cameraVisible = true; $("#accueil").hidden = true; $("#scanTexte").textContent = "Préparation…"; $("#scan").hidden = false; };
    const guet = setInterval(() => { const v = mindar.video; if (v && v.readyState >= 2 && v.videoWidth) { clearInterval(guet); montrerCamera(); } }, 30);
    try { await mindar.start(); } finally { clearInterval(guet); }
    montrerCamera();
    dernier = performance.now();
    renderer.setAnimationLoop(() => {
      const maintenant = performance.now(), dt = Math.min((maintenant - dernier) / 1000, 0.1); dernier = maintenant;
      lisser(dt); renderer.render(scene, camera); dbg.frames++;
    });
    enMarche = true; $("#scanTexte").textContent = "Recherche d'une affiche…";
    $("#accueil").hidden = true; $("#scan").hidden = false; $("#quitter").hidden = false; majBoutonsEcran();
  } catch (e) {
    console.error(e);
    afficherErreur(messageCamera(e));
  }
}

// ---------- quitter : arrête la caméra, la vidéo, le plein écran, et revient à l'accueil ----------
function quitter() {
  clearTimeout(perteTimer);
  try { video.pause(); video.removeAttribute("src"); video.load(); } catch { /* rien */ }
  try { mindar.renderer.setAnimationLoop(null); mindar.stop(); mindar.renderer.dispose(); } catch { /* déjà arrêté */ }
  $("#ar").innerHTML = ""; if (texture) texture.dispose();
  anchors = []; cur = -1; cible = null; suivie = false; premier = true; etat.ok = false; enMarche = false; pleinParVideo = false;
  video.classList.remove("plein");
  for (const s of ["#barre", "#chip", "#scan", "#retour", "#quitter", "#son", "#fsnav"]) $(s).hidden = true;
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  $("#plein").hidden = false; $("#accueil").hidden = false; $("#demarrer").disabled = false;
  $("#etat").textContent = "Caméra arrêtée. Vous pouvez fermer cet onglet ou redémarrer.";
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
  video.classList.add("plein"); $("#plein").hidden = true; $("#retour").hidden = false; $("#chip").hidden = true; $("#scan").hidden = true; $("#fsnav").hidden = true;
  clearTimeout(perteTimer); video.controls = false; lire();
  if (!document.fullscreenElement) { pleinParVideo = true; pleinEcranNavigateur(); }   // sinon on est déjà en plein écran : rien à faire
};
$("#retour").onclick = () => {
  video.classList.remove("plein"); $("#retour").hidden = true; $("#plein").hidden = false; $("#chip").hidden = false; $("#scan").hidden = suivie;
  if (pleinParVideo && document.fullscreenElement) document.exitFullscreen().catch(() => {});
  pleinParVideo = false; majBoutonsEcran();
};
$("#quitter").onclick = quitter;
$("#fsnav").onclick = () => { pleinEcranNavigateur(); };
document.addEventListener("fullscreenchange", majBoutonsEcran); document.addEventListener("webkitfullscreenchange", majBoutonsEcran);
$("#demarrer").onclick = demarrer;
$("#reessayer").onclick = () => location.reload();
charger();
