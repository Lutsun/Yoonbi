import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import ScreenHeader from '../../components/ui/ScreenHeader';
import { Fonts, Radii, Spacing, Palette } from '../../constants/theme';
import { useColors } from '../../store/ThemeContext';

// Pas d'assistant conversationnel : une aide claire et honnête plutôt qu'un
// chat qui ne répondrait à rien.
const QUESTIONS: { question: string; answer: string }[] = [
  {
    question: 'Comment trouver un trajet ?',
    answer:
      'Sur la carte, appuyez sur « Où allez-vous ? ». Votre point de départ est déjà rempli avec votre position : il ne vous reste qu’à indiquer votre destination.',
  },
  {
    question: 'Que veut dire « Recommandé » ?',
    answer:
      'C’est le trajet que Yoonbi juge le meilleur : le plus rapide, en évitant la marche inutile et les bus qui ne circulent peut-être plus à cette heure. Vous pouvez toujours choisir l’autre option si elle vous arrange mieux.',
  },
  {
    question: 'Les prix affichés sont-ils exacts ?',
    answer:
      'Ce sont les tarifs officiels de chaque réseau (BRT, Dakar Dem Dikk, Tata AFTU). Le total additionne le prix de chaque bus emprunté.',
  },
  {
    question: 'Pourquoi mon point n’est pas au bon endroit ?',
    answer:
      'Vérifiez que la position précise est activée pour Yoonbi dans les Réglages de votre téléphone. En position approximative, iOS ne donne qu’une zone de plusieurs kilomètres.',
  },
  {
    question: 'Comment retrouver un trajet plus tard ?',
    answer:
      'Avant de partir, appuyez sur l’icône marque-page à côté de « Démarrer le trajet ». Vous le retrouverez dans l’onglet Favoris, et un appui suffira pour le relancer.',
  },
  {
    question: 'Je n’ai pas reçu mon code de connexion',
    answer:
      'Attendez la fin du compte à rebours puis appuyez sur « Renvoyer ». Vérifiez aussi que votre numéro est correct.',
  },
];

export default function HelpScreen() {
  const c = useColors();
  const styles = useMemo(() => createStyles(c), [c]);
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScreenHeader title="Aide" subtitle="Les questions les plus fréquentes" action="close" />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {QUESTIONS.map((item) => (
          <View key={item.question} style={styles.card}>
            <Text style={styles.question}>{item.question}</Text>
            <Text style={styles.answer}>{item.answer}</Text>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (c: Palette) =>
  StyleSheet.create({
  safe: { flex: 1, backgroundColor: c.canvas },
  content: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xl,
    gap: Spacing.sm,
  },
  card: {
    backgroundColor: c.surface,
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: c.line,
    padding: Spacing.md,
  },
  question: { fontFamily: Fonts.bodySemi, fontSize: 15, color: c.ink },
  answer: {
    fontFamily: Fonts.body,
    fontSize: 14,
    color: c.inkMuted,
    marginTop: Spacing.sm,
    lineHeight: 21,
  },
});
