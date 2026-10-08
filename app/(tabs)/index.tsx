import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Linking,
  Platform,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MapView, { Marker, Callout, Polyline, Region } from '../../components/map/AppMap';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';

import TripSteps from '../../components/trip/TripSteps';
import NavigationBanner from '../../components/trip/NavigationBanner';
import {
  computeNavigation,
  formatMeters,
  NavigationState,
  pathLengthM,
  rerouteDecision,
  walkMinutesFor,
} from '../../services/navigation';
import { planJourney } from '../../services/journey';
import { slicePath } from '../../services/geometry';
import { walkingRoute } from '../../services/roadPath';
import {
  dismissGuidanceNotifications,
  notifyArrived,
  notifyPrepareToAlight,
} from '../../services/guidanceNotifications';
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
import { getNetworkStops } from '../../services/transit';
import { MapPlace, PLACE_CATEGORIES, placesInRegion } from '../../services/mapPlaces';
import { clearLastTrip } from '../../services/offlineCache';
import { LatLng, Stop, TripSegment } from '../../types/transit';
import { initialsOf } from '../../utils/text';

// Niveau de zoom pendant le guidage : assez serré pour voir la rue suivante.
const NAVIGATION_ZOOM = 16.5;
// Hors guidage : zone visible autour de l'utilisateur (≈ 1,5 km de côté).
const BROWSING_DELTA = 0.015;
// Apple Plans (iOS) ignore `zoom` et ne connaît que l'altitude de la caméra,
// en mètres : sans elle, le guidage restait sur la vue d'ensemble du trajet
// au lieu de zoomer sur l'utilisateur. Équivalents approximatifs des zooms
// ci-dessus ; chaque plateforme ignore la valeur qui ne la concerne pas.
const NAVIGATION_ALTITUDE = 700;
const KEEP_AWAKE_TAG = 'yoonbi-guidance';
// Distance à laquelle prévenir avant de descendre — le même rayon que la
// marche de correspondance (voir services/routing.ts). Dès qu'il ne reste
// plus qu'un arrêt, on prévient un peu plus tôt, dans la limite du second.
const PREPARE_ALIGHT_RADIUS_M = 400;
const PREPARE_ALIGHT_LAST_STOP_M = 800;
// Délai minimal entre deux recalculs (quand recalculer : voir
// `rerouteDecision` dans services/navigation.ts).
const REROUTE_COOLDOWN_MS = 30000;

// Chemin déjà parcouru : grisé, comme sur un GPS, pour que le reste ressorte.
// Assez clair en mode sombre pour ne pas se confondre avec les routes.
const TRAVELED_LIGHT = '#B9C0CA';
const TRAVELED_DARK = '#8A94A3';
// Marche à venir : en points, d'une couleur neutre et très contrastée (ardoise
// sur carte claire, presque blanc sur carte sombre). Jamais en bleu : le bleu
// est la couleur de Dakar Dem Dikk, et l'on confondait « marcher » avec
// « prendre un DDD ». Des traits courts aux bouts arrondis se rejoignaient en
// un boudin informe ; un tiret quasi nul arrondi dessine un point rond.
const WALK_LIGHT = '#344054';
const WALK_DARK = '#F2F4F7';
const WALK_DOTS = [1, 11];

// Tracé minimal (deux fois le même point) d'une couche momentanément vide.
function hiddenPath(segment: TripSegment): LatLng[] {
  const start = segment.path[0];
  return [start, start];
}

