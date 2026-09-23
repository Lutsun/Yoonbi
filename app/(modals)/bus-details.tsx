import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import EmptyState from '../../components/ui/EmptyState';
import ScreenHeader from '../../components/ui/ScreenHeader';
import { Fonts, Radii, Spacing, Palette } from '../../constants/theme';
import { useColors } from '../../store/ThemeContext';
import { getLine, getLineStops } from '../../services/transit';
import { Line, Stop } from '../../types/transit';

export default function BusDetailsScreen() {
  const c = useColors();
  const styles = useMemo(() => createStyles(c), [c]);
  const { lineId, code, name, color } = useLocalSearchParams<{
    lineId: string;
    code: string;
    name: string;
    color?: string;
  }>();

  const [stops, setStops] = useState<Stop[]>([]);
  const [line, setLine] = useState<Line | null>(null);
  const [loading, setLoading] = useState(true);
  const [errored, setErrored] = useState(false);
  const lineColor = color || c.yonn;

  useEffect(() => {
    let cancelled = false;
    Promise.all([getLineStops(lineId), getLine(lineId).catch(() => null)])
      .then(([stopsData, lineData]) => {
        if (cancelled) return;
        setStops(stopsData);
        setLine(lineData);
      })
      .catch(() => !cancelled && setErrored(true))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [lineId]);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScreenHeader title={code ?? 'Ligne'} subtitle={name} action="close" />

      {!loading && !errored && stops.length > 0 && (
        <View style={styles.summary}>
          <View style={[styles.badge, { backgroundColor: lineColor }]}>
            <Text style={styles.badgeText}>{(code ?? '').replace('Ligne ', '')}</Text>
          </View>
          <Text style={styles.summaryText}>
            {stops.length} arrêts · {stops[0].name} → {stops[stops.length - 1].name}
          </Text>
        </View>
      )}

      {!loading && !errored && (line?.hours_label || line?.frequency_label) && (
        <View style={styles.schedule}>
          {!!line.hours_label && (
            <View style={styles.scheduleRow}>
              <Ionicons name="time-outline" size={16} color={c.inkMuted} />
              <Text style={styles.scheduleText}>{line.hours_label}</Text>
            </View>
          )}
          {!!line.frequency_label && (
            <View style={styles.scheduleRow}>
              <Ionicons name="repeat-outline" size={16} color={c.inkMuted} />
              <Text style={styles.scheduleText}>{line.frequency_label}</Text>
            </View>
          )}
          {line.schedule_estimated && (
            <Text style={styles.scheduleNote}>
              Amplitude estimée : l'exploitant ne publie pas d'horaire précis pour cette ligne.
            </Text>
          )}
        </View>
      )}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={c.yonn} />
        </View>
      ) : errored ? (
        <EmptyState
          icon="cloud-offline-outline"
          title="Impossible de charger cette ligne"
          description="Vérifie ta connexion et réessaie dans un instant."
        />
      ) : stops.length === 0 ? (
        <EmptyState
          icon="bus-outline"
          title="Aucun arrêt renseigné"
          description="Le tracé de cette ligne n'a pas encore été ajouté."
        />
      ) : (
        <FlatList
          data={stops}
          keyExtractor={(s) => s.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          renderItem={({ item, index }) => {
            const isFirst = index === 0;
            const isLast = index === stops.length - 1;
            return (
              <View style={styles.stopRow}>
                <View style={styles.markerCol}>
                  {!isFirst && <View style={[styles.line, { backgroundColor: lineColor }]} />}
                  <View
                    style={[
                      styles.dot,
                      { borderColor: lineColor },
                      (isFirst || isLast) && { backgroundColor: lineColor },
                    ]}
                  />
                  {!isLast && <View style={[styles.line, { backgroundColor: lineColor }]} />}
                </View>
                <Text style={[styles.stopName, (isFirst || isLast) && styles.stopNameTerminus]}>
                  {item.name}
                </Text>
              </View>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const createStyles = (c: Palette) =>
  StyleSheet.create({
  safe: { flex: 1, backgroundColor: c.canvas },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    padding: Spacing.md,
    backgroundColor: c.surface,
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: c.line,
  },
  badge: {
    minWidth: 48,
    height: 40,
    borderRadius: Radii.md,
    paddingHorizontal: Spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontFamily: Fonts.bodySemi, fontSize: 13, color: c.surface },
  summaryText: { flex: 1, fontFamily: Fonts.body, fontSize: 13, color: c.inkMuted },

  schedule: {
    gap: Spacing.xs,
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    padding: Spacing.md,
    backgroundColor: c.surface,
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: c.line,
  },
  scheduleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  scheduleText: { fontFamily: Fonts.bodyMedium, fontSize: 13, color: c.ink },
  scheduleNote: { fontFamily: Fonts.body, fontSize: 11, color: c.inkFaint, marginTop: 2 },

  list: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xl },
  stopRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  markerCol: { width: 20, alignItems: 'center', alignSelf: 'stretch' },
  line: { width: 2, flex: 1, minHeight: 12, opacity: 0.35 },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2.5,
    backgroundColor: c.surface,
  },
  stopName: {
    flex: 1,
    fontFamily: Fonts.bodyMedium,
    fontSize: 15,
    color: c.inkMuted,
    paddingVertical: Spacing.md,
  },
  stopNameTerminus: { fontFamily: Fonts.bodySemi, color: c.ink },
});
