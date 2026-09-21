import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import ScreenHeader from '../../components/ui/ScreenHeader';
import PrimaryButton from '../../components/ui/PrimaryButton';
import { Fonts, Radii, Spacing, Palette } from '../../constants/theme';
import { useColors } from '../../store/ThemeContext';
import { getNearbyStops, getRouteGraph, searchStops } from '../../services/transit';
import { searchPlaces } from '../../services/places';
import {
  buildRouteGraph,
  pickBestOptions,
  planFromPosition,
  planTripOptions,
  RouteGraph,
  USER_POSITION_ID,
  withEgressWalk,
} from '../../services/routing';
import { useUserLocation } from '../../store/LocationContext';
import { useTrip } from '../../store/TripContext';
import { Stop, TripPlan } from '../../types/transit';
import { formatDistance } from '../../utils/eta';

// Le graphe du réseau ne change pas pendant une session : on le garde en
// mémoire pour ne pas le recharger à chaque recherche.
let cachedGraph: RouteGraph | null = null;

type Field = 'origin' | 'destination';
type Outcome = 'none' | 'no-path' | 'same-stop' | 'error' | 'no-location';

const OUTCOME_MESSAGE: Record<Exclude<Outcome, 'none'>, string> = {
  'no-path': 'Ces deux arrêts ne sont pas encore reliés dans le réseau Yoonbi.',
  'same-stop': 'Le départ et la destination sont le même arrêt.',
  error: 'Impossible de calculer l’itinéraire. Vérifie ta connexion.',
  'no-location': 'Active la localisation pour partir de ta position exacte.',
};

const PLACE_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  hospital: 'medkit',
  pharmacy: 'medical',
  townhall: 'business',
  market: 'basket',
  school: 'school',
  worship: 'star-outline',
  police: 'shield',
  bank: 'card',
  station: 'train',
  sport: 'football',
  food: 'restaurant',
  hotel: 'bed',
};

function placeIcon(category?: string): keyof typeof Ionicons.glyphMap {
  return (category && PLACE_ICONS[category]) || 'location';
}

