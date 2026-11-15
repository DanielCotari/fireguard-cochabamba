import {
  collection,
  doc,
  documentId,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  where,
} from 'firebase/firestore';
import type { DetectionCollection } from '@/components/detection-map-types';
import { db } from '@/lib/firebase';

export type SatelliteMonth = {
  year: number;
  month: number;
  modis_count: number | null;
  viirs_count: number | null;
  viirs_adjusted?: number | null;
  final_value: number | null;
  final_source: string | null;
  final_kind: string | null;
  coverage: 'complete' | 'incomplete' | 'missing';
  modis_geojson: string | null;
  viirs_geojson: string | null;
};

export type SatelliteCalendar = {
  status: 'awaiting_data' | 'ready' | 'insufficient';
  statusMessage: string;
  metadata: {
    period: { startYear: number; endYear: number };
    bbox: { west: number; south: number; east: number; north: number };
    areaName: string;
    sources: {
      sensor: string;
      product: string;
      satellites: string;
      version?: string;
      algorithmVersions?: string[];
      sourceFiles?: string[];
    }[];
    calibration?: { startYear: number; endYear: number };
    evaluation?: { startYear: number; endYear: number };
    transitionMonth?: string;
    units?: string;
  };
  harmonization?: { factor: number | null; calibrationMonths?: number };
  evaluation?: {
    sampleCount: number;
    minimumSamples: number;
    before?: { mae: number | null; bias: number | null };
    after?: { mae: number | null; bias: number | null };
  };
  monthly: SatelliteMonth[];
};

export type PublishedCalendar = {
  calendar: SatelliteCalendar;
  importId: string | null;
};

const MONTH_LABEL = /^[0-9]{4}-(0[1-9]|1[0-2])$/;
const MAX_DETECTIONS_PER_PAGE = 500;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nullableNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function yearSpan(value: unknown) {
  if (!isRecord(value) || !Number.isInteger(value.startYear) || !Number.isInteger(value.endYear)) return undefined;
  return { startYear: Number(value.startYear), endYear: Number(value.endYear) };
}

function parseMonth(id: string, value: Record<string, unknown>): SatelliteMonth {
  const year = value.year;
  const month = value.month;
  const coverage = value.coverage;
  if (
    !MONTH_LABEL.test(id) ||
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    id !== `${year}-${String(month).padStart(2, '0')}` ||
    !['complete', 'incomplete', 'missing'].includes(String(coverage))
  ) {
    throw new Error(`El agregado satelital ${id} no cumple el modelo publicado.`);
  }
  return {
    year: Number(year),
    month: Number(month),
    modis_count: nullableNumber(value.modis_count),
    viirs_count: nullableNumber(value.viirs_count),
    viirs_adjusted: nullableNumber(value.viirs_adjusted),
    final_value: nullableNumber(value.final_value),
    final_source: typeof value.final_source === 'string' ? value.final_source : null,
    final_kind: typeof value.final_kind === 'string' ? value.final_kind : null,
    coverage: coverage as SatelliteMonth['coverage'],
    modis_geojson: typeof value.modis_geojson === 'string' ? value.modis_geojson : null,
    viirs_geojson: typeof value.viirs_geojson === 'string' ? value.viirs_geojson : null,
  };
}

