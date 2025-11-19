import { supabase } from "@/lib/supabase";

export type ProfileRow = {
  id: string;
  email: string;
  role: "user" | "admin";
  is_premium: boolean;
  display_name: string | null;
  created_at: string;
  updated_at: string;
};

export const listProfiles = async (): Promise<ProfileRow[]> => {
  const { data, error } = await supabase
    .from("profiles")
    .select("id,email,role,is_premium,display_name,created_at,updated_at")
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
    .select("id,email,role,is_premium,display_name,created_at,updated_at")
    .single();
  if (error) {
    throw error;
  }
  return data as ProfileRow;
};






