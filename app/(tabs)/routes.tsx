import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
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
import { getOperators, getLines } from '../../services/transit';
import { getFavoriteLineIds, addFavoriteLine, removeFavoriteLine } from '../../services/favorites';
import { useAuth } from '../../store/AuthContext';
import { Line, Operator } from '../../types/transit';

type LineWithOperator = Line & { operator: Operator };

export default function RoutesScreen() {
  const c = useColors();
  const styles = useMemo(() => createStyles(c), [c]);
  const router = useRouter();
  const { user } = useAuth();
  const [operators, setOperators] = useState<Operator[]>([]);
  const [lines, setLines] = useState<LineWithOperator[]>([]);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [errored, setErrored] = useState(false);
  const [query, setQuery] = useState('');
  const [operatorFilter, setOperatorFilter] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      getOperators(),
      getLines(),
      user ? getFavoriteLineIds(user.id) : Promise.resolve([]),
    ])
      .then(([ops, lns, favorites]) => {
        if (cancelled) return;
        const byId = new Map(ops.map((o) => [o.id, o]));
        const enriched = lns
          .map((l) => {
            const operator = byId.get(l.operator_id);
            return operator ? { ...l, operator } : null;
          })
          .filter((l): l is LineWithOperator => l !== null);

        setOperators(ops.filter((o) => enriched.some((l) => l.operator_id === o.id)));
        setLines(enriched);
        setFavoriteIds(new Set(favorites));
      })
      .catch(() => !cancelled && setErrored(true))
      .finally(() => !cancelled && setLoading(false));

    return () => {
      cancelled = true;
    };
  }, [user]);

  const toggleFavorite = (lineId: string) => {
    if (!user) return;
    const isFavorite = favoriteIds.has(lineId);

    setFavoriteIds((prev) => {
      const next = new Set(prev);
      isFavorite ? next.delete(lineId) : next.add(lineId);
      return next;
    });

    const request = isFavorite
      ? removeFavoriteLine(user.id, lineId)
      : addFavoriteLine(user.id, lineId);

    request.catch(() => {
      setFavoriteIds((prev) => {
        const next = new Set(prev);
        isFavorite ? next.add(lineId) : next.delete(lineId);
        return next;
      });
    });
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return lines.filter((l) => {
      if (operatorFilter && l.operator_id !== operatorFilter) return false;
      if (!q) return true;
      return l.code.toLowerCase().includes(q) || l.name.toLowerCase().includes(q);
    });
  }, [lines, query, operatorFilter]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.head}>
        <Text style={styles.title}>Lignes</Text>
        <Text style={styles.subtitle}>
          {lines.length > 0 ? `${lines.length} lignes de bus à Dakar` : 'Le réseau de Dakar'}
        </Text>
      </View>

      {!loading && !errored && lines.length > 0 && (
        <>
          <View style={styles.search}>
            <Ionicons name="search" size={17} color={c.inkFaint} />
            <TextInput
              style={styles.searchInput}
              placeholder="Chercher une ligne ou un quartier"
              placeholderTextColor={c.inkFaint}
              value={query}
              onChangeText={setQuery}
              autoCorrect={false}
              autoCapitalize="none"
            />
            {query.length > 0 && (
              <TouchableOpacity onPress={() => setQuery('')} accessibilityRole="button">
                <Ionicons name="close-circle" size={17} color={c.inkFaint} />
              </TouchableOpacity>
            )}
          </View>

          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            data={operators}
            keyExtractor={(o) => o.id}
            style={styles.chipsRow}
            contentContainerStyle={styles.chipsContent}
            ListHeaderComponent={
              <Chip
                styles={styles}
                colors={c}
                label="Tous"
                active={operatorFilter === null}
                onPress={() => setOperatorFilter(null)}
              />
            }
            renderItem={({ item }) => (
              <Chip
                styles={styles}
                colors={c}
                label={item.short_name}
                color={item.color}
                active={operatorFilter === item.id}
                onPress={() => setOperatorFilter(operatorFilter === item.id ? null : item.id)}
              />
            )}
          />
        </>
      )}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={c.yonn} />
        </View>
      ) : errored ? (
        <EmptyState
          icon="cloud-offline-outline"
          title="Impossible de charger les lignes"
          description="Vérifiez votre connexion et réessayez dans un instant."
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon="search-outline"
          title="Aucun résultat"
          description={
            query ? `Aucune ligne ne correspond à « ${query} ».` : 'Aucune ligne pour cet opérateur.'
          }
        />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(l) => l.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          renderItem={({ item }) => {
            const color = item.color || item.operator.color;
            const [from, to] = item.name.split('↔').map((s) => s.trim());
            return (
              <TouchableOpacity
                style={styles.row}
                activeOpacity={0.7}
                onPress={() =>
                  router.push({
                    pathname: '/(modals)/bus-details',
                    params: { lineId: item.id, code: item.code, name: item.name, color },
                  })
                }
              >
                <View style={[styles.badge, { backgroundColor: color }]}>
                  <Text style={styles.badgeText} numberOfLines={1}>
                    {item.code.replace('Ligne ', '')}
                  </Text>
                </View>

                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle} numberOfLines={1}>
                    {from && to ? `${from} → ${to}` : item.name}
                  </Text>
                  <Text style={styles.rowMeta}>
                    {item.operator.name}
                    {item.fare_fcfa ? ` · ${item.fare_fcfa} FCFA` : ''}
                  </Text>
                </View>

                <TouchableOpacity
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  onPress={() => toggleFavorite(item.id)}
                  accessibilityRole="button"
                  accessibilityLabel={
                    favoriteIds.has(item.id) ? 'Retirer des favoris' : 'Ajouter aux favoris'
                  }
                >
                  <Ionicons
                    name={favoriteIds.has(item.id) ? 'star' : 'star-outline'}
                    size={19}
                    color={favoriteIds.has(item.id) ? c.gold : c.inkFaint}
                  />
                </TouchableOpacity>
              </TouchableOpacity>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

function Chip({
  label,
  color,
  active,
  onPress,
  styles,
  colors,
}: {
  label: string;
  color?: string;
  active: boolean;
  onPress: () => void;
  styles: ReturnType<typeof createStyles>;
  colors: Palette;
}) {
  return (
    <TouchableOpacity
      style={[styles.chip, active && styles.chipActive]}
      onPress={onPress}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      {!!color && (
        <View style={[styles.chipDot, { backgroundColor: active ? colors.surface : color }]} />
      )}
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

const createStyles = (c: Palette) =>
  StyleSheet.create({
  safe: { flex: 1, backgroundColor: c.canvas },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  head: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.sm, paddingBottom: Spacing.md },
  title: { fontFamily: Fonts.display, fontSize: 28, color: c.ink },
  subtitle: { fontFamily: Fonts.body, fontSize: 14, color: c.inkMuted, marginTop: 2 },

  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.line,
    borderRadius: Radii.md,
    paddingHorizontal: Spacing.md,
    height: 46,
    marginHorizontal: Spacing.lg,
  },
  searchInput: { flex: 1, fontFamily: Fonts.body, fontSize: 14, color: c.ink },

  chipsRow: { flexGrow: 0, height: 56 },
  chipsContent: { paddingHorizontal: Spacing.lg, alignItems: 'center', gap: Spacing.xs },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 34,
    paddingHorizontal: Spacing.md,
    borderRadius: Radii.pill,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.line,
    marginRight: Spacing.xs,
  },
  chipActive: { backgroundColor: c.ink, borderColor: c.ink },
  chipDot: { width: 7, height: 7, borderRadius: 4 },
  chipText: { fontFamily: Fonts.bodySemi, fontSize: 12.5, color: c.inkMuted },
  chipTextActive: { color: c.surface },

  list: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: TAB_BAR_HEIGHT + TAB_BAR_BOTTOM_MARGIN + Spacing.xl,
  },
  separator: { height: 1, backgroundColor: c.line, marginLeft: 48 + Spacing.md },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.md,
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
