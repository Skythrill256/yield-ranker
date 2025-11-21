# Frontend ↔ Backend Connection: Saved Ranking Weights

## 📋 What the Frontend Does

### File: `src/services/preferences.ts`

**Updated to call your backend API instead of Supabase directly:**

1. **Save Preferences:**
   - Calls: `PUT /api/user/preferences`
   - Sends: `{ preferences: { ranking_weights: {...} } }`
   - Headers: `Authorization: Bearer <jwt_token>`

2. **Load Preferences:**
   - Calls: `GET /api/user/preferences`
   - Headers: `Authorization: Bearer <jwt_token>`
   - Returns: `{ success: true, preferences: {...} }`

### File: `src/pages/Dashboard.tsx`

**What happens when user clicks "Apply Rankings":**

```typescript
const applyRankings = async () => {
  // 1. Creates weights object
  const newWeights = {
    yield: yieldWeight,
    stdDev: stdDevWeight,
    totalReturn: totalReturnWeight,
    timeframe: totalReturnTimeframe,
  };

  // 2. Saves to backend API
  await saveRankingWeights(user.id, newWeights);
  // This calls: PUT /api/user/preferences
};
```

**What happens on page load:**

```typescript
useEffect(() => {
  // Loads from profile.preferences
  // Profile is loaded by AuthContext
  // AuthContext gets profile from Supabase (which has preferences from backend)
  const savedWeights = profile.preferences.ranking_weights;
  if (savedWeights) {
    setWeights(savedWeights);
    // Apply the saved weights
  }
}, [profile]);
```

---

## 🔧 What the Backend Needs to Do

### 1. Add Routes

Create `server/routes/user.js` with:

```javascript
// PUT /api/user/preferences - Save
router.put('/preferences', verifyToken, async (req, res) => {
  // Save req.body.preferences to profiles.preferences column
});

// GET /api/user/preferences - Load
router.get('/preferences', verifyToken, async (req, res) => {
  // Return profiles.preferences for authenticated user
});
```

### 2. Mount Routes

In `server/index.js`:

```javascript
const userRoutes = require('./routes/user');
app.use('/api/user', userRoutes);
```

### 3. Database Setup

Run SQL in Supabase:

```sql
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS preferences JSONB DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_profiles_preferences 
ON profiles USING gin(preferences);
```

---

## 🔄 Complete Flow

### Saving Rankings:

```
User clicks "Apply Rankings"
  ↓
Frontend: applyRankings() called
  ↓
Frontend: saveRankingWeights(userId, weights)
  ↓
Frontend: PUT /api/user/preferences
  ↓
Backend: verifyToken() - checks JWT
  ↓
Backend: UPDATE profiles SET preferences = {...} WHERE id = userId
  ↓
Backend: Returns { success: true, preferences: {...} }
  ↓
Frontend: Shows "Rankings saved ✓" toast
  ↓
✅ Saved to database!
```

### Loading Rankings:

```
User logs in / page loads
  ↓
AuthContext: Loads profile from Supabase
  ↓
Profile includes: { preferences: { ranking_weights: {...} } }
  ↓
Dashboard: useEffect sees profile.preferences
  ↓
Dashboard: setWeights(savedWeights)
  ↓
✅ Rankings applied automatically!
```

---

## 📝 Exact Code to Give Backend Team

**Copy this entire file and give it to them:**

See: `BACKEND_RANKING_WEIGHTS_API.md`

It contains:
- ✅ Complete route implementation
- ✅ JWT verification middleware
- ✅ Error handling
- ✅ Testing instructions
- ✅ Database setup SQL

---

## 🧪 Testing

### Test Frontend → Backend Connection:

1. **Start backend server:**
   ```bash
   cd server
   npm start
   ```

2. **Open frontend:**
   ```bash
   npm run dev
   ```

3. **Open browser console (F12)**

4. **Test save:**
   - Open "Customize Rankings"
   - Change weights (e.g., 40/30/30)
   - Select "3 Mo"
   - Click "Apply Rankings"
   - Look for console: `✅ Saved weights successfully`

5. **Test load:**
   - Refresh page
   - Look for console: `✅ Loading saved weights from profile`
   - Weights should be 40/30/30 with 3 Mo selected

---

## ✅ Checklist

**Frontend (Already Done):**
- ✅ Updated `preferences.ts` to call backend API
- ✅ Dashboard saves weights on "Apply Rankings"
- ✅ Dashboard loads weights on mount
- ✅ Console logging for debugging

**Backend (You Need to Add):**
- ⬜ Create `server/routes/user.js`
- ⬜ Add `PUT /api/user/preferences` endpoint
- ⬜ Add `GET /api/user/preferences` endpoint
- ⬜ Add JWT verification middleware
- ⬜ Mount routes in `server/index.js`

**Database (You Need to Run):**
- ⬜ Run SQL to add `preferences` column
- ⬜ Verify RLS policies allow updates

---

## 🚀 Quick Start for Backend

1. **Copy the code from `BACKEND_RANKING_WEIGHTS_API.md`**
2. **Create `server/routes/user.js`** with the routes
3. **Add to `server/index.js`:** `app.use('/api/user', require('./routes/user'))`
4. **Run the SQL** in Supabase
5. **Test it!**

That's it! The frontend is already set up and waiting for your backend endpoints. 🎉

