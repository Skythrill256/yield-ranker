/**
 * MailerLite Service
 * 
 * Handles newsletter subscriptions via MailerLite API
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
import MailerLite from '@mailerlite/mailerlite-nodejs';
import { logger } from '../utils/index.js';

// ============================================================================
// Types
// ============================================================================

interface SubscribeResult {
    success: boolean;
    message: string;
    subscriberId?: string;
}

// ============================================================================
// Client Initialization
// ============================================================================

// Using 'any' type as the MailerLite SDK has non-standard TypeScript exports
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let client: any = null;

function getClient(): typeof client {
    if (client) return client;

    const apiKey = process.env.MAILERLITE_API_KEY;
    if (!apiKey) {
        logger.warn('MailerLite', 'MAILERLITE_API_KEY not configured');
        return null;
    }

    // The SDK exports a class that should be instantiated with 'new'
    // @ts-expect-error - MailerLite SDK has non-standard TypeScript exports
    client = new MailerLite({ api_key: apiKey });
    return client;
}

// ============================================================================
// Public API Methods
// ============================================================================

/**
 * Add a subscriber to the MailerLite list
 */
export async function addSubscriber(email: string): Promise<SubscribeResult> {
    const mailerlite = getClient();

    if (!mailerlite) {
        return {
            success: false,
            message: 'Newsletter service is not configured',
        };
    }

    try {
        const response = await mailerlite.subscribers.createOrUpdate({
            email: email.toLowerCase().trim(),
        });

        logger.info('MailerLite', `Subscriber added/updated: ${email}`);

        return {
            success: true,
            message: 'Successfully subscribed to newsletter',
            subscriberId: response.data?.data?.id,
        };
    } catch (error: unknown) {
        // Handle specific MailerLite errors
        const err = error as { response?: { data?: { message?: string } }; message?: string };
        const errorMessage = err?.response?.data?.message || err?.message || 'Unknown error';

        logger.error('MailerLite', `Failed to add subscriber: ${errorMessage}`);

        // Check for common error cases
        if (errorMessage.includes('already exists')) {
            return {
                success: true,
                message: 'You are already subscribed to our newsletter',
            };
        }

        return {
            success: false,
            message: 'Failed to subscribe. Please try again later.',
        };
    }
}

/**
 * Health check for MailerLite API
 */
export async function healthCheck(): Promise<boolean> {
    const mailerlite = getClient();

    if (!mailerlite) {
        return false;
    }

    try {
        // Try to fetch subscribers to verify API key works
        await mailerlite.subscribers.get({ limit: 1 });
        return true;
    } catch (error) {
        logger.error('MailerLite', `Health check failed: ${(error as Error).message}`);
        return false;
    }
}
