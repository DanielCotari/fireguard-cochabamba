import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type * as Leaflet from 'leaflet';
import type { useMapEvents as UseMapEvents } from 'react-leaflet';
import type { Coordinate } from '@/lib/report-service';
import type { DetectionCollection } from '@/components/detection-map-types';

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
}: {
  height: number;
  detections: DetectionCollection | null;
  selectedLocation?: Coordinate | null;
  onLocationSelect?: (location: Coordinate) => void;
}) {
  const [modules, setModules] = useState<LeafletModules | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);

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
    return <View style={[styles.mapMessage, { height }]}><Text style={styles.messageText}>{mapError}</Text></View>;
  }
  if (!modules) {
    return <View style={[styles.mapMessage, { height }]}><Text style={styles.messageText}>Cargando mapa…</Text></View>;
  }

  const { MapContainer, TileLayer, GeoJSON, CircleMarker } = modules.reactLeaflet;
  const center: Leaflet.LatLngExpression = [-17.35, -66.15];
  const pointToLayer: Leaflet.GeoJSONOptions['pointToLayer'] = (feature, latlng) => {
    const color = feature?.properties?.sensor === 'MODIS' ? '#f08c3d' : '#4795b8';
    return modules.leaflet.circleMarker(latlng, {
      radius: 5,
      color: '#fff',
      weight: 1,
      fillColor: color,
      fillOpacity: 0.9,
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
        {detections ? <GeoJSON data={detections as GeoJSON.GeoJsonObject} pointToLayer={pointToLayer} /> : null}
        {selectedLocation ? (
          <CircleMarker
            center={[selectedLocation.latitude, selectedLocation.longitude]}
            radius={8}
            pathOptions={{ color: '#fff', weight: 2, fillColor: '#a43e31', fillOpacity: 1 }}
          />
        ) : null}
        {onLocationSelect ? <MapClickEvents useMapEvents={modules.reactLeaflet.useMapEvents} onLocationSelect={onLocationSelect} /> : null}
      </MapContainer>
    </View>
  );
}

const styles = StyleSheet.create({
  mapWrap: { overflow: 'hidden', borderRadius: 12, backgroundColor: '#e8eee8' },
  map: { height: '100%', width: '100%', zIndex: 0 },
  mapMessage: { borderRadius: 12, backgroundColor: '#e8eee8', alignItems: 'center', justifyContent: 'center', padding: 18 },
  messageText: { color: '#64756e', fontSize: 12, textAlign: 'center' },
});
