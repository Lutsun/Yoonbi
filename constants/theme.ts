// constants/theme.ts
//
// Système de design Yoonbi, en deux palettes (claire et sombre).
//
// Principes : une seule couleur d'accent utilisée avec parcimonie, une
// échelle de gris à trois niveaux pour toute la hiérarchie du texte, et des
// cartes délimitées par de fines bordures plutôt que par des ombres.
//
// Les écrans ne lisent jamais ces palettes directement : ils passent par
// `useColors()` (voir store/ThemeContext.tsx) pour suivre le mode choisi.

// Identité de marque — volontairement HORS du système clair/sombre.
// L'écran d'ouverture et le logo inversé doivent rester strictement
// identiques quel que soit le thème : c'est une identité, pas une couleur
// d'interface. `green` reprend exactement la couleur du splash natif
// (app.json), pour qu'il n'y ait aucun changement de teinte au lancement.
export const Brand = {
  green: '#1DB954',
  onGreen: '#FFFFFF', // le « Yonn » du logo inversé
  wordmarkInk: '#201E1D', // le « ma » du logo inversé
};

export type Palette = {
  yonn: string;
  yonnDark: string;
  yonnDeep: string;
  yonnTint: string;

  ink: string;
  inkMuted: string;
  inkFaint: string;

  canvas: string;
  surface: string;
  line: string;
  fill: string;

  danger: string;
  dangerTint: string;
  gold: string;
};

export const lightColors: Palette = {
  yonn: '#12B76A',
  yonnDark: '#027A48',
  yonnDeep: '#05603A',
  yonnTint: '#ECFDF3',

  ink: '#101828',
  inkMuted: '#475467',
  inkFaint: '#98A2B3',

  canvas: '#F9FAFB',
  surface: '#FFFFFF',
  line: '#EAECF0',
  fill: '#F2F4F7',

  danger: '#D92D20',
  dangerTint: '#FEF3F2',
  gold: '#F79009',
};

export const darkColors: Palette = {
  // Vert éclairci : sur fond sombre, le vert clair reste lisible là où le
  // vert d'origine deviendrait terne.
  yonn: '#32D583',
  yonnDark: '#6CE9A6',
  yonnDeep: '#A6F4C5',
  yonnTint: '#0C2A1D',

  ink: '#F2F4F7',
  inkMuted: '#B4BCC8',
  inkFaint: '#727C8A',

  canvas: '#0C1017',
  surface: '#161C26',
  line: '#252D3A',
  fill: '#1E2531',

  danger: '#F97066',
  dangerTint: '#2A1614',
  gold: '#FDB022',
};

// Sora pour les titres et les chiffres, Inter pour le texte courant.
export const Fonts = {
  display: 'Sora_700Bold',
  displaySemi: 'Sora_600SemiBold',
  body: 'Inter_400Regular',
  bodyMedium: 'Inter_500Medium',
  bodySemi: 'Inter_600SemiBold',
};

export const Spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48 };

export const Radii = { sm: 8, md: 12, lg: 16, xl: 24, pill: 999 };

// Ombres — rares et douces, réservées à ce qui flotte réellement au-dessus
// du contenu. En mode sombre une ombre ne se voit pas : on la remplace par
// une bordure, qui joue le même rôle de détourage.
export function makeElevation(c: Palette, isDark: boolean) {
  const floating = isDark
    ? { borderWidth: 1, borderColor: c.line }
    : {
        shadowColor: '#101828',
        shadowOpacity: 0.08,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: 6 },
        elevation: 6,
      };

  const control = isDark
    ? { borderWidth: 1, borderColor: c.line }
    : {
        shadowColor: '#101828',
        shadowOpacity: 0.1,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 3 },
        elevation: 4,
      };

  return {
    card: { borderWidth: 1, borderColor: c.line },
    floating,
    control,
  } as const;
}

// Barre de navigation flottante (voir components/navigation/CustomTabBar.tsx).
export const TAB_BAR_HEIGHT = 68;
export const TAB_BAR_BOTTOM_MARGIN = Spacing.sm;
