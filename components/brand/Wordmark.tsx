import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Brand, Fonts } from '../../constants/theme';
import { useColors } from '../../store/ThemeContext';

// Le logo Yoonbi.
//   - `default`  : posé sur un fond d'interface, il suit le thème pour rester
//                  lisible en clair comme en sombre.
//   - `inverted` : posé sur le vert de la marque (écran d'ouverture), il garde
//                  des couleurs figées — « Yoon » blanc, « bi » noir — pour ne
//                  jamais changer d'aspect d'un lancement à l'autre.
export default function Wordmark({
  size = 36,
  variant = 'default',
}: {
  size?: number;
  variant?: 'default' | 'inverted';
}) {
  const c = useColors();
  const inverted = variant === 'inverted';

  const yonnColor = inverted ? Brand.onGreen : c.yonn;
  const biColor = inverted ? Brand.wordmarkInk : c.ink;

  return (
    <View style={styles.row} accessibilityRole="header" accessibilityLabel="Yoonbi">
      <Text style={[styles.text, { fontSize: size, color: yonnColor }]}>Yoon</Text>
      <Text style={[styles.text, { fontSize: size, color: biColor }]}>bi</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row' },
  text: {
    fontFamily: Fonts.display,
    letterSpacing: -0.5,
  },
});
