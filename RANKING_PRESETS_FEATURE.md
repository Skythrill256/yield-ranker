# Ranking Presets Feature

## Overview
Added a clean, seamless preset system to the "Customize Rankings" panel that allows users to save, load, and manage multiple named ranking configurations.

## Features Implemented

### 1. **Save Presets**
- Click "Save as Preset" button in the ranking panel
- Enter a custom name for your preset
- Saves current Yield, DVI, and Total Return weights plus timeframe
- Validates weights (must total 100%) before saving

### 2. **Load Presets**
- Saved presets appear at the top of the ranking panel
- Click any preset card to instantly load those settings
- Shows quick preview: Y:30% D:30% R:40%
- Smooth hover effects matching your design aesthetic

### 3. **Delete Presets**
- Hover over a preset card to reveal delete button (X)
- One-click deletion with confirmation toast
- Clean, unobtrusive UI that appears only on hover

### 4. **Design**
- Matches existing slate/primary color scheme
- Uses same border-2, rounded-lg styling as rest of dashboard
- Responsive grid layout (2 columns)
- Smooth transitions and hover states
- Dashed border "Save as Preset" button for clear call-to-action

## Technical Implementation

### Frontend Changes

#### `src/services/preferences.ts`
- Added `RankingPreset` type with name, weights, and createdAt
- Extended `UserPreferences` type to include `ranking_presets?: RankingPreset[]`
- New functions:
  - `saveRankingPreset()` - saves a new preset or overwrites existing one with same name
  - `loadRankingPresets()` - loads all user presets
  - `deleteRankingPreset()` - removes a preset by name

#### `src/pages/Dashboard.tsx`
- Added state for presets, save dialog, and preset name input
- Loads presets from profile on mount
- Three new handlers:
  - `handleSavePreset()` - validates and saves new preset
  - `handleLoadPreset()` - applies preset weights to sliders
  - `handleDeletePreset()` - removes preset from storage
- UI additions:
  - Preset grid at top of ranking panel (only shows if presets exist)
  - "Save as Preset" button with inline input dialog
  - Delete buttons on hover for each preset card

### Backend Requirements

**✅ NO BACKEND CHANGES NEEDED!**

The existing `preferences` JSONB column in the `profiles` table already supports this feature. The structure is:

```json
{
  "ranking_weights": { ... },
  "ranking_presets": [
    {
      "name": "Conservative",
      "weights": { "yield": 50, "stdDev": 30, "totalReturn": 20, "timeframe": "12mo" },
      "createdAt": "2024-01-15T10:30:00.000Z"
    },
    {
      "name": "Growth Focused",
      "weights": { "yield": 10, "stdDev": 20, "totalReturn": 70, "timeframe": "3mo" },
      "createdAt": "2024-01-16T14:20:00.000Z"
    }
  ]
}
```

The JSONB column is flexible and already indexed, so no schema migration is required.

## User Experience

1. **First Time**: User adjusts sliders, clicks "Save as Preset", enters name like "Conservative"
2. **Saved**: Preset appears at top of panel with quick stats
3. **Switch**: Click another preset (e.g., "Aggressive") to instantly load those weights
4. **Manage**: Hover and delete presets you no longer need
5. **Apply**: Click "Apply Rankings" to use the loaded preset on your dashboard

## Storage

- Presets are stored per-user in Supabase `profiles.preferences` JSONB column
- Automatically synced across devices/sessions
- No limit on number of presets (reasonable usage expected)
- Duplicate names overwrite previous preset with same name

## Design Aesthetic Match

✅ Slate-50 backgrounds for weight sliders
✅ Border-2 with slate-200 for cards
✅ Primary color for active states and CTAs
✅ Smooth hover transitions
✅ Consistent rounded-lg corners
✅ Tabular-nums for weight percentages
✅ Clean, minimal icons (lucide-react)
✅ Responsive spacing and typography

## Testing Checklist

- [ ] Save a preset with valid weights (100% total)
- [ ] Try to save with invalid weights (should show error)
- [ ] Load a preset and verify sliders update
- [ ] Delete a preset and verify it's removed
- [ ] Refresh page and verify presets persist
- [ ] Save preset with same name (should overwrite)
- [ ] Apply rankings after loading a preset
- [ ] Check mobile/tablet responsiveness

## Future Enhancements (Optional)

- Export/import presets as JSON
- Share presets with other users
- Preset categories/tags
- Preset search/filter
- Duplicate preset feature
- Preset usage analytics

