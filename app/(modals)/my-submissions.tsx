import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import ScreenHeader from '../../components/ui/ScreenHeader';
import EmptyState from '../../components/ui/EmptyState';
import { Fonts, Radii, Spacing, Palette } from '../../constants/theme';
import { useColors } from '../../store/ThemeContext';
import { getMyLineSubmissions } from '../../services/contributions';
import { LineSubmission, SubmissionStatus } from '../../types/contributions';

const STATUS_META: Record<SubmissionStatus, { label: string; icon: keyof typeof Ionicons.glyphMap }> = {
  pending: { label: 'En attente', icon: 'time-outline' },
  approved: { label: 'Validée', icon: 'checkmark-circle' },
  rejected: { label: 'Refusée', icon: 'close-circle' },
};

export default function MySubmissionsScreen() {
  const c = useColors();
  const styles = useMemo(() => createStyles(c), [c]);
  const [items, setItems] = useState<LineSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [errored, setErrored] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      getMyLineSubmissions()
        .then((data) => !cancelled && setItems(data))
        .catch(() => !cancelled && setErrored(true))
        .finally(() => !cancelled && setLoading(false));
      return () => {
        cancelled = true;
      };
    }, [])
  );

  const statusColor = (status: SubmissionStatus) =>
    status === 'approved' ? c.yonnDark : status === 'rejected' ? c.danger : c.inkMuted;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScreenHeader title="Mes contributions" action="close" />

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={c.yonn} />
        </View>
      ) : errored ? (
        <EmptyState
          icon="cloud-offline-outline"
          title="Impossible de charger tes contributions"
          description="Vérifie ta connexion et réessaie dans un instant."
        />
      ) : items.length === 0 ? (
        <EmptyState
          icon="add-circle-outline"
          title="Aucune contribution pour l'instant"
          description="Depuis ton profil, propose une ligne de bus absente de Yoonbi."
        />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => {
            const meta = STATUS_META[item.status];
            return (
              <View style={styles.card}>
                <View style={styles.cardTop}>
                  <Text style={styles.lineLabel} numberOfLines={1}>
                    {item.lineLabel}
                  </Text>
                  <View style={styles.statusPill}>
                    <Ionicons name={meta.icon} size={13} color={statusColor(item.status)} />
                    <Text style={[styles.statusText, { color: statusColor(item.status) }]}>
                      {meta.label}
                    </Text>
                  </View>
                </View>
                <Text style={styles.meta}>
                  {item.stopCount} arrêt{item.stopCount > 1 ? 's' : ''}
                  {item.operatorHint ? ` · ${item.operatorHint}` : ''}
                  {item.fareFcfa ? ` · ${item.fareFcfa} FCFA` : ''}
                </Text>
                {item.status === 'rejected' && !!item.reviewNote && (
                  <Text style={styles.reviewNote}>« {item.reviewNote} »</Text>
                )}
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
    list: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xl, gap: Spacing.sm },
    card: {
      backgroundColor: c.surface,
      borderRadius: Radii.lg,
      borderWidth: 1,
      borderColor: c.line,
      padding: Spacing.md,
      gap: 4,
    },
    cardTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
    lineLabel: { flex: 1, fontFamily: Fonts.bodySemi, fontSize: 15, color: c.ink },
    statusPill: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    statusText: { fontFamily: Fonts.bodySemi, fontSize: 11 },
    meta: { fontFamily: Fonts.body, fontSize: 12, color: c.inkFaint },
    reviewNote: { fontFamily: Fonts.body, fontSize: 12, color: c.inkMuted, fontStyle: 'italic', marginTop: 2 },
  });
