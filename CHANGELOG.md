# Hébergement GitHub Pages — 22 octobre 2026

- Publication automatique de `dist/` par GitHub Actions après installation verrouillée, tests et compilation, à chaque envoi sur `main` ou lancement manuel.
- Manifeste, icônes et service worker compatibles avec le sous-dossier `/1plan3D/` et l’hébergement à la racine ; caches isolés par dossier d’installation.
- Suppression de la configuration d’hébergement OpenAI du dépôt et documentation de l’activation de GitHub Pages, du suivi du déploiement et du transfert des projets JSON.

# Textures réalistes — 22 octobre 2026

- Premier pack CC0 embarqué : 12 finitions, 9 jeux photographiques de Poly Haven et ambientCG, avec couleur, normales OpenGL et rugosité.
- Choix par vignettes dans les propriétés, application à la sélection, échelle, rotation et teinte ; sol dans Afficher, modes Réaliste / Schéma et qualité légère.
- UV en mètres, veinage longitudinal, bois de bout distinct, maps photographiques partagées et libérées au dernier utilisateur.
- Sauvegarde, duplication et annulation des apparences ; support porteur, dimensions, achats et recettes conservés.
- Export PNG et ZIP attendent le décodage des textures locales. HTML autonome et cache PWA incluent le pack sans téléchargement séparé.
- Corrections d’accès mobile : notifications sans interception des clics et panneau Propriétés au-dessus de son fond de fermeture.
- Validation : 576 tests réussis ; WebGL, export PNG, rechargement PWA hors connexion et interface mobile simulée contrôlés sans erreur JavaScript ni requête externe de texture.

# V0.29 — Placement, plans et exports — 22 octobre 2026

- Correction de l’ajout depuis la capsule : la pose démarre aussi lorsqu’aucune fenêtre n’est ouverte.
- Plans : suppression des cadres parasites hérités des icônes, cotes autour de la structure, niveau de détail et grille directement accessibles, mode structure seule.
- Empreinte bleue de placement projetée sur le sol ou le support visé, verte en cas d’accrochage ; désactivation dans les aides, aucun export de l’empreinte.
- Export ZIP au choix : huit angles 3D, calques actuels ou structure seule, trois plans SVG et galerie HTML.
- Proposition documentée de textures réalistes : docs/TEXTURES.md ; textures photographiques non encore intégrées.
- 567 tests automatisés réussis. Plan et export groupé de trois plans vérifiés dans le navigateur. Rendu WebGL indisponible dans l’environnement de vérification ; validation visuelle 3D sur appareil restant à faire.

# V0.27 — Feuille de route V0.20 à V0.27 — 20 octobre 2026

- V0.20–V0.21 : interface réorganisée autour des pièces, de la scène et des propriétés ; réglages Aimant et support de pose rapprochés du dessin ; menu contextuel réduit aux actions pertinentes, outils précis conservés.
- V0.22–V0.23 : calcul commun des contacts proposés et continus, extension aux murs et panneaux rectangulaires, aides visuelles simplifiées et distinction de la face cible. Les axes et grilles imposés restent prioritaires.
- V0.24 : attaches persistantes dans le schéma V5, suivi relatif sans changement de dimensions, conflits visibles, détachement explicite, propagation sans double déplacement et suppression annulable des références.
- V0.25 : adaptation choisie des bois entre deux extrémités et des panneaux entre quatre coins ; supports intermédiaires indépendants du pilotage de la longueur ; aperçu avant redimensionnement, refus des cadres non plans ou dégénérés.
- V0.26 : propositions de fixations selon les supports, confirmation individuelle ou par lot homogène avec aperçu des achats, prévention des doublons et conservation des positions manuelles.
- V0.27 : sauvegardes locales V5 avec attaches, compatibilité des fichiers et historiques V1/V4, exports sur la géométrie finale et vérification automatisée d’un projet de 1 000 pièces.
- Choix retenus : longueur fixe par défaut, attache automatique facultative, grille adaptative conservée, Alt temporaire, menu court avec actions secondaires, réorganisation progressive.
- Vérification automatisée des calculs, parcours DOM, sauvegardes et exports. La recette visuelle WebGL et tactile sur appareils réels reste à réaliser ; aucune mesure de fluidité mobile n’est annoncée.
- Le calcul d’efforts et le dimensionnement structurel restent exclus.

