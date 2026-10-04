import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';

import { Fonts, Radii, Spacing, Palette, makeElevation } from '../../constants/theme';
import { useTheme } from '../../store/ThemeContext';
import { NavigationState, NavigationStep } from '../../services/navigation';
import { ManeuverKind } from '../../types/transit';

// Flèche à afficher pour chaque geste à pied, comme sur un GPS.
const MANEUVER_ICONS: Record<ManeuverKind, keyof typeof MaterialCommunityIcons.glyphMap> = {
  depart: 'walk',
  straight: 'arrow-up',
  left: 'arrow-left-top',
  right: 'arrow-right-top',
  'slight-left': 'arrow-top-left',
  'slight-right': 'arrow-top-right',
  'sharp-left': 'arrow-left-top',
  'sharp-right': 'arrow-right-top',
  uturn: 'arrow-u-left-top',
  roundabout: 'rotate-right',
  arrive: 'flag-checkered',
};

// Hors itinéraire : ce qui se passe, selon l'étape. En bus, un détour est
// souvent normal (travaux, embouteillage) — on rassure plutôt qu'alarmer.
const OFF_ROUTE_TEXT: Record<NavigationStep['kind'], string> = {
  walk: 'Tu t’éloignes du chemin — recalcul en cours…',
  board: 'Tu t’éloignes de l’arrêt de montée.',
  ride: 'Le bus s’écarte de son trajet habituel — le guidage reprend dès qu’il le retrouve.',
  arrival: '',
};

// La consigne du moment, en haut de la carte : ce que l'utilisateur doit
// faire maintenant, et dans combien de mètres. C'est le seul élément qu'il
// doit pouvoir lire d'un coup d'œil, bus en marche.
export default function NavigationBanner({
  nav,
  notice,
  rerouting,
  onReplan,
}: {
  nav: NavigationState;
  /** Message passager (« Chemin recalculé »). */
  notice?: string | null;
  rerouting?: boolean;
  /** Recalculer un trajet complet depuis la position actuelle. */
  onReplan?: () => void;
}) {
  const { colors: c, isDark } = useTheme();
  const styles = useMemo(() => createStyles(c, isDark), [c, isDark]);

  const { instruction, arrived, offRoute, weakSignal, progress } = nav;
  const accent = instruction.lineColor ?? (arrived ? c.yonn : c.ink);
  // Sur le fond « encre » (clair en mode sombre), un pictogramme blanc
  // disparaîtrait : il prend alors la couleur du fond de l'écran.
  const glyph = instruction.lineColor || arrived ? '#FFFFFF' : c.canvas;
  const showsLine = (instruction.kind === 'ride' || instruction.kind === 'board') && !!instruction.lineCode;

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <View style={[styles.badge, { backgroundColor: accent }]}>
          {showsLine ? (
            <Text style={styles.badgeText} numberOfLines={1}>
              {instruction.lineCode!.replace('Ligne ', '')}
            </Text>
          ) : instruction.kind === 'walk' && instruction.maneuver ? (
            <MaterialCommunityIcons name={MANEUVER_ICONS[instruction.maneuver]} size={26} color={glyph} />
          ) : (
            <Ionicons
              name={instruction.kind === 'walk' ? 'walk' : instruction.kind === 'arrival' ? 'flag' : 'bus'}
              size={20}
              color={glyph}
            />
          )}
        </View>

        <View style={styles.texts}>
          <Text style={styles.title} numberOfLines={2}>
            {instruction.title}
          </Text>
          <Text style={styles.detail} numberOfLines={2}>
            {instruction.detail}
          </Text>
        </View>
      </View>

      {!!notice && (
        <View style={styles.info}>
          <Ionicons name="refresh" size={15} color={c.inkMuted} />
          <Text style={styles.infoText}>{notice}</Text>
        </View>
      )}

      {weakSignal && !arrived && (
        <View style={styles.info}>
          <Ionicons name="cellular-outline" size={15} color={c.inkMuted} />
          <Text style={styles.infoText}>
            Signal GPS faible — le guidage reprendra dès que ta position sera plus précise.
          </Text>
        </View>
      )}

      {offRoute && !arrived && (
        <View style={styles.warning}>
          <Ionicons name="alert-circle-outline" size={15} color={c.danger} />
          <Text style={styles.warningText}>{OFF_ROUTE_TEXT[instruction.kind]}</Text>
          {instruction.kind !== 'walk' && onReplan && (
            <TouchableOpacity
              style={styles.replan}
              onPress={() => onReplan()}
              disabled={rerouting}
              accessibilityRole="button"
              accessibilityLabel="Recalculer l’itinéraire depuis ma position"
            >
              {rerouting ? (
                <ActivityIndicator size="small" color={c.canvas} />
              ) : (
                <Text style={styles.replanText}>Recalculer</Text>
              )}
            </TouchableOpacity>
          )}
        </View>
      )}

      <View style={styles.track}>
        <View
          style={[styles.trackFill, { width: `${Math.round(progress * 100)}%`, backgroundColor: accent }]}
        />
      </View>
    </View>
  );
}

const createStyles = (c: Palette, isDark: boolean) =>
  StyleSheet.create({
    wrap: {
      backgroundColor: c.surface,
      borderRadius: Radii.lg,
      padding: Spacing.md,
      gap: Spacing.sm,
      ...makeElevation(c, isDark).floating,
    },
    row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
    badge: {
      minWidth: 44,
      height: 44,
      borderRadius: Radii.md,
      paddingHorizontal: Spacing.sm,
      alignItems: 'center',
      justifyContent: 'center',
    },
    badgeText: { fontFamily: Fonts.bodySemi, fontSize: 15, color: '#FFFFFF' },
    texts: { flex: 1 },
    title: { fontFamily: Fonts.displaySemi, fontSize: 17, color: c.ink },
    detail: { fontFamily: Fonts.bodyMedium, fontSize: 13, color: c.inkMuted, marginTop: 2 },

    warning: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      backgroundColor: c.dangerTint,
      borderRadius: Radii.sm,
      paddingHorizontal: Spacing.sm,
      paddingVertical: 6,
    },
    warningText: { flex: 1, fontFamily: Fonts.bodyMedium, fontSize: 12, color: c.danger },
    replan: {
      backgroundColor: c.danger,
      borderRadius: Radii.pill,
      paddingHorizontal: Spacing.md,
      paddingVertical: 6,
      minWidth: 92,
      alignItems: 'center',
    },
    replanText: { fontFamily: Fonts.bodySemi, fontSize: 12, color: c.canvas },

    info: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      backgroundColor: c.fill,
      borderRadius: Radii.sm,
      paddingHorizontal: Spacing.sm,
      paddingVertical: 6,
    },
    infoText: { flex: 1, fontFamily: Fonts.bodyMedium, fontSize: 12, color: c.inkMuted },

    track: { height: 4, borderRadius: 2, backgroundColor: c.fill, overflow: 'hidden' },
    trackFill: { height: 4, borderRadius: 2 },
  });