export async function loadPublishedCalendar(fallback: SatelliteCalendar): Promise<PublishedCalendar> {
  if (!db) return { calendar: fallback, importId: null };
  const configSnapshot = await getDoc(doc(db, 'publicConfig', 'satellite'));
  if (!configSnapshot.exists()) {
    return { calendar: fallback, importId: null };
  }

  const config = configSnapshot.data();
  if (
    !['awaiting_data', 'ready', 'insufficient'].includes(String(config.status)) ||
    typeof config.importId !== 'string' ||
    !isRecord(config.metadata) ||
    !isRecord(config.metadata.period)
  ) {
    throw new Error('La configuración satelital publicada no cumple el modelo esperado.');
  }

  const monthsSnapshot = await getDocs(query(
    collection(db, 'publicMonthlyStats'),
    orderBy('yearMonth', 'asc'),
    limit(120),
  ));
  const monthly = monthsSnapshot.docs.map((month) => parseMonth(month.id, month.data()));
  return {
    importId: config.importId,
    calendar: {
      status: config.status as SatelliteCalendar['status'],
      statusMessage: typeof config.statusMessage === 'string' ? config.statusMessage : 'Estado satelital pendiente.',
      metadata: {
        period: {
          startYear: Number(config.metadata.period.startYear),
          endYear: Number(config.metadata.period.endYear),
        },
        bbox: isRecord(config.metadata.bbox)
          ? {
            west: Number(config.metadata.bbox.west),
            south: Number(config.metadata.bbox.south),
            east: Number(config.metadata.bbox.east),
            north: Number(config.metadata.bbox.north),
          }
          : fallback.metadata.bbox,
        areaName: typeof config.metadata.areaName === 'string' ? config.metadata.areaName : fallback.metadata.areaName,
        sources: Array.isArray(config.metadata.sources)
          ? config.metadata.sources.filter(isRecord).flatMap((source) =>
            typeof source.sensor === 'string' && typeof source.product === 'string' && typeof source.satellites === 'string'
              ? [{
                sensor: source.sensor,
                product: source.product,
                satellites: source.satellites,
                ...(typeof source.version === 'string' ? { version: source.version } : {}),
                ...(Array.isArray(source.algorithmVersions)
                  ? { algorithmVersions: source.algorithmVersions.filter((version): version is string => typeof version === 'string') }
                  : {}),
                ...(Array.isArray(source.sourceFiles)
                  ? { sourceFiles: source.sourceFiles.filter((file): file is string => typeof file === 'string') }
                  : {}),
              }]
              : [],
          )
          : [],
        calibration: yearSpan(config.metadata.calibration),
        evaluation: yearSpan(config.metadata.evaluation),
        transitionMonth: typeof config.metadata.transitionMonth === 'string' ? config.metadata.transitionMonth : undefined,
        units: typeof config.metadata.units === 'string' ? config.metadata.units : undefined,
      },
      monthly,
    },
  };
}

export async function loadPublishedDetections(
  year: number,
  month: number,
  importId: string,
  cursorId?: string,
): Promise<{ detections: DetectionCollection | null; nextCursor: string | null }> {
  if (!db) throw new Error('Firebase no está configurado para consultar detecciones publicadas.');
  const monthKey = `${year}-${String(month).padStart(2, '0')}`;
  let detectionsQuery = query(
    collection(db, 'publicDetections'),
    where('yearMonth', '==', monthKey),
    where('importId', '==', importId),
    orderBy(documentId()),
    limit(MAX_DETECTIONS_PER_PAGE),
  );
  if (cursorId) {
    const cursor = await getDoc(doc(db, 'publicDetections', cursorId));
    if (
      !cursor.exists() ||
      cursor.data().yearMonth !== monthKey ||
      cursor.data().importId !== importId
    ) {
      throw new Error('El cursor de detecciones ya no pertenece al conjunto publicado.');
    }
    detectionsQuery = query(detectionsQuery, startAfter(cursor));
  }
  const snapshot = await getDocs(detectionsQuery);
  const features = snapshot.docs.flatMap((item) => {
    const value = item.data();
    if (
      value.yearMonth !== monthKey ||
      (value.sensor !== 'MODIS' && value.sensor !== 'VIIRS') ||
      typeof value.latitude !== 'number' ||
      typeof value.longitude !== 'number' ||
      !Number.isFinite(value.latitude) ||
      !Number.isFinite(value.longitude)
    ) {
      return [];
    }
    const properties: DetectionCollection['features'][number]['properties'] = { sensor: value.sensor };
    if (isRecord(value.properties)) {
      for (const [key, property] of Object.entries(value.properties)) {
        if (
          property === null ||
          typeof property === 'string' ||
          typeof property === 'number' ||
          typeof property === 'boolean'
        ) properties[key] = property;
      }
    }
    return [{
      type: 'Feature' as const,
      geometry: {
        type: 'Point' as const,
        coordinates: [value.longitude, value.latitude] as [number, number],
      },
      properties,
    }];
  });
  return {
    detections: features.length ? { type: 'FeatureCollection', features } : null,
    nextCursor: snapshot.docs.length === MAX_DETECTIONS_PER_PAGE
      ? snapshot.docs[snapshot.docs.length - 1].id
      : null,
  };
}
