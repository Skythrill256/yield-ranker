import { createContext, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { getSession, onAuthChange, signOut as supabaseSignOut } from '@/auth/api';
import { supabase, type Profile as ProfileRow } from '@/lib/supabase';
import { trackUserLogin } from '@/services/admin';

type AuthContextType = {
  session: Session | null;
  user: User | null;
  profile: ProfileRow | null;
  loading: boolean;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasTrackedLogin, setHasTrackedLogin] = useState(false);

  const loadProfile = async (userId: string | undefined) => {
    if (!userId) {
      setProfile(null);
      return;
    }
    const { data, error } = await supabase
      .from('profiles')
      .select('id,email,role,is_premium,display_name,created_at,updated_at,preferences')
      .eq('id', userId)
      .single();
    if (error) {
      setProfile(null);
      return;
    }
    setProfile(data as ProfileRow);
  };

  useEffect(() => {
    let active = true;
    const hydrate = async () => {
      try {
        const current = await getSession();
        if (active) {
          setSession(current);
          await loadProfile(current?.user.id);
          if (current?.user?.id && !hasTrackedLogin) {
            await trackUserLogin();
            setHasTrackedLogin(true);
          }
        }
      } catch {
        if (active) {
          setSession(null);
          setProfile(null);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };
    hydrate();
    const unsubscribe = onAuthChange(async (next) => {
      setSession(next);
      if (next?.user?.id) {
        await loadProfile(next.user.id);
        if (!hasTrackedLogin) {
          await trackUserLogin();
          setHasTrackedLogin(true);
        }
      } else {
        setProfile(null);
        setHasTrackedLogin(false);
      }
      setLoading(false);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [hasTrackedLogin]);

  const signOut = async () => {
    await supabaseSignOut();
    setSession(null);
    setProfile(null);
  };

  const value = useMemo<AuthContextType>(
    () => ({
      session,
      user: session?.user ?? null,
      profile,
      loading,
      signOut,
    }),
    [session, profile, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};
