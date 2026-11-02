# Sons à fournir

Le moteur son (à venir) lira les fichiers de `public/sounds/`. Un fichier absent reste simplement muet : on peut les
ajouter petit à petit. Chaque ligne donne le nom exact du fichier, ce qu'on doit y entendre et des mots-clés de
recherche (en anglais, pour les banques de sons).

## Où les trouver (libres de droits)
- **Sonniss — GDC Game Audio Bundle** (sonniss.com/gameaudiogdc) : plusieurs dizaines de Go de vrais enregistrements,
  libres pour un jeu, sans mention obligatoire. La meilleure source pour la mer, le bois, les canons.
- **Freesound** (freesound.org) : filtrer la licence sur **Creative Commons 0** (sinon il faut citer l'auteur).
- **Kenney** (kenney.nl/assets, catégorie Audio) : bruitages de menus et d'impacts, CC0.
- **OpenGameArt** (opengameart.org) : filtrer sur CC0 ; utile pour la musique.
- **Musique** : chercher des airs de marins (sea shanty, hornpipe, jig) instrumentaux en CC0. Une musique en CC-BY
  (ex. Kevin MacLeod, incompetech.com) est possible : noter alors son titre et son auteur dans `public/sounds/CREDITS.txt`.

## Format
- `.ogg` (de préférence) ou `.mp3`, 44,1 ou 48 kHz.
- **Mono** pour tout ce qui vient d'un point de la scène (canons, impacts, craquements…) : le jeu le place lui-même en
  3D. Stéréo pour les ambiances et la musique.
- Les fichiers marqués **boucle** doivent se raccorder sans clic (début et fin dans le même son), 20 s à 1 min.
- Plusieurs variantes (`_1`, `_2`, `_3`…) évitent la répétition : le jeu en tire une au hasard (et varie un peu la hauteur).
- Couper les silences au début de chaque bruitage (le son doit partir tout de suite).

## Ambiance de mer — `public/sounds/ambience/`
| Fichier | Ce qu'on entend | Recherche |
|---|---|---|
| `sea_calm.ogg` (boucle) | mer calme au large, petites vagues contre une coque | ocean waves calm open sea, boat hull lapping |
| `sea_rough.ogg` (boucle) | mer formée, vagues qui se brisent | ocean waves rough, sea storm waves |
| `sea_storm.ogg` (boucle) | grosse tempête, déferlantes, grondement | storm sea heavy waves crashing |
| `wind_light.ogg` (boucle) | brise dans le gréement | wind rigging light, wind ship ropes |
| `wind_strong.ogg` (boucle) | vent fort qui siffle dans les cordages | strong wind howling, gale wind ropes |
| `rain.ogg` (boucle) | pluie sur la mer et sur un pont de bois | rain on deck, rain on water |
| `thunder_1.ogg` … `thunder_3.ogg` | coups de tonnerre (proche, lointain) | thunder close, thunder rumble distant |
| `hull_creak_1.ogg` … `hull_creak_4.ogg` | bois de coque qui grince (courts, 1 à 3 s) | wooden ship creak, hull creaking |
| `rope_creak_1.ogg` … `rope_creak_3.ogg` | cordages et poulies qui travaillent | rope creak, ship rigging pulley |
| `sail_flap_1.ogg` … `sail_flap_3.ogg` | toile qui claque au vent | sail flapping, canvas flap wind |
| `bow_splash_1.ogg` … `bow_splash_3.ogg` | étrave qui fend une vague, gerbe | boat bow splash, wave hit bow |
| `gulls_1.ogg` … `gulls_3.ogg` | mouettes (près des côtes et des bancs) | seagulls, gulls harbor |
| `harbor.ogg` (boucle) | port : clapot, voix lointaines, bois, cloche discrète | harbor ambience, port docks medieval |
| `night_sea.ogg` (boucle) | mer de nuit, très calme, quelques clapotis | night ocean calm, sea night ambience |
| `ship_bell.ogg` | cloche de bord (le quart, l'entrée au port) | ship bell, brass bell ring |

## Combat — `public/sounds/combat/`
| Fichier | Ce qu'on entend | Recherche |
|---|---|---|
| `cannon_near_1.ogg` … `cannon_near_4.ogg` | coup de canon tout proche, puissant | cannon fire close, black powder cannon |
| `cannon_far_1.ogg` … `cannon_far_3.ogg` | canonnade lointaine, sourde | cannon distant, artillery far |
| `ball_whistle_1.ogg` … `ball_whistle_3.ogg` | boulet qui siffle en passant | cannonball whizz, projectile whoosh |
| `hit_wood_1.ogg` … `hit_wood_4.ogg` | boulet dans la coque : bois qui éclate | wood impact smash, wood splinter crash |
| `splash_1.ogg` … `splash_4.ogg` | boulet qui tombe à l'eau | cannonball water splash, object into water |
| `rigging_hit_1.ogg` … `rigging_hit_2.ogg` | toile déchirée, cordage arraché | fabric rip, cloth tear |
| `mast_crack.ogg` | vergue ou mât qui casse et tombe (voile abattue) | wood break large, mast crack |
| `explosion_1.ogg` … `explosion_2.ogg` | sainte-barbe qui saute, grosse explosion | gunpowder explosion, barrel explosion |
| `mortar_fire.ogg` | départ du mortier (grave, en cloche) | mortar fire, heavy cannon thump |
| `shell_blast.ogg` | obus qui éclate | shell explosion, bomb blast |
| `fire.ogg` (boucle) | incendie à bord, bois qui crépite | fire crackling wood, burning |
| `sinking.ogg` | navire qui sombre : craquements, eau qui s'engouffre | ship sinking, wood groan water rush |
| `ram_crash.ogg` | deux coques qui se heurtent | wood crash collision, boat collision |
| `fort_cannon_1.ogg` … `fort_cannon_2.ogg` | canon de fort, plus grave, écho | cannon echo fortress |

## Navires maudits — `public/sounds/cursed/`
| Fichier | Ce qu'on entend | Recherche |
|---|---|---|
| `rise.ogg` | l'eau qui bouillonne, bois qui gémit (sortie de l'eau, ~4 s) | water bubbling large, underwater groan |
| `dive.ogg` | le navire qui s'enfonce, remous | water gurgle sink, submerge |
| `presence.ogg` (boucle) | souffle sourd, murmures, grincements lointains | ghost ambience, eerie drone whispers |

## Menus et vie à bord — `public/sounds/ui/` et `public/sounds/crew/`
| Fichier | Ce qu'on entend | Recherche |
|---|---|---|
| `ui/coins_1.ogg` … `ui/coins_3.ogg` | pièces qui tintent (achat, prime) | coins drop, coin pouch |
| `ui/coins_big.ogg` | pluie de pièces (coffre, grosse prime) | gold coins pile, treasure coins |
| `ui/paper_1.ogg` … `ui/paper_3.ogg` | parchemin qu'on tourne, qu'on déplie | paper page turn, parchment unfold |
| `ui/quill.ogg` | plume qui gratte (contrat signé, journal) | quill writing, pen scratch |
| `ui/wood_click.ogg` | bouton de bois, petit choc sec | wood click, wooden tap |
| `ui/map_unfold.ogg` | grande carte qu'on déroule (M) | map unfold, paper large |
| `ui/chest_open.ogg` | coffre au trésor qui s'ouvre | treasure chest open, wooden chest creak |
| `ui/hammer.ogg` | marteau et scie (amélioration au chantier) | hammer wood, carpentry |
| `ui/tear_poster.ogg` | affiche arrachée (taverne) | paper tear |
| `crew/cheer_1.ogg` … `crew/cheer_2.ogg` | équipage qui crie victoire | crowd cheer pirates, men cheering |
| `crew/shout_1.ogg` … `crew/shout_3.ogg` | ordres criés, sans mots compréhensibles | men shouting, sailors shout |
| `crew/tavern.ogg` (boucle) | taverne : brouhaha, chopes, rires | tavern ambience, medieval inn crowd |

## Musique — `public/sounds/music/` (stéréo, boucle)
| Fichier | Quand | Recherche |
|---|---|---|
| `port.ogg` | au port et dans les menus du port : air calme, accordéon, violon | sea shanty instrumental calm, tavern music |
| `sailing.ogg` | en mer, sans combat : air entraînant mais discret | sea shanty instrumental, hornpipe, jig |
| `night.ogg` | en mer la nuit : air lent, plus mystérieux | calm folk night, slow fiddle |
| `combat.ogg` | en combat : percussions, tension | pirate battle music, naval battle |
| `boss.ogg` | face à un boss : plus sombre et plus fort | epic pirate boss, dark orchestral |
| `cursed.ogg` | navires maudits en vue : inquiétant | eerie horror ambient, ghost ship |
| `treasure.ogg` | court motif (5-10 s, sans boucle) : trésor trouvé, plan complet | fanfare short, victory jingle |
