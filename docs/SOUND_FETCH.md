# Consigne pour une session Claude Code locale : récupérer les sons du jeu

À donner telle quelle à une session Claude Code lancée **sur ton PC** (pas dans le cloud), dans le dossier du jeu.

---

Tu travailles dans le dépôt du jeu « Bateau » (jeu de combat naval pirate, XVIIe-XVIIIe siècle, Three.js). Ta mission :
**trouver, télécharger, préparer et ranger tous les sons listés dans `docs/SOUNDS.md`**, puis les pousser sur la
branche git `claude/hopeful-carson-lcknf6`. Tu n'écris aucun code du jeu.

## 1. Règles
- **De vrais enregistrements** (mer, bois, canons à poudre, voix, instruments acoustiques), jamais de son synthétique,
  de « laser », de sons de science-fiction ni d'effets de jeu vidéo arcade. Ambiance : pirate, XVIIe-XVIIIe siècle,
  réaliste et un peu rude.
- **Licences** : seulement **CC0** (domaine public) ou des licences libres pour un jeu sans mention, comme la licence
  du pack Sonniss GDC. En **CC-BY** seulement pour la musique s'il n'y a rien de bon en CC0, et alors sa ligne dans
  les crédits est obligatoire. **Jamais** de CC-BY-NC, CC-BY-ND, ni de son sans licence claire.
- Lis les tags, la description, la durée, la note et le nombre de téléchargements pour choisir. Prends ce qui colle
  le mieux à la ligne de `docs/SOUNDS.md`, pas le premier résultat.
- Ne garde rien qui contienne des paroles compréhensibles, de la musique moderne, des moteurs, des voitures, des
  oiseaux tropicaux de forêt, des bruits de ville moderne.

## 2. Sources (dans cet ordre de préférence)
1. **Freesound** (freesound.org) : crée (ou demande à l'utilisateur) une clé d'API gratuite sur
   https://freesound.org/apiv2/apply/. Recherche par l'API : `https://freesound.org/apiv2/search/text/?query=...&filter=license:"Creative Commons 0"&fields=id,name,tags,description,duration,license,username,avg_rating,num_downloads,previews,url&token=CLE`.
   Sans connexion OAuth, prends la prévisualisation `preview-hq-ogg` (assez bonne pour un jeu). Si l'utilisateur
   veut bien se connecter, le téléchargement d'origine (`/download/`, OAuth2) est meilleur.
2. **Kenney** (kenney.nl/assets, catégorie Audio : « Impact Sounds », « RPG Audio », « Interface Sounds »…), tout en
   CC0 : pour les menus (pièces, papier, clics de bois, coffres) et quelques impacts.
3. **OpenGameArt** (opengameart.org), filtre de licence CC0 : surtout pour la musique (sea shanty, hornpipe, jig,
   musique de taverne, combat naval, ambiance inquiétante).
4. **Sonniss GDC Game Audio Bundle** (sonniss.com/gameaudiogdc) : seulement si l'utilisateur l'a déjà téléchargé ou
   accepte de le faire (dizaines de Go) ; tu y piocherais alors mer, bois, canons, explosions.

## 3. Préparation (ffmpeg)
- Installe ffmpeg s'il manque (demande à l'utilisateur avant d'installer quoi que ce soit).
- Sortie en **Ogg Vorbis**, 44,1 kHz : `-c:a libvorbis -q:a 5`.
- **Mono** (`-ac 1`) pour les dossiers `combat/`, `cursed/` (sauf `presence`), `ui/`, `crew/` (sauf `tavern`), et
  pour `hull_creak`, `rope_creak`, `sail_flap`, `bow_splash`, `gulls`, `ship_bell` d'`ambience/`. **Stéréo** pour le
  reste (boucles d'ambiance, musique).
- Coupe le silence du début (`silenceremove=start_periods=1:start_threshold=-50dB`) et de la fin des bruitages.
- Volume homogène : bruitages normalisés vers -16 LUFS (`loudnorm=I=-16:TP=-1.5`), ambiances vers -20 LUFS,
  musique vers -18 LUFS.
- **Boucles** (marquées « boucle » dans la liste) : 20 s à 1 min. Coupe au même niveau en début et en fin, puis fais un
  fondu enchaîné de la fin sur le début (environ 1 s) pour qu'elles se répètent sans clic.
- Taille : au plus 1,5 Mo par bruitage, 3 Mo par boucle d'ambiance, 5 Mo par musique. **Total visé : moins de 80 Mo.**

## 4. Rangement
- Tout va dans `public/sounds/<dossier>/<nom exact de docs/SOUNDS.md>.ogg` (par exemple
  `public/sounds/combat/cannon_near_2.ogg`). Respecte exactement les noms et le nombre de variantes.
- `public/sounds/CREDITS.txt` : une ligne par fichier, avec le fichier, le titre d'origine, l'auteur, la licence et
  l'adresse de la page d'origine.
- `public/sounds/manifest.json` : `{ "combat/cannon_near_1.ogg": { "source": "url", "license": "CC0", "duration": 2.4 }, ... }`.
- `public/sounds/MISSING.md` : la liste des sons que tu n'as pas trouvés (ou pas trouvés assez bons), avec ce que tu
  as cherché.

## 5. Vérification, puis envoi
- Contrôle chaque fichier avec `ffprobe` (durée, canaux, format). Aucun fichier vide, aucun fichier au-dessus des
  limites de taille.
- Propose à l'utilisateur d'écouter quelques fichiers clés avant l'envoi (canons, mer calme, musique du port).
- Ne modifie rien d'autre que `public/sounds/`. Fais un commit (« Sons du jeu : … ») et pousse sur la branche
  `claude/hopeful-carson-lcknf6` (`git push origin HEAD:claude/hopeful-carson-lcknf6`, après un `git pull` de cette
  branche).
- Termine par un résumé : nombre de fichiers, taille totale, sources utilisées, ce qui manque.