# V0.19.2 — Sélection des assemblages — 20 octobre 2026

- Premier clic : ensemble des pièces liées ou groupées ; second clic : pièce seule. Alt + clic garde l’accès direct à la pièce seule.
- V0.19.1 : le menu natif du navigateur ne masque plus les actions de l’application ; le glissement droit conserve la navigation.

# V0.9 de test — 19 octobre 2026

- Retrait du calcul d’efforts du périmètre.
- Calque physique de fixations, placement automatique ou manuel par poignées et coordonnées, ancrages de platines inclus. Positions liées à la pièce et sauvegardées ; quantités uniques par recette.
- Catalogue personnel et compléments, stock bois multi-longueurs/chutes, calepinage rectangulaire, détail des lés de grillage cohérent avec stock et réserve.
- Modèles personnalisables pergola ouverte, clôture droite, portes battantes et coulissantes ; panneau bois libre.
- Dossier dessus/face/côté, positions des fixations, repères, débit, checklist et étapes de préparation ; SVG et OBJ enrichis.
- Module électrique : implantation, circuits saisis, chemins et longueurs, unifilaire de principe et achats. Aucun choix automatique de calibre ni contrôle de conformité.
- Projets locaux nommés, variantes, historique borné, restauration et sauvegarde globale fusionnée.
- Géométries et recettes génériques ; usinages, contraintes persistantes, catalogue fabricant complet et vue éclatée hors de cette livraison.
- Vérification automatisée du domaine, des intégrations Three sans renderer et des parcours DOM. Contrôle navigateur/WebGL réel restant à faire.

# V0.4.1 — Navigation et placement précis

- Caméra libre à la souris, sans cible : déplacement, regard sur place et avance/recul ; mode orbital conservé.
- Pas relatif de 0,1 à 1 000 mm, défaut 1 mm ; petits déplacements par axe.
- Propositions de contacts entre vraies faces de bois, aperçu et choix explicite du support, y compris poteaux intermédiaires.
- Réglage exact d'espace libre ou d'entraxe en m/cm/mm ; référence fixe et déplacement de pièce/groupe.
- Alignement des centres ou faces avec aperçu.
- Plans XZ/XY/YZ et par face réelle, décalage, vue du plan, translation parallèle et pose sur le plan.
- Ancien accrochage automatique des axes retiré pour éviter les chevauchements involontaires.
- Plan et précision conservés dans les sauvegardes V4 ; caméra mémorisée sur le navigateur.

Limites : bois rectangulaire et faces parallèles pour les contacts ; les écarts suivent l'axe choisi. Les contacts et alignements ne sont pas des contraintes permanentes. Les murs/panneaux ne participent pas au contrôle de pénétration des propositions. Vérification automatisée par géométrie, événements de caméra et parcours DOM ; rendu WebGL réel à vérifier dans un navigateur.

# V0.4 — Construction libre

- Pièces libres, conversion de l'enclos, départ vide et exemples modifiables.
- Sélection multiple, coordonnées exactes, déplacement et rotation, duplication en série, alignements, groupes et accrochages.
- Sections/essences individuelles, panneaux à quatre coins et murs de référence.
- Liaisons individuelles avec recettes modifiables, comparaison et copie vers d'autres liaisons.
- Scellements muraux : ancrages, tiges, tamis, résine et kits à distance.
- Achats par essence, calcul de plusieurs surfaces de couverture, diagnostics et traçabilité des liaisons.
- Migration des projets V1, conservation de la copie locale V1 et récupération avant import.
- Dossier imprimable enrichi des liaisons, hypothèses et murs.

Les jalons V0.2 à V0.4 sont réunis dans cette version de test. Le catalogue reste fondé sur des familles génériques avec documentation fabricant ; aucune capacité structurelle n'est certifiée. La vérification visuelle en navigateur reste à effectuer. Les détails de perçage, l'usinage géométrique et les collisions complètes ne sont pas couverts.
