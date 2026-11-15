import { onIdTokenChanged, type User } from 'firebase/auth';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { auth, firebaseConfigured } from '@/lib/firebase';

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
};

const AuthContext = createContext<AuthState>({
  user: null,
  role: 'visitor',
  loading: true,
  configured: false,
  technicalAdmin: false,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<AppRole>('visitor');
  const [technicalAdmin, setTechnicalAdmin] = useState(false);
  const [loading, setLoading] = useState(firebaseConfigured);

  useEffect(() => {
    if (!auth) {
      return;
    }

    return onIdTokenChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (!currentUser) {
        setRole('visitor');
        setTechnicalAdmin(false);
        setLoading(false);
        return;
      }

      try {
        const token = await currentUser.getIdTokenResult();
        const claimRole = token.claims.role;
        const roles: AppRole[] = ['firefighter', 'brigade_leader', 'incident_commander', 'super_admin'];
        setRole(typeof claimRole === 'string' && roles.includes(claimRole as AppRole) ? claimRole as AppRole : 'citizen');
        setTechnicalAdmin(token.claims.technicalAdmin === true);
      } catch {
        setRole('citizen');
        setTechnicalAdmin(false);
      } finally {
        setLoading(false);
      }
    });
  }, []);

  const value = useMemo(
    () => ({ user, role, loading, configured: firebaseConfigured, technicalAdmin }),
    [loading, role, technicalAdmin, user],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
