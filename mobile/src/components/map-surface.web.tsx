import { useEffect, useState } from 'react';
import { StyleSheet, Text, View, useColorScheme } from 'react-native';
import type * as Leaflet from 'leaflet';
import type { useMapEvents as UseMapEvents } from 'react-leaflet';
import type { Coordinate } from '@/lib/report-service';
import type { DetectionCollection } from '@/components/detection-map-types';
import { dimensions, radii, spacing, typography, themeTokens } from '@/theme/tokens';
import { pilotArea } from '@/constants/pilot-area';

import 'leaflet/dist/leaflet.css';

type LeafletModules = {
  leaflet: typeof Leaflet;
  reactLeaflet: typeof import('react-leaflet');
};

function MapClickEvents({
  useMapEvents,
  onLocationSelect,
}: {
  useMapEvents: typeof UseMapEvents;
  onLocationSelect?: (location: Coordinate) => void;
}) {
  useMapEvents({
    click(event) {
      onLocationSelect?.({ latitude: event.latlng.lat, longitude: event.latlng.lng });
    },
  });
  return null;
}

export function DetectionMap({
  height,
  detections,
  selectedLocation,
  onLocationSelect,
  onDetectionSelect,
}: {
  height: number;
  detections: DetectionCollection | null;
  selectedLocation?: Coordinate | null;
  onLocationSelect?: (location: Coordinate) => void;
  onDetectionSelect?: (feature: DetectionCollection['features'][number]) => void;
}) {
  const [modules, setModules] = useState<LeafletModules | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);
  const dark = useColorScheme() === 'dark';
  const colors = themeTokens[dark ? 'dark' : 'light'].colors;

  useEffect(() => {
    let active = true;
    Promise.all([import('leaflet'), import('react-leaflet')])
      .then(([leaflet, reactLeaflet]) => {
        if (active) setModules({ leaflet, reactLeaflet });
      })
      .catch((error: unknown) => {
        if (active) setMapError(error instanceof Error ? error.message : 'No se pudo cargar el mapa.');
      });
    return () => { active = false; };
  }, []);

  if (mapError) {
    return <View style={[styles.mapMessage, { height, backgroundColor: colors.surface, borderColor: colors.line }]}><Text style={[styles.messageText, { color: colors.inkMuted }]}>{mapError}</Text></View>;
  }
  if (!modules) {
    return <View style={[styles.mapMessage, { height, backgroundColor: colors.surface, borderColor: colors.line }]}><Text style={[styles.messageText, { color: colors.inkMuted }]}>Cargando mapa…</Text></View>;
  }

  const { MapContainer, TileLayer, GeoJSON, CircleMarker, Rectangle } = modules.reactLeaflet;
  const center: Leaflet.LatLngExpression = [-17.35, -66.15];
  const pointToLayer: Leaflet.GeoJSONOptions['pointToLayer'] = (feature, latlng) => {
    const modis = feature?.properties?.sensor === 'MODIS';
    const color = modis ? colors.modis : colors.viirs;
    if (modis) {
      return modules.leaflet.circleMarker(latlng, {
        radius: spacing.xxs,
        color: colors.surfaceRaised,
        weight: dimensions.hairline,
        fillColor: color,
        fillOpacity: 0.9,
      });
    }
    return modules.leaflet.rectangle(
      [[latlng.lat - 0.0007, latlng.lng - 0.0007], [latlng.lat + 0.0007, latlng.lng + 0.0007]],
      { color: colors.surfaceRaised, weight: dimensions.hairline, fillColor: color, fillOpacity: 0.9 },
    );
  };
  const onEachFeature: Leaflet.GeoJSONOptions['onEachFeature'] = (feature, layer) => {
    layer.on('click', () => {
      if (feature.geometry.type !== 'Point') return;
      const selectedFeature = detections?.features.find((item) => item.properties === feature.properties);
      if (selectedFeature) onDetectionSelect?.(selectedFeature);
    });
  };

  return (
    <View style={[styles.mapWrap, { height }]}>
      <MapContainer
        center={center}
        zoom={10}
        scrollWheelZoom
        style={styles.map}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Rectangle
          bounds={[[pilotArea.south, pilotArea.west], [pilotArea.north, pilotArea.east]]}
          pathOptions={{ color: colors.calm, weight: dimensions.rule, dashArray: `${spacing.xs} ${spacing.xs}`, fillOpacity: 0.035, fillColor: colors.calm }}
        />
        {detections ? <GeoJSON data={detections as GeoJSON.GeoJsonObject} pointToLayer={pointToLayer} onEachFeature={onEachFeature} /> : null}
        {selectedLocation ? (
          <CircleMarker
            center={[selectedLocation.latitude, selectedLocation.longitude]}
            radius={spacing.sm}
            pathOptions={{ color: colors.surfaceRaised, weight: 2, fillColor: colors.attention, fillOpacity: 1 }}
          />
        ) : null}
        {onLocationSelect ? <MapClickEvents useMapEvents={modules.reactLeaflet.useMapEvents} onLocationSelect={onLocationSelect} /> : null}
      </MapContainer>
    </View>
  );
}

const styles = StyleSheet.create({
  mapWrap: { overflow: 'hidden', borderRadius: radii.medium },
  map: { height: '100%', width: '100%', zIndex: 0 },
  mapMessage: { borderWidth: dimensions.hairline, borderRadius: radii.medium, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  messageText: { fontFamily: typography.family.sans, fontSize: typography.size.small, textAlign: 'center' },
});
