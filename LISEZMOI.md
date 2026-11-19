# Graphiste & RA — mode d'emploi

Page web de réalité augmentée : on vise une affiche avec le téléphone, sa vidéo se superpose dessus.

## Organisation
- `contenus/` : VOS fichiers sources (une paire PNG + MP4 par affiche, même nom). Non publié.
- `ra.config.json` : le fichier de paramétrage (vous le modifiez à la main).
- `scripts/` : scripts de préparation (build, publication).
- `docs/` : le site publié par GitHub Pages (généré, ne pas modifier à la main).
- `_compo/` : vos fichiers de composition (PSD). Non publié.

## Réglages (ra.config.json)
- `boucle` : `false` = la vidéo s'arrête sur la dernière image (bouton « Rejouer »).
- `quandAffichePerdue` : `"continuer"` (la vidéo continue, le son aussi) ou `"pause"`.
- `calage` : `"ajuster"` = la vidéo est entière, centrée sur l'affiche ; `"remplir"` = elle couvre toute l'affiche (bords rognés).
Chaque paire peut reprendre ces réglages pour elle seule.

## Ajouter une affiche (à compléter à l'étape 7)
1. Déposer `affiche-03.png` + `affiche-03.mp4` dans `contenus/`.
2. Ajouter une ligne dans `ra.config.json`.
3. `npm run build`
4. `npm run publier`
