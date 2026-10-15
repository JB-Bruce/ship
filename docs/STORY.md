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
