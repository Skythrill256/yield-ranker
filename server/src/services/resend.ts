/**
 * Resend Email Service
 * 
 * Handles sending emails via Resend API
 */

import { Resend } from 'resend';
import { logger } from '../utils/index.js';

// ============================================================================
// Types
// ============================================================================

interface SendEmailResult {
    success: boolean;
    message: string;
    messageId?: string;
}

// ============================================================================
// Client Initialization
// ============================================================================

let resendClient: Resend | null = null;

function getClient(): Resend | null {
    if (resendClient) return resendClient;

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
        logger.warn('Resend', 'RESEND_API_KEY not configured');
        return null;
    }

    try {
        resendClient = new Resend(apiKey);
        return resendClient;
    } catch (error) {
        logger.warn('Resend', `Failed to initialize Resend client: ${(error as Error).message}`);
        return null;
    }
}

// ============================================================================
// Public API Methods
// ============================================================================

/**
 * Send an email via Resend
 */
export async function sendEmail(
    to: string | string[],
    subject: string,
    html: string,
    from?: string
): Promise<SendEmailResult> {
    const resend = getClient();

    if (!resend) {
        return {
            success: false,
            message: 'Email service is not configured',
        };
    }

    const fromEmail = from || process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';
    const toEmails = Array.isArray(to) ? to : [to];

    try {
        const response = await resend.emails.send({
            from: fromEmail,
            to: toEmails,
            subject,
            html,
        });

        if (response.error) {
            logger.error('Resend', `Failed to send email: ${response.error.message}`);
            return {
                success: false,
                message: response.error.message || 'Failed to send email',
            };
        }

        logger.info('Resend', `Email sent successfully: ${response.data?.id}`);
        return {
            success: true,
            message: 'Email sent successfully',
            messageId: response.data?.id,
        };
    } catch (error) {
        const errorMessage = (error as Error).message || 'Unknown error';
        logger.error('Resend', `Failed to send email: ${errorMessage}`);
        return {
            success: false,
            message: 'Failed to send email. Please try again later.',
        };
    }
}

/**
 * Health check for Resend API
 */
export async function healthCheck(): Promise<boolean> {
    const resend = getClient();
    return resend !== null;
}