type RouteLayer = {
  segment: TripSegment;
  current: boolean;
  traveled: LatLng[] | null;
  ahead: LatLng[] | null;
};

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
    text: 'Autorisez la localisation pour voir où vous êtes et les arrêts autour de vous.',
    action: 'Autoriser',
  },
  // Dans un navigateur, l'autorisation se rétablit depuis l'icône à gauche de
  // l'adresse du site — il n'y a pas de Réglages à ouvrir.
  denied:
    Platform.OS === 'web'
      ? {
          icon: 'location-outline',
          text: 'Yoonbi n’a pas accès à votre position. Autorisez-la depuis l’icône à gauche de l’adresse du site, puis réessayez.',
          action: 'Réessayer',
        }
      : {
          icon: 'location-outline',
          text: 'Yoonbi n’a pas accès à votre position. Activez-la dans les Réglages pour être guidé.',
          action: 'Ouvrir les Réglages',
        },
  'services-off': {
    icon: 'cellular-outline',
    text: 'La localisation de votre téléphone est coupée. Activez-la dans Réglages › Confidentialité.',
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
  const {
    activeTrip,
    activeTripId,
    setActiveTrip,
    updateActivePlan,
    clearActiveTrip: clearActiveTripRaw,
    resumableTrip,
    resumeLastTrip,
    dismissResumableTrip,
  } = useTrip();
  const { status, position, precise, request } = useUserLocation();
  const mapRef = useRef<MapView>(null);

  const [stops, setStops] = useState<Stop[]>([]);
  // Portion de carte visible : décide quels lieux (restaurants, mairies…)
  // afficher, selon le zoom.
  const [region, setRegion] = useState<Region>(DAKAR_REGION);
  const places = useMemo(() => placesInRegion(region, stops), [region, stops]);
  const [stopsError, setStopsError] = useState(false);
  // Le détail étape par étape reste replié par défaut pendant le guidage :
  // la carte doit rester l'élément principal à l'écran, pas la liste.
  const [stepsExpanded, setStepsExpanded] = useState(false);

  // État du guidage, recalculé à chaque position (voir services/navigation.ts).
  const [nav, setNav] = useState<NavigationState | null>(null);
  // L'avancement doit être monotone : on garde la dernière étape atteinte,
  // et le chemin déjà parcouru sur son tracé (valable pour CE tracé-là : s'il
  // est remplacé — rues suivies, chemin recalculé — on repart de sa projection).
  const stepIndexRef = useRef(0);
  const progressRef = useRef<{ path: LatLng[] | null; along: number }>({ path: null, along: 0 });
  // Un recalcul en cours de route remplace le trajet sans recadrer la carte :
  // la caméra continue de suivre l'utilisateur.
  const keepCameraRef = useRef(false);
  // Notifications de guidage déjà envoyées pour le trajet en cours — pour ne
  // prévenir qu'une fois par étape, pas à chaque position reçue.
  const notifiedTripKeyRef = useRef<string | null>(null);
  const preparedAlightRef = useRef<Set<number>>(new Set());
  const arrivedNotifiedRef = useRef(false);
  // La caméra suit l'utilisateur, jusqu'à ce qu'il déplace la carte lui-même.
  const [following, setFollowing] = useState(false);

  const hasFix = !!position;

  // On arrête le guidage à la demande de l'utilisateur (bouton « Arrêter »
  // ou « Terminer ») : dans les deux cas, on efface aussi les notifications
  // qui pourraient encore traîner dans le centre de notifications.
  const clearActiveTrip = useCallback(() => {
    dismissGuidanceNotifications();
    clearActiveTripRaw();
  }, [clearActiveTripRaw]);

  // Tout le réseau, chargé une fois (et repris de la copie hors ligne sans
  // connexion) : les mêmes arrêts sur tous les appareils, où qu'ils soient.
  const loadStops = useCallback(async () => {
    try {
      setStops(await getNetworkStops());
      setStopsError(false);
    } catch {
      setStopsError(true);
    }
  }, []);

  useEffect(() => {
    loadStops();
  }, [loadStops]);

  // La carte est l'endroit où la demande d'autorisation a du sens : on la
  // déclenche une seule fois, à la première ouverture.
  const askedRef = useRef(false);
  useEffect(() => {
    if (status === 'needs-permission' && !askedRef.current) {
      askedRef.current = true;
      request();
    }
  }, [status, request]);

  // Première position reçue : on centre la carte sur l'utilisateur — une fois
  // la carte prête, sinon iOS ignore l'animation et la carte reste sur la vue
  // d'ensemble de Dakar, le point bleu dans un coin.
  const centeredRef = useRef(false);
  const [mapReady, setMapReady] = useState(false);
  useEffect(() => {
    if (!mapReady || !position || centeredRef.current || activeTrip) return;
    centeredRef.current = true;
    mapRef.current?.animateToRegion(
      {
        latitude: position.latitude,
        longitude: position.longitude,
        latitudeDelta: BROWSING_DELTA,
        longitudeDelta: BROWSING_DELTA,
      },
      600
    );
  }, [mapReady, position, activeTrip]);

  // Pendant le guidage, l'écran ne doit pas se verrouiller : une fois éteint,
  // l'app est suspendue et le guide cesserait de suivre l'utilisateur.
  useEffect(() => {
    if (!activeTrip) return;
    activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => {});
    return () => {
      deactivateKeepAwake(KEEP_AWAKE_TAG).catch(() => {});
    };
  }, [activeTrip]);

  // Départ d'un NOUVEAU trajet : on montre l'itinéraire en entier une fois,
  // puis la caméra se met à suivre l'utilisateur. Volontairement lié à
  // `activeTripId` et pas au trajet lui-même : quand son tracé est précisé en
  // cours de route, le guidage ne doit ni repartir de zéro ni recadrer.
  const activeTripRef = useRef(activeTrip);
  activeTripRef.current = activeTrip;
  useEffect(() => {
    stepIndexRef.current = 0;
    progressRef.current = { path: null, along: 0 };
    setStepsExpanded(false);
    const trip = activeTripRef.current;
    if (!trip) {
      setNav(null);
      setFollowing(false);
      return;
    }
    if (keepCameraRef.current) {
      keepCameraRef.current = false;
      setFollowing(true);
      return;
    }
    const coords = trip.plan.segments.flatMap((s) => s.path);
    if (coords.length > 0) {
      mapRef.current?.fitToCoordinates(coords, {
        edgePadding: { top: 160, right: 56, bottom: 360, left: 56 },
        animated: true,
      });
    }
    const timer = setTimeout(() => setFollowing(true), 1600);
    return () => clearTimeout(timer);
  }, [activeTripId]);

  // Le cœur du guidage : à chaque position, on recalcule l'étape en cours,
  // la distance jusqu'à la prochaine action et le temps restant, en tenant
  // compte de la précision réelle du GPS.
  useEffect(() => {
    if (!activeTrip || !position) return;
    const segments = activeTrip.plan.segments;
    const previous = progressRef.current;
    const previousAlong =
      previous.path !== null && previous.path === segments[stepIndexRef.current]?.path ? previous.along : 0;
    const next = computeNavigation(
      activeTrip.plan,
      position,
      activeTrip.destination,
      stepIndexRef.current,
      position.accuracy,
      previousAlong
    );
    stepIndexRef.current = next.stepIndex;
    progressRef.current = { path: segments[next.stepIndex]?.path ?? null, along: next.alongM };
    setNav(next);
  }, [position, activeTrip]);

  // Rappels de guidage : un seul par étape, jamais un doublon à chaque
  // position reçue. On repart de zéro à chaque nouveau trajet — pas quand
  // son tracé est simplement précisé.
  useEffect(() => {
    if (!activeTrip) return;
    const key = String(activeTripId);
    if (notifiedTripKeyRef.current !== key) {
      notifiedTripKeyRef.current = key;
      preparedAlightRef.current = new Set();
      arrivedNotifiedRef.current = false;
    }
  }, [activeTrip, activeTripId]);

  // --- Recalcul d'itinéraire -------------------------------------------------
  // Comme un GPS, jusqu'à l'arrivée :
  // - à pied, un écart durable recalcule le chemin jusqu'à l'arrêt visé — ou
  //   le trajet entier s'il est devenu trop loin pour y revenir à pied ;
  // - en bus, un détour ne déclenche rien (le guidage reprend dès que le bus
  //   retrouve son trajet) ; seul un bus qui s'éloigne durablement de l'arrêt
  //   de descente fait recalculer le trajet depuis la position actuelle ;
  // - à tout moment, l'utilisateur peut recalculer d'un geste.
  const offRouteSinceRef = useRef<number | null>(null);
  // Distance à l'arrêt de descente au début de l'écart, pour savoir si le bus
  // s'en rapproche malgré le détour ou s'il part ailleurs.
  const offRouteStartDistRef = useRef(0);
  const offRouteStepRef = useRef(-1);
  const lastRerouteRef = useRef(0);
  const [rerouting, setRerouting] = useState(false);
  const [rerouteNotice, setRerouteNotice] = useState<string | null>(null);

  // Le téléphone n'envoie une position qu'après quelques mètres parcourus :
  // quelqu'un qui s'arrête hors du chemin n'en recevrait plus, et le délai
  // avant recalcul ne serait jamais réévalué. Tant qu'on est hors itinéraire,
  // on revérifie donc à intervalle régulier.
  const [offRouteTick, setOffRouteTick] = useState(0);
  const isOffRoute = !!nav?.offRoute && !nav.arrived;
  useEffect(() => {
    if (!isOffRoute) return;
    const timer = setInterval(() => setOffRouteTick((t) => t + 1), 2000);
    return () => clearInterval(timer);
  }, [isOffRoute]);

  const replanFromHere = useCallback(async (reason?: string) => {
    const trip = activeTripRef.current;
    if (!trip || !position || rerouting) return;
    lastRerouteRef.current = Date.now();
    setRerouting(true);
    try {
      const result = await planJourney({ position }, trip.destination);
      if (activeTripRef.current !== trip) return; // guidage arrêté entre-temps
      if (result.status === 'ok') {
        keepCameraRef.current = true;
        setActiveTrip({ origin: result.origin, destination: trip.destination, plan: result.options[0].plan });
        setRerouteNotice(reason ? `${reason} — nouvel itinéraire` : 'Nouvel itinéraire depuis votre position');
      } else if (result.status === 'no-service') {
        setRerouteNotice(result.message);
      } else {
        setRerouteNotice('Aucun autre trajet trouvé depuis ici');
      }
    } catch {
      setRerouteNotice('Recalcul impossible pour le moment');
    } finally {
      setRerouting(false);
    }
  }, [position, rerouting, setActiveTrip]);

  useEffect(() => {
    const trip = activeTripRef.current;
    if (!trip || !nav || !position || nav.arrived) return;
    if (!nav.offRoute) {
      offRouteSinceRef.current = null;
      return;
    }
    const now = Date.now();
    // Un écart se mesure étape par étape : la distance de référence n'a de
    // sens que vers le point visé par l'étape en cours.
    if (offRouteSinceRef.current === null || offRouteStepRef.current !== nav.stepIndex) {
      offRouteSinceRef.current = now;
      offRouteStepRef.current = nav.stepIndex;
      offRouteStartDistRef.current = nav.distanceToNextM;
    }
    const segment = trip.plan.segments[nav.stepIndex];
    if (!segment || rerouting || now - lastRerouteRef.current < REROUTE_COOLDOWN_MS) return;

    const decision = rerouteDecision(
      nav,
      segment.type,
      now - offRouteSinceRef.current,
      nav.distanceToNextM - offRouteStartDistRef.current
    );
    if (decision.action === 'replan') {
      replanFromHere(decision.reason);
      return;
    }
    if (decision.action !== 'walk' || segment.type !== 'walk') return;

    const target = segment.path[segment.path.length - 1];
    lastRerouteRef.current = now;
    setRerouting(true);
    const stepIndex = nav.stepIndex;
    walkingRoute(position, target)
      .then((routed) => {
        const current = activeTripRef.current;
        if (!routed || !current || current !== trip) return;
        const segments = current.plan.segments.map((s, i) =>
          i === stepIndex && s.type === 'walk'
            ? { ...s, path: routed.path, maneuvers: routed.maneuvers, minutes: walkMinutesFor(pathLengthM(routed.path)) }
            : s
        );
        updateActivePlan({ ...current.plan, segments });
        offRouteSinceRef.current = null;
        setRerouteNotice('Chemin recalculé');
      })
      .finally(() => setRerouting(false));
  }, [nav, position, rerouting, updateActivePlan, replanFromHere, offRouteTick]);

  // Le message de recalcul s'efface tout seul.
  useEffect(() => {
    if (!rerouteNotice) return;
    const timer = setTimeout(() => setRerouteNotice(null), 4000);
    return () => clearTimeout(timer);
  }, [rerouteNotice]);

  useEffect(() => {
    if (!activeTrip || !nav) return;
    const segment = activeTrip.plan.segments[nav.stepIndex];
    const nearAlight =
      nav.distanceToNextM <= PREPARE_ALIGHT_RADIUS_M ||
      (nav.stopsRemaining === 1 && nav.distanceToNextM <= PREPARE_ALIGHT_LAST_STOP_M);
    if (
      segment?.type === 'ride' &&
      // Pas tant qu'on attend encore le bus à l'arrêt de montée.
      nav.instruction.kind === 'ride' &&
      nearAlight &&
      !preparedAlightRef.current.has(nav.stepIndex)
    ) {
      preparedAlightRef.current.add(nav.stepIndex);
      notifyPrepareToAlight(segment.alightStopName);
    }
    if (nav.arrived && !arrivedNotifiedRef.current) {
      arrivedNotifiedRef.current = true;
      notifyArrived(activeTrip.destination.name);
      // Arrivé : ce trajet ne doit plus être proposé à la reprise, même si
      // l'app est fermée sans appuyer sur « Terminer ».
      clearLastTrip();
    }
  }, [nav, activeTrip]);

  // Caméra qui suit, comme un GPS, tant que l'utilisateur n'a pas déplacé la
  // carte lui-même.
  useEffect(() => {
    if (!activeTrip || !following || !position) return;
    mapRef.current?.animateCamera(
      {
        center: { latitude: position.latitude, longitude: position.longitude },
        zoom: NAVIGATION_ZOOM,
        altitude: NAVIGATION_ALTITUDE,
        // La carte s'oriente dans le sens de la marche, comme un GPS.
        ...(position.heading != null ? { heading: position.heading } : {}),
        pitch: 45,
      },
      { duration: 700 }
    );
  }, [position, following, activeTrip]);

  // « Y aller » depuis un lieu de la carte : l'itinéraire s'ouvre avec ce
  // lieu déjà choisi comme destination, le départ étant la position actuelle.
  const goToPlace = (place: MapPlace) => {
    router.push({
      pathname: '/(modals)/itinerary',
      params: {
        destId: place.id,
        destName: place.name,
        destLat: String(place.latitude),
        destLng: String(place.longitude),
        destCategory: place.category,
        destSubtitle: place.subtitle ?? '',
      },
    });
  };

  const recenter = () => {
    if (!position) {
      request();
      return;
    }
    if (activeTrip) {
      // En guidage, la caméra de suivi (plus haut) prend le relais.
      setFollowing(true);
      return;
    }
    // Hors guidage : une zone d'environ 1,5 km autour de l'utilisateur — de
    // quoi voir les arrêts et les lieux proches. Par zone plutôt que par
    // caméra : sur iOS, la caméra combinant zoom et altitude dézoomait.
    mapRef.current?.animateToRegion(
      {
        latitude: position.latitude,
        longitude: position.longitude,
        latitudeDelta: BROWSING_DELTA,
        longitudeDelta: BROWSING_DELTA,
      },
      500
    );
  };

  // Découpe du tracé à la position de l'utilisateur : ce qui est fait d'un
  // côté, ce qui reste de l'autre.
  const navStep = nav?.stepIndex ?? -1;
  const navAlong = nav?.alongM ?? 0;
  const routeLayers = useMemo(() => {
    if (!activeTrip) return [];
    return activeTrip.plan.segments.map((segment, index): RouteLayer => {
      if (index < navStep) return { segment, current: false, traveled: segment.path, ahead: null };
      if (index > navStep) return { segment, current: false, traveled: null, ahead: segment.path };
      const length = pathLengthM(segment.path);
      const along = Math.min(navAlong, length);
      return {
        segment,
        current: true,
        traveled: along >= 1 ? slicePath(segment.path, 0, along) : null,
        ahead: along < length ? slicePath(segment.path, along, length) : null,
      };
    });
  }, [activeTrip, navStep, navAlong]);

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
        onRegionChangeComplete={setRegion}
        onMapReady={() => setMapReady(true)}
      >
        {!activeTrip &&
          stops.map((stop) => (
            // Les arrêts passent toujours au-dessus des lieux.
            <Marker key={stop.id} coordinate={stop} anchor={{ x: 0.5, y: 0.5 }} zIndex={10}>
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

        {/* Lieux utiles (OpenStreetMap) : pastille claire et icône colorée,
            pour ne jamais être confondus avec un arrêt (pastille pleine). */}
        {!activeTrip &&
          places.map((place) => {
            const meta = PLACE_CATEGORIES[place.category];
            return (
              <Marker key={place.id} coordinate={place} anchor={{ x: 0.5, y: 0.5 }} zIndex={1}>
                <View style={[styles.placePin, { backgroundColor: meta.color }]}>
                  <MaterialCommunityIcons name={meta.icon} size={12} color="#FFFFFF" />
                </View>
                <Callout onPress={() => goToPlace(place)}>
                  <View style={styles.callout}>
                    <Text style={styles.calloutTitle}>{place.name}</Text>
                    <Text style={styles.calloutLines}>{meta.label}</Text>
                    <Text style={styles.calloutAction}>Y aller ›</Text>
                  </View>
                </Callout>
              </Marker>
            );
          })}

        {activeTrip && (
          <>
            {/* Trois couches par étape, toujours montées et dans le même ordre :
                Apple Plans empile les tracés dans l'ordre où ils sont AJOUTÉS
                (pas l'ordre React). Un liseré ajouté en cours de route
                recouvrait la ligne colorée ; on met donc à jour les couches
                sans jamais en ajouter. Une couche vide est rendue invisible ;
                un nouveau trajet (recalcul) remonte toutes les couches d'un coup. */}
            {routeLayers.map(({ segment, traveled }, index) => (
              <Polyline
                key={`${activeTripId}-done-${index}`}
                coordinates={traveled ?? hiddenPath(segment)}
                strokeColor={traveled ? (isDark ? TRAVELED_DARK : TRAVELED_LIGHT) : 'transparent'}
                strokeWidth={6}
                lineDashPattern={segment.type === 'walk' ? WALK_DOTS : undefined}
                lineCap="round"
                zIndex={1}
              />
            ))}
            {routeLayers.map(({ segment, ahead, current }, index) => (
              <Polyline
                key={`${activeTripId}-casing-${index}`}
                coordinates={ahead ?? hiddenPath(segment)}
                // Liseré blanc sous chaque bus à venir : une ligne bleu foncé
                // (DDD) ou orange (AFTU) reste lisible sur toutes les cartes.
                strokeColor={ahead && segment.type === 'ride' ? '#FFFFFF' : 'transparent'}
                strokeWidth={current ? 13 : 10}
                lineCap="round"
                zIndex={2}
              />
            ))}
            {routeLayers.map(({ segment, ahead, current }, index) => (
              <Polyline
                key={`${activeTripId}-ahead-${index}`}
                coordinates={ahead ?? hiddenPath(segment)}
                strokeColor={
                  !ahead
                    ? 'transparent'
                    : segment.type === 'ride'
                      ? segment.lineColor
                      : isDark
                        ? WALK_DARK
                        : WALK_LIGHT
                }
                strokeWidth={segment.type === 'walk' ? (current ? 8 : 6) : current ? 9 : 6}
                lineDashPattern={segment.type === 'walk' ? WALK_DOTS : undefined}
                lineCap="round"
                zIndex={3}
              />
            ))}

            {/* Prochaine action, épinglée sur la carte : où monter, où descendre. */}
            {nav && !nav.arrived && activeTrip.plan.segments[nav.stepIndex] && (
              <Marker
                coordinate={
                  activeTrip.plan.segments[nav.stepIndex].path[
                    activeTrip.plan.segments[nav.stepIndex].path.length - 1
                  ]
                }
                anchor={{ x: 0.5, y: 1 }}
              >
                <View style={styles.actionPin}>
                  <Text style={styles.actionPinText} numberOfLines={1}>
                    {(() => {
                      const seg = activeTrip.plan.segments[nav.stepIndex];
                      return seg.type === 'ride'
                        ? `Descendez à ${seg.alightStopName}`
                        : `Rejoignez ${seg.toStopName}`;
                    })()}
                  </Text>
                </View>
              </Marker>
            )}

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
            <Text style={styles.loadingText}>Recherche de votre position…</Text>
          </View>
        </View>
      )}

      <View style={[styles.topBar, { paddingTop: insets.top + Spacing.sm }]} pointerEvents="box-none">
        {activeTrip ? (
          <View style={styles.navHeader}>
            <View style={{ flex: 1 }}>
              {nav ? (
                <NavigationBanner
                  nav={nav}
                  notice={rerouteNotice}
                  rerouting={rerouting}
                  onReplan={replanFromHere}
                />
              ) : (
                <View style={styles.waitingBanner}>
                  <ActivityIndicator color={c.yonn} size="small" />
                  <Text style={styles.waitingText}>En attente du signal GPS pour vous guider…</Text>
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

        {!activeTrip && resumableTrip && (
          <View style={styles.resumeCard}>
            <View style={styles.resumeIcon}>
              <Ionicons name="play-back" size={16} color={c.yonnDeep} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.resumeTitle}>Trajet interrompu</Text>
              <Text style={styles.resumeText} numberOfLines={1}>
                {resumableTrip.origin.name} → {resumableTrip.destination.name}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.resumeDismiss}
              onPress={dismissResumableTrip}
              accessibilityRole="button"
              accessibilityLabel="Ignorer"
            >
              <Ionicons name="close" size={16} color={c.inkFaint} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.resumeButton}
              onPress={resumeLastTrip}
              accessibilityRole="button"
            >
              <Text style={styles.resumeButtonText}>Reprendre</Text>
            </TouchableOpacity>
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
          { bottom: sheetBottom + (activeTrip ? (stepsExpanded ? 320 : 170) : 76) },
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
          <TouchableOpacity
            style={styles.sheetHandleWrap}
            onPress={() => setStepsExpanded((v) => !v)}
            accessibilityRole="button"
            accessibilityLabel={stepsExpanded ? 'Masquer les étapes' : 'Voir les étapes'}
          >
            <View style={styles.sheetHandle} />
          </TouchableOpacity>

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
              value={
                activeTrip.plan.totalFareFcfa > 0
                  ? `${activeTrip.plan.fareEstimated ? '≈ ' : ''}${activeTrip.plan.totalFareFcfa} F`
                  : 'Gratuit'
              }
              label="prix"
              color={c.yonnDark}
            />
          </View>

          {arrived && (
            <View style={styles.arrivedBanner}>
              <Ionicons name="checkmark-circle" size={17} color={c.yonnDeep} />
              <Text style={styles.arrivedText}>Vous êtes arrivé à destination</Text>
            </View>
          )}

          <TouchableOpacity
            style={styles.stepsToggle}
            onPress={() => setStepsExpanded((v) => !v)}
            activeOpacity={0.7}
            accessibilityRole="button"
          >
            <Text style={styles.stepsToggleText}>
              {stepsExpanded
                ? 'Masquer les étapes'
                : `Voir les étapes · ${activeTrip.plan.segments.length + 1}`}
            </Text>
            <Ionicons
              name={stepsExpanded ? 'chevron-up' : 'chevron-down'}
              size={16}
              color={c.inkMuted}
            />
          </TouchableOpacity>

          {stepsExpanded && (
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
          )}

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
    resumeCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      backgroundColor: c.surface,
      borderRadius: Radii.lg,
      padding: Spacing.sm,
      marginBottom: Spacing.sm,
      ...e.floating,
    },
    resumeIcon: {
      width: 32,
      height: 32,
      borderRadius: Radii.md,
      backgroundColor: c.yonnTint,
      alignItems: 'center',
      justifyContent: 'center',
    },
    resumeTitle: { fontFamily: Fonts.bodySemi, fontSize: 12, color: c.ink },
    resumeText: { fontFamily: Fonts.body, fontSize: 11, color: c.inkMuted, marginTop: 1 },
    resumeDismiss: { padding: Spacing.xs },
    resumeButton: {
      backgroundColor: c.yonn,
      borderRadius: Radii.pill,
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.sm,
    },
    resumeButtonText: { fontFamily: Fonts.bodySemi, fontSize: 12, color: c.canvas },
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

    // Arrêts : l'élément principal de la carte — plus grands, bien détourés.
    pin: {
      width: 26,
      height: 26,
      borderRadius: 13,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
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
    actionPin: {
      maxWidth: 220,
      backgroundColor: c.ink,
      borderRadius: 12,
      paddingHorizontal: 10,
      paddingVertical: 6,
      marginBottom: 6,
    },
    actionPinText: { fontFamily: Fonts.bodySemi, fontSize: 12, color: c.canvas },
    callout: { minWidth: 150, padding: Spacing.xs },
    calloutTitle: { fontFamily: Fonts.bodySemi, fontSize: 13, color: '#101828' },
    calloutLines: { fontFamily: Fonts.body, fontSize: 11, color: '#475467', marginTop: 2 },
    calloutAction: { fontFamily: Fonts.bodySemi, fontSize: 12, color: '#027A48', marginTop: 6 },
    // Lieux : petits, discrets, en retrait des arrêts (l'essentiel de Yoonbi).
    // Lieux : petite pastille pleine, couleur de la catégorie, un peu
    // transparente — lisible, mais en retrait des arrêts.
    placePin: {
      width: 20,
      height: 20,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1.5,
      borderColor: '#FFFFFF',
      opacity: 0.9,
    },

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
      // Replié (par défaut), le panneau ne prend que la place de ses stats
      // + le bouton : la carte reste l'élément principal. Cette limite ne
      // joue que si l'utilisateur ouvre lui-même le détail des étapes.
      maxHeight: 400,
      backgroundColor: c.surface,
      borderRadius: Radii.xl,
      paddingHorizontal: Spacing.lg,
      paddingTop: Spacing.sm,
      paddingBottom: Spacing.md,
      ...e.floating,
    },
    sheetHandleWrap: { paddingVertical: Spacing.xs, marginTop: -Spacing.xs },
    sheetHandle: {
      alignSelf: 'center',
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: c.line,
    },
    stepsToggle: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
      paddingVertical: Spacing.sm,
      marginTop: Spacing.xs,
    },
    stepsToggleText: { fontFamily: Fonts.bodySemi, fontSize: 13, color: c.inkMuted },
    sheetScroll: { marginTop: Spacing.xs, maxHeight: 220 },
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
