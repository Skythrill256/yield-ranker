# Backend API Implementation: Saved Ranking Weights

## 🎯 What the Frontend Does

The frontend calls your backend API to save/load ranking weights. Here's exactly what happens:

### When User Clicks "Apply Rankings":
1. Frontend calls: `PUT /api/user/preferences`
2. Sends: `{ preferences: { ranking_weights: { yield: 40, stdDev: 30, totalReturn: 30, timeframe: "3mo" } } }`
3. Backend saves to `profiles.preferences` column in database
4. Returns success response

### When User Logs In / Page Loads:
1. Frontend calls: `GET /api/user/preferences`
2. Backend returns: `{ preferences: { ranking_weights: {...} } }`
3. Frontend applies these weights automatically

---

## 📋 Backend Endpoints to Implement

### 1. PUT /api/user/preferences
**Save user preferences**

**Request:**
```http
PUT /api/user/preferences
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "preferences": {
    "ranking_weights": {
      "yield": 40,
      "stdDev": 30,
      "totalReturn": 30,
      "timeframe": "3mo"
    }
  }
}
```

**Response (Success):**
```json
{
  "success": true,
  "preferences": {
    "ranking_weights": {
      "yield": 40,
      "stdDev": 30,
      "totalReturn": 30,
      "timeframe": "3mo"
    }
  }
}
```

**Response (Error):**
```json
{
  "success": false,
  "message": "Failed to save preferences"
}
```

---

### 2. GET /api/user/preferences
**Load user preferences**

**Request:**
```http
GET /api/user/preferences
Authorization: Bearer <jwt_token>
```

**Response (Success - Has Preferences):**
```json
{
  "success": true,
  "preferences": {
    "ranking_weights": {
      "yield": 40,
      "stdDev": 30,
      "totalReturn": 30,
      "timeframe": "3mo"
    }
  }
}
```

**Response (Success - No Preferences Yet):**
```json
{
  "success": true,
  "preferences": null
}
```

**Response (Error):**
```json
{
  "success": false,
  "message": "Failed to load preferences"
}
```

---

## 🔧 Backend Implementation (Node.js/Express)

### Step 1: Add to your Express server

```javascript
// In your server/index.js or server/routes/user.js

const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Middleware to verify JWT token
const verifyToken = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ success: false, message: 'No token provided' });
    }

    // Verify token with Supabase
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) {
      return res.status(401).json({ success: false, message: 'Invalid token' });
    }

    req.user = user;
    next();
  } catch (error) {
    res.status(401).json({ success: false, message: 'Token verification failed' });
  }
};

// PUT /api/user/preferences - Save preferences
router.put('/preferences', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { preferences } = req.body;

    if (!preferences) {
      return res.status(400).json({ 
        success: false, 
        message: 'Preferences object is required' 
      });
    }

    // Update user's preferences in database
    const { data, error } = await supabase
      .from('profiles')
      .update({ 
        preferences: preferences,
        updated_at: new Date().toISOString()
      })
      .eq('id', userId)
      .select('preferences')
      .single();

    if (error) {
      console.error('Error saving preferences:', error);
      return res.status(500).json({ 
        success: false, 
        message: 'Failed to save preferences',
        error: error.message 
      });
    }

    res.json({
      success: true,
      preferences: data.preferences
    });
  } catch (error) {
    console.error('Error in PUT /api/user/preferences:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error' 
    });
  }
});

// GET /api/user/preferences - Load preferences
router.get('/preferences', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;

    // Get user's preferences from database
    const { data, error } = await supabase
      .from('profiles')
      .select('preferences')
      .eq('id', userId)
      .single();

    if (error) {
      // If user doesn't exist or no preferences, return null
      if (error.code === 'PGRST116') {
        return res.json({
          success: true,
          preferences: null
        });
      }
      
      console.error('Error loading preferences:', error);
      return res.status(500).json({ 
        success: false, 
        message: 'Failed to load preferences',
        error: error.message 
      });
    }

    res.json({
      success: true,
      preferences: data?.preferences || null
    });
  } catch (error) {
    console.error('Error in GET /api/user/preferences:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error' 
    });
  }
});

module.exports = router;
```

### Step 2: Mount the routes in your main server file

```javascript
// In your server/index.js

const userRoutes = require('./routes/user'); // or wherever you put the routes

app.use('/api/user', userRoutes);
```

---

## 🗄️ Database Setup

