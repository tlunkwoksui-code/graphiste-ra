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
  anchors[i].group.add(root);
  if (nouvelle) {
    pauseUtilisateur = false;
    video.src = p.video; video.loop = !!p.boucle; video.poster = p.vignette; video.load();
    caler(p);
    $("#chip").textContent = p.titre; $("#chip").hidden = false; $("#barre").hidden = false; $("#rejouer").hidden = true;
  }
  root.visible = true;
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
      filterMinCF: parseFloat(q.get("cf") || "0.0008"), filterBeta: parseFloat(q.get("beta") || "600"),
      warmupTolerance: 4, missTolerance: parseInt(q.get("miss") || "12", 10),
    });
    const { renderer, scene, camera } = mindar;
    renderer.outputEncoding = THREE.sRGBEncoding;
    texture = new THREE.VideoTexture(video); texture.encoding = THREE.sRGBEncoding; texture.minFilter = THREE.LinearFilter;
    videoMesh = new THREE.Mesh(geom, new THREE.MeshBasicMaterial({ map: texture, toneMapped: false }));
    fond = new THREE.Mesh(geom, new THREE.MeshBasicMaterial({ color: 0x000000 }));
    videoMesh.position.z = 0.002; fond.position.z = 0.001;
    root = new THREE.Group(); root.add(fond); root.add(videoMesh); root.visible = false;

    cfg.paires.forEach((p, i) => {
      const a = mindar.addAnchor(i); anchors.push(a);
      a.onTargetFound = () => {
        if (i === cur) { suivie = true; root.visible = true; if (p.quandAffichePerdue === "pause") lire(); }
        else { suivie = true; allerA(i); }
        $("#scan").hidden = true;
      };
      a.onTargetLost = () => {
        if (i !== cur) return;
        suivie = false; root.visible = false;
        if (p.quandAffichePerdue === "pause") video.pause();
        $("#scan").hidden = false;
      };
    });
    await mindar.start();
    renderer.setAnimationLoop(() => renderer.render(scene, camera));
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
