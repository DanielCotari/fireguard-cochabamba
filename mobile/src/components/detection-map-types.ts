export type DetectionCollection = {
  type: 'FeatureCollection';
  features: {
    type: 'Feature';
    geometry: {
      type: 'Point';
      coordinates: [number, number];
    };
    properties: Record<string, string | number | boolean | null>;
  }[];
};
