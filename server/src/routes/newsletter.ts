/**
 * Newsletter Routes
 * 
 * Handles newsletter subscription endpoints
 */

import { Router, Request, Response } from 'express';
import { addSubscriber, removeSubscriber, getSubscriber } from '../services/mailerlite.js';
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

/**
 * POST /unsubscribe - Unsubscribe from newsletter
 */
router.post('/unsubscribe', async (req: Request, res: Response): Promise<void> => {
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

        // Remove subscriber via MailerLite
        const result = await removeSubscriber(trimmedEmail);

        if (result.success) {
            logger.info('Newsletter', `Subscriber unsubscribed: ${trimmedEmail}`);
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
        logger.error('Newsletter', `Unsubscription error: ${(error as Error).message}`);
        res.status(500).json({
            success: false,
            message: 'An error occurred. Please try again later.',
        });
    }
});

/**
 * POST /check-subscription - Check if email is subscribed
 * This endpoint allows authenticated users to check their subscription status
 */
router.post('/check-subscription', async (req: Request, res: Response): Promise<void> => {
    try {
        const { email } = req.body;

        // Validate email presence
        if (!email || typeof email !== 'string') {
            res.status(400).json({
                success: false,
                isSubscribed: false,
                message: 'Email is required',
            });
            return;
        }

        // Validate email format
        const trimmedEmail = email.trim();
        if (!isValidEmail(trimmedEmail)) {
            res.status(400).json({
                success: false,
                isSubscribed: false,
                message: 'Please enter a valid email address',
            });
            return;
        }

        // Check subscription status via MailerLite
        const result = await getSubscriber(trimmedEmail);

        logger.info('Newsletter', `Subscription check for ${trimmedEmail}: ${result.isSubscribed ? 'subscribed' : 'not subscribed'}`);

        res.status(200).json({
            success: result.success,
            isSubscribed: result.isSubscribed,
            message: result.message,
        });
    } catch (error) {
        logger.error('Newsletter', `Subscription check error: ${(error as Error).message}`);
        res.status(500).json({
            success: false,
            isSubscribed: false,
            message: 'An error occurred. Please try again later.',
        });
    }
});

export default router;
