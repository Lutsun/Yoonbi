import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import ScreenHeader from '../../components/ui/ScreenHeader';
import PrimaryButton from '../../components/ui/PrimaryButton';
import { Fonts, Radii, Spacing, Palette } from '../../constants/theme';
import { useColors } from '../../store/ThemeContext';
import { useUserLocation } from '../../store/LocationContext';
import { submitLineContribution } from '../../services/contributions';
import { MarkedStop } from '../../types/contributions';

const MIN_STOPS = 2;

export default function ContributeLineScreen() {
  const c = useColors();
  const styles = useMemo(() => createStyles(c), [c]);
  const router = useRouter();
  const { status: locationStatus, position, request: requestLocation } = useUserLocation();

  const [lineLabel, setLineLabel] = useState('');
  const [operatorHint, setOperatorHint] = useState('');
  const [fare, setFare] = useState('');
  const [stopName, setStopName] = useState('');
  const [stops, setStops] = useState<MarkedStop[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const markStop = () => {
    if (!stopName.trim() || !position) return;
    setStops((prev) => [
      ...prev,
      {
        name: stopName.trim(),
        latitude: position.latitude,
        longitude: position.longitude,
        accuracyMeters: position.accuracy,
      },
    ]);
    setStopName('');
    setError(null);
  };

  const removeStop = (index: number) => {
    setStops((prev) => prev.filter((_, i) => i !== index));
  };

  const canSend = lineLabel.trim().length > 0 && stops.length >= MIN_STOPS;

  const send = async () => {
    if (!canSend || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await submitLineContribution({
        lineLabel: lineLabel.trim(),
        operatorHint: operatorHint.trim() || undefined,
        fareFcfa: fare.trim() ? Number(fare.trim()) : undefined,
        stops,
      });
      setDone(true);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Échec de l'envoi — vérifiez votre connexion et réessayez."
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <ScreenHeader title="Proposer une ligne" action="close" />
        <View style={styles.doneWrap}>
          <View style={styles.doneIcon}>
            <Ionicons name="checkmark" size={30} color={c.canvas} />
          </View>
          <Text style={styles.doneTitle}>Contribution envoyée</Text>
          <Text style={styles.doneText}>
            Un administrateur va la relire avant qu'elle n'apparaisse dans l'app. Vous pouvez suivre
            son statut depuis votre profil, dans « Mes contributions ».
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
      <ScreenHeader
        title="Proposer une ligne"
        subtitle="Marquez chaque arrêt pendant que vous y êtes — Yoonbi capte votre position sur l'instant."
        action="close"
      />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.label}>Nom de la ligne</Text>
          <TextInput
            style={styles.input}
            placeholder="ex. Bus vers Ouakam"
            placeholderTextColor={c.inkFaint}
            value={lineLabel}
            onChangeText={setLineLabel}
          />

          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Opérateur (si connu)</Text>
              <TextInput
                style={styles.input}
                placeholder="Tata AFTU, DDD…"
                placeholderTextColor={c.inkFaint}
                value={operatorHint}
                onChangeText={setOperatorHint}
              />
            </View>
            <View style={{ width: 110 }}>
              <Text style={styles.label}>Tarif FCFA</Text>
              <TextInput
                style={styles.input}
                placeholder="200"
                placeholderTextColor={c.inkFaint}
                value={fare}
                onChangeText={setFare}
                keyboardType="number-pad"
              />
            </View>
          </View>

          <View style={styles.divider} />

          <Text style={styles.sectionTitle}>Arrêts marqués · {stops.length}</Text>

          {stops.length === 0 && (
            <Text style={styles.hint}>
              Montez dans le bus, puis marquez le premier arrêt dès le départ.
            </Text>
          )}

          {stops.map((stop, i) => (
            <View key={i} style={styles.stopRow}>
              <View style={styles.stopDot}>
                <Text style={styles.stopDotText}>{i + 1}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.stopName}>{stop.name}</Text>
                <Text style={styles.stopMeta}>
                  {stop.accuracyMeters != null
                    ? `Position précise à ${Math.round(stop.accuracyMeters)} m`
                    : 'Précision inconnue'}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => removeStop(i)}
                accessibilityRole="button"
                accessibilityLabel="Retirer cet arrêt"
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="close-circle" size={20} color={c.inkFaint} />
              </TouchableOpacity>
            </View>
          ))}

          {locationStatus !== 'ready' ? (
            <TouchableOpacity style={styles.locationNotice} onPress={requestLocation}>
              <Ionicons name="location-outline" size={16} color={c.yonnDark} />
              <Text style={styles.locationNoticeText}>
                Activez votre position pour pouvoir marquer un arrêt.
              </Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.markRow}>
              <TextInput
                style={[styles.input, { flex: 1 }]}
                placeholder="Nom de cet arrêt"
                placeholderTextColor={c.inkFaint}
                value={stopName}
                onChangeText={setStopName}
                onSubmitEditing={markStop}
                returnKeyType="done"
              />
              <TouchableOpacity
                style={[styles.markButton, !stopName.trim() && styles.markButtonDisabled]}
                onPress={markStop}
                disabled={!stopName.trim()}
                accessibilityRole="button"
              >
                <Ionicons name="add" size={20} color={c.canvas} />
              </TouchableOpacity>
            </View>
          )}

          {!!error && <Text style={styles.error}>{error}</Text>}

          <View style={{ height: Spacing.lg }} />

          <PrimaryButton
            label={
              stops.length < MIN_STOPS
                ? `Encore ${MIN_STOPS - stops.length} arrêt${MIN_STOPS - stops.length > 1 ? 's' : ''}…`
                : 'Envoyer la contribution'
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

const createStyles = (c: Palette) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.canvas },
    scroll: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xl, gap: Spacing.xs },

    label: { fontFamily: Fonts.bodySemi, fontSize: 12, color: c.inkMuted, marginBottom: 6, marginTop: Spacing.sm },
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
    row: { flexDirection: 'row', gap: Spacing.sm },

    divider: { height: 1, backgroundColor: c.line, marginVertical: Spacing.lg },
    sectionTitle: { fontFamily: Fonts.bodySemi, fontSize: 13, color: c.ink, marginBottom: Spacing.sm },
    hint: { fontFamily: Fonts.body, fontSize: 13, color: c.inkMuted, marginBottom: Spacing.md, lineHeight: 19 },

    stopRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      paddingVertical: Spacing.sm,
    },
    stopDot: {
      width: 26,
      height: 26,
      borderRadius: 13,
      backgroundColor: c.yonnTint,
      alignItems: 'center',
      justifyContent: 'center',
    },
    stopDotText: { fontFamily: Fonts.bodySemi, fontSize: 12, color: c.yonnDark },
    stopName: { fontFamily: Fonts.bodyMedium, fontSize: 14, color: c.ink },
    stopMeta: { fontFamily: Fonts.body, fontSize: 11, color: c.inkFaint, marginTop: 1 },

    markRow: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.sm, alignItems: 'center' },
    markButton: {
      width: 48,
      height: 48,
      borderRadius: Radii.md,
      backgroundColor: c.yonn,
      alignItems: 'center',
      justifyContent: 'center',
    },
    markButtonDisabled: { opacity: 0.4 },

    locationNotice: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      backgroundColor: c.yonnTint,
      borderRadius: Radii.md,
      padding: Spacing.md,
      marginTop: Spacing.sm,
    },
    locationNoticeText: { flex: 1, fontFamily: Fonts.bodyMedium, fontSize: 12, color: c.yonnDark },

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
