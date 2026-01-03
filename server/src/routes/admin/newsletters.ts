/**
 * Admin Newsletter Routes
 * 
 * Handles newsletter/campaign management for admins
 */

import { Router, Request, Response, NextFunction } from 'express';
import { getSupabase } from '../../services/database.js';
import { logger } from '../../utils/index.js';
import {
    createCampaign,
    updateCampaign,
    sendCampaign,
    getCampaign,
    listCampaigns,
    addSubscriber,
    removeSubscriber,
    listSubscribers,
    type Campaign,
} from '../../services/mailerlite.js';

const router: Router = Router();

// ============================================================================
// Types
// ============================================================================

interface AuthenticatedRequest extends Request {
    user?: {
        id: string;
        email?: string;
    };
    profile?: {
        role: string;
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

async function requireAdmin(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
): Promise<void> {
    try {
        const userId = req.user?.id;
        if (!userId) {
            res.status(401).json({
                success: false,
                message: 'User not authenticated',
            });
            return;
        }

        const supabase = getSupabase();
        const { data: profile, error } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', userId)
            .single();

        if (error || !profile) {
            logger.error('Admin', `Failed to fetch user profile: ${error?.message || 'Not found'}`);
            res.status(403).json({
                success: false,
                message: 'Failed to verify admin status',
            });
            return;
        }

        if (profile.role !== 'admin') {
            res.status(403).json({
                success: false,
                message: 'Admin access required',
            });
            return;
        }

        req.profile = profile;
        next();
    } catch (error) {
        logger.error('Admin', `Admin check error: ${(error as Error).message}`);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
        });
    }
}

// ============================================================================
// Routes
// ============================================================================

/**
 * GET /admin/newsletters - List all campaigns/newsletters
 */
router.get('/', verifyToken, requireAdmin, async (req: Request, res: Response): Promise<void> => {
    try {
        const limit = parseInt(req.query.limit as string) || 100;
        const offset = parseInt(req.query.offset as string) || 0;

        const result = await listCampaigns(limit, offset);

        if (result.success) {
            res.json({
                success: true,
                campaigns: result.campaigns || [],
            });
        } else {
            res.status(500).json({
                success: false,
                message: result.message || 'Failed to list campaigns',
            });
        }
    } catch (error) {
        logger.error('Admin Newsletters', `Error listing campaigns: ${(error as Error).message}`);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
        });
    }
});

/**
 * GET /admin/newsletters/:id - Get a single campaign
 */
router.get('/:id', verifyToken, requireAdmin, async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;

        const result = await getCampaign(id);

        if (result.success && result.campaign) {
            res.json({
                success: true,
                campaign: result.campaign,
            });
        } else {
            res.status(404).json({
                success: false,
                message: result.message || 'Campaign not found',
            });
        }
    } catch (error) {
        logger.error('Admin Newsletters', `Error getting campaign: ${(error as Error).message}`);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
        });
    }
});

/**
 * POST /admin/newsletters - Create a new campaign/newsletter
 */
router.post('/', verifyToken, requireAdmin, async (req: Request, res: Response): Promise<void> => {
    try {
        const { name, subject, type, content, from_name, from_email, reply_to } = req.body;

        if (!name || !subject) {
            res.status(400).json({
                success: false,
                message: 'Name and subject are required',
            });
            return;
        }

        const campaign: Omit<Campaign, 'id' | 'status' | 'created_at' | 'updated_at' | 'sent_at'> = {
            name,
            subject,
            type: type || 'regular',
            content: content || {},
            from_name,
            from_email,
            reply_to,
        };

        const result = await createCampaign(campaign);

        if (result.success && result.campaign) {
            res.status(201).json({
                success: true,
                campaign: result.campaign,
                message: result.message,
            });
        } else {
            res.status(500).json({
                success: false,
                message: result.message || 'Failed to create campaign',
            });
        }
    } catch (error) {
        logger.error('Admin Newsletters', `Error creating campaign: ${(error as Error).message}`);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
        });
    }
});

