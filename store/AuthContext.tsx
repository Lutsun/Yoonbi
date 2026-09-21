import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Session } from '@supabase/supabase-js';
import { supabase } from '../services/supabase';
import { getProfile } from '../services/profile';
import { User } from '../types/auth';

type AuthContextValue = {
  user: User | null;
  session: Session | null;
  isLoggedIn: boolean;
  isRestoring: boolean;
  // Un numéro a été vérifié par SMS (vraie session Supabase Auth) mais
  // n'a pas encore de profil Yoonbi (nom/ville) : direction complete-profile.
  needsProfile: boolean;
  refreshProfile: () => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isRestoring, setIsRestoring] = useState(true);
  const [checkingProfile, setCheckingProfile] = useState(false);

  const loadProfile = useCallback(async (activeSession: Session | null) => {
    if (!activeSession?.user) {
      setUser(null);
      return;
    }
    setCheckingProfile(true);
    try {
      const profile = await getProfile(activeSession.user.id, activeSession.user.phone ?? '');
      setUser(profile ?? null);
    } finally {
      setCheckingProfile(false);
    }
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      loadProfile(data.session).finally(() => setIsRestoring(false));
    });

    // Réagit à toute connexion, déconnexion ou rafraîchissement de session,
    // où qu'il ait lieu dans l'app — géré entièrement par Supabase Auth.
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      loadProfile(nextSession);
    });

    return () => subscription.subscription.unsubscribe();
  }, [loadProfile]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      session,
      isLoggedIn: !!user,
      isRestoring,
      needsProfile: !!session && !user && !checkingProfile,
      refreshProfile: () => loadProfile(session),
      logout: async () => {
        await supabase.auth.signOut();
      },
    }),
    [user, session, isRestoring, checkingProfile, loadProfile]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
