/**
 * User Routes
 * 
 * Handles user preferences and authentication
 */

import { Router, Request, Response, NextFunction } from 'express';
import { getSupabase } from '../services/database.js';
import { logger } from '../utils/index.js';

const router: Router = Router();

// ============================================================================
// Types
// ============================================================================

interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email?: string;
  };
}

// ============================================================================
// Middleware
// ============================================================================

async function verifyToken(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        success: false,
        message: 'No token provided',
      });
      return;
    }

    const token = authHeader.replace('Bearer ', '');
    const supabase = getSupabase();
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      res.status(401).json({
        success: false,
        message: 'Invalid or expired token',
      });
      return;
    }

    req.user = user;
    next();
  } catch (error) {
    logger.error('Auth', `Token verification error: ${(error as Error).message}`);
    res.status(401).json({
      success: false,
      message: 'Token verification failed',
    });
  }
}

// ============================================================================
// Routes
// ============================================================================

/**
 * PUT /preferences - Update user preferences
 */
router.put('/preferences', verifyToken, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'User not authenticated' });
      return;
    }

    const { preferences } = req.body;

    if (!preferences || typeof preferences !== 'object') {
      res.status(400).json({
        success: false,
        message: 'Preferences object is required',
      });
      return;
    }

    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('profiles')
      .update({
        preferences,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId)
      .select('preferences')
      .single();

    if (error) {
      logger.error('User', `Database error: ${error.message}`);
      res.status(500).json({
        success: false,
        message: 'Failed to save preferences',
        error: error.message,
      });
      return;
    }

    res.json({
      success: true,
      preferences: data.preferences,
    });
  } catch (error) {
    logger.error('User', `Error saving preferences: ${(error as Error).message}`);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
});

/**
 * GET /preferences - Get user preferences
 */
router.get('/preferences', verifyToken, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'User not authenticated' });
      return;
    }

    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('profiles')
      .select('preferences')
      .eq('id', userId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        res.json({
          success: true,
          preferences: null,
        });
        return;
      }

      logger.error('User', `Database error: ${error.message}`);
      res.status(500).json({
        success: false,
        message: 'Failed to load preferences',
        error: error.message,
      });
      return;
    }

    res.json({
      success: true,
      preferences: data?.preferences ?? null,
    });
  } catch (error) {
    logger.error('User', `Error loading preferences: ${(error as Error).message}`);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
});

export default router;
