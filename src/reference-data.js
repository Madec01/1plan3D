// Documentation de familles consultée le 19/10/2026, pas une sélection technique.
// Les quantités de l'application sont des hypothèses modifiables : la présence
// d'une source fabricant ne valide ni leur nombre, ni leur diamètre, ni leur résistance.
export const VERIFIED_REFERENCES = [
  {
    id: 'simpson-abr',
    label: 'Simpson — Équerres renforcées ABR',
    url: 'https://www.simpson.fr/fr-FR/produits/equerre-renforcee-105-70-90-abr',
    checkedAt: '2026-10-19',
    scope: 'Famille d’équerres pour liaisons bois et supports rigides.',
    conditions: [
      'Choisir la référence, le plan de fixation et les fixations associées dans la fiche technique.',
      'Le nombre d’équerres et le blocage en rotation font partie des hypothèses du montage.',
      'Cette famille Z275 est indiquée en classe de service 2 : vérifier une variante adaptée à l’exposition extérieure réelle.'
    ]
  },
  {
    id: 'simpson-sae',
    label: 'Simpson — Sabots à ailes extérieures SAE / SAEL',
    url: 'https://www.simpson.fr/fr-FR/produits/sabot-a-ailes-exterieures-sae-sael',
    checkedAt: '2026-10-19',
    scope: 'Sabots pour solives ou chevrons, avec tableaux par référence et support.',
    conditions: [
      'Les plans de clouage total et partiel ont des quantités et des performances différentes.',
      'Distinguer les fixations côté porteur de celles côté pièce portée ; leur longueur dépend notamment de l’épaisseur du bois.',
      'Sur béton ou maçonnerie, vérifier les ancrages séparément, notamment près des bords.',
      'La référence standard est donnée en classe de service 2 : ne pas la choisir automatiquement pour un ouvrage exposé.'
    ]
  },
  {
    id: 'simpson-ssh',
    label: 'Simpson — Vis de connecteurs SSH',
    url: 'https://www.simpson.fr/fr-FR/produits/vis-connecteurs-acier-sur-bois-ssh',
    checkedAt: '2026-10-19',
    scope: 'Vis acier–bois et tableau des connecteurs compatibles.',
    conditions: [
      'La compatibilité dépend de la référence du connecteur et du diamètre/longueur de vis.',
      'Les vis d’assemblage bois génériques ne remplacent pas automatiquement les fixations prévues pour un connecteur.',
      'Utiliser la fiche du connecteur pour définir le nombre et la disposition des vis.'
    ]
  },
  {
    id: 'simpson-swwz',
    label: 'Simpson — Vis structurelles bois SWWZ Impreg+',
    url: 'https://www.simpson.fr/fr-FR/produits/vis-a-bois-structurelle-tete-plate-impreg-swwz',
    checkedAt: '2026-10-19',
    scope: 'Exemple de famille de vis à filetage partiel pour assemblage bois en extérieur.',
    conditions: [
      'Choisir diamètre, longueur et longueur filetée selon les pièces et le montage étudiés.',
      'Le revêtement est présenté pour l’extérieur, hors atmosphère très corrosive.',
      'Le conditionnement et les données techniques varient avec la référence ; aucun nombre universel de vis par liaison.'
    ]
  },
  {
    id: 'fischer-fis-v-plus',
    label: 'Fischer — Scellement par injection FIS V Plus',
    url: 'https://www.fischer.fr/fr-fr/produits/fixations-chimiques/scellements-par-injection/scellement-par-injection-fis-v-plus',
    checkedAt: '2026-10-19',
    scope: 'Système de scellement chimique pour bétons et maçonneries précisés dans ses évaluations techniques.',
    conditions: [
      'Vérifier le matériau exact, la tige et les accessoires autorisés dans le système retenu.',
      'Suivre la notice pour le forage, son nettoyage, l’injection et les délais avant chargement ; la température et la variante de résine comptent.',
      'Le volume par ancrage reste une saisie estimative tant que le diamètre, la profondeur et le montage exact ne sont pas renseignés.',
      'Compter les pertes et les embouts, puis vérifier ce qui est déjà inclus dans le conditionnement acheté.'
    ]
  },
  {
    id: 'fischer-fis-h-k',
    label: 'Fischer — Tamis d’injection FIS H K',
    url: 'https://www.fischer.fr/fr-fr/produits/fixations-chimiques/tamis-d-injection/tamis-d-injection-plastique-fis-h-k',
    checkedAt: '2026-10-19',
    scope: 'Tamis associés à une résine et à une tige pour les montages documentés en maçonnerie.',
    conditions: [
      'Sélectionner ensemble support, résine, tamis et tige compatibles ; le terme « mur creux » ne suffit pas.',
      'La résine traverse le tamis et forme son ancrage dans le matériau : un simple volume annulaire de trou ne décrit pas ce montage.',
      'Utiliser les indications de remplissage du système choisi et vérifier si le tamis est déjà fourni dans le kit.'
    ]
  },
  {
    id: 'fischer-thermax16',
    label: 'Fischer — Montage à distance TherMax 16',
    url: 'https://www.fischer.fr/fr-fr/produits/fixation-sur-etics-isolation/thermax/thermax-12-et-16/thermax-16',
    checkedAt: '2026-10-19',
    scope: 'Exemple de système traversant une isolation extérieure pour reprendre les efforts dans le support.',
    conditions: [
      'Identifier le support porteur, l’épaisseur des couches traversées et la combinaison de résine autorisée.',
      'Le système comporte une rupture thermique ; l’étanchéité autour de la traversée fait partie de la pose.',
      'Les kits contiennent des accessoires en quantités variables : déduire ceux fournis pour éviter un double achat.',
      'L’ajout d’isolant ne se traite pas par une simple augmentation de longueur d’une cheville ordinaire.'
    ]
  },
  {
    id: 'fischer-faz-ii-plus',
    label: 'Fischer — Goujons d’ancrage FAZ II Plus',
    url: 'https://www.fischer.fr/fr-fr/produits/chevilles-metalliques/goujon-d-ancrage/goujon-d-ancrage-faz-ii-plus/goujon-d-ancrage-faz-ii-plus',
    checkedAt: '2026-10-19',
    scope: 'Ancrage mécanique dans le béton couvert par la documentation du produit.',
    conditions: [
      'Vérifier le béton, son épaisseur, la profondeur d’ancrage, les entraxes et les distances aux bords dans l’évaluation technique.',
      'Le diamètre de forage, le couple de serrage et l’épaisseur fixable varient avec la référence.',
      'Un nombre de trous dans une platine fournit un quantitatif, pas la validation des efforts repris.',
      'Choisir une protection contre la corrosion adaptée à l’exposition.'
    ]
  }
];
