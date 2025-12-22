/**
 * Contact Routes
 * 
 * Handles contact form email submissions
 */

import { Router, Request, Response } from 'express';
import { sendEmail } from '../services/resend.js';
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
 * POST /send-email - Send contact form email
 */
router.post('/send-email', async (req: Request, res: Response): Promise<void> => {
    try {
        const { subject, html, email, name } = req.body;

        // Validate required fields
        if (!subject || typeof subject !== 'string') {
            res.status(400).json({
                success: false,
                message: 'Subject is required',
            });
            return;
        }

        if (!html || typeof html !== 'string') {
            res.status(400).json({
                success: false,
                message: 'Email content is required',
            });
            return;
        }

        // Get recipient email from environment or use default
        const recipientEmail = process.env.CONTACT_EMAIL || process.env.RESEND_TO_EMAIL || 'contact@dividendsandtotalreturns.com';

        // Send email
        const result = await sendEmail(
            recipientEmail,
            subject,
            html
        );

        if (result.success) {
            logger.info('Contact', `Contact form submission received from ${name || 'unknown'} (${email || 'no email'})`);
            res.status(200).json({
                success: true,
                message: 'Email sent successfully',
            });
        } else {
            logger.error('Contact', `Failed to send contact email: ${result.message}`);
            res.status(500).json({
                success: false,
                message: result.message || 'Failed to send email',
            });
        }
    } catch (error) {
        logger.error('Contact', `Contact form error: ${(error as Error).message}`);
        res.status(500).json({
            success: false,
            message: 'An error occurred. Please try again later.',
        });
    }
});

export default router;

