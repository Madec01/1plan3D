# Atelier · Sur mesure V0.29

## Utilisation et développement

- Ouvrir **dist/index.html** dans un navigateur : le HTML contient le code et le pack de textures PBR embarquées, sans dépendance réseau pour le dessin.
- Application hébergée par GitHub Pages : https://madec01.github.io/1plan3D/
- Sources : https://github.com/Madec01/1plan3D
- Développement : Node.js 22 ou ultérieur, puis `npm install`, `npm test` et `npm run build`. Le verrou `pnpm-lock.yaml` permet aussi l’installation avec pnpm (`pnpm install --frozen-lockfile`).
- `src/` contient les modules et l’interface ; `tests/` les tests ; `public/` les fichiers d’installation ; `dist/` la version directement utilisable. `build.mjs` produit le HTML autonome.
- Les projets restent dans le navigateur. Exporter le JSON pour les transférer ou les sauvegarder ; les projets personnels ne sont pas inclus dans ce dépôt.

## Hébergement GitHub Pages

Le code est conservé dans ce dépôt ; le site utilisable est publié séparément par **GitHub Pages**. Le workflow [Publier sur GitHub Pages](.github/workflows/pages.yml) installe les dépendances verrouillées, lance les tests, compile le HTML avec les textures puis déploie uniquement `dist/` chez GitHub à chaque envoi sur `main`.

Pour la première publication :

