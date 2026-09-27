import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  FlatList,
  Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import ScreenHeader from '../../components/ui/ScreenHeader';
import EmptyState from '../../components/ui/EmptyState';
import { Fonts, Radii, Spacing, Palette } from '../../constants/theme';
import { useColors } from '../../store/ThemeContext';
import { searchStops } from '../../services/transit';
import { searchPlaces } from '../../services/places';
import { setSavedPlace } from '../../services/profile';
import { useAuth } from '../../store/AuthContext';
import { useUserLocation } from '../../store/LocationContext';
import { Stop } from '../../types/transit';

const KIND_LABEL: Record<'home' | 'work', { title: string; placeholder: string }> = {
  home: { title: 'Domicile', placeholder: 'Cherche ton adresse…' },
  work: { title: 'Travail', placeholder: "Cherche ton lieu de travail…" },
};

export default function SavedPlaceScreen() {
  const c = useColors();
  const styles = useMemo(() => createStyles(c), [c]);
  const router = useRouter();
  const { user, refreshProfile } = useAuth();
  const { position } = useUserLocation();
  const { kind } = useLocalSearchParams<{ kind: 'home' | 'work' }>();
  const config = KIND_LABEL[kind === 'work' ? 'work' : 'home'];

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Stop[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    setLoading(true);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      Promise.all([
        searchStops(query).catch(() => [] as Stop[]),
        searchPlaces(query).catch(() => [] as Stop[]),
      ])
        .then(([stops, places]) => setResults([...stops.slice(0, 4), ...places]))
        .finally(() => setLoading(false));
    }, 450);
    return () => clearTimeout(debounceRef.current);
  }, [query]);

  const save = async (label: string, latitude: number, longitude: number) => {
    if (!user || saving) return;
    setSaving(true);
    try {
      await setSavedPlace(user.id, kind === 'work' ? 'work' : 'home', { label, latitude, longitude });
      await refreshProfile();
      router.back();
    } catch {
      setSaving(false);
    }
  };

  const existing = kind === 'work' ? user?.work : user?.home;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScreenHeader title={config.title} action="close" />

      <View style={styles.searchRow}>
        <Ionicons name="search" size={17} color={c.inkFaint} />
        <TextInput
          style={styles.searchInput}
          placeholder={config.placeholder}
          placeholderTextColor={c.inkFaint}
          value={query}
          onChangeText={setQuery}
          autoFocus
          returnKeyType="search"
        />
        {loading && <ActivityIndicator size="small" color={c.yonn} />}
      </View>

      {!query.trim() && (
        <View style={styles.quick}>
          {!!position && (
            <TouchableOpacity
              style={styles.quickRow}
              activeOpacity={0.7}
              disabled={saving}
              onPress={() => save('Ma position actuelle', position.latitude, position.longitude)}
            >
              <View style={styles.quickIcon}>
                <Ionicons name="locate" size={16} color={c.yonn} />
              </View>
              <Text style={styles.quickText}>Utiliser ma position actuelle</Text>
            </TouchableOpacity>
          )}
          {existing && (
            <TouchableOpacity
              style={styles.quickRow}
              activeOpacity={0.7}
              disabled={saving}
              onPress={async () => {
                if (!user) return;
                setSaving(true);
                try {
                  await setSavedPlace(user.id, kind === 'work' ? 'work' : 'home', null);
                  await refreshProfile();
                  router.back();
                } catch {
                  setSaving(false);
                }
              }}
            >
              <View style={[styles.quickIcon, { backgroundColor: c.dangerTint }]}>
                <Ionicons name="trash-outline" size={16} color={c.danger} />
              </View>
              <Text style={[styles.quickText, { color: c.danger }]}>Retirer « {existing.label} »</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {query.trim() && !loading && results.length === 0 ? (
        <EmptyState icon="search-outline" title="Aucun résultat" description="Essaie un autre nom ou une autre orthographe." />
      ) : (
        <FlatList
          data={results}
          keyExtractor={(s) => s.id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.row}
              activeOpacity={0.7}
              disabled={saving}
              onPress={() => {
                Keyboard.dismiss();
                save(item.name, item.latitude, item.longitude);
              }}
            >
              <View style={[styles.rowIcon, { backgroundColor: (item.isPlace ? c.ink : c.yonn) + '22' }]}>
                <Ionicons name={item.isPlace ? 'location' : 'bus'} size={16} color={item.isPlace ? c.ink : c.yonn} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowName} numberOfLines={1}>
                  {item.name}
                </Text>
                {!!item.subtitle && (
                  <Text style={styles.rowSubtitle} numberOfLines={1}>
                    {item.subtitle}
                  </Text>
                )}
              </View>
            </TouchableOpacity>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const createStyles = (c: Palette) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.canvas },
    searchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      marginHorizontal: Spacing.lg,
      marginBottom: Spacing.md,
      paddingHorizontal: Spacing.md,
      height: 48,
      borderRadius: Radii.md,
      borderWidth: 1.5,
      borderColor: c.line,
      backgroundColor: c.fill,
    },
    searchInput: { flex: 1, fontFamily: Fonts.body, fontSize: 15, color: c.ink },

    quick: { paddingHorizontal: Spacing.lg, gap: Spacing.xs, marginBottom: Spacing.sm },
    quickRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.sm },
    quickIcon: {
      width: 34,
      height: 34,
      borderRadius: Radii.md,
      backgroundColor: c.yonnTint,
      alignItems: 'center',
      justifyContent: 'center',
    },
    quickText: { fontFamily: Fonts.bodyMedium, fontSize: 14, color: c.ink },

    list: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xl },
    row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.sm },
    rowIcon: { width: 34, height: 34, borderRadius: Radii.md, alignItems: 'center', justifyContent: 'center' },
    rowName: { fontFamily: Fonts.bodyMedium, fontSize: 14, color: c.ink },
    rowSubtitle: { fontFamily: Fonts.body, fontSize: 12, color: c.inkMuted, marginTop: 1 },
  });
