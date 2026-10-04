import React, { useMemo, useState } from 'react';
import { View, Text, TextInput, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import ScreenHeader from '../../components/ui/ScreenHeader';
import PrimaryButton from '../../components/ui/PrimaryButton';
import { Fonts, Radii, Spacing, Palette } from '../../constants/theme';
import { useColors } from '../../store/ThemeContext';
import { useAuth } from '../../store/AuthContext';
import { updateProfile } from '../../services/profile';
import { formatPhoneDisplay } from '../../utils/phone';

export default function EditProfileScreen() {
  const c = useColors();
  const styles = useMemo(() => createStyles(c), [c]);
  const router = useRouter();
  const { user, refreshProfile } = useAuth();

  const [fullName, setFullName] = useState(user?.fullName ?? '');
  const [city, setCity] = useState(user?.city ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!user) return null;

  const canSave = fullName.trim().length > 0;

  const save = async () => {
    if (!canSave || saving) return;
    setSaving(true);
    setError(null);
    try {
      await updateProfile(user.id, { fullName, city });
      await refreshProfile();
      router.back();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Échec de l'enregistrement.");
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScreenHeader title="Modifier le profil" action="close" />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.content}>
          <Text style={styles.label}>Nom complet</Text>
          <TextInput
            style={styles.input}
            placeholder="Votre nom"
            placeholderTextColor={c.inkFaint}
            value={fullName}
            onChangeText={setFullName}
            autoFocus
          />

          <Text style={styles.label}>Ville (facultatif)</Text>
          <TextInput
            style={styles.input}
            placeholder="Dakar, Thiès, Saint-Louis…"
            placeholderTextColor={c.inkFaint}
            value={city}
            onChangeText={setCity}
          />

          <Text style={styles.label}>Numéro de téléphone</Text>
          <View style={styles.readOnly}>
            <Text style={styles.readOnlyText}>+221 {formatPhoneDisplay(user.phone)}</Text>
          </View>
          <Text style={styles.hint}>
            Le numéro sert à votre connexion : il ne peut pas être changé ici.
          </Text>

          {!!error && <Text style={styles.error}>{error}</Text>}

          <View style={{ flex: 1 }} />

          <PrimaryButton
            label="Enregistrer"
            onPress={save}
            disabled={!canSave}
            loading={saving}
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const createStyles = (c: Palette) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.canvas },
    content: { flex: 1, paddingHorizontal: Spacing.lg, paddingBottom: Spacing.lg },

    label: { fontFamily: Fonts.bodySemi, fontSize: 12, color: c.inkMuted, marginBottom: 6, marginTop: Spacing.md },
    input: {
      height: 50,
      paddingHorizontal: Spacing.md,
      borderRadius: Radii.md,
      borderWidth: 1.5,
      borderColor: c.line,
      backgroundColor: c.fill,
      fontFamily: Fonts.bodyMedium,
      fontSize: 15,
      color: c.ink,
    },
    readOnly: {
      height: 50,
      paddingHorizontal: Spacing.md,
      borderRadius: Radii.md,
      backgroundColor: c.fill,
      justifyContent: 'center',
      opacity: 0.6,
    },
    readOnlyText: { fontFamily: Fonts.bodyMedium, fontSize: 15, color: c.inkMuted },
    hint: { fontFamily: Fonts.body, fontSize: 12, color: c.inkFaint, marginTop: 6 },

    error: { fontFamily: Fonts.body, fontSize: 12, color: c.danger, marginTop: Spacing.md },
  });
