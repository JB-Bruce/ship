# Trame principale — « L'Or maudit » (brouillon)

État : brouillon de travail, idées validées par le joueur le 2026-10-15. Les noms propres sont provisoires.

## Contexte
Sur l'île natale (la Tortue), on apprend la légende de la *Nuestra Señora de las Ánimas*, un galion qui aurait volé un
or maudit sur une île perdue, puis sombré quelque part au fond des mers. On se jette à la mer avec les deux premiers marins trouvés pour suivre ses traces.

## Fils rouges (présents dans tous les actes)
- **L'antagoniste de la Marine**, le commodore Armand de Valcourt, cherche aussi l'or maudit. Il te croise et te
  prévient (acte 1), te traque (acte 2), prend de l'avance ou te vole une part (acte 3), et débarque avec la grande
  flotte sur l'île du trésor (acte 4).
- **La malédiction** : plus on avance (fragments, reliques), plus des **vaisseaux fantômes** apparaissent, de plus en plus
  souvent. Certaines apparitions sont scénarisées et marquent les tournants de l'histoire.
- **Les personnages** : les deux marins de départ, Bastien Morel (vieux navigateur bourru) et Lou (jeune mousse
  casse-cou), qui sont tes premiers officiers ; la vieille Maëlle, conteuse de la Tortue, qui raconte la légende et
  recolle les fragments de carte ; Esteban « le Corbeau » Rojas, pirate rival, ni ami ni ennemi, lui aussi sur la piste.
- **Les créatures marines** (Kraken, serpents de mer…) peuvent se croiser un peu partout hors des mers connues, en
  rencontres rares.

## Les passages entre les mers
- **Les tempêtes** : on quitte les mers connues en traversant de grosses tempêtes (séquence scénarisée : paquets de mer,
  éclairs, un gardien) et on en ressort ailleurs.
- **Le rayon vert** (passage magique) : il faut se trouver loin à l'ouest au moment du coucher du soleil ; un éclair
  vert jaillit au ras de l'horizon, et en cinglant droit dessus avec la bonne relique, on passe vers les mers perdues.
  C'est le passage des actes 3 et 4.
- Chaque nouvelle mer est **une carte à part**, où l'on arrive par le voyage (plutôt qu'un monde géant : performances,
  et chaque mer garde son ambiance : météo, ciel, couleur de l'eau, décor).

## Prologue — l'île natale
La légende, les deux marins, une chaloupe. Le tutoriel (pilotage, combat, pêche, port) se fait dans l'histoire.

