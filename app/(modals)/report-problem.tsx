import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import ScreenHeader from '../../components/ui/ScreenHeader';
import PrimaryButton from '../../components/ui/PrimaryButton';
import { Fonts, Radii, Spacing, Palette } from '../../constants/theme';
import { useColors } from '../../store/ThemeContext';
import { useUserLocation } from '../../store/LocationContext';
import { submitReport } from '../../services/reports';
import { getNetworkLines, getNetworkStops, NetworkLine } from '../../services/transit';
import { Stop } from '../../types/transit';
import { ReportType } from '../../types/reports';
import { REPORT_TYPES } from '../../constants/reports';
import { distanceKm } from '../../utils/eta';
import { searchKey } from '../../utils/text';

const MIN_DESCRIPTION = 10;
const MAX_RESULTS = 5;

export default function ReportProblemScreen() {
  const c = useColors();
  const styles = useMemo(() => createStyles(c), [c]);
  const router = useRouter();
  // Ouvert depuis la fiche d'une ligne : la ligne est déjà choisie.
  const params = useLocalSearchParams<{ lineId?: string }>();
  const { position } = useUserLocation();

  const [type, setType] = useState<ReportType | null>(null);
  const [lines, setLines] = useState<NetworkLine[]>([]);
  const [stops, setStops] = useState<Stop[]>([]);
  const [line, setLine] = useState<NetworkLine | null>(null);
  const [stop, setStop] = useState<Stop | null>(null);
  const [lineQuery, setLineQuery] = useState('');
  const [stopQuery, setStopQuery] = useState('');
  const [picking, setPicking] = useState<'line' | 'stop' | null>(null);
  const [description, setDescription] = useState('');
  const [shareLocation, setShareLocation] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    getNetworkLines()
      .then((all) => {
        setLines(all);
        if (params.lineId) setLine(all.find((l) => l.id === params.lineId) ?? null);
      })
      .catch(() => {});
    getNetworkStops().then(setStops).catch(() => {});
  }, [params.lineId]);

  const lineResults = useMemo(() => {
    const q = searchKey(lineQuery);
    const found = q
      ? lines.filter((l) => searchKey(`${l.code} ${l.name} ${l.operatorShortName}`).includes(q))
      : lines;
    return found.slice(0, MAX_RESULTS);
  }, [lines, lineQuery]);

  // Sans recherche, on propose les arrêts les plus proches : c'est souvent
  // celui où l'on se trouve qui pose problème.
  const stopResults = useMemo(() => {
    const q = searchKey(stopQuery);
    if (q) return stops.filter((s) => searchKey(s.name).includes(q)).slice(0, MAX_RESULTS);
    if (!position) return [];
    return [...stops]
      .map((s) => ({ s, d: distanceKm(position.latitude, position.longitude, s.latitude, s.longitude) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, 3)
      .map(({ s }) => s);
  }, [stops, stopQuery, position]);

  const canSend = !!type && description.trim().length >= MIN_DESCRIPTION;

  const send = async () => {
    if (!canSend || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await submitReport({
        type: type!,
        lineId: line?.id,
        stopId: stop?.id,
        description: description.trim(),
        location:
          shareLocation && position
            ? { latitude: position.latitude, longitude: position.longitude, accuracy: position.accuracy }
            : undefined,
      });
      setDone(true);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Échec de l'envoi — vérifiez votre connexion et réessayez."
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <ScreenHeader title="Signaler un problème" action="close" />
        <View style={styles.doneWrap}>
          <View style={styles.doneIcon}>
            <Ionicons name="checkmark" size={30} color={c.canvas} />
          </View>
          <Text style={styles.doneTitle}>Signalement envoyé</Text>
          <Text style={styles.doneText}>
            Merci ! Un administrateur va le vérifier. Vous pouvez suivre son statut depuis votre profil,
            dans « Mes signalements ».
          </Text>
          <View style={styles.doneButton}>
            <PrimaryButton label="Terminer" onPress={() => router.back()} />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScreenHeader title="Signaler un problème" subtitle="Aidez-nous à garder Yoonbi fiable." action="close" />

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.label}>Type de problème</Text>
          <View style={styles.typeGrid}>
            {REPORT_TYPES.map((t) => {
              const selected = type === t.value;
              return (
                <TouchableOpacity
                  key={t.value}
                  style={[styles.typeChip, selected && styles.typeChipSelected]}
                  onPress={() => setType(t.value)}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                >
                  <Ionicons name={t.icon} size={16} color={selected ? c.yonnDark : c.inkMuted} />
                  <Text style={[styles.typeText, selected && styles.typeTextSelected]}>{t.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={styles.label}>Ligne concernée (facultatif)</Text>
          {line ? (
            <SelectedChip
              styles={styles}
              colors={c}
              badge={{ text: line.code.replace('Ligne ', ''), color: line.color }}
              title={line.code}
              subtitle={`${line.operatorShortName} · ${line.name}`}
              onClear={() => setLine(null)}
            />
          ) : (
            <Picker
              styles={styles}
              colors={c}
              open={picking === 'line'}
              onOpen={() => setPicking('line')}
              placeholder="Choisir une ligne"
              query={lineQuery}
              onQuery={setLineQuery}
              items={lineResults.map((l) => ({
                key: l.id,
                title: `${l.code} · ${l.operatorShortName}`,
                subtitle: l.name,
                color: l.color,
                onPress: () => {
                  setLine(l);
                  setLineQuery('');
                  setPicking(null);
                },
              }))}
            />
          )}

          <Text style={styles.label}>Arrêt concerné (facultatif)</Text>
          {stop ? (
            <SelectedChip
              styles={styles}
              colors={c}
              title={stop.name}
              subtitle={stop.lines?.join(' · ')}
              onClear={() => setStop(null)}
            />
          ) : (
            <Picker
              styles={styles}
              colors={c}
              open={picking === 'stop'}
              onOpen={() => setPicking('stop')}
              placeholder="Choisir un arrêt"
              query={stopQuery}
              onQuery={setStopQuery}
              emptyHint={stopQuery ? undefined : 'Tapez le nom de l’arrêt.'}
              items={stopResults.map((s) => ({
                key: s.id,
                title: s.name,
                subtitle: s.lines?.join(' · '),
                color: s.operator_colors?.[0],
                onPress: () => {
                  setStop(s);
                  setStopQuery('');
                  setPicking(null);
                },
              }))}
            />
          )}

          <Text style={styles.label}>Description du problème</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder="Ex. : l'arrêt a été déplacé de l'autre côté du rond-point."
            placeholderTextColor={c.inkFaint}
            value={description}
            onChangeText={setDescription}
            onFocus={() => setPicking(null)}
            multiline
            maxLength={1000}
            textAlignVertical="top"
          />

          <View style={styles.locationRow}>
            <Ionicons name="location-outline" size={18} color={position ? c.yonnDark : c.inkFaint} />
            <View style={{ flex: 1 }}>
              <Text style={styles.locationTitle}>Joindre ma position</Text>
              <Text style={styles.locationMeta}>
                {position
                  ? position.accuracy != null
                    ? `Précise à ${Math.round(position.accuracy)} m`
                    : 'Position disponible'
                  : 'Position indisponible — le signalement sera envoyé sans.'}
              </Text>
            </View>
            <Switch
              value={shareLocation && !!position}
              onValueChange={setShareLocation}
              disabled={!position}
              trackColor={{ true: c.yonn, false: c.line }}
            />
          </View>

          {!!error && <Text style={styles.error}>{error}</Text>}

          <View style={{ height: Spacing.lg }} />

          <PrimaryButton
            label={
              !type
                ? 'Choisissez le type de problème'
                : description.trim().length < MIN_DESCRIPTION
                  ? 'Décrivez le problème'
                  : 'Envoyer le signalement'
            }
            onPress={send}
            disabled={!canSend}
            loading={submitting}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

type Styles = ReturnType<typeof createStyles>;

// Un choix facultatif : un champ qui, une fois touché, devient une recherche
// avec quelques résultats en dessous.
function Picker({
  styles,
  colors,
  open,
  onOpen,
  placeholder,
  query,
  onQuery,
  items,
  emptyHint,
}: {
  styles: Styles;
  colors: Palette;
  open: boolean;
  onOpen: () => void;
  placeholder: string;
  query: string;
  onQuery: (q: string) => void;
  items: { key: string; title: string; subtitle?: string; color?: string; onPress: () => void }[];
  emptyHint?: string;
}) {
  if (!open) {
    return (
      <TouchableOpacity style={[styles.input, styles.pickerField]} onPress={onOpen} accessibilityRole="button">
        <Text style={styles.pickerPlaceholder}>{placeholder}</Text>
        <Ionicons name="chevron-down" size={16} color={colors.inkFaint} />
      </TouchableOpacity>
    );
  }
  return (
    <View>
      <View style={[styles.input, styles.pickerField]}>
        <Ionicons name="search" size={16} color={colors.inkFaint} />
        <TextInput
          style={styles.pickerInput}
          placeholder="Rechercher…"
          placeholderTextColor={colors.inkFaint}
          value={query}
          onChangeText={onQuery}
          autoFocus
          autoCorrect={false}
        />
      </View>
      <View style={styles.results}>
        {items.length === 0 ? (
          <Text style={styles.resultsEmpty}>{emptyHint ?? 'Aucun résultat.'}</Text>
        ) : (
          items.map((item) => (
            <TouchableOpacity key={item.key} style={styles.resultRow} onPress={item.onPress}>
              <View style={[styles.resultDot, { backgroundColor: item.color ?? colors.yonn }]} />
              <View style={{ flex: 1 }}>
                <Text style={styles.resultTitle} numberOfLines={1}>
                  {item.title}
                </Text>
                {!!item.subtitle && (
                  <Text style={styles.resultSubtitle} numberOfLines={1}>
                    {item.subtitle}
                  </Text>
                )}
              </View>
            </TouchableOpacity>
          ))
        )}
      </View>
    </View>
  );
}

function SelectedChip({
  styles,
  colors,
  badge,
  title,
  subtitle,
  onClear,
}: {
  styles: Styles;
  colors: Palette;
  badge?: { text: string; color: string };
  title: string;
  subtitle?: string;
  onClear: () => void;
}) {
  return (
    <View style={styles.selected}>
      {badge ? (
        <View style={[styles.selectedBadge, { backgroundColor: badge.color }]}>
          <Text style={styles.selectedBadgeText} numberOfLines={1}>
            {badge.text}
          </Text>
        </View>
      ) : (
        <Ionicons name="bus" size={18} color={colors.yonnDark} />
      )}
      <View style={{ flex: 1 }}>
        <Text style={styles.resultTitle} numberOfLines={1}>
          {title}
        </Text>
        {!!subtitle && (
          <Text style={styles.resultSubtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        )}
      </View>
      <TouchableOpacity
        onPress={onClear}
        accessibilityRole="button"
        accessibilityLabel="Retirer"
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Ionicons name="close-circle" size={20} color={colors.inkFaint} />
      </TouchableOpacity>
    </View>
  );
}

const createStyles = (c: Palette) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.canvas },
    scroll: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xl, gap: Spacing.xs },

    label: { fontFamily: Fonts.bodySemi, fontSize: 12, color: c.inkMuted, marginBottom: 6, marginTop: Spacing.md },
    input: {
      height: 48,
      paddingHorizontal: Spacing.md,
      borderRadius: Radii.md,
      borderWidth: 1.5,
      borderColor: c.line,
      backgroundColor: c.fill,
      fontFamily: Fonts.bodyMedium,
      fontSize: 15,
      color: c.ink,
    },
    textArea: { height: 110, paddingTop: Spacing.md },

    typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
    typeChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: Spacing.md,
      paddingVertical: 10,
      borderRadius: Radii.pill,
      borderWidth: 1.5,
      borderColor: c.line,
      backgroundColor: c.surface,
    },
    typeChipSelected: { borderColor: c.yonn, backgroundColor: c.yonnTint },
    typeText: { fontFamily: Fonts.bodyMedium, fontSize: 13, color: c.inkMuted },
    typeTextSelected: { fontFamily: Fonts.bodySemi, color: c.yonnDark },

    pickerField: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm },
    pickerPlaceholder: { fontFamily: Fonts.bodyMedium, fontSize: 15, color: c.inkFaint },
    pickerInput: { flex: 1, fontFamily: Fonts.bodyMedium, fontSize: 15, color: c.ink, height: '100%' },
    results: {
      marginTop: Spacing.xs,
      borderRadius: Radii.md,
      borderWidth: 1,
      borderColor: c.line,
      backgroundColor: c.surface,
      overflow: 'hidden',
    },
    resultsEmpty: { fontFamily: Fonts.body, fontSize: 13, color: c.inkFaint, padding: Spacing.md },
    resultRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      paddingHorizontal: Spacing.md,
      paddingVertical: 11,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.line,
    },
    resultDot: { width: 10, height: 10, borderRadius: 5 },
    resultTitle: { fontFamily: Fonts.bodyMedium, fontSize: 14, color: c.ink },
    resultSubtitle: { fontFamily: Fonts.body, fontSize: 12, color: c.inkFaint, marginTop: 1 },

    selected: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      minHeight: 48,
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.sm,
      borderRadius: Radii.md,
      borderWidth: 1.5,
      borderColor: c.yonn,
      backgroundColor: c.yonnTint,
    },
    selectedBadge: {
      minWidth: 30,
      paddingHorizontal: 6,
      paddingVertical: 4,
      borderRadius: Radii.sm,
      alignItems: 'center',
    },
    selectedBadgeText: { fontFamily: Fonts.bodySemi, fontSize: 12, color: '#FFFFFF' },

    locationRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      marginTop: Spacing.lg,
      padding: Spacing.md,
      borderRadius: Radii.md,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.line,
    },
    locationTitle: { fontFamily: Fonts.bodySemi, fontSize: 14, color: c.ink },
    locationMeta: { fontFamily: Fonts.body, fontSize: 12, color: c.inkFaint, marginTop: 1 },

    error: { fontFamily: Fonts.body, fontSize: 12, color: c.danger, marginTop: Spacing.sm },

    doneWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.xl, gap: Spacing.sm },
    doneButton: { width: '100%' },
    doneIcon: {
      width: 64,
      height: 64,
      borderRadius: 32,
      backgroundColor: c.yonn,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: Spacing.sm,
    },
    doneTitle: { fontFamily: Fonts.displaySemi, fontSize: 20, color: c.ink },
    doneText: {
      fontFamily: Fonts.body,
      fontSize: 14,
      color: c.inkMuted,
      textAlign: 'center',
      lineHeight: 21,
      marginBottom: Spacing.lg,
    },
  });
