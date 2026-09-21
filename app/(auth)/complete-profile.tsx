import React, { useEffect, useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Session } from '@supabase/supabase-js';

import AuthTextInput from '../../components/ui/AuthTextInput';
import PrimaryButton from '../../components/ui/PrimaryButton';
import { Fonts, Spacing, Palette } from '../../constants/theme';
import { useColors } from '../../store/ThemeContext';
import { supabase } from '../../services/supabase';
import { createProfile } from '../../services/profile';
import { useAuth } from '../../store/AuthContext';
import { toE164 } from '../../utils/phone';

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '';
  return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase();
}

export default function CompleteProfileScreen() {
  const c = useColors();
  const styles = useMemo(() => createStyles(c), [c]);
  const router = useRouter();
  const { refreshProfile } = useAuth();
  const { phone } = useLocalSearchParams<{ phone: string }>();
  const [session, setSession] = useState<Session | null>(null);
  const [fullName, setFullName] = useState('');
  const [city, setCity] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);

  // On récupère la session Supabase Auth déjà ouverte par l'écran de
  // vérification, plutôt que de la faire transiter par la navigation.
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
  }, []);

  const initials = initialsOf(fullName);

  const handleSubmit = async () => {
    if (!fullName.trim()) {
      setError('Entre ton nom complet');
      return;
    }
    if (!session?.user) {
      setError('Session expirée, reconnecte-toi.');
      return;
    }
    setError(undefined);
    setLoading(true);
    try {
      await createProfile(session.user.id, session.user.phone ?? toE164(phone), fullName, city);
      await refreshProfile();
      router.replace('/(tabs)');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={{ height: Spacing.xl }} />

          <Text style={styles.title}>
            Bienvenue sur <Text style={styles.titleYonn}>Yoon</Text>bi
          </Text>
          <Text style={styles.subtitle}>Dites-nous comment vous appeler.</Text>

          <View style={styles.avatarWrap}>
            <View style={[styles.avatar, !!initials && styles.avatarFilled]}>
              {initials ? (
                <Text style={styles.avatarText}>{initials}</Text>
              ) : (
                <Ionicons name="person-outline" size={28} color={c.inkMuted} />
              )}
            </View>
          </View>

          <View style={{ height: Spacing.lg }} />

          <AuthTextInput
            label="Prénom et nom"
            icon="person-outline"
            placeholder="Aïssatou Sow"
            autoCapitalize="words"
            value={fullName}
            onChangeText={(t) => {
              setFullName(t);
              if (error) setError(undefined);
            }}
            error={error}
            returnKeyType="next"
            autoFocus
          />

          <AuthTextInput
            label="Ville (optionnel)"
            icon="location-outline"
            placeholder="Dakar"
            autoCapitalize="words"
            value={city}
            onChangeText={setCity}
            returnKeyType="done"
            onSubmitEditing={handleSubmit}
          />

          <View style={{ height: Spacing.sm }} />

          <PrimaryButton
            label="Créer mon compte"
            onPress={handleSubmit}
            loading={loading}
            disabled={!fullName.trim()}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const createStyles = (c: Palette) =>
  StyleSheet.create({
  safe: { flex: 1, backgroundColor: c.canvas },
  scroll: { flexGrow: 1, paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xl },
  title: {
    fontFamily: Fonts.display,
    fontSize: 28,
    color: c.ink,
  },
  titleYonn: {
    color: c.yonn,
  },
  subtitle: {
    fontFamily: Fonts.body,
    fontSize: 14,
    color: c.inkMuted,
    marginTop: 6,
  },
  avatarWrap: {
    alignItems: 'center',
    marginTop: Spacing.xl,
  },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 1.5,
    borderColor: c.line,
    borderStyle: 'dashed',
    backgroundColor: c.fill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarFilled: {
    borderStyle: 'solid',
    borderColor: c.yonn,
    backgroundColor: c.yonnTint,
  },
  avatarText: {
    fontFamily: Fonts.display,
    fontSize: 28,
    color: c.yonn,
  },
});
