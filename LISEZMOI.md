# Graphiste & RA — mode d'emploi

Page web de réalité augmentée : on vise une affiche imprimée avec le téléphone, sa vidéo se superpose dessus.

**Adresse du site : https://tlunkwoksui-code.github.io/graphiste-ra/** (à ouvrir avec Chrome sur Android)

## Organisation
- `contenus/` : VOS fichiers sources (une paire PNG + MP4 par affiche, même nom). Non publié.
- `ra.config.json` : le fichier de paramétrage (vous le modifiez à la main).
- `src/` : le code de la page (HTML, CSS, JS). `docs/` : le site généré, publié par GitHub Pages — ne pas modifier à la main.
- `scripts/` : les outils (`build`, `publier`, tests). `_compo/` : vos PSD. Non publié.

## Ajouter une affiche en 4 gestes
1. Déposer `affiche-03.png` + `affiche-03.mp4` dans `contenus/` (noms en minuscules, chiffres et tirets, sans espace ni accent). Le PNG = la zone image seule, sans les marges blanches de la feuille.
2. Ajouter une ligne dans `paires` de `ra.config.json` :
   `{ "id": "affiche-03", "image": "affiche-03.png", "video": "affiche-03.mp4", "titre": "Mon titre" }`
3. `npm run build` : vérifie, optimise les vidéos (1280 px), compile `targets.mind`, affiche le rapport (lire les ⚠).
4. `npm run publier` : envoie sur GitHub ; le site est à jour environ 1 minute plus tard.

## Réglages (ra.config.json)
- `boucle` : `false` = la vidéo s'arrête sur la dernière image (bouton « Rejouer »).
- `quandAffichePerdue` : `"continuer"` (la vidéo continue, le son aussi) ou `"pause"`.
- `calage` : `"ajuster"` = vidéo entière centrée (bandes noires si le ratio diffère) ; `"remplir"` = elle couvre toute l'affiche (bords rognés).
- `zonesIgnorees` : zones [x, y, largeur, hauteur] (0 à 1) repeintes en blanc UNIQUEMENT pour la reconnaissance. Sert à effacer ce qui est identique sur plusieurs affiches (logos, textes communs), pour ne pas confondre deux affiches. Réglable par paire.
Chaque paire peut reprendre ces réglages pour elle seule.

## Conseils pour que les affiches soient bien reconnues
- La reconnaissance s'appuie sur des détails nets (contours, textures, texte). Les grands aplats de couleur unie et les dégradés flous donnent peu de points : le rapport de `npm run build` affiche un ⚠ si une affiche en a trop peu.
- Deux affiches qui se ressemblent (mêmes logos, même mise en page) risquent d'être confondues : utiliser `zonesIgnorees`, ou ajouter un élément très différent sur chacune.
- Imprimer net, sans reflet : papier mat, éclairage uniforme, affiche bien à plat. Se placer à 40 cm - 1 m, l'affiche entière dans le champ au départ.
- Un fond chargé en détails (illustration, texture, texte) vaut mieux qu'un fond uni.

## Tester sans téléphone
- `npm run test-photo -- contenus/photos-test/photo.jpg` : teste la reconnaissance d'une photo (hors navigateur).
- `npm run test-nav -- contenus/photos-test/fake-xxx.mjpeg` : ouvre la page dans Chrome avec une caméra simulée.

## Réglage de la fluidité de la vidéo (section « suivi » de ra.config.json)
Le suivi de l'affiche ne fournit une nouvelle position que 10 à 20 fois par seconde ; la page lisse donc le mouvement à chaque image affichée.
- `lissage` : `true` / `false`.
- `tauMax` (0,16 s) : lissage quand l'affiche est immobile ; plus grand = moins de tremblements, un peu plus de retard.
- `tauMin` (0,03 s) : lissage pendant un grand mouvement ; plus petit = la vidéo suit sans traîner.
- `filterMinCF`, `filterBeta`, `missTolerance` : filtre interne de MindAR.
Pour essayer sans rien publier, ajouter à l'adresse, par exemple : `?tauMax=0.25&tauMin=0.05` ; `?debug=1` affiche le nombre d'images par seconde et de mises à jour du suivi.

## Versions du suivi (historique)
- **v1** : première version, saccadée (tag git `v1`).
- **v2** : lissage de la pose à chaque image — mieux. Reste accessible à `/v2/` (https://tlunkwoksui-code.github.io/graphiste-ra/v2/).
- **v3** (adresse principale) : v2 + zone morte (l'affiche immobile ne tremble plus), prédiction du mouvement entre deux mises à jour du suivi, lissage ajusté (`tauMin` 0,06 ; `tauMax` 0,14 ; `prediction` 0,8 ; `zoneMorte` 0,003 ; `predMax` 0,09).
Retour à v2 : ouvrir l'adresse `/v2/`, ou republier en remplaçant `src/app.js` par `versions/v2/app.js`.
- **v3** validée par l'utilisateur le 20/11/2026, figée à `/v3/` (https://tlunkwoksui-code.github.io/graphiste-ra/v3/).
- **v4** (adresse principale) : v3 + navigateur en plein écran au démarrage (équivalent de F11, Chrome Android), vidéo en pause quand l'affiche sort du champ puis reprise au même endroit quand on la revisse (`quandAffichePerdue: "pause"`), bouton « Quitter » (arrête caméra et vidéo, sort du plein écran, retourne à l'accueil), bouton « ⛶ Plein écran » si on est sorti du plein écran, boutons déplacés pour libérer l'écran.
  Sur iPhone/Safari le plein écran du navigateur n'existe pas : ajouter la page à l'écran d'accueil (Partager > Sur l'écran d'accueil) pour l'ouvrir sans barres.

## Plusieurs formats d'affiches (ajout du 20/11/2026)
- Chaque affiche peut avoir son propre format (paysage, portrait…) : la page lit le ratio de l'affiche et celui de la vidéo (calculés par `npm run build`) et cale la vidéo exactement sur l'affiche. Si les deux ratios diffèrent, la vidéo est entière et centrée, avec des bandes noires.
- `id` dans `ra.config.json` : lettres sans accent, chiffres, tirets (c'est le nom du fichier vidéo publié). Les fichiers de `contenus/` peuvent garder leurs noms (même avec accent) : seule la ligne `image`/`video` doit les citer exactement.
- Les vidéos sont réduites pour le mobile : plus grand côté 1280 px maximum (un portrait 1080×1920 devient 720×1280), CRF 28.
- `zonesIgnorees` n'est plus global : il est réservé aux affiches `fumerTue` et `salonMaison` (même bandeau AFPAR). Les autres affiches sont reconnues avec toute leur image.
- `npm run test-croise` : montre chaque affiche à la reconnaissance et indique quelles cibles la reconnaissent (idéal : une seule, la bonne).
