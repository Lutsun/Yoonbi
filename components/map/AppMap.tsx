// La carte de l'app sur téléphone : react-native-maps (Apple Plans sur iOS,
// Google Maps sur Android). La version navigateur, construite sur Leaflet
// avec les mêmes composants et la même API, est dans AppMap.web.tsx — Expo
// choisit automatiquement le bon fichier selon la plateforme.
export { default, Marker, Callout, Polyline } from 'react-native-maps';
export type { Region } from 'react-native-maps';
