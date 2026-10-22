# Proposition de textures réalistes

État au 22 octobre 2026 : **proposition d’évolution**, pas encore un pack photographique intégré. L’application conserve ses textures procédurales embarquées pour fonctionner hors connexion. Les apparences ne modifient ni les quantités ni les recettes de fixation.

## Bibliothèques retenues

- **ambientCG** : bibliothèque de matériaux dont les fichiers téléchargeables sont sous CC0. Les textures peuvent être redistribuées dans une application. [Licence officielle](https://docs.ambientcg.com/license/) · [Catalogue](https://ambientcg.com/).
- **Poly Haven** : textures, modèles et éclairages HDRI sous CC0 ; redistribution des assets autorisée. Le catalogue comprend bois, briques/blocs, béton et terrains. [Licence officielle](https://polyhaven.com/license) · [Textures](https://polyhaven.com/textures).

Je recommande un petit catalogue sélectionné et livré avec l’application. Cela évite de dépendre d’un serveur d’images pendant un chantier. L’utilisation de l’API publique Poly Haven relève de conditions distinctes de la licence des textures : [conditions de l’API](https://github.com/Poly-Haven/Public-API/blob/master/ToS.md). Un navigateur de catalogue en ligne serait donc une extension séparée.

## Palette proposée

| Élément | Finitions à proposer | Point d’attention |
| --- | --- | --- |
| Mur | Parpaing gris, brique rouge, béton coffré, béton lisse, enduit | Joints à l’échelle réelle ; orientation horizontale des rangs |
| Sol | Terre sèche, terre humide, herbe courte, terrain en friche, sable, gravier | Éviter la répétition visible sur de grandes surfaces |
| Béton | Plot brut, dalle talochée, béton coffré | Même grain pour les plots et les faces d’une dalle |
| Bois | Brut de sciage, raboté, lasuré, peint, vieilli | Veinage dans la longueur ; bois de bout sur les extrémités |
| Métal et grillage | Acier galvanisé, acier peint | Conserver les ajours du grillage et des platines |

Sources de sélection : [briques et blocs](https://polyhaven.com/textures/brick-block), [bois](https://polyhaven.com/textures/wood), [sols et terrains](https://polyhaven.com/textures/ground-terrain), [sable](https://polyhaven.com/textures/ground-terrain/sand). La friche peut être rendue par une surface photographique ; une végétation qui dépasse réellement du sol demanderait des objets supplémentaires et un budget graphique distinct.

## Intégration recommandée

1. **Choisir l’apparence** dans les propriétés de la pièce, avec vignettes. Choix du sol dans Afficher. Une action applique la finition à toute la sélection.
2. **Premier pack léger** : environ 12 finitions, images de 512 à 1 024 pixels, partage des textures entre les objets. Conserver un mode Schéma sans textures et un mode Réaliste.
3. **Matériaux PBR** : image de couleur, relief de surface (normal map), rugosité. Le relief reste visuel : pas de déplacement des faces, afin de conserver les accroches et dimensions exactes. Prévoir une qualité réduite pour le téléphone.
4. **Échelle physique** : une texture représentant 1 m de mur continue à représenter 1 m après redimensionnement. Les UV d’un chevron suivent sa longueur et ses faces ; une photo de planches de parquet ne convient pas telle quelle à un poteau.
5. **Sauvegarde** : stocker un identifiant de finition, son échelle, sa rotation et une teinte facultative. L’aspect « brique » n’impose jamais automatiquement un support de fixation en brique : le matériau porteur reste un choix explicite.
6. **Exports fiables** : intégrer ou servir localement les fichiers, afin que les captures PNG ne soient pas bloquées par les règles d’accès aux images distantes. Inclure les finitions du projet dans l’offre hors connexion.
7. **Traçabilité** : pour chaque asset retenu, garder son ID, l’auteur, l’URL, la licence et l’échelle réelle. La sélection exacte des photographies reste à effectuer avant de livrer le pack.

Critères de recette : aucun étirement après agrandissement d’un mur ; veinage dans le bon sens ; tailles cohérentes entre objets ; mêmes quantités avant/après ; export PNG correct ; réouverture hors connexion ; mesure de la fluidité sur un téléphone réel.
