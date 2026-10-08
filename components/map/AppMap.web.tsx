// La carte de l'app dans un navigateur (version web de Yoonbi).
//
// react-native-maps n'existe pas sur le web : ce fichier en reprend les
// composants utilisés par l'app (MapView, Marker, Callout, Polyline) et les
// méthodes de caméra (animateToRegion, animateCamera, fitToCoordinates) sur
// Leaflet, avec les fonds de carte CARTO (données © OpenStreetMap). Les
// pastilles d'arrêts et de lieux sont les MÊMES composants React que sur
// téléphone, affichés dans les marqueurs Leaflet : le design est identique.

import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import React, {
  createContext,
  forwardRef,
  ReactNode,
  useContext,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { StyleProp, View, ViewStyle } from 'react-native';
import { MapContainer, Pane, Polyline as LeafletPolyline, TileLayer, useMap, useMapEvents } from 'react-leaflet';

export type LatLng = { latitude: number; longitude: number };
export type Region = LatLng & { latitudeDelta: number; longitudeDelta: number };

type EdgePadding = { top: number; right: number; bottom: number; left: number };

export type MapViewHandle = {
  animateToRegion: (region: Region, duration?: number) => void;
  animateCamera: (camera: { center?: LatLng; zoom?: number; heading?: number }, opts?: { duration?: number }) => void;
  fitToCoordinates: (coords: LatLng[], opts?: { edgePadding?: EdgePadding; animated?: boolean }) => void;
};

// Fond de carte OpenStreetMap (le même que la console d'administration). En
// mode sombre, il est inversé par un filtre CSS : pas de second service de
// tuiles, pas de clé d'API.
const TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
const DARK_TILES_CLASS = 'yoonbi-dark-tiles';

if (typeof document !== 'undefined' && !document.getElementById(DARK_TILES_CLASS)) {
  const style = document.createElement('style');
  style.id = DARK_TILES_CLASS;
  style.textContent = `.${DARK_TILES_CLASS} .leaflet-tile-pane { filter: invert(1) hue-rotate(180deg) brightness(0.9) contrast(0.9) saturate(0.6); }`;
  document.head.appendChild(style);
}

// Couches superposées : tracés (1 à 3), puis lieux, puis arrêts au-dessus.
const ROUTE_PANES = [1, 2, 3];

function zoomForDelta(longitudeDelta: number): number {
  const width = typeof window !== 'undefined' ? window.innerWidth : 400;
  return Math.max(3, Math.min(18, Math.log2((360 * width) / (256 * longitudeDelta))));
}

function regionOf(map: L.Map): Region {
  const b = map.getBounds();
  const c = map.getCenter();
  return {
    latitude: c.lat,
    longitude: c.lng,
    latitudeDelta: b.getNorth() - b.getSouth(),
    longitudeDelta: b.getEast() - b.getWest(),
  };
}

const MapReadyContext = createContext<L.Map | null>(null);

// Branche les événements et les méthodes de caméra sur la carte Leaflet.
const Bridge = forwardRef<
  MapViewHandle,
  {
    onPanDrag?: () => void;
    onRegionChangeComplete?: (region: Region) => void;
    onMapReady?: () => void;
    onMap: (map: L.Map) => void;
  }
>(function Bridge({ onPanDrag, onRegionChangeComplete, onMapReady, onMap }, ref) {
  const map = useMap();
  useMapEvents({
    dragstart: () => onPanDrag?.(),
    moveend: () => onRegionChangeComplete?.(regionOf(map)),
  });
  useEffect(() => {
    onMap(map);
    onMapReady?.();
    onRegionChangeComplete?.(regionOf(map));
    // La carte peut naître dans un conteneur pas encore dimensionné.
    const timer = setTimeout(() => map.invalidateSize(), 100);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map]);

  useImperativeHandle(
    ref,
    () => ({
      animateToRegion: (region, duration = 500) => {
        map.flyToBounds(
          [
            [region.latitude - region.latitudeDelta / 2, region.longitude - region.longitudeDelta / 2],
            [region.latitude + region.latitudeDelta / 2, region.longitude + region.longitudeDelta / 2],
          ],
          { duration: duration / 1000 }
        );
      },
      animateCamera: (camera, opts) => {
        const center = camera.center ? L.latLng(camera.center.latitude, camera.center.longitude) : map.getCenter();
        map.flyTo(center, camera.zoom ?? map.getZoom(), { duration: (opts?.duration ?? 500) / 1000 });
      },
      fitToCoordinates: (coords, opts) => {
        if (coords.length === 0) return;
        // Le conteneur a pu changer de taille (bandeau, panneau du trajet).
        map.invalidateSize();
        const p = opts?.edgePadding ?? { top: 40, right: 40, bottom: 40, left: 40 };
        map.fitBounds(L.latLngBounds(coords.map((c) => [c.latitude, c.longitude] as [number, number])), {
          paddingTopLeft: [p.left, p.top],
          paddingBottomRight: [p.right, p.bottom],
          animate: opts?.animated ?? true,
        });
      },
    }),
    [map]
  );
  return null;
});

// Le point bleu de l'utilisateur, comme sur téléphone.
function UserLocation() {
  const map = useMap();
  useEffect(() => {
    if (!navigator.geolocation) return;
    let dot: L.CircleMarker | null = null;
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        const at = L.latLng(pos.coords.latitude, pos.coords.longitude);
        if (!dot) {
          dot = L.circleMarker(at, {
            radius: 8,
            color: '#FFFFFF',
            weight: 3,
            fillColor: '#1A73E8',
            fillOpacity: 1,
            pane: 'user',
          }).addTo(map);
        } else {
          dot.setLatLng(at);
        }
      },
      () => {},
      { enableHighAccuracy: true }
    );
    return () => {
      navigator.geolocation.clearWatch(id);
      dot?.remove();
    };
  }, [map]);
  return null;
}

