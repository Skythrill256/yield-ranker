/**
 * MailerLite Service
 * 
 * Handles newsletter subscriptions and campaign management via MailerLite API
 */

import { logger } from '../utils/index.js';

// ============================================================================
// Types
// ============================================================================

interface SubscribeResult {
    success: boolean;
    message: string;
    subscriberId?: string;
}

export interface Campaign {
    id?: string;
    name: string;
    subject: string;
    type: 'regular' | 'ab';
    content?: {
        html?: string;
        plain?: string;
    };
    from_name?: string;
    from_email?: string;
    reply_to?: string;
    status?: 'draft' | 'outbox' | 'sent';
    created_at?: string;
    updated_at?: string;
    sent_at?: string;
}

export interface CampaignListResult {
    success: boolean;
    campaigns?: Campaign[];
    message?: string;
}

export interface CampaignResult {
    success: boolean;
    campaign?: Campaign;
    message?: string;
}

export interface UnsubscribeResult {
    success: boolean;
    message: string;
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

    try {
        // Dynamic import to handle missing package gracefully
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const MailerLite = require('@mailerlite/mailerlite-nodejs');
        // The SDK exports a class that should be instantiated with 'new'
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment
        client = new MailerLite({ api_key: apiKey });
        return client;
    } catch (error) {
        logger.warn('MailerLite', `Failed to initialize MailerLite client: ${(error as Error).message}`);
        return null;
    }
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
 * Remove a subscriber from the MailerLite list
 */
export async function removeSubscriber(email: string): Promise<UnsubscribeResult> {
    const mailerlite = getClient();

    if (!mailerlite) {
        return {
            success: false,
            message: 'Newsletter service is not configured',
        };
    }

    try {
        await mailerlite.subscribers.delete(email.toLowerCase().trim());
        logger.info('MailerLite', `Subscriber removed: ${email}`);
        return {
            success: true,
            message: 'Successfully unsubscribed from newsletter',
        };
    } catch (error: unknown) {
        const err = error as { response?: { data?: { message?: string } }; message?: string };
        const errorMessage = err?.response?.data?.message || err?.message || 'Unknown error';
        logger.error('MailerLite', `Failed to remove subscriber: ${errorMessage}`);
        return {
            success: false,
            message: 'Failed to unsubscribe. Please try again later.',
        };
    }
}

/**
 * List all subscribers
 */
export interface Subscriber {
    id: string;
    email: string;
    status: string;
    subscribed_at?: string;
    unsubscribed_at?: string;
}

export interface SubscriberListResult {
    success: boolean;
    subscribers?: Subscriber[];
    message?: string;
}

export async function listSubscribers(limit: number = 1000, offset: number = 0): Promise<SubscriberListResult> {
    const mailerlite = getClient();

    if (!mailerlite) {
        return {
            success: false,
            message: 'Newsletter service is not configured',
        };
    }

    try {
        const response = await mailerlite.subscribers.get({ limit, offset });
        
        const subscribers: Subscriber[] = (response.data?.data || []).map((sub: any) => ({
            id: sub.id || '',
            email: sub.email || '',
            status: sub.status || 'active',
            subscribed_at: sub.subscribed_at,
            unsubscribed_at: sub.unsubscribed_at,
        }));

        logger.info('MailerLite', `Listed ${subscribers.length} subscribers`);
        return {
            success: true,
            subscribers,
        };
    } catch (error: unknown) {
        const err = error as { response?: { data?: { message?: string } }; message?: string };
        const errorMessage = err?.response?.data?.message || err?.message || 'Unknown error';
        logger.error('MailerLite', `Failed to list subscribers: ${errorMessage}`);
        return {
            success: false,
            message: 'Failed to list subscribers. Please try again later.',
        };
    }
}

/**
 * Create a new campaign/newsletter
 */
export async function createCampaign(campaign: Omit<Campaign, 'id' | 'status' | 'created_at' | 'updated_at' | 'sent_at'>): Promise<CampaignResult> {
    const mailerlite = getClient();

    if (!mailerlite) {
        return {
            success: false,
            message: 'Newsletter service is not configured',
        };
    }

    try {
        const response = await mailerlite.campaigns.create({
            name: campaign.name,
            subject: campaign.subject,
            type: campaign.type || 'regular',
            content: campaign.content || {},
            from_name: campaign.from_name,
            from_email: campaign.from_email,
            reply_to: campaign.reply_to,
        });

        logger.info('MailerLite', `Campaign created: ${campaign.name}`);
        return {
            success: true,
            campaign: response.data?.data as Campaign,
            message: 'Campaign created successfully',
        };
    } catch (error: unknown) {
        const err = error as { response?: { data?: { message?: string } }; message?: string };
        const errorMessage = err?.response?.data?.message || err?.message || 'Unknown error';
        logger.error('MailerLite', `Failed to create campaign: ${errorMessage}`);
        return {
            success: false,
            message: `Failed to create campaign: ${errorMessage}`,
        };
    }
}

/**
 * Update an existing campaign/newsletter
 */
export async function updateCampaign(campaignId: string, updates: Partial<Campaign>): Promise<CampaignResult> {
    const mailerlite = getClient();

    if (!mailerlite) {
        return {
            success: false,
            message: 'Newsletter service is not configured',
        };
    }

    try {
        const response = await mailerlite.campaigns.update(campaignId, updates);
        logger.info('MailerLite', `Campaign updated: ${campaignId}`);
        return {
            success: true,
            campaign: response.data?.data as Campaign,
            message: 'Campaign updated successfully',
        };
    } catch (error: unknown) {
        const err = error as { response?: { data?: { message?: string } }; message?: string };
        const errorMessage = err?.response?.data?.message || err?.message || 'Unknown error';
        logger.error('MailerLite', `Failed to update campaign: ${errorMessage}`);
        return {
            success: false,
            message: `Failed to update campaign: ${errorMessage}`,
        };
    }
}

/**
 * Send a campaign/newsletter
 */
export async function sendCampaign(campaignId: string): Promise<CampaignResult> {
    const mailerlite = getClient();

    if (!mailerlite) {
        return {
            success: false,
            message: 'Newsletter service is not configured',
        };
    }

    try {
        const response = await mailerlite.campaigns.send(campaignId);
        logger.info('MailerLite', `Campaign sent: ${campaignId}`);
        return {
            success: true,
            campaign: response.data?.data as Campaign,
            message: 'Campaign sent successfully',
        };
    } catch (error: unknown) {
        const err = error as { response?: { data?: { message?: string } }; message?: string };
        const errorMessage = err?.response?.data?.message || err?.message || 'Unknown error';
        logger.error('MailerLite', `Failed to send campaign: ${errorMessage}`);
        return {
            success: false,
            message: `Failed to send campaign: ${errorMessage}`,
        };
    }
}

/**
 * Get a single campaign by ID
 */
export async function getCampaign(campaignId: string): Promise<CampaignResult> {
    const mailerlite = getClient();

    if (!mailerlite) {
        return {
            success: false,
            message: 'Newsletter service is not configured',
        };
    }

    try {
        const response = await mailerlite.campaigns.get(campaignId);
        return {
            success: true,
            campaign: response.data?.data as Campaign,
        };
    } catch (error: unknown) {
        const err = error as { response?: { data?: { message?: string } }; message?: string };
        const errorMessage = err?.response?.data?.message || err?.message || 'Unknown error';
        logger.error('MailerLite', `Failed to get campaign: ${errorMessage}`);
        return {
            success: false,
            message: `Failed to get campaign: ${errorMessage}`,
        };
    }
}

/**
 * List all campaigns/newsletters
 */
export async function listCampaigns(limit: number = 100, offset: number = 0): Promise<CampaignListResult> {
    const mailerlite = getClient();

    if (!mailerlite) {
        return {
            success: false,
            message: 'Newsletter service is not configured',
        };
    }

    try {
        const response = await mailerlite.campaigns.get({ limit, offset });
        const campaigns = (response.data?.data || []) as Campaign[];
        return {
            success: true,
            campaigns,
        };
    } catch (error: unknown) {
        const err = error as { response?: { data?: { message?: string } }; message?: string };
        const errorMessage = err?.response?.data?.message || err?.message || 'Unknown error';
        logger.error('MailerLite', `Failed to list campaigns: ${errorMessage}`);
        return {
            success: false,
            message: `Failed to list campaigns: ${errorMessage}`,
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
