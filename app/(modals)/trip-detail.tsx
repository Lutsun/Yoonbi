import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import EmptyState from '../../components/ui/EmptyState';
import PrimaryButton from '../../components/ui/PrimaryButton';
import ScreenHeader from '../../components/ui/ScreenHeader';
import TripSteps from '../../components/trip/TripSteps';
import { Fonts, Radii, Spacing, Palette } from '../../constants/theme';
import { useColors } from '../../store/ThemeContext';
import { saveTrip } from '../../services/trips';
import { USER_POSITION_ID } from '../../services/routing';
import { useAuth } from '../../store/AuthContext';
import { useTrip } from '../../store/TripContext';

export default function TripDetailScreen() {
  const router = useRouter();
  const c = useColors();
  const styles = useMemo(() => createStyles(c), [c]);
  const { user } = useAuth();
  const { previewTrip, setActiveTrip } = useTrip();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  if (!previewTrip) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <ScreenHeader title="Votre itinéraire" />
        <EmptyState
          icon="alert-circle-outline"
          title="Aucun itinéraire à afficher"
          description="Reviens en arrière et relance une recherche."
        />
      </SafeAreaView>
    );
  }

  const { origin, destination, plan } = previewTrip;

  const handleSave = async () => {
    if (!user || saved) return;
    // « Ma position » n'a de sens qu'au moment présent : on enregistre à la
    // place l'arrêt où l'on monte, pour pouvoir relancer ce trajet plus tard
    // depuis les Favoris.
    const firstRide = plan.segments.find((s) => s.type === 'ride');
    const savedOrigin =
      origin.id === USER_POSITION_ID && firstRide?.type === 'ride'
        ? {
            name: firstRide.boardStopName,
            latitude: firstRide.path[0].latitude,
            longitude: firstRide.path[0].longitude,
          }
        : origin;
    setSaving(true);
    try {
      await saveTrip({
        userId: user.id,
        originLabel: savedOrigin.name,
        originLatitude: savedOrigin.latitude,
        originLongitude: savedOrigin.longitude,
        destinationLabel: destination.name,
        destinationLatitude: destination.latitude,
        destinationLongitude: destination.longitude,
      });
      setSaved(true);
    } finally {
      setSaving(false);
    }
  };

  const handleStart = () => {
    setActiveTrip({ origin, destination, plan });
    // Ferme toute la pile (itinéraire → choix → détail) et rend la main à la
    // carte, qui prend le relais en mode guidage.
    router.replace('/(tabs)');
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScreenHeader title="Votre itinéraire" subtitle={`${origin.name} → ${destination.name}`} />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.stats}>
          <Stat styles={styles} value={`${plan.totalMinutes}`} unit="min" label="durée" />
          <View style={styles.statDivider} />
          <Stat
            styles={styles}
            value={plan.totalFareFcfa > 0 ? `${plan.totalFareFcfa}` : 'Gratuit'}
            unit={plan.totalFareFcfa > 0 ? 'FCFA' : '(à pied)'}
            label="prix"
            color={c.yonnDark}
          />
          <View style={styles.statDivider} />
          <Stat styles={styles} value={`${plan.totalWalkMinutes}`} unit="min" label="à pied" />
        </View>

        {/* Actions juste sous le résumé : la décision se prend ici, pas après
            avoir fait défiler toutes les étapes. */}
        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.saveButton, saved && styles.saveButtonDone]}
            onPress={handleSave}
            disabled={!user || saving || saved}
            accessibilityRole="button"
            accessibilityLabel="Enregistrer ce trajet"
          >
            {saving ? (
              <ActivityIndicator size="small" color={c.ink} />
            ) : (
              <Ionicons
                name={saved ? 'bookmark' : 'bookmark-outline'}
                size={20}
                color={saved ? c.yonnDark : c.ink}
              />
            )}
          </TouchableOpacity>

          <View style={{ flex: 1 }}>
            <PrimaryButton label="Démarrer le trajet" onPress={handleStart} />
          </View>
        </View>

        <Text style={styles.sectionLabel}>Le trajet étape par étape</Text>

        <View style={styles.stepsCard}>
          <TripSteps origin={origin} destination={destination} segments={plan.segments} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({
  value,
  unit,
  label,
  color,
  styles,
}: {
  value: string;
  unit: string;
  label: string;
  color?: string;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <View style={styles.stat}>
      <View style={styles.statValueRow}>
        <Text style={[styles.statValue, !!color && { color }]}>{value}</Text>
        <Text style={[styles.statUnit, !!color && { color }]}>{unit}</Text>
      </View>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const createStyles = (c: Palette) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.canvas },
    content: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xl },

    stats: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: c.surface,
      borderRadius: Radii.lg,
      borderWidth: 1,
      borderColor: c.line,
      paddingVertical: Spacing.md,
    },
    stat: { flex: 1, alignItems: 'center' },
    statDivider: { width: 1, height: 32, backgroundColor: c.line },
    statValueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 3 },
    statValue: { fontFamily: Fonts.display, fontSize: 22, color: c.ink },
    statUnit: { fontFamily: Fonts.bodyMedium, fontSize: 12, color: c.inkMuted },
    statLabel: { fontFamily: Fonts.body, fontSize: 12, color: c.inkFaint, marginTop: 3 },

    actions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      marginTop: Spacing.md,
    },
    saveButton: {
      width: 52,
      height: 52,
      borderRadius: Radii.md,
      borderWidth: 1,
      borderColor: c.line,
      backgroundColor: c.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    saveButtonDone: { backgroundColor: c.yonnTint, borderColor: c.yonnTint },

    sectionLabel: {
      fontFamily: Fonts.bodySemi,
      fontSize: 11,
      letterSpacing: 0.6,
      textTransform: 'uppercase',
      color: c.inkFaint,
      marginTop: Spacing.lg,
      marginBottom: Spacing.sm,
    },
    stepsCard: {
      backgroundColor: c.surface,
      borderRadius: Radii.lg,
      borderWidth: 1,
      borderColor: c.line,
      padding: Spacing.md,
      paddingBottom: 0,
    },
  });