## Première mer — « Mer de la Tortue » (acte 1, proposition)
Plan : `docs/plans/mer1-plan.png`, description physique : `docs/MER1.md` (nord en haut ; +Z = nord, +X = ouest dans le jeu). Environ 7 × 6 km.
- **Existant** : 1. la Tortue (île natale, repaire, Maëlle) ; 2. Port-Sabre (la Confrérie pirate, 1,2 km à l'est) ;
  3. l'Île Royale (arsenal de la Marine, base de Valcourt, 2 km au nord) ; 4. l'Île du Dauphin (poste de la Marine,
  1,3 km à l'ouest).
- **Nouveau, proposé** :
  - 5. **Port-Franc** (~1,9 km au sud) : comptoir marchand, ni pirate ni Marine ; le meilleur marché et les rumeurs
    (indices, contrats de commerce). On peut l'améliorer comme ses îles (plus tard, la carte montrera les zones qu'on
    contrôle).
  - 6. **Le Cimetière des Navires** (~2,8 km au sud-est) : récifs semés d'épaves à fouiller (indices, butin) ; repaire
    de la Veuve Noire par gros temps.
  - 7. **La Crique du Corbeau** (~2,5 km au nord-est) : repaire caché d'Esteban Rojas, petit port pirate qu'on découvre
    par l'histoire.
  - 8. **Le Phare de l'Ermite** (~2,7 km à l'ouest) : îlot sans port, un vieux gardien qui a vu passer le galion.
  - 9. **Les Îlots des Pêcheurs** (~2,2 km au sud-ouest) : village de pêcheurs, bancs de poissons, lieu du prologue.
  - 10. **Le Fort de la Passe** (~3 km à l'est) : îlot fortifié de la Marine qui verrouille la route du Mur des
    tempêtes ; on peut l'abattre pour passer.
  - 11. **Le Rocher du Crâne** (~3 km au nord) : îlot sans port, lieu de légende (indice, rencontre fantôme).
  - **Décor** (sans grande importance) : 12. **le Banc du Naufragé** (ex-« Île Longue », banc de sable étroit et palmiers, entre la Tortue et
    l'Île Royale) ; 13. **les Dents** (chapelet de rochers et récifs près du Cimetière) ; 14. **l'Îlot aux Oiseaux**
    (lagon en croissant, mouettes, au nord-ouest).
- **Formes naturelles** : côtes irrégulières, îles étirées et tournées, criques ; jamais de rond parfait ni d'étoile.
- **Bords** : le **Mur des tempêtes** à l'est (passage vers la mer des Récifs, acte 2) ; des brumes du large au
  nord-ouest. **Tout autour de la carte, une tempête géante** : en approchant du bord, ciel noir, mer énorme, et des
  éclairs qui frappent et **détruisent ton navire** si tu insistes.
- Technique :
  - les îles sans plage importante (Phare, Rocher du Crâne, décor) n'ont pas le calme des vagues ;
  - la carte est grande : ce qui est loin ne doit coûter ni au rendu ni aux calculs (îles, décor, forts, navires et
    leur IA au-delà de la brume : pas dessinés, mis à jour moins souvent ou en veille ; le shader de l'eau ne parcourt
    que les îles proches).

## Acte 1 — « Les traces »
L'archipel actuel (la Tortue, Port-Sabre, les îles de la Marine). On voyage d'île en île pour parler aux gens et
trouver des indices ; chaque indice se gagne par une action (mission de taverne, fouille d'épave, poursuite, duel).
On réunit les premiers fragments de carte, l'influence sur le territoire natal grandit.
Boss : la Veuve Noire ; premier duel contre un capitaine de la Marine (envoyé du commodore) ; le pirate rival.

## Acte 2 — « Au-delà des cartes »
Les fragments indiquent une route hors des cartes connues. Il faut un navire assez gros, la carte reconstituée et un
navigateur. Traversée des tempêtes (Le Spectre garde le passage), puis on débouche sur **la mer des Récifs** : archipel sauvage et
inexploré, lagons turquoise, récifs à fleur d'eau qui abîment la coque, hauts-fonds, villages oubliés. Nouvelle carte, nouveau port d'attache à gagner, on reprend l'enquête.
Boss : Le Spectre (gardien de la tempête) ; un commodore de la Marine en frégate ; le grand fort de la Marine qui
verrouille la route du nord.

## Acte 3 — « Les capitaines hantés »
Trois grands pirates hantés détiennent chacun une clé de l'archipel final. Chacun règne sur une mer perdue **très, très
loin** : un long voyage (tempêtes, rayon vert) pour l'atteindre. On les affronte dans l'ordre qu'on veut. Missions de
plus en plus grandioses. Idées de mers et de boss :
- le **Hollandais volant**, dans une mer de brume éternelle ;
- **le Roi Blanc** (capitaine-squelette pris dans les glaces), dans **le monde du froid** : le seul endroit glacé du
  jeu. Neige qui tombe, banquise, icebergs ; coques et décor aux tons froids, neige sur les ponts ; **la glace abîme la
  coque** (chocs contre les glaces flottantes et la banquise) ;
- **la Dame des Marais**, dans **une mer-marécage** : eaux vertes et immobiles, mangroves, arbres morts, brume basse,
  chenaux étroits, presque pas de vent.
Boss en plus possibles : 2 ou 3 boss pirates ou fantastiques sur la route, un boss de la Marine.

## Acte 4 — « L'or maudit »
Les trois clés ouvrent la route de l'archipel du naufrage.
1. La **carcasse vivante du galion maudit**, dans des eaux en tempête permanente : le combat final contre le
   surnaturel (boss à phases).
2. **L'île du trésor** : l'armada de la Marine du commodore, qui t'a suivi, arrive. Grands vaisseaux, amiral, siège.
3. **La grotte** immense et le trésor (cinématique), puis l'épilogue. Le jeu continue en mode libre.

## Boss (liste de travail)
Veuve Noire (fait), Le Spectre (fait), Hollandais volant, 2-3 boss pirates ou fantastiques, navire hanté final
(carcasse du galion), 2-3 boss de la Marine (capitaine, commodore, amiral), grand fort de la Marine.

## Mécaniques à construire (ordre proposé)
1. Journal de quête et dialogues au port (portraits, texte, étapes, objectifs).
2. Indices et fragments de carte (objets de quête, carte qui se dévoile).
3. Personnages uniques (marins de départ, officiers d'histoire), sur la base des officiers existants.
4. Boss scénarisés à phases et attaques spéciales (sur la base des boss existants).
5. Vaisseaux fantômes liés à la malédiction (apparitions de plus en plus fréquentes, tournants scénarisés).
6. Plusieurs mers (cartes séparées), voyage par les tempêtes et par le rayon vert.
7. Monde du froid : neige, tons froids, banquise et icebergs qui abîment la coque.
8. Autres mers perdues de l'acte 3 (brume éternelle, marécage) et créatures marines.
9. Grotte finale (cinématique).
Plus tard : abordage et capture de navires.

## Ajouts techniques à implémenter

### 1. Histoire et quêtes
- **Moteur de quêtes** (`story/`) : actes, chapitres, étapes à objectifs (aller à, parler à, couler tel navire, trouver,
  attendre un moment), déclencheurs (lieu, heure, météo, victoire, objet), récompenses ; s'appuie sur `QuestTracker`.
- **Journal de quête** : nouveau menu parchemin (étapes faites et en cours, indices, résumé de l'histoire).
- **Dialogues** : fenêtre de dialogue (portrait, nom, texte, choix), scripts de dialogue en données, PNJ attachés aux
  ports (taverne, quai, gouverneur) et parfois en mer (héler un navire).
- **Portraits** des personnages (dessinés en code ou images).
- **Choix et drapeaux d'histoire** : état des choix, réputation éventuelle, conséquences.
- **Indices et fragments de carte** : objets de quête, inventaire, carte qui se dévoile (fragments posés sur la carte M).
- **Scènes scénarisées** : caméra pilotée, bandeaux, apparition d'une flotte, mise en pause des contrôles.
- **Sauvegarde** : état de l'histoire, choix, objets, mer courante (nouvelle version de `SaveData`).

### 2. Personnages et équipage
- **Officiers d'histoire uniques** (Bastien, Lou…) : non vendables, talents propres, répliques ; base `fleet/officers.ts`.
- **Départ en chaloupe à deux marins** : nouveau début de partie (prologue) et tutoriel intégré.

### Fait
- **Formes d'île naturelles** (2026-10-15) : une île peut être étirée (`stretch`, rapport longueur / largeur) le long
  d'un grand axe orienté (`rotation`), avec jusqu'à 6 ondulations de côte ; même calcul dans le jeu (collisions,
  relief, radar, carte) et dans le shader de l'eau. Les quatre îles existantes sont restées identiques (vérifié point
  par point). Essai sur une île étirée 3 fois : distance au rivage aussi précise que sur les îles rondes, plage,
  ressac et lagon alignés. Les groupes de rochers viendront avec le point 2 (beaucoup de petites îles sans coût).
- **Beaucoup d'îles sans coût** (2026-10-15) : le shader de l'eau ne reçoit plus que les 8 îles les plus proches du
  joueur dont la zone touche la grille de l'eau (`ISLAND_SLOTS`) : son coût ne dépend plus du nombre d'îles. Une île
  peut se passer de l'atténuation des vagues (`calmDistance` 0, îlots rocheux). Les navires au-delà de la grille de
  l'eau ne calculent plus leur flottaison ni l'animation de leur gréement (mesure avec 32 navires dont 23 au loin :
  0,59 → 0,32 ms par image pour les navires) ; les IA ne coûtent presque rien (0,1 ms), pas besoin de les mettre en
  veille. Rendu vérifié identique au pixel près avant/après.
- **Deux sortes d'îles** (2026-10-15) : les îles à port (fiche de campagne, port, crique habitée) et les îlots (décor ou
  lieu de quête : nom sur la carte, décor, sans port ni rien à sauvegarder). Toutes partagent la même géométrie
  (collisions, navigation, eau, radar, carte, terrain, végétation). Premier îlot : **le Banc du Naufragé** (renommé, ex-« Île Longue » ; banc de sable de
  ≈ 360 × 45 m entre la Tortue et l'Île Royale, palmiers, lagon, chaloupe échouée sur la plage). Les quatre îles
  existantes sont restées identiques (vérifié point par point).
- **Courbure** (2026-10-15) : une terre peut être courbée (`bend`, en arc ; modérée) ; le Banc du Naufragé l'est
  (26 m aux bouts). L'îlot a été renommé « Le Banc du Naufragé » à la demande du joueur.
- **Bord du monde** (2026-10-15) : un cercle de 3,5 km de rayon autour de l'archipel prévu (centre à l'est-nord-est de
  la Tortue), avec une petite marge. En approchant (400 m avant), le ciel se ferme et la mer grossit : le temps vu du
  navire glisse vers la grosse tempête, sans changer le temps du monde (pas de Veuve Noire pour autant). Passé le bord,
  la foudre frappe le navire de plus en plus souvent (d'un coup toutes les 7 s au bord à un toutes les 1,2 s à 300 m
  au-delà ; 15 % de sa vie à chaque coup), sans alerte ni message : on s'en sort en faisant demi-tour à temps. Les IA
  restent à 300 m en deçà du bord, et rien n'y apparaît. Sur la carte M : une bande sombre et le bord en tirets. Le
  Mur des tempêtes de l'est est, pour l'instant, le même bord.

### 3. Plusieurs mers
- **Monde par mer** : chaque mer a ses îles, ports, forts, météo, ciel, couleur d'eau, ennemis, créatures ; chargement et
  déchargement d'une mer (libérer géométries et textures), écran ou fondu de transition.
- **Îles généralisées** : `ISLANDS`, `ISLAND_LIST`, `land`, le GLSL des îles (tableaux d'uniforms de taille fixe) et le
  décor (`worldBuilder`) passent d'un archipel fixe à l'archipel de la mer courante.
- **Carte M par mer**, et carte du monde (les mers et les routes entre elles).
- **Voyage entre les mers** : traversée des tempêtes (séquence : paquets de mer, éclairs, gardien), arrivée dans la
  nouvelle mer ; retour possible.
- **Rayon vert** : aller loin à l'ouest au coucher du soleil (`DayCycle`), éclair vert à l'horizon (effet de ciel),
  cingler dessus avec la relique → passage vers une mer perdue.
- **Limites de la carte** : bords de mer (brume, tempête qui repousse) au lieu d'un monde ouvert à l'infini.

### 4. Ambiances de mer
- **Profils de mer** (comme les `WeatherProfile`) : eau, ciel, brume, lumière, vent, temps possibles.
- **Mer des Récifs** : lagons turquoise, récifs et hauts-fonds (dégâts de coque, collisions), décor d'îles sauvages,
  villages.
- **Monde du froid** : neige qui tombe (comme la pluie), banquise et icebergs (collisions, dégâts de coque), tons froids
  (palette de livrée et éclairage), neige sur les ponts, eau sombre.
- **Mer-marécage** : eau verte immobile, mangroves et arbres morts sur l'eau, chenaux étroits, brume basse, vent presque nul.
- **Mer de brume éternelle** : brouillard dense permanent (réutilise le brouillard).
- **Archipel du naufrage** : tempête permanente.

### 5. Ennemis, boss et créatures
- **Boss à phases** : changement de tactique selon la vie, attaques spéciales, renforts, dialogues en combat ;
  extension de `BossDef` et de `world/bossEncounter.ts`.
- **Nouveaux boss** : Hollandais volant (plonge et réapparaît), Roi Blanc, Dame des Marais, 2-3 pirates ou fantastiques,
  3 boss de la Marine (capitaine, commodore, amiral), grand fort de la Marine, carcasse vivante du galion.
- **Vaisseaux fantômes** : livrée spectrale (coque délabrée, voiles en lambeaux, lueur verte, transparence ou brume),
  apparitions de plus en plus fréquentes selon l'avancée, apparitions scénarisées aux tournants.
- **Créatures marines** : Kraken (tentacules animés qui sortent de l'eau, saisissent un navire), serpent de mer ;
  nouveaux modèles animés et une IA propre (pas un `Ship`).
- **Antagoniste récurrent** : un navire et un capitaine nommés qui reviennent, fuient, survivent jusqu'à la fin.
- **Armada de la Marine** : très grandes flottes (performances : nombre de navires, boulets `COMBAT.maxBalls`, équipage animé).

### 6. Navires
- **Vaisseau de l'amiral** (vaisseau de ligne, rang 8 ?), **carcasse du galion maudit** (modèle délabré et animé),
  navires fantômes (variantes des modèles existants) ; éventuellement navires légendaires gagnés en récompense.

### 7. Fin
- **Grotte du trésor** : cinématique (décor de grotte, trésor, caméra), puis épilogue et retour au mode libre.

### 8. Plus tard
- Abordage et capture de navires.
