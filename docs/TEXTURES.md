# Textures réalistes embarquées

État au 22 octobre 2026 : **premier pack intégré**, 12 finitions issues de 9 jeux photographiques CC0. Couleur, normales OpenGL et rugosité sont incluses dans le HTML autonome, avec les vignettes. Aucune API, clé, image distante ou installation supplémentaire n’est nécessaire à l’utilisation.

## Utilisation

- Sélectionner une pièce, ouvrir **Propriétés**, puis **Apparence**. Une sélection de pièces compatibles peut recevoir la même finition. Échelle, rotation et teinte sont réglables ; les apparences différentes sont signalées.
- **Afficher → Apparence du sol** change le terrain visible indépendamment du support de fondation. **Rendu schéma** désactive toutes les maps. Le mode **Légère** conserve la couleur, sans normales ni rugosité photographiques.
- Les réglages sont dans `project.appearance` : mode, qualité, sol et table `parts` par identifiant de pièce. Ils suivent sauvegarde JSON, historique, duplication, conversion en construction libre et annuler/rétablir. Les anciens projets reçoivent les finitions par défaut à l’ouverture.
- Une apparence de parpaing n’impose **aucun** support porteur. Dimensions, accrochages, recettes de fixation, quantités et prix restent indépendants.

## Pack retenu

| Finition | Jeu source | Tuile à échelle ×1 | Traitement |
| --- | --- | --- | --- |
| Bois naturel | Poly Haven `walnut_veneer_02` | 1 × 1 m | Couleur et PBR d’origine |
| Bois satiné | Même jeu | 1 × 1 m | Rugosité réduite |
| Bois lasuré | Même jeu | 1 × 1 m | Teinte chaude et rugosité réduite |
| Bois patiné | Poly Haven `wood_table_001` | 0,234375 × 1,5 m | Une seule planche recadrée, sans joints de parquet |
| Parpaing gris | ambientCG `Bricks066` | 1,5 × 1,5 m | Échelle visuelle choisie pour des blocs d’environ 50 × 20 cm |
| Pierre naturelle | Poly Haven `stone_tiles_02` | 2 × 2 m | Couleur et PBR d’origine |
| Béton brut | Poly Haven `concrete_floor_02` | 2 × 2 m | Couleur et PBR d’origine |
| Enduit clair | Poly Haven `white_plaster_02` | 1 × 1 m | Couleur et PBR d’origine |
| Herbe | ambientCG `Grass004` | 2 × 2 m | Échelle visuelle choisie |
| Terre et mousse | ambientCG `Ground037` | 2 × 2 m | Échelle visuelle choisie |
| Terre humide | Même jeu | 2 × 2 m | Teinte sombre et rugosité réduite |
| Pavés | Poly Haven `cobblestone_floor_08` | 2 × 2 m | Couleur et PBR d’origine |

Les dimensions Poly Haven proviennent du manifeste du distributeur. Les trois échelles ambientCG sont des choix d’affichage, pas des dimensions fabricant. Les finitions du bois décrivent un aspect ; elles n’attestent pas l’essence ni le traitement réel de la pièce. La terre humide conserve la mousse du jeu source.

## Sources et licence

