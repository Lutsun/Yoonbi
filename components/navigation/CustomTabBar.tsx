import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import {
  Fonts,
  Radii,
  Spacing,
  Palette,
  makeElevation,
  TAB_BAR_HEIGHT,
  TAB_BAR_BOTTOM_MARGIN,
} from '../../constants/theme';
import { useTheme } from '../../store/ThemeContext';

const ICONS: Record<
  string,
  { on: keyof typeof Ionicons.glyphMap; off: keyof typeof Ionicons.glyphMap }
> = {
  index: { on: 'map', off: 'map-outline' },
  routes: { on: 'git-branch', off: 'git-branch-outline' },
  saved: { on: 'bookmark', off: 'bookmark-outline' },
  profile: { on: 'person-circle', off: 'person-circle-outline' },
};

// Props reçues par `tabBar` de <Tabs>, sans importer les fichiers internes d'expo-router.
type BottomTabBarProps = Parameters<NonNullable<React.ComponentProps<typeof Tabs>['tabBar']>>[0];

// Barre "île" flottante, positionnée à la main : plus fiable que
// `tabBarStyle`, qui ignore left/right selon la version de React Navigation.
export default function CustomTabBar({ state, descriptors, emitter, navigateToTab }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { colors: c, isDark } = useTheme();
  const styles = useMemo(() => createStyles(c, isDark), [c, isDark]);

  return (
    <View style={[styles.wrap, { bottom: insets.bottom + TAB_BAR_BOTTOM_MARGIN }]}>
      {state.routes.map((route, index) => {
        const { options } = descriptors[route.key];
        const label = (options.title ?? route.name) as string;
        const focused = state.index === index;
        const icon = ICONS[route.name] ?? ICONS.index;

        const onPress = () => {
          const event = emitter.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });
          if (!focused && !event.defaultPrevented) navigateToTab(route.key);
        };

        return (
          <TouchableOpacity
            key={route.key}
            onPress={onPress}
            style={styles.item}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityState={focused ? { selected: true } : {}}
          >
            <Ionicons
              name={focused ? icon.on : icon.off}
              size={22}
              color={focused ? c.yonn : c.inkFaint}
            />
            <Text style={[styles.label, focused && styles.labelActive]}>{label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const createStyles = (c: Palette, isDark: boolean) =>
  StyleSheet.create({
    wrap: {
      position: 'absolute',
      left: Spacing.lg,
      right: Spacing.lg,
      height: TAB_BAR_HEIGHT,
      borderRadius: Radii.xl,
      backgroundColor: c.surface,
      flexDirection: 'row',
      alignItems: 'center',
      ...makeElevation(c, isDark).floating,
    },
    item: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3 },
    label: { fontFamily: Fonts.bodyMedium, fontSize: 10.5, color: c.inkFaint },
    labelActive: { fontFamily: Fonts.bodySemi, color: c.yonn },
  });
