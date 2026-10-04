import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import EmptyState from '../../components/ui/EmptyState';
import PrimaryButton from '../../components/ui/PrimaryButton';
import ScreenHeader from '../../components/ui/ScreenHeader';
import { Fonts, Radii, Spacing, Palette } from '../../constants/theme';
import { useColors } from '../../store/ThemeContext';
import { useTrip } from '../../store/TripContext';
import { TripOption } from '../../types/transit';
import { formatFare } from '../../utils/eta';

export default function ChooseTripScreen() {
  const router = useRouter();
  const c = useColors();
  const styles = useMemo(() => createStyles(c), [c]);
  const { pendingTrip, setPreviewTrip } = useTrip();
  const [selectedIndex, setSelectedIndex] = useState(0);

  if (!pendingTrip) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <ScreenHeader title="Choisir un trajet" />
        <EmptyState
          icon="alert-circle-outline"
          title="Aucun trajet à afficher"
          description="Reviens en arrière et relance une recherche."
        />
      </SafeAreaView>
    );
  }

  const { origin, destination, options } = pendingTrip;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScreenHeader title="Choisir un trajet" subtitle={`${origin.name} → ${destination.name}`} />

      <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
        {options.map((option, index) => (
          <OptionCard
            key={index}
            styles={styles}
            colors={c}
            option={option}
            selected={index === selectedIndex}
            onPress={() => setSelectedIndex(index)}
          />
        ))}

        {/* Le bouton suit directement les options : sur deux ou trois cartes,
            le renvoyer en bas d'écran laissait un grand vide au milieu. */}
        <View style={styles.cta}>
          <PrimaryButton
            label="Voir le détail"
            onPress={() => {
              setPreviewTrip({ origin, destination, plan: options[selectedIndex].plan });
              router.push('/(modals)/trip-detail');
            }}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function OptionCard({
  option,
  selected,
  onPress,
  styles,
  colors,
}: {
  option: TripOption;
  selected: boolean;
  onPress: () => void;
  styles: ReturnType<typeof createStyles>;
  colors: Palette;
}) {
  const { plan } = option;
  const rides = plan.segments.filter((s) => s.type === 'ride');
  const changes = Math.max(0, rides.length - 1);

  return (
    <TouchableOpacity
      style={[styles.card, selected && styles.cardSelected]}
      activeOpacity={0.85}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
    >
      <View style={styles.cardHead}>
        <Text style={styles.duration}>{plan.totalMinutes} min</Text>
        {option.recommended && (
          <View style={styles.tag}>
            <Ionicons name="star" size={11} color={colors.yonnDeep} />
            <Text style={styles.tagText}>Recommandé</Text>
          </View>
        )}
        <View style={{ flex: 1 }} />
        <Text style={styles.fare}>{formatFare(plan.totalFareFcfa)}</Text>
      </View>

      {/* Enchaînement des lignes : ce qu'on prend, dans l'ordre. */}
      <View style={styles.strip}>
        {plan.segments.map((segment, i) => (
          <React.Fragment key={i}>
            {i > 0 && <Ionicons name="chevron-forward" size={13} color={colors.inkFaint} />}
            {segment.type === 'ride' ? (
              <View style={[styles.chip, { backgroundColor: segment.lineColor }]}>
                <Text style={styles.chipText}>{segment.lineCode.replace('Ligne ', '')}</Text>
              </View>
            ) : (
              <View style={styles.walkChip}>
                <Ionicons name="walk" size={13} color={colors.inkMuted} />
                <Text style={styles.walkChipText}>{segment.minutes}</Text>
              </View>
            )}
          </React.Fragment>
        ))}
      </View>

      <View style={styles.cardFoot}>
        <Text style={styles.summary}>
          {rides.length === 0
            ? 'Tout à pied, sans bus'
            : changes === 0
            ? 'Direct, sans correspondance'
            : `${changes} correspondance${changes > 1 ? 's' : ''}`}
          {rides.length > 0 && plan.totalWalkMinutes > 0 ? ` · ${plan.totalWalkMinutes} min à pied` : ''}
        </Text>
        {selected && <Ionicons name="checkmark-circle" size={20} color={colors.yonn} />}
      </View>

      {!!option.warning && (
        <View style={styles.warning}>
          <Ionicons name="time-outline" size={14} color={colors.gold} />
          <Text style={styles.warningText}>{option.warning}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const createStyles = (c: Palette) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.canvas },
    list: {
      paddingHorizontal: Spacing.lg,
      paddingTop: Spacing.xs,
      paddingBottom: Spacing.lg,
      gap: Spacing.sm,
    },

    card: {
      backgroundColor: c.surface,
      borderRadius: Radii.lg,
      borderWidth: 1.5,
      borderColor: c.line,
      padding: Spacing.md,
    },
    cardSelected: { borderColor: c.yonn },

    cardHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
    duration: { fontFamily: Fonts.display, fontSize: 20, color: c.ink },
    fare: { fontFamily: Fonts.bodySemi, fontSize: 14, color: c.inkMuted },
    tag: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      backgroundColor: c.yonnTint,
      borderRadius: Radii.pill,
      paddingHorizontal: Spacing.sm,
      paddingVertical: 3,
    },
    tagText: { fontFamily: Fonts.bodySemi, fontSize: 10.5, color: c.yonnDeep },

    strip: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: Spacing.xs,
      marginTop: Spacing.md,
    },
    chip: {
      borderRadius: Radii.sm,
      paddingHorizontal: Spacing.sm,
      paddingVertical: 5,
      minWidth: 30,
      alignItems: 'center',
    },
    chipText: { fontFamily: Fonts.bodySemi, fontSize: 12, color: '#FFFFFF' },
    walkChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2,
      backgroundColor: c.fill,
      borderRadius: Radii.sm,
      paddingHorizontal: Spacing.sm,
      paddingVertical: 5,
    },
    walkChipText: { fontFamily: Fonts.bodyMedium, fontSize: 11, color: c.inkMuted },

    cardFoot: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: Spacing.sm,
    },
    summary: { flex: 1, fontFamily: Fonts.body, fontSize: 13, color: c.inkFaint },
    warning: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, marginTop: Spacing.sm },
    warningText: { flex: 1, fontFamily: Fonts.bodyMedium, fontSize: 12, color: c.gold },

    cta: { marginTop: Spacing.sm },
  });
