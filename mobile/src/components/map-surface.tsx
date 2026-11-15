import { useState } from 'react';
import { Pressable, StyleSheet, Text, View, useColorScheme } from 'react-native';
import type { Coordinate } from '@/lib/report-service';
import type { DetectionCollection } from '@/components/detection-map-types';
import { dimensions, radii, spacing, themeTokens, typography } from '@/theme/tokens';
import { pilotArea } from '@/constants/pilot-area';

type DetectionFeature = DetectionCollection['features'][number];

function project(longitude: number, latitude: number) {
  return {
    x: ((longitude - pilotArea.west) / (pilotArea.east - pilotArea.west)) * 100,
    y: ((pilotArea.north - latitude) / (pilotArea.north - pilotArea.south)) * 100,
  };
}

function insidePilot(longitude: number, latitude: number) {
  return longitude >= pilotArea.west && longitude <= pilotArea.east &&
    latitude >= pilotArea.south && latitude <= pilotArea.north;
}

function DetectionPoint({
  feature,
  onPress,
  colors,
}: {
  feature: DetectionFeature;
  onPress: () => void;
  colors: typeof themeTokens.light.colors | typeof themeTokens.dark.colors;
}) {
  const [longitude, latitude] = feature.geometry.coordinates;
  const position = project(longitude, latitude);
  const modis = feature.properties.sensor === 'MODIS';
  const sensor = modis ? 'MODIS' : 'VIIRS';
  const color = modis ? colors.modis : colors.viirs;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${sensor}, observación en ${latitude.toFixed(5)} de latitud y ${longitude.toFixed(5)} de longitud`}
      onPress={onPress}
      style={[styles.detectionTarget, { left: `${position.x}%`, top: `${position.y}%` }]}
    >
      <View style={[styles.detection, { backgroundColor: color }, !modis && styles.squareDetection]} />
    </Pressable>
  );
}

export function MapSurface({
  height,
  detections,
  selectedLocation,
  onLocationSelect,
  onDetectionSelect,
}: {
  height: number;
  detections?: DetectionCollection | null;
  selectedLocation?: Coordinate | null;
  onLocationSelect?: (location: Coordinate) => void;
  onDetectionSelect?: (feature: DetectionFeature) => void;
}) {
  const colors = themeTokens[useColorScheme() === 'dark' ? 'dark' : 'light'].colors;
  const [mapSize, setMapSize] = useState({ width: 0, height: 0 });
  const features = (detections?.features ?? []).filter((feature) => feature.geometry.type === 'Point' && insidePilot(feature.geometry.coordinates[0], feature.geometry.coordinates[1]));
  const selectedPosition = selectedLocation && insidePilot(selectedLocation.longitude, selectedLocation.latitude)
    ? project(selectedLocation.longitude, selectedLocation.latitude)
    : null;

  return (
    <View style={[styles.map, { height, backgroundColor: colors.canvas, borderColor: colors.line }]}>
      <View style={[styles.mapField, { backgroundColor: colors.surface }]}>
        <Pressable
          accessibilityRole={onLocationSelect ? 'button' : undefined}
          accessibilityLabel={onLocationSelect ? 'Seleccionar ubicación dentro del rectángulo piloto' : 'Mapa del rectángulo piloto'}
          onLayout={(event) => setMapSize({ width: event.nativeEvent.layout.width, height: event.nativeEvent.layout.height })}
          onPress={onLocationSelect ? (event) => {
            if (!mapSize.width || !mapSize.height) return;
            const x = Math.max(0, Math.min(1, event.nativeEvent.locationX / mapSize.width));
            const y = Math.max(0, Math.min(1, event.nativeEvent.locationY / mapSize.height));
            onLocationSelect({
              longitude: pilotArea.west + x * (pilotArea.east - pilotArea.west),
              latitude: pilotArea.north - y * (pilotArea.north - pilotArea.south),
            });
          } : undefined}
          style={[styles.coordinateBorder, { borderColor: colors.calm }]}
        >
          <View style={[styles.gridHorizontal, styles.gridHorizontalOne, { backgroundColor: colors.line }]} />
          <View style={[styles.gridHorizontal, styles.gridHorizontalTwo, { backgroundColor: colors.line }]} />
          <View style={[styles.gridVertical, styles.gridVerticalOne, { backgroundColor: colors.line }]} />
          <View style={[styles.gridVertical, styles.gridVerticalTwo, { backgroundColor: colors.line }]} />
          {features.map((feature, index) => (
            <DetectionPoint
              key={`${feature.properties.sensor}-${feature.geometry.coordinates.join(',')}-${index}`}
              feature={feature}
              onPress={() => onDetectionSelect?.(feature)}
              colors={colors}
            />
          ))}
          {selectedPosition ? (
            <View
              accessibilityLabel="Ubicación seleccionada"
              style={[styles.selectedPoint, { left: `${selectedPosition.x}%`, top: `${selectedPosition.y}%`, backgroundColor: colors.attention, borderColor: colors.surfaceRaised }]}
            />
          ) : null}
          <Text style={[styles.mapCorner, styles.mapNorthWest, { color: colors.inkSubtle }]}>{Math.abs(pilotArea.north).toFixed(2)}° S</Text>
          <Text style={[styles.mapCorner, styles.mapSouthWest, { color: colors.inkSubtle }]}>{Math.abs(pilotArea.south).toFixed(2)}° S</Text>
          <Text style={[styles.mapCorner, styles.mapSouthEast, { color: colors.inkSubtle }]}>{Math.abs(pilotArea.east).toFixed(2)}° O</Text>
        </Pressable>
      </View>
      <View style={[styles.mapCaption, { borderTopColor: colors.line }]}>
        <Text style={[styles.captionTitle, { color: colors.ink }]}>RECTÁNGULO PILOTO · COCHABAMBA</Text>
        <Text style={[styles.captionText, { color: colors.inkMuted }]}>Esquema de coordenadas del área de análisis; no representa límites administrativos ni cartografía de calles.</Text>
      </View>
    </View>
  );
}

export { MapSurface as DetectionMap };

const styles = StyleSheet.create({
  map: { overflow: 'hidden', borderWidth: dimensions.hairline, borderRadius: radii.medium, padding: spacing.sm },
  mapField: { flex: 1, padding: spacing.lg },
  coordinateBorder: { flex: 1, overflow: 'hidden', borderWidth: dimensions.rule, borderStyle: 'dashed', position: 'relative' },
  gridHorizontal: { position: 'absolute', left: 0, right: 0, height: dimensions.hairline },
  gridHorizontalOne: { top: '33.3%' },
  gridHorizontalTwo: { top: '66.6%' },
  gridVertical: { position: 'absolute', top: 0, bottom: 0, width: dimensions.hairline },
  gridVerticalOne: { left: '33.3%' },
  gridVerticalTwo: { left: '66.6%' },
  detectionTarget: { position: 'absolute', width: dimensions.touchTarget, height: dimensions.touchTarget, marginLeft: -(dimensions.touchTarget / 2), marginTop: -(dimensions.touchTarget / 2), alignItems: 'center', justifyContent: 'center' },
  detection: { width: spacing.sm, height: spacing.sm, borderRadius: radii.pill, borderWidth: dimensions.hairline },
  squareDetection: { borderRadius: radii.small },
  selectedPoint: { position: 'absolute', width: spacing.md, height: spacing.md, marginLeft: -spacing.xs, marginTop: -spacing.xs, borderRadius: radii.pill, borderWidth: dimensions.rule },
  mapCorner: { position: 'absolute', fontFamily: typography.family.mono, fontSize: typography.size.caption, backgroundColor: 'transparent' },
  mapNorthWest: { top: spacing.xs, left: spacing.xs },
  mapSouthWest: { bottom: spacing.xs, left: spacing.xs },
  mapSouthEast: { bottom: spacing.xs, right: spacing.xs },
  mapCaption: { borderTopWidth: dimensions.hairline, paddingTop: spacing.sm, gap: spacing.xxs },
  captionTitle: { fontFamily: typography.family.mono, fontSize: typography.size.caption, fontWeight: '800', letterSpacing: 0.6 },
  captionText: { fontFamily: typography.family.sans, fontSize: typography.size.caption, lineHeight: typography.lineHeight.body },
});
