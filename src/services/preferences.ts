import { RankingWeights } from "@/types/etf";
import { supabase } from "@/lib/supabase";

const API_BASE_URL = import.meta.env.VITE_API_URL || "";

export type RankingPreset = {
  name: string;
  weights: RankingWeights;
  createdAt: string;
};

export type UserPreferences = {
  ranking_weights?: RankingWeights;
  return_view?: "total" | "price";
  ranking_presets?: RankingPreset[];
  chart_settings?: {
    chartType?: "price" | "totalReturn";
    selectedTimeframe?: string;
    showTotalReturns?: boolean;
  };
};

/**
 * Get auth token for API requests
 */
const getAuthToken = async (): Promise<string | null> => {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token || null;
};

/**
 * Save user preferences to the database via backend API
 */
export const saveUserPreferences = async (
  userId: string,
  preferences: UserPreferences
): Promise<void> => {
  const token = await getAuthToken();
  if (!token) {
    throw new Error("Not authenticated");
  }

  const response = await fetch(`${API_BASE_URL}/api/user/preferences`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ preferences }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: "Failed to save preferences" }));
    throw new Error(error.message || `HTTP ${response.status}`);
  }
};

/**
 * Load user preferences from the database via backend API
 */
export const loadUserPreferences = async (
  userId: string
): Promise<UserPreferences | null> => {
  const token = await getAuthToken();
  if (!token) {
    console.warn("Not authenticated, cannot load preferences");
    return null;
  }

  try {
    const response = await fetch(`${API_BASE_URL}/api/user/preferences`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        // No preferences saved yet, return null
        return null;
      }
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    return (data.preferences as UserPreferences) || null;
  } catch (error) {
    console.error("Failed to load preferences:", error);
    return null;
  }
};

/**
 * Save ranking weights specifically
 */
export const saveRankingWeights = async (
  userId: string,
  weights: RankingWeights
): Promise<void> => {
  console.log("💾 Saving ranking weights:", weights, "for user:", userId);
  
  // First get existing preferences
  const existing = await loadUserPreferences(userId);
  console.log("📦 Existing preferences:", existing);
  
  // Merge with new weights
  const updated: UserPreferences = {
    ...existing,
    ranking_weights: weights,
  };

  console.log("🔄 Updated preferences to save:", updated);

  const { data, error } = await supabase
    .from("profiles")
    .update({ preferences: updated })
    .eq("id", userId)
    .select("preferences");

  if (error) {
    console.error("❌ Error saving preferences:", error);
    throw new Error(`Failed to save preferences: ${error.message}`);
  }

  console.log("✅ Successfully saved preferences:", data);
  
  // Verify it was saved
  const { data: verifyData, error: verifyError } = await supabase
    .from("profiles")
    .select("preferences")
    .eq("id", userId)
    .single();
    
  if (verifyError) {
    console.error("❌ Error verifying save:", verifyError);
  } else {
    console.log("✅ Verified saved preferences:", verifyData?.preferences);
  }
};

/**
 * Load ranking weights specifically
 */
export const loadRankingWeights = async (
  userId: string
): Promise<RankingWeights | null> => {
  const preferences = await loadUserPreferences(userId);
  return preferences?.ranking_weights || null;
};

/**
 * Save a new ranking preset
 */
export const saveRankingPreset = async (
  userId: string,
  presetName: string,
  weights: RankingWeights,
  setAsDefault: boolean = false
): Promise<void> => {
  const existing = await loadUserPreferences(userId) || {};
  const existingPresets = Array.isArray(existing?.ranking_presets) ? existing.ranking_presets : [];
  
  // Check if preset with same name exists
  const filteredPresets = existingPresets.filter(p => p.name !== presetName);
  
  const newPreset: RankingPreset = {
    name: presetName,
    weights,
    createdAt: new Date().toISOString(),
  };
  
  const updated: UserPreferences = {
    ...existing,
    ranking_presets: [...filteredPresets, newPreset],
  };
  
  // If setAsDefault is true, also save as default ranking weights
  if (setAsDefault) {
    updated.ranking_weights = weights;
  }
  
  const { error } = await supabase
    .from("profiles")
    .update({ preferences: updated })
    .eq("id", userId);
    
  if (error) {
    throw new Error(`Failed to save preset: ${error.message}`);
  }
};

/**
 * Load all ranking presets
 */
export const loadRankingPresets = async (
  userId: string
): Promise<RankingPreset[]> => {
  const preferences = await loadUserPreferences(userId);
  return preferences?.ranking_presets || [];
};

/**
 * Delete a ranking preset
 */
export const deleteRankingPreset = async (
  userId: string,
  presetName: string
): Promise<void> => {
  const existing = await loadUserPreferences(userId);
  const existingPresets = existing?.ranking_presets || [];
  
  const updated: UserPreferences = {
    ...existing,
    ranking_presets: existingPresets.filter(p => p.name !== presetName),
  };
  
  const { error } = await supabase
    .from("profiles")
    .update({ preferences: updated })
    .eq("id", userId);
    
  if (error) {
    throw new Error(`Failed to delete preset: ${error.message}`);
  }
};

/**
 * Save chart settings
 */
export const saveChartSettings = async (
  userId: string,
  chartSettings: {
    chartType?: "price" | "totalReturn";
    selectedTimeframe?: string;
    showTotalReturns?: boolean;
  }
): Promise<void> => {
  const existing = await loadUserPreferences(userId);
  
  const updated: UserPreferences = {
    ...existing,
    chart_settings: chartSettings,
  };
  
  const { error } = await supabase
    .from("profiles")
    .update({ preferences: updated })
    .eq("id", userId);
    
  if (error) {
    throw new Error(`Failed to save chart settings: ${error.message}`);
  }
};

