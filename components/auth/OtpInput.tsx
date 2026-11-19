import React, { useRef, useMemo } from 'react';
import { View, TextInput, Text, StyleSheet, Pressable, type TextInputInstance } from 'react-native';
import { Fonts, Radii, Palette } from '../../constants/theme';
import { useColors } from '../../store/ThemeContext';

export default function OtpInput({
  length = 6,
  value,
  onChange,
  error,
}: {
  length?: number;
  value: string;
  onChange: (value: string) => void;
  error?: string;
}) {
  const c = useColors();
  const styles = useMemo(() => createStyles(c), [c]);
  const inputRef = useRef<TextInputInstance>(null);
  const digits = Array.from({ length }, (_, i) => value[i] ?? '');
  const activeIndex = Math.min(value.length, length - 1);

  return (
    <View>
      <Pressable onPress={() => inputRef.current?.focus()} style={styles.wrap}>
        <View style={styles.row}>
          {digits.map((digit, i) => (
            <View
              key={i}
              style={[
                styles.box,
                i === activeIndex && !error && styles.boxActive,
                !!error && styles.boxError,
              ]}
            >
              <Text style={styles.digit}>{digit}</Text>
            </View>
          ))}
        </View>
        <TextInput
          ref={inputRef}
          value={value}
          onChangeText={(t) => onChange(t.replace(/\D/g, '').slice(0, length))}
          keyboardType="number-pad"
          maxLength={length}
          style={styles.hiddenInput}
          autoFocus
        />
      </Pressable>
      {!!error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

const createStyles = (c: Palette) =>
  StyleSheet.create({
  wrap: { position: 'relative' },
  row: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  box: {
    width: 46,
    height: 56,
    borderRadius: Radii.md,
    borderWidth: 1.5,
    borderColor: c.yonn,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxActive: { borderColor: c.ink },
  boxError: { borderColor: c.danger },
  digit: {
    fontFamily: Fonts.display,
    fontSize: 22,
    color: c.yonnDeep,
  },
  hiddenInput: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0,
  },
  error: {
    fontFamily: Fonts.body,
    fontSize: 12,
    color: c.danger,
    marginTop: 8,
    textAlign: 'center',
  },
});
