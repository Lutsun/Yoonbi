import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Linking,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MapView, { Marker, Callout, Polyline, Region } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';

import TripSteps from '../../components/trip/TripSteps';
import NavigationBanner from '../../components/trip/NavigationBanner';
import { computeNavigation, formatMeters, NavigationState } from '../../services/navigation';
import { useAuth } from '../../store/AuthContext';
import { useTrip } from '../../store/TripContext';
import { useTheme } from '../../store/ThemeContext';
import { LocationStatus, useUserLocation } from '../../store/LocationContext';
import {
  Fonts,
  Radii,
  Spacing,
  Palette,
  makeElevation,
  TAB_BAR_HEIGHT,
  TAB_BAR_BOTTOM_MARGIN,
} from '../../constants/theme';
import { getNearbyStops } from '../../services/transit';
import { LatLng, Stop } from '../../types/transit';
import { initialsOf } from '../../utils/text';
import { distanceKm } from '../../utils/eta';

// Niveau de zoom pendant le guidage : assez serré pour voir la rue suivante.
const NAVIGATION_ZOOM = 16.5;
const BROWSING_ZOOM = 15;
const KEEP_AWAKE_TAG = 'yoonbi-guidance';

const DAKAR_REGION: Region = {
  latitude: 14.6928,
  longitude: -17.4467,
  latitudeDelta: 0.045,
  longitudeDelta: 0.045,
};

// Ce que la carte affiche quand elle ne peut pas localiser l'utilisateur.
const LOCATION_BLOCKERS: Partial<
  Record<LocationStatus, { text: string; action: string; icon: keyof typeof Ionicons.glyphMap }>
> = {
  'needs-permission': {
    icon: 'location-outline',
    text: 'Autorise la localisation pour voir où tu es et les arrêts autour de toi.',
    action: 'Autoriser',
  },
  denied: {
    icon: 'location-outline',
    text: 'Yoonbi n’a pas accès à ta position. Active-la dans les Réglages pour être guidé.',
    action: 'Ouvrir les Réglages',
  },
  'services-off': {
    icon: 'cellular-outline',
    text: 'La localisation de ton téléphone est coupée. Active-la dans Réglages › Confidentialité.',
    action: 'Ouvrir les Réglages',
  },
};

