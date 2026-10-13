---
name: new-ship-type
description: Liste de contrôle pour ajouter un nouveau type de bateau au jeu (stats, modèle 3D, équipage, dégâts, icônes, ennemis, prix). À utiliser quand on ajoute ou duplique un type de navire.
disable-model-invocation: true
argument-hint: <identifiant> (ex. galleon)
---

# Ajouter un type de bateau : $ARGUMENTS

Lis d'abord `CLAUDE.md` (sections Types de bateaux, Modèles 3D, Équipage animé, Dégâts visibles, Eau dans les coques) et `docs/GAME_DESIGN.md`. Prends le type existant le plus proche comme modèle et suis-le fichier par fichier. Identifiants en anglais, textes affichés et commentaires en français.

## 1. Données
- [ ] `src/shipTypes.ts` : ajouter l'identifiant à `ShipType` et à sa place dans `SHIP_SIZE_ORDER` (de la plus petite à la plus grande), puis une entrée `SHIP_TYPES` : nom (`feminine` si besoin), description, `armament`, `lootFactor`, `price`, `respawnTime`, `hold`, `canFish`, `stats`, `enemyStats`, `upgrades` (table vide = amélioration absente pour ce type), `mass`, et `extensions` s'il s'allonge.
- [ ] `src/shipStats.ts` : caractéristiques de base. Ne jamais modifier une base au runtime : tout passe par `deriveStats` puis `applyModifiers`.
- [ ] `src/config.ts`, chaque table indexée par type : `OFFICERS.slots`, `GUNS.cost`, `DECK_CREW.hands` / `handsPerExtension` (navire ponté), poids d'apparition dans les étapes de `ENEMIES` si les ennemis peuvent l'utiliser, `BOSSES` s'il porte un boss. Cherche les autres avec `grep -rn "frigate" src` et `grep -rn "Record<ShipType" src`.
- [ ] `src/ui/port/ledgerTab.ts` : `ORDER`.
- [ ] `src/ui/shipIcons.ts` : `SHIP_ICONS` et `EXTENDED_ICONS` s'il s'allonge.

## 2. Modèle 3D (`src/ship/<type>/`)
- [ ] Une classe qui implémente `ShipModel` (`src/ship/shipModel.ts`), branchée dans `createShipModel`.
- [ ] Coque par `parts/hullShape.ts` (`HullShape`) ; `waterline` = `HullShape.waterlineProfile()` (`WATERLINE_SAMPLES` points, utilisé par le liseré d'écume).
- [ ] Repère : proue vers +Z, bâbord +X, tribord −X, flottaison à y = 0.
- [ ] Masque d'eau au plat-bord (profondeur seule) et `renderOrder` des objets opaques à 0 (`utils/renderOrder.ts`).
- [ ] Pièces fixes fusionnées par matériau (`utils/geometryBatch.ts`), mises en cache par livrée ; seules les pièces animées sont propres à l'instance. `dispose()` libère ce qui est propre à l'instance.
- [ ] Voiles par `parts/sails.ts`, matériau par voile via `tornSail.material()` (trous de `setDamage`, emblème d'élite `Livery.sailEmblem`, `Livery.tattered`).
- [ ] `fireSpots` via `fireSpots()` de `parts/common.ts`, `barHeight`, `flagMount`, `ensignStaff` (hampe de poupe, ou flèche du mât arrière si une bôme passe au-dessus), `setFlagLift`.
- [ ] Canons : `setCannons(perSide)` crée les `CannonMount` (avec `calibre` 'main' ou 'deck' s'il a `deckCannon`).
- [ ] Navire ponté : `deckPlan` (`ship/deckPlan.ts` : matelots, barre, vigie, promenades, cordages, `isOpenGun`), pas de marins figés dans la géométrie. Barque : rameurs fixes.
- [ ] Allongement : plan paramétré `<type>Layout(niveau)` avec `parts/hullStretch.ts`, reconstruction dans un groupe `body` par `setExtension`, gabarits en cache par plan et par livrée ; `typeName`, `extensionIcon`.

## 3. Vérifications
- [ ] `npm run typecheck`.
- [ ] En jeu avec `?debug` : l'acheter au port (B donne 1000 or et 1000 bois), le voir naviguer par beau temps et par grosse tempête (flottaison, liseré d'écume, eau absente dans la coque), tirer, prendre des dégâts (voiles trouées, feux), couler ; vérifier l'équipage animé, le drapeau de rang et les pavillons de trophées ; l'allonger s'il s'allonge.
- [ ] Mettre à jour `CLAUDE.md` (liste des modèles 3D) et, si le gameplay change, `docs/GAME_DESIGN.md`.
