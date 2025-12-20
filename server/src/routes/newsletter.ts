/**
 * Newsletter Routes
 * 
 * Handles newsletter subscription endpoints
 */

import { Router, Request, Response } from 'express';
import { addSubscriber } from '../services/mailerlite.js';
import { logger } from '../utils/index.js';

const router: Router = Router();

// ============================================================================
// Email Validation
// ============================================================================

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidEmail(email: string): boolean {
    return EMAIL_REGEX.test(email);
}

// ============================================================================
// Routes
// ============================================================================

/**
 * POST /subscribe - Subscribe to newsletter
 */
router.post('/subscribe', async (req: Request, res: Response): Promise<void> => {
    try {
        const { email } = req.body;

        // Validate email presence
        if (!email || typeof email !== 'string') {
            res.status(400).json({
                success: false,
                message: 'Email is required',
            });
            return;
        }

        // Validate email format
        const trimmedEmail = email.trim();
        if (!isValidEmail(trimmedEmail)) {
            res.status(400).json({
                success: false,
                message: 'Please enter a valid email address',
            });
            return;
        }

        // Add subscriber via MailerLite
        const result = await addSubscriber(trimmedEmail);

        if (result.success) {
            logger.info('Newsletter', `New subscriber: ${trimmedEmail}`);
            res.status(200).json({
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
        logger.error('Newsletter', `Subscription error: ${(error as Error).message}`);
        res.status(500).json({
            success: false,
            message: 'An error occurred. Please try again later.',
        });
    }
});

export default router;