// Accueil : la carte occupe tout l'écran, une seule action mène au
// planificateur. Quand un trajet est lancé, la même carte devient le guide
// pas à pas (voir `activeTrip`).
export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { colors: c, isDark } = useTheme();
  const styles = useMemo(() => createStyles(c, isDark), [c, isDark]);
  const { user } = useAuth();
  const { activeTrip, clearActiveTrip } = useTrip();
  const { status, position, precise, request } = useUserLocation();
  const mapRef = useRef<MapView>(null);

  const [stops, setStops] = useState<Stop[]>([]);
  const [stopsError, setStopsError] = useState(false);

  // État du guidage, recalculé à chaque position (voir services/navigation.ts).
  const [nav, setNav] = useState<NavigationState | null>(null);
  // L'avancement doit être monotone : on garde la dernière étape atteinte.
  const stepIndexRef = useRef(0);
  // La caméra suit l'utilisateur, jusqu'à ce qu'il déplace la carte lui-même.
  const [following, setFollowing] = useState(false);

  const hasFix = !!position;

  const loadNearbyStops = useCallback(async (latitude: number, longitude: number) => {
    try {
      setStops(await getNearbyStops(latitude, longitude, 3000));
      setStopsError(false);
    } catch {
      setStopsError(true);
    }
  }, []);

  // La carte est l'endroit où la demande d'autorisation a du sens : on la
  // déclenche une seule fois, à la première ouverture.
  const askedRef = useRef(false);
  useEffect(() => {
    if (status === 'needs-permission' && !askedRef.current) {
      askedRef.current = true;
      request();
    }
  }, [status, request]);

  // Sans position, on montre malgré tout le réseau du centre de Dakar.
  useEffect(() => {
    if ((status === 'denied' || status === 'services-off') && stops.length === 0) {
      loadNearbyStops(DAKAR_REGION.latitude, DAKAR_REGION.longitude);
    }
  }, [status, stops.length, loadNearbyStops]);

  // Première position reçue : on centre la carte sur l'utilisateur.
  const centeredRef = useRef(false);
  useEffect(() => {
    if (!position || centeredRef.current || activeTrip) return;
    centeredRef.current = true;
    mapRef.current?.animateToRegion(
      {
        latitude: position.latitude,
        longitude: position.longitude,
        latitudeDelta: 0.015,
        longitudeDelta: 0.015,
      },
      600
    );
  }, [position, activeTrip]);

  // Arrêts proches : rechargés dès qu'on s'est déplacé de plus de 400 m.
  const lastLoadRef = useRef<LatLng | null>(null);
  useEffect(() => {
    if (!position || activeTrip) return;
    const last = lastLoadRef.current;
    const movedKm = last
      ? distanceKm(last.latitude, last.longitude, position.latitude, position.longitude)
      : Infinity;
    if (movedKm > 0.4) {
      lastLoadRef.current = { latitude: position.latitude, longitude: position.longitude };
      loadNearbyStops(position.latitude, position.longitude);
    }
  }, [position, activeTrip, loadNearbyStops]);

  // Pendant le guidage, l'écran ne doit pas se verrouiller : une fois éteint,
  // l'app est suspendue et le guide cesserait de suivre l'utilisateur.
  useEffect(() => {
    if (!activeTrip) return;
    activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => {});
    return () => {
      deactivateKeepAwake(KEEP_AWAKE_TAG).catch(() => {});
    };
  }, [activeTrip]);

  // Départ d'un trajet : on montre l'itinéraire en entier une fois, puis la
  // caméra se met à suivre l'utilisateur.
  useEffect(() => {
    stepIndexRef.current = 0;
    if (!activeTrip) {
      setNav(null);
      setFollowing(false);
      return;
    }
    const coords = activeTrip.plan.segments.flatMap((s) => s.path);
    if (coords.length > 0) {
      mapRef.current?.fitToCoordinates(coords, {
        edgePadding: { top: 160, right: 56, bottom: 360, left: 56 },
        animated: true,
      });
    }
    const timer = setTimeout(() => setFollowing(true), 1600);
    return () => clearTimeout(timer);
  }, [activeTrip]);

  // Le cœur du guidage : à chaque position, on recalcule l'étape en cours,
  // la distance jusqu'à la prochaine action et le temps restant, en tenant
  // compte de la précision réelle du GPS.
  useEffect(() => {
    if (!activeTrip || !position) return;
    const next = computeNavigation(
      activeTrip.plan,
      position,
      activeTrip.destination.name,
      stepIndexRef.current,
      position.accuracy
    );
    stepIndexRef.current = next.stepIndex;
    setNav(next);
  }, [position, activeTrip]);

  // Caméra qui suit, comme un GPS, tant que l'utilisateur n'a pas déplacé la
  // carte lui-même.
  useEffect(() => {
    if (!activeTrip || !following || !position) return;
    mapRef.current?.animateCamera(
      {
        center: { latitude: position.latitude, longitude: position.longitude },
        zoom: NAVIGATION_ZOOM,
      },
      { duration: 700 }
    );
  }, [position, following, activeTrip]);

  const recenter = () => {
    if (!position) {
      request();
      return;
    }
    if (activeTrip) setFollowing(true);
    mapRef.current?.animateCamera(
      {
        center: { latitude: position.latitude, longitude: position.longitude },
        zoom: activeTrip ? NAVIGATION_ZOOM : BROWSING_ZOOM,
      },
      { duration: 500 }
    );
  };

  const firstName = user?.fullName?.trim().split(/\s+/)[0];
  const arrived = nav?.arrived ?? false;
  const sheetBottom = insets.bottom + TAB_BAR_HEIGHT + TAB_BAR_BOTTOM_MARGIN + Spacing.sm;
  const blocker = LOCATION_BLOCKERS[status];
  const searching = !position && (status === 'checking' || status === 'locating');

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        initialRegion={DAKAR_REGION}
        showsUserLocation
        showsMyLocationButton={false}
        showsCompass={false}
        // Masque les commerces d'Apple Maps : seuls les arrêts Yoonbi restent.
        showsPointsOfInterests={false}
        userInterfaceStyle={isDark ? 'dark' : 'light'}
        // Dès que l'utilisateur déplace la carte, on arrête de la recentrer
        // sous ses doigts — il reprend la main jusqu'à ce qu'il le redemande.
        onPanDrag={() => following && setFollowing(false)}
      >
        {!activeTrip &&
          stops.map((stop) => (
            <Marker key={stop.id} coordinate={stop} anchor={{ x: 0.5, y: 0.5 }}>
              <View style={[styles.pin, { backgroundColor: stop.operator_colors?.[0] ?? c.yonn }]}>
                <Ionicons name="bus" size={13} color="#FFFFFF" />
              </View>
              <Callout tooltip={false}>
                <View style={styles.callout}>
                  <Text style={styles.calloutTitle}>{stop.name}</Text>
                  <Text style={styles.calloutLines}>
                    {stop.lines?.length ? stop.lines.join(' · ') : 'Aucune ligne renseignée'}
                  </Text>
                </View>
              </Callout>
            </Marker>
          ))}

        {activeTrip && (
          <>
            {activeTrip.plan.segments.map((segment, index) => (
              <Polyline
                key={index}
                coordinates={segment.path}
                strokeColor={segment.type === 'ride' ? segment.lineColor : c.inkFaint}
                strokeWidth={segment.type === 'ride' ? 6 : 4}
                lineDashPattern={segment.type === 'walk' ? [6, 6] : undefined}
                lineCap="round"
              />
            ))}

            <Marker coordinate={activeTrip.origin} anchor={{ x: 0.5, y: 0.5 }}>
              <View style={styles.originPin}>
                <View style={styles.originPinDot} />
              </View>
            </Marker>

            <Marker coordinate={activeTrip.destination} anchor={{ x: 0.5, y: 0.5 }}>
              <View style={styles.destinationPin}>
                <Ionicons name="flag" size={14} color={c.canvas} />
              </View>
            </Marker>
          </>
        )}
      </MapView>

      {searching && (
        <View style={styles.loadingOverlay} pointerEvents="none">
          <View style={styles.loadingPill}>
            <ActivityIndicator color={c.yonn} size="small" />
            <Text style={styles.loadingText}>Recherche de ta position…</Text>
          </View>
        </View>
      )}

      <View style={[styles.topBar, { paddingTop: insets.top + Spacing.sm }]} pointerEvents="box-none">
        {activeTrip ? (
          <View style={styles.navHeader}>
            <View style={{ flex: 1 }}>
              {nav ? (
                <NavigationBanner nav={nav} />
              ) : (
                <View style={styles.waitingBanner}>
                  <ActivityIndicator color={c.yonn} size="small" />
                  <Text style={styles.waitingText}>En attente du signal GPS pour te guider…</Text>
                </View>
              )}
            </View>
            <TouchableOpacity
              style={styles.navClose}
              onPress={clearActiveTrip}
              accessibilityRole="button"
              accessibilityLabel="Arrêter le guidage"
            >
              <Ionicons name="close" size={18} color={c.ink} />
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.greeting}>
            <View style={styles.greetingAvatar}>
              <Text style={styles.greetingInitials}>{user ? initialsOf(user.fullName) : ''}</Text>
            </View>
            <Text style={styles.greetingText}>Bonjour{firstName ? ` ${firstName}` : ''}</Text>
          </View>
        )}

        {blocker && (
          <View style={styles.blocker}>
            <View style={styles.blockerIcon}>
              <Ionicons name={blocker.icon} size={20} color={c.yonnDark} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.blockerText}>{blocker.text}</Text>
              <TouchableOpacity
                style={styles.blockerButton}
                onPress={request}
                accessibilityRole="button"
              >
                <Text style={styles.blockerButtonText}>{blocker.action}</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {hasFix && !precise && (
          <Notice
            styles={styles}
            colors={c}
            icon="locate-outline"
            text="Position approximative : active « Position exacte » dans les Réglages pour un guidage fiable."
            onPress={() => Linking.openSettings()}
          />
        )}
        {stopsError && (
          <Notice
            styles={styles}
            colors={c}
            icon="warning-outline"
            text="Impossible de charger les arrêts pour le moment."
          />
        )}
      </View>

      <TouchableOpacity
        style={[
          styles.locateButton,
          { bottom: sheetBottom + (activeTrip ? 320 : 76) },
          activeTrip && following && styles.locateButtonActive,
        ]}
        onPress={recenter}
        accessibilityRole="button"
        accessibilityLabel={
          activeTrip && !following ? 'Reprendre le suivi' : 'Centrer sur ma position'
        }
      >
        <Ionicons name="navigate" size={19} color={hasFix ? c.yonn : c.inkFaint} />
      </TouchableOpacity>

      {activeTrip ? (
        <View style={[styles.sheet, { bottom: sheetBottom }]}>
          <View style={styles.sheetHandle} />

          {/* Pendant le guidage, ce qui compte est ce qu'il RESTE, pas les
              totaux du départ : les deux premières valeurs se recalculent à
              chaque position. */}
          <View style={styles.tripStats}>
            <Stat
              styles={styles}
              value={nav && !arrived ? `${nav.remainingMinutes} min` : '—'}
              label="restant"
            />
            <View style={styles.statDivider} />
            <Stat
              styles={styles}
              value={nav && !arrived ? formatMeters(nav.remainingMeters) : '—'}
              label="distance"
            />
            <View style={styles.statDivider} />
            <Stat
              styles={styles}
              value={`${activeTrip.plan.totalFareFcfa} F`}
              label="prix"
              color={c.yonnDark}
            />
          </View>

          {arrived && (
            <View style={styles.arrivedBanner}>
              <Ionicons name="checkmark-circle" size={17} color={c.yonnDeep} />
              <Text style={styles.arrivedText}>Tu es arrivé à destination</Text>
            </View>
          )}

          <ScrollView
            style={styles.sheetScroll}
            contentContainerStyle={styles.sheetScrollContent}
            showsVerticalScrollIndicator={false}
          >
            <TripSteps
              origin={activeTrip.origin}
              destination={activeTrip.destination}
              segments={activeTrip.plan.segments}
              activeIndex={nav?.stepIndex ?? -1}
            />
          </ScrollView>

          <TouchableOpacity
            style={[styles.endButton, arrived && styles.endButtonDone]}
            onPress={clearActiveTrip}
            accessibilityRole="button"
          >
            <Text style={[styles.endButtonText, arrived && styles.endButtonTextDone]}>
              {arrived ? 'Terminer le trajet' : 'Arrêter le guidage'}
            </Text>
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity
          style={[styles.searchBar, { bottom: sheetBottom }]}
          activeOpacity={0.9}
          onPress={() => router.push('/(modals)/itinerary')}
          accessibilityRole="button"
        >
          <View style={styles.searchIcon}>
            <Ionicons name="search" size={17} color={c.yonn} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.searchTitle}>Où allez-vous ?</Text>
            <Text style={styles.searchSubtitle}>Bus, correspondances, prix</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={c.inkFaint} />
        </TouchableOpacity>
      )}
    </View>
  );
}

