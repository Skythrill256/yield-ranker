import { supabase } from '@/lib/supabase';
import type { Session } from '@supabase/supabase-js';

// IMPORTANT:
// OAuth/email redirects must go back to the same origin the user is currently on.
// If we use a hardcoded env URL (e.g. www vs non-www), and that host points to MailerLite,
// the user will land on a MailerLite 404 after Google login.
const appUrl = window.location.origin;

export const signUpEmail = async (email: string, password: string, displayName?: string) => {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      ...(displayName ? { data: { display_name: displayName } } : {}),
      emailRedirectTo: appUrl,
    },
  });
  if (error) {
    throw error;
  }
  return data;
};

export const signInEmail = async (email: string, password: string) => {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error) {
    throw error;
  }
  return data;
};

export const signInGoogle = async () => {
  // Always redirect to home page to avoid routing issues
  // The app will handle navigation after OAuth callback
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: appUrl,
      queryParams: {
        access_type: 'offline',
        prompt: 'consent',
      },
    },
  });
  if (error) {
    throw error;
  }
};

export const signOut = async () => {
  const { error } = await supabase.auth.signOut();
  if (error) {
    throw error;
  }
};

export const getSession = async () => {
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    throw error;
  }
  return data.session;
};

export const onAuthChange = (callback: (session: Session | null) => void) => {
  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange((_event, session) => {
    callback(session);
  });
  return () => {
    subscription.unsubscribe();
  };
};