export default function ItineraryScreen() {
  const router = useRouter();
  const c = useColors();
  const styles = useMemo(() => createStyles(c), [c]);
  const { setPendingTrip } = useTrip();

  const [origin, setOrigin] = useState<Stop | null>(null);
  const [destination, setDestination] = useState<Stop | null>(null);
  const [originText, setOriginText] = useState('');
  const [destinationText, setDestinationText] = useState('');
  const [activeField, setActiveField] = useState<Field | null>('destination');
  const [results, setResults] = useState<Stop[]>([]);
  const [suggestions, setSuggestions] = useState<Stop[]>([]);
  const [loading, setLoading] = useState(false);
  const [outcome, setOutcome] = useState<Outcome>('none');

  // Position GPS réelle, partagée avec la carte (store/LocationContext).
  const { status: locationStatus, position, request: requestLocation } = useUserLocation();
  // Le départ est « Ma position » : le trajet partira des coordonnées exactes
  // de l'utilisateur, pas d'un arrêt choisi à sa place.
  const [originIsUser, setOriginIsUser] = useState(false);
  const locatingMe = originIsUser && !position;

  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    const text = activeField === 'origin' ? originText : destinationText;
    if (!activeField || !text.trim()) {
      setResults([]);
      return;
    }
    clearTimeout(debounceRef.current);
    // Les lieux (mairie, hôpital…) ne servent que de destination ; Nominatim
    // impose une requête par seconde au plus, d'où l'anti-rebond plus long.
    const withPlaces = activeField === 'destination';
    debounceRef.current = setTimeout(() => {
      Promise.all([
        searchStops(text).catch(() => [] as Stop[]),
        withPlaces ? searchPlaces(text).catch(() => [] as Stop[]) : Promise.resolve([] as Stop[]),
      ]).then(([stopsFound, placesFound]) => setResults([...stopsFound.slice(0, 4), ...placesFound]));
    }, 450);
    return () => clearTimeout(debounceRef.current);
  }, [activeField, originText, destinationText]);

  // Champ vide : on propose les arrêts autour de la position réelle.
  useEffect(() => {
    const text = activeField === 'origin' ? originText : destinationText;
    const around = position ?? (originIsUser ? null : origin);
    if (!activeField || text.trim() || !around) {
      setSuggestions([]);
      return;
    }
    getNearbyStops(around.latitude, around.longitude, 3000)
      .then((s) => setSuggestions(s.filter((x) => x.id !== origin?.id).slice(0, 6)))
      .catch(() => setSuggestions([]));
  }, [activeField, originText, destinationText, origin, originIsUser, position]);

  const useMyPosition = () => {
    if (locationStatus !== 'ready' && locationStatus !== 'locating') {
      // Autorisation manquante : on la demande (ou on ouvre les Réglages).
      requestLocation();
      if (locationStatus === 'denied' || locationStatus === 'services-off') {
        setOutcome('no-location');
      }
      return;
    }
    setOriginIsUser(true);
    setOriginText('Ma position');
    setOutcome('none');
  };

  // Par défaut, on part de là où se trouve l'utilisateur.
  const defaultedRef = useRef(false);
  useEffect(() => {
    if (defaultedRef.current || origin) return;
    if (locationStatus === 'ready' || locationStatus === 'locating') {
      defaultedRef.current = true;
      setOriginIsUser(true);
      setOriginText('Ma position');
    }
  }, [locationStatus, origin]);

  const selectStop = (stop: Stop) => {
    if (activeField === 'origin') {
      setOrigin(stop);
      setOriginText(stop.name);
      setOriginIsUser(false);
      setActiveField(destination ? null : 'destination');
    } else {
      setDestination(stop);
      setDestinationText(stop.name);
      setActiveField(null);
      Keyboard.dismiss();
    }
    setResults([]);
    setOutcome('none');
  };

  const swap = () => {
    // « Ma position » ne peut pas devenir une destination.
    if (originIsUser) {
      setOrigin(destination);
      setOriginText(destinationText);
      setDestination(null);
      setDestinationText('');
      setOriginIsUser(false);
    } else {
      setOrigin(destination);
      setDestination(origin);
      setOriginText(destinationText);
      setDestinationText(originText);
    }
    setOutcome('none');
  };

  const handleSearch = async () => {
    if (!destination) return;
    if (originIsUser && !position) {
      setOutcome('no-location');
      return;
    }
    if (!originIsUser && !origin) return;

    Keyboard.dismiss();
    setActiveField(null);
    setLoading(true);
    setOutcome('none');
    try {
      if (!cachedGraph) cachedGraph = buildRouteGraph(await getRouteGraph());

      let from: Stop;
      let options;

      if (destination.isPlace) {
        // Un lieu n'est pas un arrêt : on vise les arrêts les plus proches de
        // lui, puis on ajoute la marche finale jusqu'à sa porte.
        let exits = await getNearbyStops(destination.latitude, destination.longitude, 1000);
        if (exits.length === 0) {
          exits = await getNearbyStops(destination.latitude, destination.longitude, 2500);
        }
        if (exits.length === 0) {
          setOutcome('no-path');
          return;
        }

        const startCandidates =
          originIsUser && position
            ? await getNearbyStops(position.latitude, position.longitude, 1200).then(async (c) =>
                c.length > 0 ? c : getNearbyStops(position.latitude, position.longitude, 3000)
              )
            : [];

        const plans: TripPlan[] = [];
        for (const exit of exits.slice(0, 3)) {
          const found =
            originIsUser && position
              ? planFromPosition(cachedGraph, position, startCandidates, exit.id)
              : planTripOptions(cachedGraph, origin!.id, exit.id);
          for (const option of found) {
            if (option.plan.segments.length === 0) continue;
            plans.push(withEgressWalk(option.plan, exit, destination));
          }
        }
        options = pickBestOptions(plans);
        from =
          originIsUser && position
            ? { id: USER_POSITION_ID, name: 'Ma position', latitude: position.latitude, longitude: position.longitude }
            : origin!;
      } else if (originIsUser && position) {
        // Départ réel : on compare les arrêts accessibles à pied (d'abord
        // dans un rayon de marche raisonnable, sinon un peu plus loin).
        let candidates = await getNearbyStops(position.latitude, position.longitude, 1200);
        if (candidates.length === 0) {
          candidates = await getNearbyStops(position.latitude, position.longitude, 3000);
        }
        options = planFromPosition(cachedGraph, position, candidates, destination.id);
        // Le départ affiché et enregistré est la position de l'utilisateur.
        from = {
          id: USER_POSITION_ID,
          name: 'Ma position',
          latitude: position.latitude,
          longitude: position.longitude,
        };
      } else {
        options = planTripOptions(cachedGraph, origin!.id, destination.id);
        from = origin!;
        if (options.length > 0 && options[0].plan.segments.length === 0) {
          setOutcome('same-stop');
          return;
        }
      }

      if (options.length === 0) {
        setOutcome('no-path');
        return;
      }

      setPendingTrip({ origin: from, destination, options });
      router.push('/(modals)/choose-trip');
    } catch {
      setOutcome('error');
    } finally {
      setLoading(false);
    }
  };

  const canSearch =
    !!destination &&
    (originIsUser ? !!position : !!origin && origin.id !== destination.id);
  const list = results.length > 0 ? results : suggestions;
  const listIsSuggestions = results.length === 0 && suggestions.length > 0;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScreenHeader title="Itinéraire" action="close" />

      <View style={styles.top}>
        <View style={styles.form}>
          <View style={styles.rail}>
            <View style={styles.railDotOrigin} />
            <View style={styles.railLine} />
            <View style={styles.railDotDestination} />
          </View>

          <View style={styles.fields}>
            <Field
              styles={styles}
              colors={c}
              placeholder="Point de départ"
              value={originText}
              filled={originIsUser ? !!position : !!origin}
              onFocus={() => setActiveField('origin')}
              onChangeText={(t) => {
                setOriginText(t);
                setOriginIsUser(false);
                if (origin) setOrigin(null);
              }}
            />
            <View style={styles.fieldSeparator} />
            <Field
              styles={styles}
              colors={c}
              placeholder="Destination"
              value={destinationText}
              filled={!!destination}
              onFocus={() => setActiveField('destination')}
              onChangeText={(t) => {
                setDestinationText(t);
                if (destination) setDestination(null);
              }}
            />
          </View>

          <TouchableOpacity
            style={styles.swap}
            onPress={swap}
            accessibilityRole="button"
            accessibilityLabel="Inverser départ et destination"
          >
            <Ionicons name="swap-vertical" size={17} color={c.ink} />
          </TouchableOpacity>
        </View>

        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.myPosition}
            onPress={useMyPosition}
            disabled={locatingMe}
            accessibilityRole="button"
          >
            {locatingMe ? (
              <ActivityIndicator size="small" color={c.yonn} />
            ) : (
              <Ionicons name="locate" size={15} color={c.yonn} />
            )}
            <Text style={styles.myPositionText}>Ma position</Text>
          </TouchableOpacity>

          <View style={{ flex: 1 }}>
            <PrimaryButton
              label="Rechercher"
              onPress={handleSearch}
              disabled={!canSearch}
              loading={loading}
            />
          </View>
        </View>

        {outcome !== 'none' && (
          <View style={styles.outcome}>
            <Ionicons name="alert-circle-outline" size={18} color={c.danger} />
            <Text style={styles.outcomeText}>{OUTCOME_MESSAGE[outcome]}</Text>
          </View>
        )}
      </View>

      <ScrollView
        style={styles.list}
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {!!activeField && list.length > 0 && (
          <>
            <Text style={styles.listLabel}>
              {listIsSuggestions ? 'Arrêts autour de toi' : 'Arrêts et lieux'}
            </Text>
            {list.map((stop) => (
              <TouchableOpacity
                key={stop.id}
                style={styles.stopRow}
                activeOpacity={0.7}
                onPress={() => selectStop(stop)}
              >
                <View
                  style={[
                    styles.stopIcon,
                    { backgroundColor: (stop.isPlace ? c.ink : stop.operator_colors?.[0] ?? c.yonn) + '22' },
                  ]}
                >
                  <Ionicons
                    name={stop.isPlace ? placeIcon(stop.category) : 'bus'}
                    size={16}
                    color={stop.isPlace ? c.ink : stop.operator_colors?.[0] ?? c.yonn}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.stopName} numberOfLines={1}>
                    {stop.name}
                  </Text>
                  {!!stop.subtitle && (
                    <Text style={styles.stopLines} numberOfLines={1}>
                      {stop.subtitle}
                    </Text>
                  )}
                  {!!stop.lines?.length && (
                    <Text style={styles.stopLines} numberOfLines={1}>
                      {stop.lines.join(' · ')}
                    </Text>
                  )}
                </View>
                {typeof stop.distance_meters === 'number' && (
                  <Text style={styles.stopDistance}>
                    {formatDistance(stop.distance_meters / 1000)}
                  </Text>
                )}
              </TouchableOpacity>
            ))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Field({
  placeholder,
  value,
  filled,
  onFocus,
  onChangeText,
  styles,
  colors,
}: {
  placeholder: string;
  value: string;
  filled: boolean;
  onFocus: () => void;
  onChangeText: (t: string) => void;
  styles: ReturnType<typeof createStyles>;
  colors: Palette;
}) {
  return (
    <View style={styles.field}>
      <TextInput
        style={styles.fieldInput}
        placeholder={placeholder}
        placeholderTextColor={colors.inkFaint}
        value={value}
        onFocus={onFocus}
        onChangeText={onChangeText}
        autoCorrect={false}
        autoCapitalize="none"
        spellCheck={false}
        returnKeyType="search"
      />
      {filled && <Ionicons name="checkmark-circle" size={17} color={colors.yonn} />}
    </View>
  );
}

const createStyles = (c: Palette) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.canvas },

    top: { paddingHorizontal: Spacing.lg, gap: Spacing.md },
    form: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: c.surface,
      borderRadius: Radii.lg,
      borderWidth: 1,
      borderColor: c.line,
      paddingHorizontal: Spacing.sm,
    },
    rail: { width: 28, alignItems: 'center', paddingVertical: Spacing.md },
    railDotOrigin: {
      width: 11,
      height: 11,
      borderRadius: 6,
      borderWidth: 3,
      borderColor: c.yonn,
      backgroundColor: c.surface,
    },
    railLine: { width: 2, flex: 1, minHeight: 20, backgroundColor: c.line, marginVertical: 3 },
    railDotDestination: { width: 10, height: 10, borderRadius: 2, backgroundColor: c.ink },

    fields: { flex: 1 },
    field: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, height: 50 },
    fieldInput: { flex: 1, fontFamily: Fonts.bodyMedium, fontSize: 15, color: c.ink },
    fieldSeparator: { height: 1, backgroundColor: c.line },

    swap: {
      width: 36,
      height: 36,
      borderRadius: Radii.pill,
      backgroundColor: c.fill,
      alignItems: 'center',
      justifyContent: 'center',
    },

    actions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
    myPosition: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      height: 52,
      paddingHorizontal: Spacing.md,
      borderRadius: Radii.md,
      borderWidth: 1,
      borderColor: c.line,
      backgroundColor: c.surface,
    },
    myPositionText: { fontFamily: Fonts.bodySemi, fontSize: 13, color: c.yonn },

    outcome: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      backgroundColor: c.dangerTint,
      borderRadius: Radii.md,
      padding: Spacing.md,
    },
    outcomeText: { flex: 1, fontFamily: Fonts.bodyMedium, fontSize: 13, color: c.danger },

    list: { flex: 1, marginTop: Spacing.md },
    listContent: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.lg },
    listLabel: {
      fontFamily: Fonts.bodySemi,
      fontSize: 11,
      letterSpacing: 0.6,
      textTransform: 'uppercase',
      color: c.inkFaint,
      marginBottom: Spacing.sm,
    },
    stopRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.md,
      paddingVertical: Spacing.sm,
    },
    stopIcon: {
      width: 38,
      height: 38,
      borderRadius: Radii.md,
      alignItems: 'center',
      justifyContent: 'center',
    },
    stopName: { fontFamily: Fonts.bodySemi, fontSize: 15, color: c.ink },
    stopLines: { fontFamily: Fonts.body, fontSize: 12, color: c.inkFaint, marginTop: 2 },
    stopDistance: { fontFamily: Fonts.bodyMedium, fontSize: 12, color: c.inkFaint },
  });
