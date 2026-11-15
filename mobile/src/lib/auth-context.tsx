import { onIdTokenChanged, type User } from 'firebase/auth';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db, firebaseConfigured } from '@/lib/firebase';

export type AppRole =
  | 'visitor'
  | 'citizen'
  | 'firefighter'
  | 'brigade_leader'
  | 'incident_commander'
  | 'super_admin';

type AuthState = {
  user: User | null;
  role: AppRole;
  loading: boolean;
  configured: boolean;
  technicalAdmin: boolean;
  accessActive: boolean;
  accessError: string | null;
};

const AuthContext = createContext<AuthState>({
  user: null,
  role: 'visitor',
  loading: true,
  configured: false,
  technicalAdmin: false,
  accessActive: false,
  accessError: null,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<AppRole>('visitor');
  const [technicalAdmin, setTechnicalAdmin] = useState(false);
  const [accessActive, setAccessActive] = useState(false);
  const [accessError, setAccessError] = useState<string | null>(null);
  const [loading, setLoading] = useState(firebaseConfigured);

  useEffect(() => {
    if (!auth) {
      return;
    }

    let generation = 0;
    let unsubscribeAccess: (() => void) | undefined;
    const unsubscribeAuth = onIdTokenChanged(auth, async (currentUser) => {
      generation += 1;
      const currentGeneration = generation;
      unsubscribeAccess?.();
      unsubscribeAccess = undefined;
      setUser(currentUser);
      if (!currentUser) {
        setRole('visitor');
        setTechnicalAdmin(false);
        setAccessActive(false);
        setAccessError(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const token = await currentUser.getIdTokenResult();
        if (currentGeneration !== generation) return;
        if (!db) throw new Error('Firestore no está disponible para comprobar el acceso.');
        unsubscribeAccess = onSnapshot(
          doc(db, 'access', currentUser.uid),
          (access) => {
            if (currentGeneration !== generation) return;
            if (!access.exists() || access.data().active !== true) {
              setRole('visitor');
              setTechnicalAdmin(false);
              setAccessActive(false);
              setAccessError('La cuenta no tiene acceso activo.');
              setLoading(false);
              return;
            }
            const accessRole = access.data().role;
            const roles: AppRole[] = ['citizen', 'firefighter', 'brigade_leader', 'incident_commander', 'super_admin'];
            setRole(typeof accessRole === 'string' && roles.includes(accessRole as AppRole) ? accessRole as AppRole : 'visitor');
            setTechnicalAdmin(token.claims.technicalAdmin === true);
            setAccessActive(true);
            setAccessError(null);
            setLoading(false);
          },
          (error) => {
            if (currentGeneration !== generation) return;
            setRole('visitor');
            setTechnicalAdmin(false);
            setAccessActive(false);
            setAccessError(error.message);
            setLoading(false);
          },
        );
      } catch (error) {
        if (currentGeneration !== generation) return;
        setRole('visitor');
        setTechnicalAdmin(false);
        setAccessActive(false);
        setAccessError(error instanceof Error ? error.message : 'No se pudo comprobar el acceso de la cuenta.');
        setLoading(false);
      }
    });
    return () => {
      generation += 1;
      unsubscribeAuth();
      unsubscribeAccess?.();
    };
  }, []);

  const value = useMemo(
    () => ({ user, role, loading, configured: firebaseConfigured, technicalAdmin, accessActive, accessError }),
    [accessActive, accessError, loading, role, technicalAdmin, user],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
