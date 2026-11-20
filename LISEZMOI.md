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

v1 saccadé · v2 lissage · v3 zone morte + prédiction (validée) · v4 plein écran, pause hors champ, bouton Quitter · **v5 (actuelle)** médiane de 5 poses, zone morte et lissage renforcés (validée sur téléphone le 20/11/2026).
Le site a été réorganisé en occurrences le 20/11/2026 (ancien dépôt `graphiste-ra` abandonné).
