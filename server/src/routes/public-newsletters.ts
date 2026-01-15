/**
 * Public Newsletter Routes
 * 
 * Public endpoints for viewing sent newsletters (no auth required)
 */

import { Router, Request, Response } from 'express';
import { logger } from '../utils/index.js';
import { listCampaigns, getCampaign } from '../services/mailerlite.js';

const router: Router = Router();

/**
 * GET /api/public-newsletters - List all sent campaigns (public)
 */
router.get('/', async (req: Request, res: Response): Promise<void> => {
    try {
        const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
        const offset = parseInt(req.query.offset as string) || 0;

        const result = await listCampaigns(limit, offset);

        if (result.success && result.campaigns) {
            // Filter to only sent campaigns and sort by sent_at descending
            const sentCampaigns = result.campaigns
                .filter((c) => c.status === 'sent')
                .sort((a, b) => {
                    const dateA = a.sent_at ? new Date(a.sent_at).getTime() : 0;
                    const dateB = b.sent_at ? new Date(b.sent_at).getTime() : 0;
                    return dateB - dateA; // Newest first
                })
                .map((campaign) => ({
                    // Only expose safe public fields
                    id: campaign.id,
                    name: campaign.name,
                    subject: campaign.subject,
                    sent_at: campaign.sent_at,
                }));

            res.json({
                success: true,
                newsletters: sentCampaigns,
            });
        } else {
            res.status(500).json({
                success: false,
                message: result.message || 'Failed to list newsletters',
            });
        }
    } catch (error) {
        logger.error('Public Newsletters', `Error listing newsletters: ${(error as Error).message}`);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
        });
    }
});

/**
 * GET /api/public-newsletters/:id - Get a single sent newsletter (public)
 */
router.get('/:id', async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;

        const result = await getCampaign(id);

        if (result.success && result.campaign) {
            // Only return if the campaign was sent
            if (result.campaign.status !== 'sent') {
                res.status(404).json({
                    success: false,
                    message: 'Newsletter not found',
                });
                return;
            }

            // Return safe public fields including content
            res.json({
                success: true,
                newsletter: {
                    id: result.campaign.id,
                    name: result.campaign.name,
                    subject: result.campaign.subject,
                    sent_at: result.campaign.sent_at,
                    content: result.campaign.content,
                },
            });
        } else {
            res.status(404).json({
                success: false,
                message: 'Newsletter not found',
            });
        }
    } catch (error) {
        logger.error('Public Newsletters', `Error getting newsletter: ${(error as Error).message}`);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
        });
    }
});

export default router;
