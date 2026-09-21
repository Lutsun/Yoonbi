import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { darkColors, lightColors, makeElevation, Palette } from '../constants/theme';

// Deux choix : clair ou sombre. Au premier lancement, on part du réglage du téléphone.
export type ThemeMode = 'light' | 'dark';

const STORAGE_KEY = 'yoonbi_theme_mode';

type ThemeContextValue = {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  isDark: boolean;
  colors: Palette;
  elevation: ReturnType<typeof makeElevation>;
};

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>(systemScheme === 'dark' ? 'dark' : 'light');

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((saved) => {
      if (saved === 'light' || saved === 'dark') setModeState(saved);
    });
  }, []);

  const value = useMemo<ThemeContextValue>(() => {
    const isDark = mode === 'dark';
    const colors = isDark ? darkColors : lightColors;
    return {
      mode,
      isDark,
      colors,
      elevation: makeElevation(colors, isDark),
      setMode: (next: ThemeMode) => {
        setModeState(next);
        AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {});
      },
    };
  }, [mode]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider');
  return ctx;
}

// Raccourci le plus utilisé dans les écrans.
export function useColors(): Palette {
  return useTheme().colors;
}
