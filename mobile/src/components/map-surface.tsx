import { StyleSheet, Text, View } from 'react-native';
import type { Coordinate } from '@/lib/report-service';
import type { DetectionCollection } from '@/components/detection-map-types';

export function MapSurface({ height }: { height: number }) {
  return (
    <View style={[styles.fallback, { height }]}>
      <Text style={styles.text}>El mapa interactivo está disponible en la versión web.</Text>
    </View>
  );
}

export function DetectionMap({
  height,
}: {
  height: number;
  detections?: DetectionCollection | null;
  selectedLocation?: Coordinate | null;
  onLocationSelect?: (location: Coordinate) => void;
}) {
  return <MapSurface height={height} />;
}

const styles = StyleSheet.create({
  fallback: { backgroundColor: '#e8eee8', borderRadius: 12, alignItems: 'center', justifyContent: 'center', padding: 20 },
  text: { color: '#64756e', fontSize: 12, textAlign: 'center', lineHeight: 18 },
});