1. Dans [Settings → Pages](https://github.com/Madec01/1plan3D/settings/pages), choisir **GitHub Actions** comme source dans **Build and deployment**.
2. Dans [Actions → Publier sur GitHub Pages](https://github.com/Madec01/1plan3D/actions/workflows/pages.yml), cliquer sur **Run workflow** pour la branche `main` (ou relancer la dernière exécution si elle a échoué avant l’activation de Pages).
3. Attendre que les étapes `build` et `deploy` soient vertes. Le lien du déploiement ouvre **https://madec01.github.io/1plan3D/**. Un dépôt présent sur `github.com` ne prouve pas que son site Pages est déjà publié.

L’hébergement, le certificat HTTPS et les déploiements sont gérés par GitHub. Aucune clé OpenAI, session ChatGPT, base de données ou machine de développement allumée n’est nécessaire pour utiliser l’application. Le fichier d’ancienne configuration `.openai/hosting.json` a été retiré ; cela ne supprime pas à distance un ancien site déjà publié.

**Projets existants :** les données du navigateur sont propres à chaque adresse. Depuis l’ancienne application, exporter les projets en JSON, puis les importer sur GitHub Pages. Ils ne migrent pas automatiquement et restent enregistrés sur l’appareil, sans synchronisation entre appareils.

En cas de page 404, vérifier la source Pages et le résultat du workflow ci-dessus. Si l’application fonctionne mais affiche une ancienne version, utiliser **Outils → Installer / hors connexion** pour préparer la mise à jour, puis rouvrir l’application.

## Textures réalistes · 22 octobre 2026

- **Propriétés → Apparence** : vignettes de finitions, échelle, rotation et teinte ; une sélection de même famille reçoit la finition en une action.
- **Afficher** : bascule Réaliste / Schéma, qualité détaillée ou légère et choix du sol, indépendamment du support de fondation.
- 12 finitions à partir de 9 jeux photographiques CC0 : bois naturel, satiné, lasuré et patiné ; parpaing, pierre, béton et enduit ; herbe, terre avec mousse, terre humide et pavés. Les variantes de finition partagent leurs photographies.
- Couleur, normales OpenGL et rugosité intégrées au HTML. Les motifs gardent leur taille physique après redimensionnement. Bois de bout procédural sur les extrémités ; le relief ne déplace aucune face.
- Les apparences suivent les sauvegardes, la duplication, les variantes et l’annulation ; elles ne changent ni les achats ni les recettes de fixation.
- Validation : 576 tests automatisés réussis ; parcours WebGL, export PNG, rechargement PWA hors connexion et interface 390 × 844 contrôlés dans Chromium logiciel. Essai sur téléphone physique restant à faire.
- [Sources, licences, échelles et entretien du pack](docs/TEXTURES.md). Les images sources sont vérifiées par SHA-256 et livrées localement ; aucune clé ou connexion externe n’est nécessaire à l’usage.

## Nouveautés V0.29

- Ajout direct depuis la capsule réparé ; la palette de dialogue conserve son parcours de pose avec aperçu.
- Plans : niveaux de cotes visibles, grille facultative, structure seule et cotes repoussées autour du dessin. Les cadres parasites autour des valeurs sont supprimés.
- Empreinte colorée pendant la pose et le déplacement : projection sur le sol ou le support visé, activable dans les aides au placement.
- Export groupé : sélection des angles 3D, styles d’affichage et plans, réunis dans une archive ZIP.
- Validation : 567 tests réussis ; plan et export des trois plans contrôlés dans le navigateur. Rendu WebGL restant à vérifier sur appareil.
- Recherche et proposition pour les textures de murs, sols, béton et bois : [docs/TEXTURES.md](docs/TEXTURES.md). Le premier pack photographique PBR est désormais intégré (voir ci-dessus).

## Interface V0.28

- Capsules fixes : ajouter/pièces, vue/affichage, aimant/pas/plan. Barre contextuelle selon la sélection.
- Panneaux Pièces et Propriétés repliables et épinglables ; replier ne désélectionne pas et conserve la saisie en cours.
- Menus exclusifs : fermeture au clic extérieur, à Échap et après une commande ; calques réglables sans rouvrir le menu. Échap ferme d’abord le menu, avant d’annuler le geste.
- Sur téléphone : commandes tactiles et propriétés en panneau inférieur conservées. Les conseils Plots béton, Fixations au mur et Assemblages restent visibles dans Assembler.
- Tests automatisés des menus, brouillons, raccourcis, panneaux et changements de mode. Vérification du DOM dans le navigateur ; rendu WebGL et gestes sur appareil réel restant à confirmer.

## Correctifs V0.27.1

- Poignées visibles dès la sélection d’un grillage, panneau ou mur seul, en sélection et déplacement ; les côtés modifient une dimension, les coins deux. Côté opposé conservé, pas précis et annulation. Les grillages latéraux du modèle à toit en pente sont également pris en charge.
- Murs : longueur et hauteur à la souris, longueur en vue de dessus même si la face est vue par la tranche ; épaisseur et support conservés.
- Dégrouper dans le menu principal et les propriétés. Les groupes nommés sont dissociés ; la sélection automatique par liaison peut être suspendue sans effacer les fixations, attaches géométriques ou achats. Grouper la rétablit. Sauvegarde et annulation conservent ce choix.
- Conseils & calculs en tête d’Assembler : plots béton/ancrages, fixation au mur, assemblages bois. Accès direct depuis un poteau et le guide. Volume de béton et sacs à acheter reprennent les données du modèle et de la checklist. Les anciens réglages restent accessibles au-dessus de la liste des liaisons.
- Aperçu HTML : échappement des balises de document à l’intérieur du JavaScript pour éviter une injection de rechargement au milieu du bundle.

Validation : tests automatisés de géométrie, événements souris/tactile, persistance, achats et annulation. Parcours des conseils vérifié dans le navigateur de contrôle ; son rendu WebGL est désactivé, donc pas de validation visuelle 3D sur cet environnement.

## Feuille de route V0.20 à V0.27

Cette livraison réunit les lots de simplification, d’accrochage, d’attaches persistantes et de fixation. Les six arbitrages retenus sont : dimensions fixes par défaut ; attache proposée après accrochage et mode automatique facultatif ; grille adaptative conservée ; Alt temporaire, sans détachement ; menu contextuel court avec actions secondaires ; évolution progressive de l’interface et des styles.

| Lot | Fonctionnement |
| --- | --- |
| V0.20 — Lisibilité | Informations de placement raccourcies, coordonnées séparées, distinction visuelle entre sélection, pièce déplacée et support visé. Les commandes propres à la construction sont séparées de celles des fixations. |
| V0.21 — Organisation | Liste des pièces et ajout à gauche, propriétés Pièce/Position, réglages de scène près du dessin, menu contextuel avec les commandes courantes immédiatement accessibles. Les coordonnées exactes et outils avancés sont conservés. |
| V0.22 — Contacts | Les propositions de placement et l’aimant continu partagent leur calcul de contact. Les murs et panneaux rectangulaires participent au placement. Les axes, plans verrouillés et intersections imposées restent prioritaires. |
| V0.23 — Aides et cotes | Face de support mise en évidence, indications de contact réduites au geste courant, cotes accessibles pour imposer une valeur exacte. La grille adaptative et la répartition au milieu restent disponibles. |
| V0.24 — Attaches | Une pièce peut suivre un support sans changer de dimensions. Les dépendances sont enregistrées, les conflits sont visibles et le détachement est explicite. |
| V0.25 — Adaptation | Les chevrons peuvent suivre deux supports d’extrémité, les panneaux quatre supports de coin. L’adaptation nécessite une autorisation par pièce et un aperçu des changements de dimensions et d’achats. |
| V0.26 — Fixations | Les contacts attachés sans liaison peuvent recevoir des propositions de montage adaptées au support connu. Confirmation individuelle ou par lot homogène, sans doublonner les liaisons existantes ni remplacer les implantations manuelles. |
| V0.27 — Consolidation | Migration V1/V4 vers V5, sauvegarde et restauration des attaches, exports sur la géométrie finale et essai automatisé de 1 000 pièces. La recette visuelle WebGL/tactile sur appareils réels reste à réaliser. |

### Sélection, attache et fixation : trois fonctions distinctes

Un premier clic sur une pièce sélectionne l’assemblage relié, y compris les groupes explicites. Un nouveau clic sur une pièce sélectionnée l’isole ; les clics suivants sur cette pièce la gardent seule. Alt + clic donne directement accès à la sélection seule. Le déplacement de la sélection conserve l’ensemble. Ce comportement ne crée aucune nouvelle fixation.

Une **attache géométrique** détermine ce qui suit un support lorsqu’on ne déplace que celui-ci. Une **liaison de fixation** décrit une recette et ses quantités d’achat. Une attache seule ne compte ni vis, ni connecteur, ni ancrage. Une liaison physique peut former une boucle, par exemple un cadre fermé ; une boucle de dépendances géométriques est refusée.

### Utiliser les attaches

1. Sélectionner une pièce seule, puis ouvrir **Attaches et adaptation** dans ses propriétés.
2. **Attacher une pièce…** permet de choisir la pièce qui doit suivre et son support. Sa position relative actuelle et ses dimensions sont conservées. Après un accrochage, la proposition permet de reprendre directement ce contact.
3. Déplacer le support : la pièce attachée le suit, y compris sa rotation. Déplacer tout l’ensemble n’applique pas deux fois le déplacement.
4. **Détacher** supprime la dépendance en conservant les pièces à leur place. Alt ne détache jamais une pièce : il suspend seulement les aides pendant le geste.

Le mode d’attache automatique se choisit explicitement dans les réglages. Les anciens projets reçoivent une liste d’attaches vide. La détection des contacts existants propose des attaches à confirmer ; elle ne transforme pas automatiquement toutes les liaisons historiques.

Une modification directe qui contredit une attache produit un conflit affiché. Pour le résoudre, annuler le déplacement, corriger la position du support ou détacher la pièce. La suppression d’un support laisse ses pièces dépendantes à leur place ; l’annulation restaure l’opération entière.

### Adapter une traverse ou un panneau

Choisir une pièce seule puis **Adapter aux supports…**. Pour un bois, désigner les supports de ses extrémités A et B. Pour un panneau, désigner un support pour chacun des quatre coins, dans leur ordre. Les points d’attache reprennent la position actuelle sur les supports : il faut d’abord placer correctement les pièces.

L’option **Autoriser l’adaptation** doit être cochée. Avant un changement de dimensions, l’application présente les longueurs ou surfaces modifiées et l’incidence sur les quantités. **Valider les modifications** applique l’ensemble ; **Annuler** conserve le projet antérieur. Une pièce à longueur verrouillée ne peut pas s’allonger automatiquement.

Un poteau intermédiaire peut être enregistré comme point de contrôle, sans piloter les extrémités du chevron. Son déplacement peut signaler un contact à revoir ; il ne recentre pas toute la traverse. Un panneau dont les supports ne forment plus un cadre plat et convexe n’est pas déformé automatiquement : le conflit reste à résoudre.

### Confirmer les fixations

Dans **Assembler**, les **Attaches à équiper** distinguent les contacts déjà pourvus d’une liaison, les montages à proposer et les cas sans recette compatible. Le support exact d’un mur doit être renseigné ; un support inconnu ne reçoit pas une fixation validée par défaut.

**Examiner cette fixation** affiche son incidence avant confirmation. Un lot doit partager la recette, le matériau porteur et le déport ; les cas différents se traitent séparément. Les recettes restent génériques et leur quantitatif peut être ajusté dans la liaison créée. Les grillages ou panneaux sans recette adaptée sont signalés, sans être assimilés arbitrairement à un assemblage de bois. Les positions manuelles existantes sont conservées.

### Vérifications et limites de cette livraison

Les contrôles automatisés portent sur le modèle, la géométrie Three.js sans renderer, les parcours DOM, les migrations, sauvegardes, exports, annulations et calculs de quantités. Le test de 1 000 pièces vérifie le calcul et la sauvegarde ; il ne constitue pas une mesure de fluidité 3D sur téléphone.

Le contrôle navigateur/WebGL et les gestes tactiles réels ne sont pas disponibles dans l’environnement de développement. Les tailles 1 440 × 900, 1 024 × 768 et 390 × 844, le zoom fort et les gestes à deux doigts restent à essayer sur appareil. L’installation hors connexion dépend aussi des capacités et des règles d’accès du navigateur ; les contrôles simulés du service worker ne prouvent pas une installation réelle.

Le calcul des efforts, la stabilité, les capacités structurelles, la conformité électrique, les usinages automatiques et un solveur général de contraintes restent hors périmètre. Les attaches sont des règles géométriques ciblées, pas une validation de fabrication.

## Historique des versions précédentes

**V0.19.2 — sélection des assemblages.** Un premier clic sur une pièce sélectionne toutes les pièces reliées, même indirectement, ainsi que leurs groupes explicites. Un nouveau clic sur une pièce de la sélection la choisit seule ; les clics suivants sur cette même pièce la conservent seule. Cliquer dans le vide réinitialise la sélection. Le comportement est commun à la scène 3D, au plan et à la liste. Les liaisons, positions et quantités restent inchangées ; Alt+clic garde son accès direct à une pièce seule.

**Correctif V0.19.1.** Le menu contextuel du navigateur est désactivé dans toute l’application, y compris sur le panneau Actions créé au relâchement du clic droit. Le glissement droit conserve la navigation de la caméra.

## Nouveautés V0.19 — construire directement dans la scène

**Accroche entre pièces.** Les bois proches utilisent leurs faces, centres et extrémités réels, y compris leurs sections tournées. La pièce est aimantée pendant le déplacement ; la grille locale facultative se règle indépendamment du pas de déplacement. Les centres et bouts proches passent avant les nœuds intermédiaires. Un appui intermédiaire ne recentre pas automatiquement toute la longueur du chevron. Alt suspend les accroches ; il permet de garder un petit débord volontaire. La grille globale stricte et les axes verrouillés restent prioritaires. Les accroches ne tournent ni ne redimensionnent les pièces et ne créent pas de liaison permanente.

**Manipulation et repères.** Les poignées conservent une taille lisible. En déplacement, elles se replacent dans la zone visible quand leur centre sort du cadre, sans déplacer les pièces ; en rotation, elles gardent le centre naturel de la sélection. La caméra orbite ne poursuit plus son inertie pendant une transformation. Le mobile déplacé apparaît en bleu, la cible en orange et le contact obtenu en vert, avec contours et symboles. Les textures de bois, sol et béton sont procédurales, incluses dans le HTML et désactivables dans Afficher.

**Clavier.** Les flèches déplacent la sélection selon le plan de travail en 3D ou la vue Dessus/Face/Côté en plan. Page précédente/suivante règlent la hauteur Y, hors plan verrouillé. Maj multiplie le pas par dix, Alt le divise par dix. Une pression maintenue correspond à une annulation. Les champs de saisie et dialogues ne déclenchent pas les raccourcis de construction. G pose au sol, L prépare une liaison, S active les poignées de panneau et Ctrl+A sélectionne toutes les pièces.

**Actions au clic droit.** Un clic court ouvre les propriétés, liaisons, groupe, sol, alignement, répartition, cadrage, isolement, plan de travail, copie et suppression. Le clic droit glissé conserve la navigation. Le bouton Actions et Maj+F10 donnent accès au même menu. Pour relier une seule pièce, choisir Lier puis cliquer l’autre pièce et sélectionner le montage. Pour deux pièces déjà sélectionnées, le formulaire s’ouvre directement.

**Groupes.** Un nom explicite réunit les pièces pour les sélectionner et les déplacer ensemble ; le dialogue peut inclure les pièces déjà reliées par des assemblages. Alt+clic choisit une pièce seule. Les noms historiques automatiques, comme « Structure », ne sélectionnent pas tout le projet. Dégrouper ne supprime aucune fixation. Les copies de groupes deviennent indépendantes de leurs originaux. La pose au sol déplace tout le groupe rigidement ; « chaque pièce au sol » est une action séparée.

**Cotes et panneaux.** Cliquer une cote entre deux bois en 3D permet de régler exactement son entraxe ou son jeu projeté dans le plan, avec la première ou la seconde pièce fixe. Le groupe peut accompagner la pièce déplacée. Agrandir (S) affiche quatre poignées de coins et quatre de bords sur un panneau rectangulaire de grillage, bois ou toiture. Le bord ou coin opposé reste fixe ; les dimensions suivent le pas relatif, Alt le désactive. Échap annule et le tactile demande une validation. Les surfaces, lés, quantités et achats se recalculent au commit.

Les panneaux non rectangulaires gardent l’édition par coordonnées. L’accroche décrit un contact géométrique, sans usinage automatique ni dimensionnement des efforts. Le rendu WebGL et les gestes restent à vérifier sur un appareil réel ; les contrôles sont vérifiés par tests Three/DOM et calculs géométriques.


## Nouveautés V0.16 à V0.18

**Dossier → Plans à imprimer** prépare des feuilles A4/A3, en portrait ou paysage, avec marges, titre, auteur, date, révision et numéros de page. Les vues dessus/face/côté reprennent les pièces et cotes du projet. L’échelle peut être automatique ou fixée à 1:5, 1:10, 1:20, 1:25, 1:50 ou 1:100. Une échelle fixe n’est jamais réduite en cachette : un débordement est signalé dans l’interface et sur la feuille. Le PDF vectoriel se télécharge directement ; chaque feuille peut aussi être exportée en SVG. Pour imprimer, choisir taille réelle / 100 % et contrôler le trait témoin de 25 ou 50 mm.

**Dossier → Coupes & montage** propose une coupe par plan X/Y/Z à une position précise, avec choix du côté conservé et hachures des bois et murs réellement intersectés. Les bois inclinés et la rotation de leurs sections sont pris en compte. La coupe peut se regarder de face ou en isométrie. Les panneaux restent des surfaces : aucune épaisseur n’est inventée. Ce sont des vues du modèle, sans usinage ni changement de pièces.

La vue éclatée sépare visuellement les groupes ou pièces, avec repères et traits de rappel. Le détail d’une liaison isole ses pièces et fixations schématiques. Les étapes de montage se composent à partir des pièces sélectionnées ou cochées ; leur nom et leur ordre se modifient, leur affichage est cumulatif. Des références supprimées restent signalées. La vue technique et une feuille par étape peuvent être ajoutées au PDF. Les réglages sont conservés dans le JSON et l’historique, sans changer les achats ni la géométrie.

**Outils → Installer / hors connexion** affiche l’état réel de préparation. La version HTTPS fournit un manifeste, des icônes et un service worker à cache versionné. Une première ouverture en ligne doit achever la mise en cache ; une page de connexion ou une erreur ne remplace jamais l’application enregistrée. L’installation dépend des fonctions proposées par le navigateur. Les mises à jour se préparent sur action explicite et ne rechargent pas le projet ouvert. Une demande de stockage durable et l’export JSON restent accessibles. Les projets ne sont pas synchronisés entre appareils.

Le HTML téléchargé reste autonome et fonctionne en `file://` sans cache réseau ni service worker. Pour l’installation sur l’écran d’accueil, utiliser l’adresse HTTPS. L’accès privé de l’hébergement et les restrictions du navigateur peuvent empêcher la préparation hors connexion : l’interface signale alors cette limite. Les tests simulent les événements navigateur ; l’installation et le rendu WebGL restent à essayer sur appareil réel.


## Nouveautés V0.14 et V0.15

**Téléphone** : la scène occupe l’espace disponible. La barre du bas donne accès aux pièces, à l’ajout, à la sélection multiple, aux propriétés et aux aides. Les propriétés s’ouvrent dans un panneau repliable ; les champs et boutons sont agrandis. Le clavier numérique et les zones sûres du téléphone sont pris en compte. Les achats prennent la forme de cartes.

En 3D, un doigt déplace la vue ; le bouton de rotation permet de pivoter. Deux doigts déplacent et pincent pour zoomer. Un toucher sélectionne ; un appui prolongé affiche un viseur au-dessus du doigt. Les poses et transformations tactiles restent en aperçu jusqu’à **Valider** ; **Annuler** restaure la position exacte. Les gestes à plusieurs doigts ne posent ni ne sélectionnent accidentellement une pièce. Les commandes à la souris sont conservées.

**Concevoir → Plans & cotes** ouvre un éditeur SVG utilisable sans WebGL, avec vues Dessus, Face et Côté liées au même projet. Glisser déplace le plan ; molette ou pincement zoome autour du point visé. Toucher une pièce la sélectionne et ouvre ses mêmes propriétés. Le bouton Déplacer prépare une translation à valider. Ajouter prépare une pose par point pour les poteaux et panneaux, ou par deux points pour les chevrons et diagonales. La profondeur hors du plan est conservée ; elle reste réglable dans les propriétés. Les grilles adaptatives et guides existants assistent le geste.

**Coter** enregistre une longueur, un entraxe, un espace libre projeté ou un angle entre deux bois. Cliquer/toucher la cote ouvre sa valeur exacte. Saisir `0,50 m`, choisir la pièce à déplacer (ou A/centre/B fixe pour une longueur), puis appliquer : une seule annulation restaure l’opération. La grille ne modifie pas la valeur demandée. La géométrie, les quantités et les achats se recalculent ensemble ; la prévisualisation ne les modifie pas.

Les cotes suivent les identifiants des pièces et sont conservées dans les projets, JSON et historique. Une pièce supprimée laisse une référence explicitement manquante, sans ancienne valeur affichée. Les cotes automatiques se règlent en trois niveaux : dimensions générales, rangées de poteaux et détail. Export SVG du plan complet et ajout du plan coté au dossier imprimable/PDF. L’affichage est arrondi à 1, 0,5 ou 0,1 mm sans arrondir les calculs.

Les angles et modèles guidés restent des mesures en lecture seule. Les modifications de cotes sont ponctuelles : il n’y a pas de solveur maintenant une contrainte permanente. Le dessin montre les projections des pièces, sans suppression complète des lignes cachées. Mise en page papier A4/A3, coupes et vues éclatées sont ajoutées dans les V0.16 et V0.17 ci-dessus. L’installation PWA est ajoutée dans la V0.18 ci-dessus. Les gestes et parcours ont été vérifiés par tests DOM/Three ; un essai tactile et WebGL sur appareil réel reste nécessaire.


Application française de préparation de projets en bois : enclos guidé ou construction libre, assemblages individuels, murs, quantitatif, liste d'achats et exports.

## Nouveautés V0.13 — placement adaptatif

Dans Concevoir, le bloc **Aides au placement** rassemble trois options indépendantes : guides visuels, accrochage aux guides et accrochage aux intersections de la grille. Alt suspend les accrochages pendant le geste. Les guides montrent les alignements, le milieu entre deux repères et les espacements répétés dans le plan de travail ; ils ne créent pas de contrainte permanente.

Sélectionner deux bois puis **Ajouter au milieu de ces pièces**. L’assistant permet de copier une pièce une ou plusieurs fois entre les deux repères, avec entraxes égaux ou espaces libres projetés égaux. L’aperçu comporte les mesures avant application ; une seule annulation retire toute l’opération. Une troisième pièce sélectionnée peut être recentrée avec **Centrer la dernière entre les deux premières**. Les deux références restent fixes. La section, la longueur et l’orientation de la pièce copiée sont conservées ; le niveau des repères est interpolé. Les pièces qui occupent déjà un emplacement sont signalées.

La grille adaptative prend les deux poteaux les plus éloignés dans le plan (ou les bois si moins de deux poteaux), ou deux références choisies. Elle s’oriente sur leur ligne et divise leur entraxe en N carreaux carrés. Exemple : 3 700 mm / 8 = 462,5 mm. Les deux repères coïncident avec des intersections ; les autres pièces ne sont pas déplacées automatiquement. Le nombre de divisions et les deux références sont réglables, avec un mode à pas fixe. La grille reste figée pendant le geste, puis s’adapte au projet enregistré.

L’accrochage aux intersections est distinct du pas fin relatif : il cale le pied d’un poteau (ou le centre des autres éléments) sur une position absolue de la grille. Il prend la priorité sur les guides et contacts ; une poignée dont l’axe ne permet pas de rejoindre un nœud ne déplace pas la pièce hors de cet axe. Utiliser une poignée dans le plan ou Alt. Les champs de coordonnées et l’assistant de répartition restent des réglages exacts indépendants de la grille.

Les distances automatiques sont projetées sur le plan de travail. Pour des éléments inclinés, les jeux entre enveloppes ne sont pas une distance minimale entre solides. Les guides sont limités aux références proches pour conserver une scène réactive. Lorsque les carreaux sont très fins, seule une portion de grille est dessinée, sans changer le pas réel.

## Nouveautés V0.12

Le parcours principal se compose de **Concevoir**, **Assembler**, **Préparer** et **Dossier**. Les projets et modèles sont dans le menu Projet ; le guide et l’électricité dans Outils. Préparer réunit Débit, Stock & références et Achats. Le bouton Plein cadre (F) agrandit la scène, Échap en sort. Les calques et presets Structure/Complet/Plan sont dans Afficher.

- **Saisie précise** : les cotes guidées acceptent les décimales. Une valeur hors limites reste visible avec une indication d’erreur. L’inspecteur distingue réglages essentiels et coordonnées avancées. La longueur peut changer en gardant A, le centre ou B immobile.
- **Construction libre** : choisir un élément, puis cliquer sur le plan de travail pour le poser après aperçu. Échap annule. Sans WebGL, le point de pose se saisit dans un dialogue XYZ. L’orientation de départ est conservée, la face basse est posée sur le plan.
- **Manipulation** : contour de sélection et survol, accrochage aux contacts proches pendant le déplacement (Alt le suspend), mesure entre deux points (M). Les vues Dessus/Face/Côté sont orthographiques et gardent leur orientation lors du glissement. Le mode libre conserve zoom et rotation au curseur.
- **Débit** : choix direct de plusieurs longueurs commerciales, formats personnalisés, comparaison avant application. Les longueurs, stocks/chutes, achats et prix restent dans le projet.
- **Coupes** : dans Dossier, sélectionner une pièce et définir les plans A/B (équerre, horizontal ou vertical) ainsi qu’une surlongueur totale. Le brut nécessaire tient compte de la pente et de la rotation de section et alimente le débit et les achats. Tant qu’une coupe reste indéfinie, le calcul utilise la longueur d’axe avec mention à compléter. L’arrondi 1 ou 0,5 mm porte sur la présentation, jamais sur le calcul.
- **Fiches** : longueur d’axe, enveloppe, brut, angles géométriques et deux projections par pièce ; liaison détaillée avec les deux pièces, composants, références et positions XYZ. Fiches SVG et dossier imprimable/PDF. La configuration des coupes reste dans le JSON et suit les copies/suppressions de pièces.

Les coupes renseignées servent à préparer les longueurs ; elles ne découpent pas le solide 3D. Les angles indiqués ne sont pas des réglages de machine. Les entailles, tenons, collisions complètes et dimensionnement structurel ne sont pas intégrés. Les fixations restent des représentations génériques, avec placement automatique ou manuel.

## Démarrer

Ouvrir `dist/index.html` dans un navigateur récent. Three.js et les outils sont inclus dans le fichier ; aucun CDN ni compte n'est nécessaire aux calculs. WebGL permet la 3D ; sans WebGL, le plan de dessus et l'édition par formulaires restent utilisables.

Dans **Concevoir**, choisir « Modifier les pièces librement » ou « Partir de zéro ». En mode libre, les boutons préparent le placement au clic de poteaux, chevrons, diagonales, grillage, panneaux et murs. Des exemples en L, adossé et à double pente servent de départ.

Sélectionner une pièce en 3D ou dans la liste. Modifier les coordonnées A/B, la section, l'essence, la longueur et la rotation de section, puis appliquer. Les panneaux sont définis par quatre coins. Les murs restent verticaux et portent des informations de support, d'isolant et de vide.

La sélection multiple utilise les cases ou Maj+clic. Les poignées déplacent sur les axes et tournent autour de Y ; les rotations X/Z sont disponibles dans les champs. L'outil inclut duplication en série, décalage exact, alignement des centres, espacement régulier, groupes et accrochage d'extrémités. Raccourcis : V sélection, W déplacement, R rotation, Ctrl+D duplication, Suppr suppression, Ctrl+Z annulation.

Dans **Assembler**, choisir une liaison existante ou relier deux pièces. Personnaliser la recette, les quantités, la référence et les notes. Un comparateur permet de changer de montage. Les murs creux peuvent appeler tamis, tiges et résine ; les supports inconnus ou incompatibilités connues sont signalés.

Dans **Préparer → Achats**, renseigner stock et prix par conditionnement. Le budget indique ses prix manquants. Le débit sépare les essences et les sections. Les exports comprennent JSON, CSV, SVG, PNG, OBJ et un dossier imprimable en PDF.

## Navigation et placement précis

Le mode **Libre** est activé par défaut : glisser gauche déplace la caméra, glisser droit tourne autour du point visé au début du geste, la molette zoome vers la souris. Le pivot est choisi à chaque geste, sur la pièce visible ou sur le plan de travail ; dans le vide, un repère de profondeur locale est utilisé. Glisser central ou Maj+glisser droit déplace aussi la vue. Alt ralentit le déplacement, Maj+molette ralentit le zoom. Un clic gauche sélectionne ; les poignées restent réservées au déplacement des pièces. Le mode Orbite reste disponible. Dessus/Face/Côté passent en vue orthographique.

Le pas est réglable de **0,1 à 1 000 mm**, avec 1 mm par défaut. Les incréments sont relatifs à la position de départ pour éviter de recaler involontairement la pièce sur une grille globale. L'ancien pas par défaut de 50 mm est migré à 1 mm. Les coordonnées précises, les écarts et les contacts ne sont pas arrondis à ce pas. De petits boutons déplacent d'un seul pas sur chaque axe.

Après sélection ou déplacement d'un bois, les contacts proches (75 mm) sont proposés dans l'inspecteur. Le survol montre l'aperçu ; **Appliquer** translate la sélection exactement ; **Appliquer et relier** ouvre le choix du montage. Les chevrons horizontaux sont centrés transversalement sur des poteaux intermédiaires sans recentrer leur longueur sur le poteau. Les faces doivent être parallèles et présenter une véritable surface de contact. Les propositions qui feraient pénétrer un autre bois sont écartées. Cela ne valide aucune résistance ni assemblage de charpente.

Avec un ou plusieurs bois sélectionnés, **Écart et alignement exacts** choisit la référence fixe, la pièce ou le groupe à déplacer, l'axe X/Y/Z et la mesure : espace libre entre faces ou distance entre centres/axes. Exemple : saisir **0,5 m** entre deux poteaux. L'alignement utilise leurs faces négatives, leurs centres ou leurs faces positives. Un aperçu est disponible. Les modifications sont ponctuelles, sans contrainte permanente. Les limites de faces sont projetées sur l'axe du projet pour les bois inclinés ; ce n'est pas la distance minimale euclidienne entre deux solides.

Le **plan de travail** peut être XZ, XY, YZ avec décalage, ou pris sur une face réelle de bois (y compris tournée). Il fournit une grille, une vue face au plan et un verrouillage des déplacements par poignée parallèlement au plan. **Poser la sélection sur le plan** met ses faces extrêmes au contact par translation, sans rotation. Les boutons U/V suivent le repère du plan. Le plan est enregistré dans le projet, reste fixe si le bois de référence bouge, et n'impose pas de contrainte aux cotes saisies ou aux écarts/alignements X/Y/Z.

Les contacts et les aides de mesure/alignement concernent les bois rectangulaires. Les murs et les panneaux restent éditables par coordonnées. Les suggestions automatiques sont limitées aux sélections d'au plus 20 bois, avec huit propositions visibles. Les pentes dont les faces ne sont pas parallèles demandent un ajustement manuel ou un usinage à concevoir.

## Données

Le schéma de projet est désormais V5. Les fichiers JSON V1 et V4 sont migrés sans créer d’attache implicite ; dimensions, stocks, prix, checklist et liaisons existantes sont conservés. La bibliothèque locale accepte les trois formats, y compris dans une sauvegarde globale contenant des versions historiques. Le projet précédant le dernier import reste récupérable. Exporter régulièrement le JSON pour disposer d’une sauvegarde indépendante du navigateur.

## Limites explicites

Les recettes sont des estimations modifiables ; les documents fabricants aident à sélectionner le système exact. Aucun effort admissible, profondeur de fondation, résistance de mur ou stabilité d'ensemble n'est validé. Les détails d'assemblage sont schématiques, sans plan de perçage. Les usinages d'assemblages bois ne sont pas soustraits de la géométrie.

Les diagnostics géométriques portent sur les pièces manquantes, les distances minimales entre enveloppes, les doublons exacts, les panneaux dégénérés/non plans et les pièces sans liaison. Ils ne constituent pas une détection complète des collisions. Les liaisons restent à définir par l'utilisateur après construction libre.

Les murs sont des supports existants, pas des matériaux à acheter. Les panneaux rectangulaires peuvent être calepinés dans les formats saisis ; les formes non rectangulaires sont signalées pour un tracé manuel. Le stock de grillage est interprété comme des rouleaux entiers et un seul reste continu. Le débit est une heuristique à une longueur par défaut, ou à plusieurs formats et stocks finis lorsque le mode avancé est activé. Les portillons copiés nécessitent de préciser leur quincaillerie.

Limite technique de cette version : 1 000 pièces, 5 000 liaisons de fixation et 1 000 attaches géométriques. Une pièce possède au plus une relation géométrique principale, qui peut désigner plusieurs supports. Les modèles de départ et le module électrique sont décrits ci-dessous.

## Vérification et construction

`node --test tests/*.test.mjs` : calculs, migration, opérations géométriques, duplication, assemblages, murs et parcours DOM.

`node build.mjs` : HTML autonome dans dist/.

Les tests DOM Happy DOM ne produisent pas de rendu WebGL. La vérification visuelle en navigateur n'était pas disponible dans cet environnement ; elle reste à réaliser lors de l'essai utilisateur.

## Correctif V0.9.1

En vue libre, la molette vise la souris et le clic droit tourne autour du point visé au début du geste, sans recentrage. Le glissement gauche déplace la vue ; sa vitesse s’adapte à la profondeur du point visé. Les calques masqués et le grillage ne bloquent pas le ciblage.

Les connecteurs bois ont des plaques adaptées aux sections et aux faces, avec vis orientées et perçages communs. Les équerres, plats et sabots restent des représentations génériques. Les montages que le placement ne sait pas ajuster sont signalés dans Fixer. Le métal est plus clair et les platines au sol sont affinées.

Un connecteur déplacé manuellement emporte ses vis liées ; chaque vis reste réglable séparément. Les anciens placements manuels gardent leurs coordonnées. Pour les recalculer avec le nouveau placement, choisir **Automatique** dans Fixer, puis **Manuelle** si nécessaire.

Vérifications : tests de projection caméra, ciblage Three, géométrie des plaques/perçages/vis et conservation des placements manuels. Une projection des géométries avec tampon de profondeur a été inspectée ; cela ne remplace pas la vérification de l’application en navigateur WebGL, indisponible dans cet environnement.

## Nouveautés V0.9 de test

Le calcul d’efforts et le dimensionnement structurel ont été retirés du programme à la demande de l’utilisateur.

### Fixations : automatique ou manuel

Dans **Assembler**, sélectionner une liaison et choisir **Automatique** ou **Manuelle**. Chaque vis, boulon, ancrage ou connecteur possède un repère sélectionnable. En manuel, les poignées déplacent la fixation (et ses vis liées pour un connecteur) ; les champs X/Y/Z permettent une saisie précise. Les positions sont liées au repère de la première pièce et suivent ses déplacements/rotations. Revenir en automatique rétablit la répartition proposée. Le nombre de composants suit les quantités de la recette, pas le déplacement des repères.

Pour une platine mécanique ou chimique, sélectionner son poteau puis **Positionner les ancrages**. Le calque **Vis & ancrages** permet d’afficher/masquer ces composants. Les modèles sont schématiques ; les perçages, diamètres et profondeurs d’une référence réelle ne sont pas déduits de ces formes génériques. Les positions se retrouvent dans les projections, le dossier et l’OBJ.

### Matériaux et découpe

**Stock** contient un catalogue personnel (référence, fournisseur, unité, conditionnement, prix), des articles complémentaires, des barres et chutes réelles, ainsi que les formats de panneaux. Activer les sources avancées pour les appliquer au débit et aux achats. Les chutes et stocks finis sont affectés avant les achats. Une quantité 0 sur une source « à acheter » signifie disponibilité illimitée ; les stocks 0 sont vides. Les manquants ne sont pas masqués.

Le panneau bois se crée dans l’éditeur libre. Ses quatre coins, épaisseur et essence définissent la surface à découper. Le calepinage est rectangulaire, par coupes guillotine ; la rotation dépend de l’option propre au format. Les quantités de stock ne sont pas décrémentées définitivement après chaque calcul. Les surlongueurs pour coupes biaisées et les défauts du matériau restent à prévoir.

### Modèles et dossier

**Modèles** propose une pergola ouverte, une clôture droite grillagée ou à lames, une porte battante à un/deux vantaux et une porte coulissante. Chaque création ouvre un nouveau projet libre et conserve l’ancien. Les dimensions des portes sont celles des vantaux, sans bâti ; le rail et les ferrures restent des références à choisir dans les achats. Le modèle ne dimensionne pas les sections.

**Dossier** réunit les projections orthographiques cotées, repères et débit, liaisons, implantation XYZ des fixations, checklist et étapes de préparation. Les étapes sont génériques et non réordonnables. Les SVG sont exportables ; l’impression permet un PDF. La vue éclatée et les plans d’usinage détaillés restent à développer.

### Électricité

**Élec.** permet de placer tableau, prises, lampes, commandes, boîtes et RJ45, par clic ou coordonnées. Les circuits définissent les références saisies, sections et protections ; aucun calibre n’est choisi automatiquement. Les chemins de câbles se tracent par clics ou points, avec dénivelé, réserve et marge explicites. Les extrémités attachées suivent les appareils ; les points intermédiaires restent fixes. Un circuit multiconducteur compte une longueur de câble ; les conducteurs séparés comptent une longueur par repère distinct.

Les appareils, protections renseignées, câbles et gaines alimentent la checklist globale. Plan et unifilaire de principe sont exportables en SVG, les achats en CSV. Le module ne vérifie pas la conformité ni le détail du câblage. Le plan est une seule zone rectangulaire ; les groupes différentiels sont descriptifs, leurs appareils partagés restent à ajouter comme articles complémentaires.

### Projets et versions

**Projets** permet de créer, ouvrir, renommer, dupliquer et supprimer des projets locaux, restaurer une version et exporter/importer une sauvegarde globale. Maximum 20 projets et 10 versions par projet dans un budget local de 3,5 Mo ; les anciennes versions sont retirées si nécessaire, jamais un projet courant. L’import global fusionne sans écraser les variantes. Les fichiers JSON restent le moyen de transférer les projets entre appareils.

La V0.9 désigne une version d’essai des lots pratiques, pas l’achèvement de tous les perfectionnements de la feuille de route. Les contraintes persistantes, contacts non parallèles, collisions globales, géométries fabricant et contrôles électriques réglementaires ne sont pas intégrés.
