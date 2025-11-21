import { supabase } from "@/lib/supabase";

export type ProfileRow = {
  id: string;
  email: string;
  role: "user" | "admin" | "premium" | "guest";
  is_premium: boolean;
  display_name: string | null;
  created_at: string;
  updated_at: string;
  last_login: string | null;
  preferences?: Record<string, any>;
};

export type SiteSetting = {
  key: string;
  value: string;
  description: string | null;
  updated_by: string | null;
  updated_at: string;
};

export const listProfiles = async (): Promise<ProfileRow[]> => {
  const { data, error } = await supabase
    .from("profiles")
    .select(
      "id,email,role,is_premium,display_name,created_at,updated_at,last_login"
    )
    .order("created_at", { ascending: false });
  if (error) {
    throw error;
  }
  return (data ?? []) as ProfileRow[];
};

export const updateProfile = async (
  id: string,
  updates: Partial<Pick<ProfileRow, "role" | "is_premium" | "display_name">>
): Promise<ProfileRow> => {
  const { data, error } = await supabase
    .from("profiles")
    .update(updates)
    .eq("id", id)
    .select(
      "id,email,role,is_premium,display_name,created_at,updated_at,last_login"
    )
    .single();
  if (error) {
    throw error;
  }
  return data as ProfileRow;
};

export const trackUserLogin = async (): Promise<void> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) {
      return;
    }
    
    const { error } = await supabase
      .from("profiles")
      .update({ last_login: new Date().toISOString() })
      .eq("id", user.id);
    
    if (error) {
      console.error("Failed to track login:", error);
    }
  } catch (error) {
    console.error("Failed to track login:", error);
  }
};

export const getSiteSettings = async (): Promise<SiteSetting[]> => {
  const { data, error } = await supabase
    .from("site_settings")
    .select("key,value,description,updated_by,updated_at")
    .order("key", { ascending: true });
  if (error) {
    throw error;
  }
  return (data ?? []) as SiteSetting[];
};

export const updateSiteSetting = async (
  key: string,
  value: string,
  updatedBy?: string | null
): Promise<SiteSetting> => {
  const { data, error } = await supabase
    .from("site_settings")
    .upsert(
      {
        key,
        value,
        updated_by: updatedBy ?? null,
      },
      { onConflict: "key" }
    )
    .select("key,value,description,updated_by,updated_at")
    .single();
  if (error) {
    throw error;
  }
  return data as SiteSetting;
};






