import React, { useCallback, useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import EmptyState from '../../components/ui/EmptyState';
import {
  Fonts,
  Radii,
  Spacing,
  TAB_BAR_HEIGHT,
  TAB_BAR_BOTTOM_MARGIN,
  Palette,
} from '../../constants/theme';
import { useColors } from '../../store/ThemeContext';
import { useAuth } from '../../store/AuthContext';
import { useTrip } from '../../store/TripContext';
import { getSavedTrips } from '../../services/trips';
import { getFavoriteLines, removeFavoriteLine, FavoriteLine } from '../../services/favorites';
import { getRouteGraph, searchStops } from '../../services/transit';
import { buildRouteGraph, planTripOptions, RouteGraph } from '../../services/routing';
import { Trip } from '../../types/transit';

let cachedGraph: RouteGraph | null = null;

export default function SavedScreen() {
  const c = useColors();
  const styles = useMemo(() => createStyles(c), [c]);
  const router = useRouter();
  const { user } = useAuth();
  const { setPendingTrip } = useTrip();
  const [trips, setTrips] = useState<Trip[]>([]);
  const [lines, setLines] = useState<FavoriteLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [errored, setErrored] = useState(false);
  const [replayingId, setReplayingId] = useState<string | null>(null);

  // Recharge à chaque affichage : un trajet enregistré depuis l'itinéraire
  // doit apparaître ici immédiatement.
  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      let cancelled = false;

      Promise.all([getSavedTrips(user.id), getFavoriteLines(user.id)])
        .then(([t, l]) => {
          if (cancelled) return;
          setTrips(t);
          setLines(l);
          setErrored(false);
        })
        .catch(() => !cancelled && setErrored(true))
        .finally(() => !cancelled && setLoading(false));

      return () => {
        cancelled = true;
      };
    }, [user])
  );

  const unfavorite = (lineId: string) => {
    if (!user) return;
    setLines((prev) => prev.filter((l) => l.id !== lineId));
    removeFavoriteLine(user.id, lineId).catch(() => {});
  };

  // Rejoue un trajet enregistré : on retrouve les deux arrêts par leur nom,
  // on recalcule, et on renvoie l'utilisateur sur l'écran de choix.
  const replay = async (trip: Trip) => {
    setReplayingId(trip.id);
    try {
      const [originMatches, destinationMatches] = await Promise.all([
        searchStops(trip.originLabel),
        searchStops(trip.destinationLabel),
      ]);
      const origin = originMatches.find((s) => s.name === trip.originLabel) ?? originMatches[0];
      const destination =
        destinationMatches.find((s) => s.name === trip.destinationLabel) ?? destinationMatches[0];
      if (!origin || !destination) return;

      if (!cachedGraph) cachedGraph = buildRouteGraph(await getRouteGraph());
      const options = planTripOptions(cachedGraph, origin.id, destination.id);
      if (options.length === 0) return;

      setPendingTrip({ origin, destination, options });
      router.push('/(modals)/choose-trip');
    } finally {
      setReplayingId(null);
    }
  };

  const isEmpty = trips.length === 0 && lines.length === 0;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.head}>
        <Text style={styles.title}>Favoris</Text>
        <Text style={styles.subtitle}>Vos trajets et vos lignes enregistrés</Text>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={c.yonn} />
        </View>
      ) : errored ? (
        <EmptyState
          icon="cloud-offline-outline"
          title="Impossible de charger vos favoris"
          description="Vérifiez votre connexion et réessayez dans un instant."
        />
      ) : isEmpty ? (
        <EmptyState
          icon="bookmark-outline"
          title="Rien d'enregistré"
          description="Enregistrez un itinéraire avant de partir, ou mettez une ligne en favori depuis l'onglet Lignes."
        />
      ) : (
        <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
          {trips.length > 0 && (
            <>
              <Text style={styles.sectionLabel}>Trajets</Text>
              <View style={styles.card}>
                {trips.map((trip, i) => (
                  <View key={trip.id}>
                    {i > 0 && <View style={styles.separator} />}
                    <TouchableOpacity
                      style={styles.row}
                      activeOpacity={0.7}
                      onPress={() => replay(trip)}
                      disabled={replayingId === trip.id}
                    >
                      <View style={styles.tripIcon}>
                        {replayingId === trip.id ? (
                          <ActivityIndicator size="small" color={c.yonn} />
                        ) : (
                          <Ionicons name="git-branch-outline" size={18} color={c.yonn} />
                        )}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.rowTitle} numberOfLines={1}>
                          {trip.originLabel} → {trip.destinationLabel}
                        </Text>
                        <Text style={styles.rowMeta}>Appuyez pour relancer ce trajet</Text>
                      </View>
                      <Ionicons name="chevron-forward" size={17} color={c.inkFaint} />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            </>
          )}

          {lines.length > 0 && (
            <>
              <Text style={[styles.sectionLabel, trips.length > 0 && { marginTop: Spacing.lg }]}>
                Lignes
              </Text>
              <View style={styles.card}>
                {lines.map((line, i) => {
                  const color = line.color || line.operator.color || c.yonn;
                  const [from, to] = line.name.split('↔').map((s) => s.trim());
                  return (
                    <View key={line.id}>
                      {i > 0 && <View style={styles.separator} />}
                      <TouchableOpacity
                        style={styles.row}
                        activeOpacity={0.7}
                        onPress={() =>
                          router.push({
                            pathname: '/(modals)/bus-details',
                            params: {
                              lineId: line.id,
                              code: line.code,
                              name: line.name,
                              color,
                            },
                          })
                        }
                      >
                        <View style={[styles.badge, { backgroundColor: color }]}>
                          <Text style={styles.badgeText} numberOfLines={1}>
                            {line.code.replace('Ligne ', '')}
                          </Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.rowTitle} numberOfLines={1}>
                            {from && to ? `${from} → ${to}` : line.name}
                          </Text>
                          <Text style={styles.rowMeta}>{line.operator.name}</Text>
                        </View>
                        <TouchableOpacity
                          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                          onPress={() => unfavorite(line.id)}
                          accessibilityRole="button"
                          accessibilityLabel="Retirer des favoris"
                        >
                          <Ionicons name="star" size={19} color={c.gold} />
                        </TouchableOpacity>
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </View>
            </>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const createStyles = (c: Palette) =>
  StyleSheet.create({
  safe: { flex: 1, backgroundColor: c.canvas },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  head: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.sm, paddingBottom: Spacing.md },
  title: { fontFamily: Fonts.display, fontSize: 28, color: c.ink },
  subtitle: { fontFamily: Fonts.body, fontSize: 14, color: c.inkMuted, marginTop: 2 },

  list: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: TAB_BAR_HEIGHT + TAB_BAR_BOTTOM_MARGIN + Spacing.xl,
  },
  sectionLabel: {
    fontFamily: Fonts.bodySemi,
    fontSize: 11,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: c.inkFaint,
    marginBottom: Spacing.sm,
  },
  card: {
    backgroundColor: c.surface,
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: c.line,
    overflow: 'hidden',
  },
  separator: { height: 1, backgroundColor: c.line, marginLeft: 48 + Spacing.md },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
  },
  tripIcon: {
    width: 40,
    height: 40,
    borderRadius: Radii.md,
    backgroundColor: c.yonnTint,
    alignItems: 'center',
    justifyContent: 'center',
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
  rowTitle: { fontFamily: Fonts.bodySemi, fontSize: 15, color: c.ink },
  rowMeta: { fontFamily: Fonts.body, fontSize: 12.5, color: c.inkFaint, marginTop: 2 },
});
