# Réalité augmentée — plusieurs « occurrences » sur un seul site

Une affiche imprimée déclenche sa vidéo, posée exactement dessus (MindAR + three.js). Un seul code, plusieurs occurrences : chacune a ses affiches, sa reconnaissance et son adresse (donc son QR code).

| Occurrence | Adresse (à ouvrir avec Chrome) |
|---|---|
| `prod-afpar-gra` | https://tlunkwoksui-code.github.io/realite-augmentee/prod-afpar-gra/ |
| `chaine-teddy-lavedet` | https://tlunkwoksui-code.github.io/realite-augmentee/chaine-teddy-lavedet/ |

La racine `https://tlunkwoksui-code.github.io/realite-augmentee/` est une page neutre (pas de menu). Le site est public.

## Organisation du dossier

- `src/` : le code commun (app.js, style.css, modèles de pages). Une amélioration profite à toutes les occurrences.
- `ra.config.json` : réglages communs (suivi/fluidité, calage…), surchargeables dans chaque occurrence.
- `occurrences/<nom>/ra.config.json` : titre, consigne et liste des `paires` de l'occurrence.
- `contenus/<nom>/` : VOS fichiers sources (une paire PNG + MP4 par affiche). Non publié.
- `docs/` : le site généré (ne pas modifier à la main).
- `qrcodes/` : un QR code par occurrence.
- `versions/` : anciennes versions du code (v2, v3, v4), archivées, non publiées.

## Ajouter une affiche à une occurrence

1. Déposer le PNG (l'affiche) et le MP4 dans `contenus/<nom>/` (même nom de base, ex. `cafe.png` + `cafe.mp4`).
2. Ajouter dans `paires` de `occurrences/<nom>/ra.config.json` :
   `{ "id": "cafe", "image": "cafe.png", "video": "cafe.mp4", "titre": "Café" }` (`id` : lettres sans accent, chiffres, tirets, tiret bas).
3. `npm run build -- <nom>` (ou `npm run build` pour toutes) : vérifie, optimise les vidéos (1280 px max), compile `targets.mind`, affiche le rapport (lire les ⚠).
4. `npm run publier -- "message"` : envoie sur GitHub, le site est à jour ~1 minute après.

Une occurrence sans affiche affiche « Bientôt disponible ».

## Créer une nouvelle occurrence

Créer `occurrences/<nom>/ra.config.json` (copier celui de `chaine-teddy-lavedet`, `paires` vide) et `contenus/<nom>/`. Le nom : minuscules, chiffres, tirets (il fait partie de l'adresse, ne plus le changer une fois le QR code imprimé).

## Réglages (ra.config.json)

- `reglagesParDefaut` : `boucle`, `quandAffichePerdue` ("pause" ou "continuer"), `calage` ("ajuster" = bandes noires, "remplir" = recadre), `zonesIgnorees` (zones [x,y,l,h] en fractions, ignorées pour la détection : logos communs à plusieurs affiches).
- `suivi` : fluidité du positionnement de la vidéo (lissage, zone morte, médiane…). Valeurs v5 validées.
- Chaque affiche peut avoir son format (paysage, portrait…) : la page lit le ratio de l'affiche et celui de la vidéo. Jamais de déformation.
- Pour une bonne reconnaissance : détails nets (contours, textures, texte), éviter les grands aplats. Le rapport de `npm run build` avertit sous 300 points.

## Tests sans téléphone

- `npm run test-photo -- <photo.jpg>` : reconnaissance d'une photo (variable `SITE=<nom>`, défaut prod-afpar-gra).
- `npm run test-nav -- contenus/photos-test/fake-xxx.mjpeg` : Chrome avec caméra simulée.
- `node scripts/test-croise.mjs` : matrice de confusion entre les affiches d'une occurrence.

## Historique du suivi

v1 saccadé · v2 lissage · v3 zone morte + prédiction (validée) · v4 plein écran, pause hors champ, bouton Quitter · v5 médiane de 5 poses, zone morte et lissage renforcés (validée sur téléphone le 20/11/2026) · v6 démarrage caméra instantané (préchargement des cibles) · v7 bouton « Retour RA » à la place de « ⤢ Vidéo », « Quitter » toujours visible · v8 plus aucun plein écran du navigateur (ni bouton, ni message « pour quitter le plein écran… » de Chrome). Pour une plein écran sans message : « Ajouter à l'écran d'accueil » (le manifeste est en mode plein écran) · v9 bouton « ✕ Quitter » sur l'accueil ; le code est lié à la page par un numéro de version (`app.js?v=…`) pour qu'un cache du téléphone ne mélange plus ancien et nouveau code (cause du bouton « Démarrer » inactif après v8). · v10 application installable (icône, manifeste, service worker) · **v11 (actuelle)** plein écran sans barre d'adresse : manifeste en `fullscreen` (lancement depuis le raccourci de l'écran d'accueil) + plein écran du navigateur demandé au clic sur « Démarrer la caméra » quand on arrive d'un QR code (Chrome affiche alors son message « pour quitter le plein écran… », impossible à supprimer). Pas de bouton « Installer » : le raccourci se crée par le menu ⋮ de Chrome (« Ajouter à l'écran d'accueil »). Icône : `occurrences/<nom>/icone.png` (`npm run icones`, remplaçable par la vôtre, carrée 1024x1024).
Le site a été réorganisé en occurrences le 20/11/2026 (ancien dépôt `graphiste-ra` abandonné).