import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Fonts, Radii, Spacing, Palette } from '../../constants/theme';
import { useColors } from '../../store/ThemeContext';
import { Stop, TripSegment } from '../../types/transit';
import { distanceKm, formatDistance } from '../../utils/eta';
import { USER_POSITION_ID } from '../../services/routing';

export function segmentDistanceKm(segment: TripSegment): number {
  let total = 0;
  for (let i = 0; i < segment.path.length - 1; i++) {
    const a = segment.path[i];
    const b = segment.path[i + 1];
    total += distanceKm(a.latitude, a.longitude, b.latitude, b.longitude);
  }
  return total;
}

type Props = {
  origin: Stop;
  destination: Stop;
  segments: TripSegment[];
  // Guidage : index de l'étape en cours (surlignée). `segments.length` = arrivé.
  activeIndex?: number;
};

// Le déroulé du trajet, étape par étape. Partagé entre l'écran de détail et
// le guide sur la carte, pour une lecture identique aux deux endroits.
export default function TripSteps({ origin, destination, segments, activeIndex = -1 }: Props) {
  const c = useColors();
  const styles = useMemo(() => createStyles(c), [c]);
  const arrived = activeIndex >= segments.length;

  // Quand le trajet commence par la marche depuis la position GPS (voir
  // `withAccessWalk`), le départ n'est pas l'arrêt mais l'utilisateur.
  const first = segments[0];
  const startsFromUser = first?.type === 'walk' && first.fromStopId === USER_POSITION_ID;
  const originLabel = startsFromUser ? 'Ma position' : origin.name;

  return (
    <View>
      <Row
        styles={styles}
        marker={<View style={styles.dotStart} />}
        title="Départ"
        value={originLabel}
        connector
      />

      {segments.map((segment, index) => {
        const isRide = segment.type === 'ride';
        const isFinalWalk = !isRide && segment.toStopId === destination.id;

        return (
          <Row
            key={index}
            styles={styles}
            active={index === activeIndex}
            connector
            marker={
              isRide ? (
                <View style={[styles.lineBadge, { backgroundColor: segment.lineColor }]}>
                  <Text style={styles.lineBadgeText} numberOfLines={1}>
                    {segment.lineCode.replace('Ligne ', '')}
                  </Text>
                </View>
              ) : (
                <View style={styles.walkBadge}>
                  <Ionicons name="walk" size={15} color={c.inkMuted} />
                </View>
              )
            }
            title={
              isRide
                ? segment.headsign
                  ? `Prendre ${segment.lineCode} direction ${segment.headsign}`
                  : `Prendre ${segment.lineCode}`
                : isFinalWalk
                  ? 'Marcher jusqu’à destination'
                  : `Marcher jusqu’à ${segment.toStopName}`
            }
            value={
              isRide
                ? `Descendre à ${segment.alightStopName}`
                : formatDistance(segmentDistanceKm(segment))
            }
            meta={
              isRide
                ? `${segment.operatorShortName} · ${segment.minutes} min · ${segment.stopsCount} arrêt${
                    segment.stopsCount > 1 ? 's' : ''
                  }`
                : `${segment.minutes} min à pied`
            }
          />
        );
      })}

      <Row
        styles={styles}
        active={arrived}
        marker={
          <View style={[styles.dotEnd, arrived && { backgroundColor: c.yonn }]}>
            <Ionicons name="flag" size={13} color={c.canvas} />
          </View>
        }
        title="Arrivée"
        value={destination.name}
      />
    </View>
  );
}

function Row({
  marker,
  title,
  value,
  meta,
  connector,
  active,
  styles,
}: {
  marker: React.ReactNode;
  title: string;
  value: string;
  meta?: string;
  connector?: boolean;
  active?: boolean;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <View style={styles.row}>
      <View style={styles.markerCol}>
        {marker}
        {connector && <View style={styles.connector} />}
      </View>
      <View style={[styles.body, active && styles.bodyActive]}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.value}>{value}</Text>
        {!!meta && <Text style={styles.meta}>{meta}</Text>}
      </View>
    </View>
  );
}

const MARKER = 30;

const createStyles = (c: Palette) =>
  StyleSheet.create({
    row: { flexDirection: 'row', gap: Spacing.md },
    markerCol: { width: MARKER, alignItems: 'center' },
    connector: {
      width: 2,
      flex: 1,
      minHeight: 18,
      backgroundColor: c.line,
      marginVertical: 4,
    },
    dotStart: {
      width: 14,
      height: 14,
      borderRadius: 7,
      borderWidth: 3,
      borderColor: c.yonn,
      backgroundColor: c.surface,
      marginTop: 6,
    },
    dotEnd: {
      width: MARKER,
      height: MARKER,
      borderRadius: Radii.pill,
      backgroundColor: c.ink,
      alignItems: 'center',
      justifyContent: 'center',
    },
    lineBadge: {
      minWidth: MARKER,
      height: MARKER,
      borderRadius: Radii.pill,
      paddingHorizontal: 6,
      alignItems: 'center',
      justifyContent: 'center',
    },
    lineBadgeText: { fontFamily: Fonts.bodySemi, fontSize: 12, color: '#FFFFFF' },
    walkBadge: {
      width: MARKER,
      height: MARKER,
      borderRadius: Radii.pill,
      backgroundColor: c.fill,
      alignItems: 'center',
      justifyContent: 'center',
    },
    body: { flex: 1, paddingBottom: Spacing.lg, paddingTop: 2 },
    bodyActive: {
      backgroundColor: c.yonnTint,
      borderRadius: Radii.sm,
      paddingHorizontal: Spacing.sm,
      paddingBottom: Spacing.sm,
      marginBottom: Spacing.md,
      marginLeft: -Spacing.sm,
    },
    title: { fontFamily: Fonts.bodySemi, fontSize: 15, color: c.ink },
    value: { fontFamily: Fonts.body, fontSize: 14, color: c.inkMuted, marginTop: 2 },
    meta: { fontFamily: Fonts.body, fontSize: 12, color: c.inkFaint, marginTop: 3 },
  });