type MapViewProps = {
  style?: StyleProp<ViewStyle>;
  initialRegion?: Region;
  showsUserLocation?: boolean;
  userInterfaceStyle?: 'light' | 'dark';
  onPanDrag?: () => void;
  onRegionChangeComplete?: (region: Region) => void;
  onMapReady?: () => void;
  children?: ReactNode;
  // Options propres aux cartes natives, sans effet ici.
  showsMyLocationButton?: boolean;
  showsCompass?: boolean;
  showsPointsOfInterests?: boolean;
};

const MapView = forwardRef<MapViewHandle, MapViewProps>(function MapView(
  { style, initialRegion, showsUserLocation, userInterfaceStyle, onPanDrag, onRegionChangeComplete, onMapReady, children },
  ref
) {
  const [map, setMap] = useState<L.Map | null>(null);
  const region = initialRegion ?? { latitude: 14.6928, longitude: -17.4467, latitudeDelta: 0.045, longitudeDelta: 0.045 };
  const dark = userInterfaceStyle === 'dark';

  return (
    <View style={style}>
      <MapContainer
        center={[region.latitude, region.longitude]}
        zoom={zoomForDelta(region.longitudeDelta)}
        zoomSnap={0}
        zoomControl={false}
        className={dark ? DARK_TILES_CLASS : undefined}
        style={{ width: '100%', height: '100%', background: dark ? '#0C1017' : '#F2F4F7' }}
      >
        <TileLayer url={TILES} attribution={ATTRIBUTION} maxZoom={19} />
        {ROUTE_PANES.map((z) => (
          <Pane key={z} name={`route-${z}`} style={{ zIndex: 400 + z }} />
        ))}
        <Pane name="user" style={{ zIndex: 450 }} />
        <Bridge
          ref={ref}
          onPanDrag={onPanDrag}
          onRegionChangeComplete={onRegionChangeComplete}
          onMapReady={onMapReady}
          onMap={setMap}
        />
        {showsUserLocation && <UserLocation />}
        <MapReadyContext.Provider value={map}>{map && children}</MapReadyContext.Provider>
      </MapContainer>
    </View>
  );
});