- [Poly Haven](https://polyhaven.com/license) : assets CC0, photographies distribuées par le collectif. Le distributeur ne détaille pas les photographes individuels ; aucun nom n’a été inventé.
- [ambientCG](https://docs.ambientcg.com/license/) : assets CC0 de Lennart Demes.
- Copies utilisées : [AbitaPrima assets](https://github.com/nfranchetti-svg/abitaprima-assets/tree/c9c9649beff61aca562647814b953b059bf5754c) et [FPS Buildings Environment Kit](https://github.com/petroulacl/fps-buildings-env-kit/tree/1dd8e932402deb82422920df2e7fd079391e55d3), dont les notices identifient ces jeux comme CC0. Leurs commits sont épinglés.

[`assets/textures/sources.json`](../assets/textures/sources.json) contient, pour chaque jeu, l’ID d’origine, l’auteur ou collectif indiqué, la licence, la page source, le distributeur, l’URL exacte et le SHA-256 des trois fichiers téléchargés. Le texte CC0 est joint dans [`assets/textures/CC0.txt`](../assets/textures/CC0.txt). Les fichiers ont été obtenus sur GitHub ; les sites sources bloqués par la politique réseau ne sont pas nécessaires à l’utilisation de l’application.

## Rendu et ressources

- Couleurs JPEG jusqu’à 512 px, normales et rugosité jusqu’à 256 px. Le recadrage du bois conserve son rapport de dimensions. Pack encodé : environ 1,05 Mio ; HTML complet : environ 2,45 Mio.
- Couleur en sRGB, maps de données sans conversion sRGB. Maps GPU partagées par jeu, comptées par références, libérées au dernier matériau. Images décodées réutilisées entre reconstructions de scène.
- UV exprimées en mètres sur chaque face, sans normaliser par la taille de la pièce. Agrandir un mur répète les motifs. Le grain suit la longueur locale du bois ou la première arête d’un panneau. Les extrémités des barres utilisent un bois de bout procédural distinct ; celui-ci n’est pas photographique.
- Aucun déplacement de sommets. Le relief est optique et les dimensions restent exactes. Les modes Schéma et repérage retirent couleur, normales et rugosité ensemble. Les ajours du grillage conservent leur matériau transparent existant.
- Export PNG et ZIP attendent le décodage des maps actives. Toutes les images sont des URL `data:` locales : pas de restriction CORS sur le canvas.
- La compilation inclut le pack dans l’empreinte du HTML ; le service worker versionne donc automatiquement toute modification de texture.

## Maintenance

L’installation normale reste `pnpm install --frozen-lockfile`, `pnpm test`, `pnpm build`. Le pack généré est déjà suivi dans Git et n’est jamais téléchargé pendant un build.

Pour régénérer le pack après une modification volontaire des sources :

```sh
# Outil d’entretien facultatif ; nécessite Python 3 et Pillow.
python3 scripts/prepare-textures.py --cache /tmp/atelier-texture-cache
pnpm test
pnpm build
```

Le script vérifie TLS et les SHA-256 avant de transformer les fichiers. Il s’arrête en cas d’écart ; ne pas modifier les empreintes pour contourner une erreur. Les modifications de cadrage s’appliquent aux trois maps correspondantes.

## Validation et limites

Tests Three.js/DOM : taille des motifs avant/après redimensionnement, orientation du bois et des panneaux obliques, bouts distincts, partage/libération des maps, espaces de couleur, modes de rendu, sélection multiple, import, duplication, annulation et quantités inchangées. Le pack contient uniquement des JPEG embarqués et des références de provenance épinglées.

Parcours navigateur enregistré dans `tests/browser-textures.py` : après compilation et démarrage du serveur local sur le port 8000, exécuter `python3 tests/browser-textures.py` avec Playwright et Chromium installés. Ce parcours utilise des contextes jetables, contrôle WebGL, sélection, modes de rendu, export PNG, persistance, rechargement PWA hors connexion et interface mobile 390 × 844. Les captures sont écrites dans `/tmp/atelier-*`.

Validation effectuée : 576 tests automatisés réussis ; parcours navigateur sans erreur JavaScript et sans requête externe de texture. L’ouverture directe en `file://` est bloquée par la politique du navigateur géré et n’a pas été validée ici ; le test hors connexion porte sur le cache PWA réel. L’installation sur l’écran d’accueil et la fluidité sur téléphone physique restent à essayer.

Les motifs restent répétitifs sur les très grands terrains. Le pack ne comprend pas encore sable, gravier, brique rouge, béton coffré ou végétation volumique. Les rendus en navigateur logiciel ne constituent pas une mesure de fluidité sur un téléphone réel.