/**
 * PUT /admin/newsletters/:id - Update an existing campaign
 */
router.put('/:id', verifyToken, requireAdmin, async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        const { name, subject, type, content, from_name, from_email, reply_to } = req.body;

        const updates: Partial<Campaign> = {};
        if (name !== undefined) updates.name = name;
        if (subject !== undefined) updates.subject = subject;
        if (type !== undefined) updates.type = type;
        if (content !== undefined) updates.content = content;
        if (from_name !== undefined) updates.from_name = from_name;
        if (from_email !== undefined) updates.from_email = from_email;
        if (reply_to !== undefined) updates.reply_to = reply_to;

        const result = await updateCampaign(id, updates);

        if (result.success && result.campaign) {
            res.json({
                success: true,
                campaign: result.campaign,
                message: result.message,
            });
        } else {
            res.status(500).json({
                success: false,
                message: result.message || 'Failed to update campaign',
            });
        }
    } catch (error) {
        logger.error('Admin Newsletters', `Error updating campaign: ${(error as Error).message}`);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
        });
    }
});

/**
 * POST /admin/newsletters/:id/send - Send a campaign
 */
router.post('/:id/send', verifyToken, requireAdmin, async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;

        const result = await sendCampaign(id);

        if (result.success && result.campaign) {
            res.json({
                success: true,
                campaign: result.campaign,
                message: result.message || 'Campaign sent successfully',
            });
        } else {
            res.status(500).json({
                success: false,
                message: result.message || 'Failed to send campaign',
            });
        }
    } catch (error) {
        logger.error('Admin Newsletters', `Error sending campaign: ${(error as Error).message}`);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
        });
    }
});

/**
 * POST /admin/newsletters/subscribers - Add a subscriber (admin only)
 */
router.post('/subscribers', verifyToken, requireAdmin, async (req: Request, res: Response): Promise<void> => {
    try {
        const { email } = req.body;

        if (!email || typeof email !== 'string') {
            res.status(400).json({
                success: false,
                message: 'Email is required',
            });
            return;
        }

        const result = await addSubscriber(email.trim());

        if (result.success) {
            res.json({
                success: true,
                message: result.message,
                subscriberId: result.subscriberId,
            });
        } else {
            res.status(500).json({
                success: false,
                message: result.message,
            });
        }
    } catch (error) {
        logger.error('Admin Newsletters', `Error adding subscriber: ${(error as Error).message}`);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
        });
    }
});

/**
 * DELETE /admin/newsletters/subscribers/:email - Remove a subscriber (admin only)
 */
router.delete('/subscribers/:email', verifyToken, requireAdmin, async (req: Request, res: Response): Promise<void> => {
    try {
        const { email } = req.params;

        if (!email) {
            res.status(400).json({
                success: false,
                message: 'Email is required',
            });
            return;
        }

        const result = await removeSubscriber(decodeURIComponent(email));

        if (result.success) {
            res.json({
                success: true,
                message: result.message,
            });
        } else {
            res.status(500).json({
                success: false,
                message: result.message,
            });
        }
    } catch (error) {
        logger.error('Admin Newsletters', `Error removing subscriber: ${(error as Error).message}`);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
        });
    }
});

/**
 * GET /admin/newsletters/subscribers - List all subscribers (admin only)
 */
router.get('/subscribers', verifyToken, requireAdmin, async (req: Request, res: Response): Promise<void> => {
    try {
        const limit = parseInt(req.query.limit as string) || 1000;
        const offset = parseInt(req.query.offset as string) || 0;

        const result = await listSubscribers(limit, offset);

        if (result.success) {
            res.json({
                success: true,
                subscribers: result.subscribers || [],
            });
        } else {
            res.status(500).json({
                success: false,
                message: result.message || 'Failed to list subscribers',
            });
        }
    } catch (error) {
        logger.error('Admin Newsletters', `Error listing subscribers: ${(error as Error).message}`);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
        });
    }
});

export default router;

