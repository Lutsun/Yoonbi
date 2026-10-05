import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import ScreenHeader from '../../components/ui/ScreenHeader';
import EmptyState from '../../components/ui/EmptyState';
import { Fonts, Radii, Spacing, Palette } from '../../constants/theme';
import { REPORT_STATUS, REPORT_TYPE_LABEL } from '../../constants/reports';
import { useColors } from '../../store/ThemeContext';
import { getMyReports } from '../../services/reports';
import { Report, ReportStatus } from '../../types/reports';

export default function MyReportsScreen() {
  const c = useColors();
  const styles = useMemo(() => createStyles(c), [c]);
  const [items, setItems] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [errored, setErrored] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      getMyReports()
        .then((data) => !cancelled && setItems(data))
        .catch(() => !cancelled && setErrored(true))
        .finally(() => !cancelled && setLoading(false));
      return () => {
        cancelled = true;
      };
    }, [])
  );

  const statusColor = (status: ReportStatus) =>
    status === 'validated' || status === 'resolved'
      ? c.yonnDark
      : status === 'rejected'
        ? c.danger
        : status === 'reviewing'
          ? c.gold
          : c.inkMuted;

  const dateFmt = useMemo(
    () => new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }),
    []
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScreenHeader title="Mes signalements" action="close" />

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={c.yonn} />
        </View>
      ) : errored ? (
        <EmptyState
          icon="cloud-offline-outline"
          title="Impossible de charger vos signalements"
          description="Vérifiez votre connexion et réessayez dans un instant."
        />
      ) : items.length === 0 ? (
        <EmptyState
          icon="megaphone-outline"
          title="Aucun signalement pour l'instant"
          description="Depuis votre profil, signalez un problème sur une ligne ou un arrêt."
        />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => {
            const meta = REPORT_STATUS[item.status];
            const about = [item.lineCode, item.stopName].filter(Boolean).join(' · ');
            return (
              <View style={styles.card}>
                <View style={styles.cardTop}>
                  <Text style={styles.type} numberOfLines={1}>
                    {REPORT_TYPE_LABEL[item.type]}
                  </Text>
                  <View style={styles.statusPill}>
                    <Ionicons name={meta.icon} size={13} color={statusColor(item.status)} />
                    <Text style={[styles.statusText, { color: statusColor(item.status) }]}>{meta.label}</Text>
                  </View>
                </View>
                <Text style={styles.meta}>
                  {about ? `${about} · ` : ''}
                  {dateFmt.format(new Date(item.createdAt))}
                </Text>
                <Text style={styles.description} numberOfLines={3}>
                  {item.description}
                </Text>
                {!!item.reviewNote && <Text style={styles.reviewNote}>« {item.reviewNote} »</Text>}
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
    type: { flex: 1, fontFamily: Fonts.bodySemi, fontSize: 15, color: c.ink },
    statusPill: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    statusText: { fontFamily: Fonts.bodySemi, fontSize: 11 },
    meta: { fontFamily: Fonts.body, fontSize: 12, color: c.inkFaint },
    description: { fontFamily: Fonts.body, fontSize: 13, color: c.inkMuted, lineHeight: 19, marginTop: 2 },
    reviewNote: { fontFamily: Fonts.body, fontSize: 12, color: c.inkMuted, fontStyle: 'italic', marginTop: 2 },
  });