### Run this SQL in Supabase SQL Editor:

```sql
-- Add preferences column if it doesn't exist
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS preferences JSONB DEFAULT '{}'::jsonb;

-- Create index for fast queries
CREATE INDEX IF NOT EXISTS idx_profiles_preferences 
ON profiles USING gin(preferences);

-- Verify RLS policy allows users to update their own profile
-- (This should already exist, but verify)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'profiles' 
    AND policyname = 'Users can update own profile'
  ) THEN
    CREATE POLICY "Users can update own profile"
      ON profiles FOR UPDATE
      USING (auth.uid() = id);
  END IF;
END $$;
```

---

## 🧪 Testing the Backend

### Test 1: Save Preferences

```bash
# Replace YOUR_TOKEN with actual JWT token
curl -X PUT http://localhost:4000/api/user/preferences \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "preferences": {
      "ranking_weights": {
        "yield": 40,
        "stdDev": 30,
        "totalReturn": 30,
        "timeframe": "3mo"
      }
    }
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "preferences": {
    "ranking_weights": {
      "yield": 40,
      "stdDev": 30,
      "totalReturn": 30,
      "timeframe": "3mo"
    }
  }
}
```

### Test 2: Load Preferences

```bash
curl -X GET http://localhost:4000/api/user/preferences \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Expected Response:**
```json
{
  "success": true,
  "preferences": {
    "ranking_weights": {
      "yield": 40,
      "stdDev": 30,
      "totalReturn": 30,
      "timeframe": "3mo"
    }
  }
}
```

---

## 🔐 Authentication

The frontend sends the JWT token from Supabase in the `Authorization` header:
```
Authorization: Bearer <supabase_jwt_token>
```

Your backend should:
1. Extract token from header
2. Verify with Supabase: `supabase.auth.getUser(token)`
3. Use `user.id` to identify which user's preferences to save/load

---

## 📝 Complete Example (Full Route File)

Create `server/routes/user.js`:

```javascript
const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Verify JWT token middleware
const verifyToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        success: false, 
        message: 'No token provided' 
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error } = await supabase.auth.getUser(token);
    
    if (error || !user) {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid or expired token' 
      });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error('Token verification error:', error);
    res.status(401).json({ 
      success: false, 
      message: 'Token verification failed' 
    });
  }
};

// PUT /api/user/preferences
router.put('/preferences', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { preferences } = req.body;

    if (!preferences || typeof preferences !== 'object') {
      return res.status(400).json({ 
        success: false, 
        message: 'Preferences object is required' 
      });
    }

    const { data, error } = await supabase
      .from('profiles')
      .update({ 
        preferences: preferences,
        updated_at: new Date().toISOString()
      })
      .eq('id', userId)
      .select('preferences')
      .single();

    if (error) {
      console.error('Database error:', error);
      return res.status(500).json({ 
        success: false, 
        message: 'Failed to save preferences',
        error: error.message 
      });
    }

    res.json({
      success: true,
      preferences: data.preferences
    });
  } catch (error) {
    console.error('Error saving preferences:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error' 
    });
  }
});

// GET /api/user/preferences
router.get('/preferences', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;

    const { data, error } = await supabase
      .from('profiles')
      .select('preferences')
      .eq('id', userId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // No row found - user doesn't have preferences yet
        return res.json({
          success: true,
          preferences: null
        });
      }
      
      console.error('Database error:', error);
      return res.status(500).json({ 
        success: false, 
        message: 'Failed to load preferences',
        error: error.message 
      });
    }

    res.json({
      success: true,
      preferences: data?.preferences || null
    });
  } catch (error) {
    console.error('Error loading preferences:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error' 
    });
  }
});

module.exports = router;
```

Then in your `server/index.js`:

```javascript
const userRoutes = require('./routes/user');
app.use('/api/user', userRoutes);
```

---

## ✅ Summary

**Frontend:**
- ✅ Updated to call `/api/user/preferences` (PUT and GET)
- ✅ Sends JWT token in Authorization header
- ✅ Handles responses correctly

**Backend (You Need to Add):**
- ✅ `PUT /api/user/preferences` - Save preferences
- ✅ `GET /api/user/preferences` - Load preferences
- ✅ JWT token verification middleware
- ✅ Database update/select logic

**Database:**
- ✅ Run SQL to add `preferences` column
- ✅ Verify RLS policies

That's it! Once you add these endpoints, everything will work! 🎉

