import type { GeoPoint, Timestamp } from 'firebase/firestore';

export type AccessDocument = {
  active: boolean;
  role: 'citizen' | 'firefighter' | 'brigade_leader' | 'incident_commander' | 'super_admin';
  organizationId?: string | null;
  brigadeIds?: string[];
  operationalAreaIds?: string[];
  technicalAdmin?: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
};

export type UserProfile = {
  displayName: string;
  phone: string | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
};

export type Availability = {
  status: 'available' | 'busy' | 'off_duty';
  updatedAt: Timestamp;
};

export type CitizenReportDocument = {
  authorId: string;
  description: string;
  observerLocation: GeoPoint | null;
  fireLocation: GeoPoint;
  observedAt: Timestamp;
  photoPath: string;
  status: string;
  satelliteMatch: 'pending' | 'match_found' | 'no_match_found';
  organizationId: string | null;
  incidentId: string | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
};