function Stat({
  value,
  label,
  color,
  styles,
}: {
  value: string;
  label: string;
  color?: string;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, !!color && { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function Notice({
  icon,
  text,
  onPress,
  styles,
  colors,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  text: string;
  onPress?: () => void;
  styles: ReturnType<typeof createStyles>;
  colors: Palette;
}) {
  const Wrapper: any = onPress ? TouchableOpacity : View;
  return (
    <Wrapper style={styles.notice} onPress={onPress} activeOpacity={0.8}>
      <Ionicons name={icon} size={17} color={colors.yonnDeep} />
      <Text style={styles.noticeText}>{text}</Text>
    </Wrapper>
  );
}

const createStyles = (c: Palette, isDark: boolean) => {
  const e = makeElevation(c, isDark);
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.canvas },

    loadingOverlay: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      alignItems: 'center',
      justifyContent: 'center',
    },
    loadingPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      backgroundColor: c.surface,
      borderRadius: Radii.pill,
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.sm,
      ...e.floating,
    },
    loadingText: { fontFamily: Fonts.bodyMedium, fontSize: 13, color: c.inkMuted },

    topBar: { paddingHorizontal: Spacing.lg, gap: Spacing.sm },

    greeting: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      alignSelf: 'flex-start',
      backgroundColor: c.surface,
      borderRadius: Radii.pill,
      paddingLeft: 4,
      paddingRight: Spacing.md,
      paddingVertical: 4,
      ...e.control,
    },
    greetingAvatar: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: c.yonnTint,
      alignItems: 'center',
      justifyContent: 'center',
    },
    greetingInitials: { fontFamily: Fonts.bodySemi, fontSize: 12, color: c.yonnDark },
    greetingText: { fontFamily: Fonts.bodySemi, fontSize: 14, color: c.ink },

    navHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
    navClose: {
      width: 38,
      height: 38,
      borderRadius: Radii.pill,
      backgroundColor: c.surface,
      alignItems: 'center',
      justifyContent: 'center',
      ...e.control,
    },

    notice: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      backgroundColor: c.yonnTint,
      borderRadius: Radii.md,
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.sm,
    },
    noticeText: { flex: 1, fontFamily: Fonts.bodyMedium, fontSize: 12, color: c.yonnDeep },

    // Carte affichée quand la position est indisponible, avec l'action qui
    // débloque la situation (autoriser, ou ouvrir les Réglages).
    blocker: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: Spacing.md,
      backgroundColor: c.surface,
      borderRadius: Radii.lg,
      padding: Spacing.md,
      ...e.floating,
    },
    blockerIcon: {
      width: 40,
      height: 40,
      borderRadius: Radii.md,
      backgroundColor: c.yonnTint,
      alignItems: 'center',
      justifyContent: 'center',
    },
    blockerText: { fontFamily: Fonts.bodyMedium, fontSize: 14, color: c.ink, lineHeight: 20 },
    blockerButton: {
      alignSelf: 'flex-start',
      backgroundColor: c.yonn,
      borderRadius: Radii.sm,
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.sm,
      marginTop: Spacing.sm,
    },
    blockerButtonText: { fontFamily: Fonts.bodySemi, fontSize: 13, color: c.canvas },

    waitingBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      backgroundColor: c.surface,
      borderRadius: Radii.lg,
      padding: Spacing.md,
      ...e.floating,
    },
    waitingText: { flex: 1, fontFamily: Fonts.bodyMedium, fontSize: 14, color: c.inkMuted },

    pin: {
      width: 28,
      height: 28,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2.5,
      borderColor: c.surface,
    },
    originPin: {
      width: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: c.surface,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 3,
      borderColor: c.yonn,
    },
    originPinDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: c.yonn },
    destinationPin: {
      width: 30,
      height: 30,
      borderRadius: 15,
      backgroundColor: c.ink,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2.5,
      borderColor: c.surface,
    },
    callout: { minWidth: 150, padding: Spacing.xs },
    calloutTitle: { fontFamily: Fonts.bodySemi, fontSize: 13, color: '#101828' },
    calloutLines: { fontFamily: Fonts.body, fontSize: 11, color: '#475467', marginTop: 2 },

    locateButton: {
      position: 'absolute',
      right: Spacing.lg,
      width: 44,
      height: 44,
      borderRadius: Radii.pill,
      backgroundColor: c.surface,
      alignItems: 'center',
      justifyContent: 'center',
      ...e.control,
    },
    // Suivi actif : le bouton s'éteint visuellement, il n'y a rien à recentrer.
    locateButtonActive: { backgroundColor: c.yonnTint },

    searchBar: {
      position: 'absolute',
      left: Spacing.lg,
      right: Spacing.lg,
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      backgroundColor: c.surface,
      borderRadius: Radii.lg,
      paddingHorizontal: Spacing.sm,
      paddingVertical: Spacing.sm,
      ...e.floating,
    },
    searchIcon: {
      width: 38,
      height: 38,
      borderRadius: Radii.md,
      backgroundColor: c.yonnTint,
      alignItems: 'center',
      justifyContent: 'center',
    },
    searchTitle: { fontFamily: Fonts.bodySemi, fontSize: 15, color: c.ink },
    searchSubtitle: { fontFamily: Fonts.body, fontSize: 12, color: c.inkFaint, marginTop: 1 },

    sheet: {
      position: 'absolute',
      left: Spacing.lg,
      right: Spacing.lg,
      maxHeight: 400,
      backgroundColor: c.surface,
      borderRadius: Radii.xl,
      paddingHorizontal: Spacing.lg,
      paddingTop: Spacing.sm,
      paddingBottom: Spacing.md,
      ...e.floating,
    },
    sheetHandle: {
      alignSelf: 'center',
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: c.line,
      marginBottom: Spacing.md,
    },
    sheetScroll: { marginTop: Spacing.md },
    sheetScrollContent: { paddingBottom: Spacing.xs },

    tripStats: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: c.canvas,
      borderRadius: Radii.md,
      paddingVertical: Spacing.sm,
    },
    stat: { flex: 1, alignItems: 'center' },
    statDivider: { width: 1, height: 26, backgroundColor: c.line },
    statValue: { fontFamily: Fonts.displaySemi, fontSize: 16, color: c.ink },
    statLabel: { fontFamily: Fonts.body, fontSize: 11, color: c.inkFaint, marginTop: 2 },

    arrivedBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      backgroundColor: c.yonnTint,
      borderRadius: Radii.md,
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.sm,
      marginTop: Spacing.sm,
    },
    arrivedText: { fontFamily: Fonts.bodySemi, fontSize: 13, color: c.yonnDeep },

    endButton: {
      height: 46,
      borderRadius: Radii.md,
      backgroundColor: c.fill,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: Spacing.sm,
    },
    endButtonDone: { backgroundColor: c.yonn },
    endButtonText: { fontFamily: Fonts.bodySemi, fontSize: 14, color: c.ink },
    endButtonTextDone: { color: c.canvas },
  });
};
