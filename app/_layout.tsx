import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useFonts } from 'expo-font';
import { Sora_600SemiBold, Sora_700Bold } from '@expo-google-fonts/sora';
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold } from '@expo-google-fonts/inter';
import * as SplashScreen from 'expo-splash-screen';
import React, { useEffect } from 'react';
import { Platform, View } from 'react-native';

import { AuthProvider } from '../store/AuthContext';
import { TripProvider } from '../store/TripContext';
import { ThemeProvider, useTheme } from '../store/ThemeContext';
import { LocationProvider } from '../store/LocationContext';

// Garde le splash screen affiché tant que les polices ne sont pas prêtes.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded, fontsError] = useFonts({
    Sora_600SemiBold,
    Sora_700Bold,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
  });

  useEffect(() => {
    if (fontsLoaded || fontsError) SplashScreen.hideAsync();
  }, [fontsLoaded, fontsError]);

  if (!fontsLoaded && !fontsError) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider>
        <AuthProvider>
          <TripProvider>
            <LocationProvider>
              <SafeAreaProvider>
                <RootNavigator />
              </SafeAreaProvider>
            </LocationProvider>
          </TripProvider>
        </AuthProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}

// Séparé du provider pour pouvoir lire le thème choisi (barre d'état et
// fond des écrans doivent suivre le mode clair/sombre).
function RootNavigator() {
  const { isDark, colors } = useTheme();

  return (
    <WebFrame background={isDark ? '#05070B' : '#E4E7EC'}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.canvas },
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(modals)" options={{ presentation: 'modal' }} />
      </Stack>
    </WebFrame>
  );
}

// Dans un navigateur d'ordinateur, Yoonbi s'affiche au format téléphone, centré
// — c'est une app mobile, pas un site étiré sur tout l'écran. Sur un vrai
// téléphone (natif ou navigateur mobile), ce cadre est transparent.
const WEB_APP_MAX_WIDTH = 480;

function WebFrame({ background, children }: { background: string; children: React.ReactNode }) {
  if (Platform.OS !== 'web') return <>{children}</>;
  return (
    <View style={{ flex: 1, backgroundColor: background, alignItems: 'center' }}>
      <View style={{ flex: 1, width: '100%', maxWidth: WEB_APP_MAX_WIDTH, overflow: 'hidden' }}>
        {children}
      </View>
    </View>
  );
}