export default MapView;

// --- Marqueurs -----------------------------------------------------------------

type CalloutProps = { children?: ReactNode; onPress?: () => void; tooltip?: boolean };

// Bulle d'information d'un marqueur : rendue par Marker dans une popup Leaflet.
export function Callout(_props: CalloutProps) {
  return null;
}

type MarkerProps = {
  coordinate: LatLng;
  anchor?: { x: number; y: number };
  zIndex?: number;
  children?: ReactNode;
};

export function Marker({ coordinate, anchor = { x: 0.5, y: 0.5 }, zIndex = 0, children }: MarkerProps) {
  const map = useContext(MapReadyContext);
  const markerRef = useRef<L.Marker | null>(null);
  const [iconEl, setIconEl] = useState<HTMLElement | null>(null);
  const [popupEl, setPopupEl] = useState<HTMLElement | null>(null);

  const items = React.Children.toArray(children) as React.ReactElement[];
  const callout = items.find((child) => child?.type === Callout) as React.ReactElement<CalloutProps> | undefined;
  const content = items.filter((child) => child !== callout);

  useEffect(() => {
    if (!map) return;
    const marker = L.marker([coordinate.latitude, coordinate.longitude], {
      icon: L.divIcon({ html: '', className: '', iconSize: [0, 0] }),
      zIndexOffset: zIndex * 1000,
    }).addTo(map);
    markerRef.current = marker;
    setIconEl(marker.getElement() ?? null);
    return () => {
      marker.remove();
      markerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map]);

  useEffect(() => {
    markerRef.current?.setLatLng([coordinate.latitude, coordinate.longitude]);
  }, [coordinate.latitude, coordinate.longitude]);

  useEffect(() => {
    markerRef.current?.setZIndexOffset(zIndex * 1000);
  }, [zIndex]);

  const hasCallout = !!callout;
  useEffect(() => {
    const marker = markerRef.current;
    if (!marker || !hasCallout) return;
    const el = document.createElement('div');
    marker.bindPopup(el, { closeButton: false, offset: [0, -10] });
    setPopupEl(el);
    return () => {
      marker.unbindPopup();
      setPopupEl(null);
    };
  }, [hasCallout, iconEl]);

  return (
    <>
      {iconEl &&
        createPortal(
          <div
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              transform: `translate(${-anchor.x * 100}%, ${-anchor.y * 100}%)`,
              whiteSpace: 'nowrap',
              cursor: hasCallout ? 'pointer' : 'default',
            }}
          >
            {content}
          </div>,
          iconEl
        )}
      {popupEl &&
        callout &&
        createPortal(
          <div
            onClick={callout.props.onPress}
            style={{ cursor: callout.props.onPress ? 'pointer' : 'default' }}
          >
            {callout.props.children}
          </div>,
          popupEl
        )}
    </>
  );
}

// --- Tracés --------------------------------------------------------------------

type PolylineProps = {
  coordinates: LatLng[];
  strokeColor?: string;
  strokeWidth?: number;
  lineDashPattern?: number[];
  lineCap?: 'butt' | 'round' | 'square';
  zIndex?: number;
};

export function Polyline({ coordinates, strokeColor, strokeWidth = 4, lineDashPattern, lineCap, zIndex = 1 }: PolylineProps) {
  const map = useContext(MapReadyContext);
  if (!map || !strokeColor || strokeColor === 'transparent' || coordinates.length < 2) return null;
  return (
    <LeafletPolyline
      positions={coordinates.map((c) => [c.latitude, c.longitude] as [number, number])}
      pane={`route-${Math.min(3, Math.max(1, zIndex))}`}
      pathOptions={{
        color: strokeColor,
        weight: strokeWidth,
        opacity: 1,
        lineCap: lineCap ?? 'round',
        lineJoin: 'round',
        dashArray: lineDashPattern?.join(' '),
      }}
    />
  );
}
