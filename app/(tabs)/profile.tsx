import React, { useCallback, useState, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import {
  Fonts,
  Radii,
  Spacing,
  TAB_BAR_HEIGHT,
  TAB_BAR_BOTTOM_MARGIN,
  Palette,
} from '../../constants/theme';
import { useTheme, ThemeMode } from '../../store/ThemeContext';
import { useAuth } from '../../store/AuthContext';
import { formatPhoneDisplay } from '../../utils/phone';
import { initialsOf } from '../../utils/text';
import { getSavedTrips } from '../../services/trips';
import { getFavoriteLineIds } from '../../services/favorites';

const THEME_OPTIONS: {
  value: ThemeMode;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  { value: 'light', label: 'Clair', icon: 'sunny-outline' },
  { value: 'dark', label: 'Sombre', icon: 'moon-outline' },
];

export default function ProfileScreen() {
  const { colors: c, mode, setMode } = useTheme();
  const styles = useMemo(() => createStyles(c), [c]);
  const router = useRouter();
  const { user, logout } = useAuth();
  const [tripCount, setTripCount] = useState<number | null>(null);
  const [lineCount, setLineCount] = useState<number | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      let cancelled = false;
      Promise.all([getSavedTrips(user.id), getFavoriteLineIds(user.id)])
        .then(([trips, lines]) => {
          if (cancelled) return;
          setTripCount(trips.length);
          setLineCount(lines.length);
        })
        .catch(() => {
          if (cancelled) return;
          setTripCount(0);
          setLineCount(0);
        });
      return () => {
        cancelled = true;
      };
    }, [user])
  );

  const handleLogout = async () => {
    await logout();
    router.replace('/(auth)/login');
  };

  if (!user) return null;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.identity}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initialsOf(user.fullName)}</Text>
          </View>
          <Text style={styles.name}>{user.fullName}</Text>
          <Text style={styles.phone}>
            +221 {formatPhoneDisplay(user.phone)}
            {user.city ? ` · ${user.city}` : ''}
          </Text>
        </View>

        <View style={styles.stats}>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{tripCount ?? '—'}</Text>
            <Text style={styles.statLabel}>Trajets enregistrés</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.stat}>
            <Text style={styles.statValue}>{lineCount ?? '—'}</Text>
            <Text style={styles.statLabel}>Lignes en favori</Text>
          </View>
        </View>

        <Text style={styles.sectionLabel}>Apparence</Text>
        <View style={styles.segment}>
          {THEME_OPTIONS.map((option) => {
            const active = mode === option.value;
            return (
              <TouchableOpacity
                key={option.value}
                style={[styles.segmentItem, active && styles.segmentItemActive]}
                onPress={() => setMode(option.value)}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
              >
                <Ionicons
                  name={option.icon}
                  size={17}
                  color={active ? c.yonnDark : c.inkFaint}
                />
                <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
                  {option.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={styles.card}>
          <Row
            styles={styles}
            colors={c}
            icon="bookmark-outline"
            label="Mes favoris"
            onPress={() => router.push('/(tabs)/saved')}
          />
          <View style={styles.separator} />
          <Row
            styles={styles}
            colors={c}
            icon="help-circle-outline"
            label="Aide et questions fréquentes"
            onPress={() => router.push('/(modals)/help')}
          />
        </View>

        <View style={styles.card}>
          <Row styles={styles} colors={c} icon="log-out-outline" label="Se déconnecter" danger onPress={handleLogout} />
        </View>

        <Text style={styles.version}>Yoonbi · version 1.0</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({
  icon,
  label,
  onPress,
  danger,
  styles,
  colors,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  danger?: boolean;
  styles: ReturnType<typeof createStyles>;
  colors: Palette;
}) {
  return (
    <TouchableOpacity style={styles.row} activeOpacity={0.7} onPress={onPress}>
      <View style={[styles.rowIcon, danger && styles.rowIconDanger]}>
        <Ionicons name={icon} size={18} color={danger ? colors.danger : colors.yonn} />
      </View>
      <Text style={[styles.rowLabel, danger && { color: colors.danger }]}>{label}</Text>
      {!danger && <Ionicons name="chevron-forward" size={17} color={colors.inkFaint} />}
    </TouchableOpacity>
  );
}

const createStyles = (c: Palette) =>
  StyleSheet.create({
  safe: { flex: 1, backgroundColor: c.canvas },
  content: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: TAB_BAR_HEIGHT + TAB_BAR_BOTTOM_MARGIN + Spacing.xl,
  },

  identity: { alignItems: 'center', paddingTop: Spacing.lg, paddingBottom: Spacing.lg },
  avatar: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: c.yonnTint,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  avatarText: { fontFamily: Fonts.display, fontSize: 26, color: c.yonnDark },
  name: { fontFamily: Fonts.display, fontSize: 22, color: c.ink },
  phone: { fontFamily: Fonts.body, fontSize: 14, color: c.inkMuted, marginTop: 3 },

  stats: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: c.surface,
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: c.line,
    paddingVertical: Spacing.md,
    marginBottom: Spacing.md,
  },
  stat: { flex: 1, alignItems: 'center' },
  statDivider: { width: 1, height: 34, backgroundColor: c.line },
  statValue: { fontFamily: Fonts.display, fontSize: 22, color: c.ink },
  statLabel: { fontFamily: Fonts.body, fontSize: 12, color: c.inkFaint, marginTop: 3 },

  sectionLabel: {
    fontFamily: Fonts.bodySemi,
    fontSize: 11,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: c.inkFaint,
    marginBottom: Spacing.sm,
  },
  segment: {
    flexDirection: 'row',
    backgroundColor: c.fill,
    borderRadius: Radii.md,
    padding: 4,
    gap: 4,
    marginBottom: Spacing.md,
  },
  segmentItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 40,
    borderRadius: Radii.sm,
  },
  segmentItemActive: { backgroundColor: c.surface },
  segmentText: { fontFamily: Fonts.bodyMedium, fontSize: 13, color: c.inkFaint },
  segmentTextActive: { fontFamily: Fonts.bodySemi, color: c.ink },

  card: {
    backgroundColor: c.surface,
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: c.line,
    overflow: 'hidden',
    marginBottom: Spacing.md,
  },
  separator: { height: 1, backgroundColor: c.line, marginLeft: 40 + Spacing.md * 2 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.md,
    height: 60,
  },
  rowIcon: {
    width: 40,
    height: 40,
    borderRadius: Radii.md,
    backgroundColor: c.yonnTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowIconDanger: { backgroundColor: c.dangerTint },
  rowLabel: { flex: 1, fontFamily: Fonts.bodySemi, fontSize: 15, color: c.ink },

  version: {
    fontFamily: Fonts.body,
    fontSize: 12,
    color: c.inkFaint,
    textAlign: 'center',
    marginTop: Spacing.sm,
  },
});
