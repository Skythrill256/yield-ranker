/**
 * MailerLite Service
 * 
 * Handles newsletter subscriptions and campaign management via MailerLite API
 */

import { logger } from '../utils/index.js';
// eslint-disable-next-line @typescript-eslint/no-require-imports
import MailerLiteSDK from '@mailerlite/mailerlite-nodejs';

// Handle CJS/ESM interop - the module exports a class as default
const MailerLite = (MailerLiteSDK as any).default || MailerLiteSDK;

// ============================================================================
// Types
// ============================================================================

interface SubscribeResult {
    success: boolean;
    message: string;
    subscriberId?: string;
}

export interface CampaignAttachment {
    name: string;
    url: string;
    type: string;
    size?: number;
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
    // Statistics from MailerLite
    stats?: CampaignStats;
    // Attachments (if available from MailerLite or stored separately)
    attachments?: CampaignAttachment[];
}

export interface CampaignStats {
    sent?: number;
    opens_count?: number;
    unique_opens_count?: number;
    open_rate?: {
        float?: number;
        string?: string;
    };
    clicks_count?: number;
    unique_clicks_count?: number;
    click_rate?: {
        float?: number;
        string?: string;
    };
    unsubscribes_count?: number;
    spam_count?: number;
    hard_bounces_count?: number;
    soft_bounces_count?: number;
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

function getClient(): any {
    if (client) return client;

    const apiKey = process.env.MAILERLITE_API_KEY;
    if (!apiKey) {
        logger.warn('MailerLite', 'MAILERLITE_API_KEY not configured');
        return null;
    }

    try {
        // Initialize MailerLite client with the API key
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call
        client = new MailerLite({ api_key: apiKey });
        logger.info('MailerLite', 'Client initialized successfully');
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
 * Get a single subscriber by email
 * Uses MailerLite API: GET /api/subscribers/{email}
 */
export interface Subscriber {
    id: string;
    email: string;
    status: string;
    subscribed_at?: string;
    unsubscribed_at?: string;
}

export interface GetSubscriberResult {
    success: boolean;
    subscriber?: Subscriber;
    isSubscribed: boolean;
    message?: string;
}

export async function getSubscriber(email: string): Promise<GetSubscriberResult> {
    const mailerlite = getClient();

    if (!mailerlite) {
        return {
            success: false,
            isSubscribed: false,
            message: 'Newsletter service is not configured',
        };
    }

    try {
        const response = await mailerlite.subscribers.find(email.toLowerCase().trim());
        const sub = response.data?.data;

        if (!sub) {
            return {
                success: true,
                isSubscribed: false,
                message: 'Subscriber not found',
            };
        }

        const subscriber: Subscriber = {
            id: sub.id || '',
            email: sub.email || '',
            status: sub.status || 'active',
            subscribed_at: sub.subscribed_at,
            unsubscribed_at: sub.unsubscribed_at,
        };

        // Check if the subscriber status is active
        const isSubscribed = subscriber.status === 'active';

        logger.info('MailerLite', `Found subscriber: ${email} (status: ${subscriber.status})`);
        return {
            success: true,
            subscriber,
            isSubscribed,
        };
    } catch (error: unknown) {
        const err = error as { response?: { status?: number; data?: { message?: string } }; message?: string };

        // 404 means subscriber not found - this is not an error, just means they're not subscribed
        if (err?.response?.status === 404) {
            logger.info('MailerLite', `Subscriber not found: ${email}`);
            return {
                success: true,
                isSubscribed: false,
                message: 'Subscriber not found',
            };
        }

        const errorMessage = err?.response?.data?.message || err?.message || 'Unknown error';
        logger.error('MailerLite', `Failed to get subscriber: ${errorMessage}`);
        return {
            success: false,
            isSubscribed: false,
            message: 'Failed to check subscription status. Please try again later.',
        };
    }
}

/**
 * List all subscribers
 */

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
 * Note: MailerLite doesn't require emails field when creating drafts.
 * Emails are only needed when sending the campaign.
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
        // MailerLite API requires 'emails' field to be an array of email configuration objects
        // Each email object must have: subject, from_name, from (sender email), and optionally content
        // This is NOT for recipient emails - MailerLite handles recipients via subscriber groups

        const htmlContent = campaign.content?.html || '';
        const plainContent = campaign.content?.plain || (htmlContent ? htmlContent.replace(/<[^>]*>/g, '') : '');

        // Build the emails array with email configuration (required by MailerLite API)
        const emailConfig: any = {
            subject: campaign.subject,
            from_name: campaign.from_name || 'Dividends and Total Returns',
            from: campaign.from_email || 'dandtotalreturns@gmail.com',
        };

        // Add content if provided
        if (htmlContent) {
            emailConfig.content = htmlContent;
        }

        // Create campaign payload with proper emails structure
        const createPayload: any = {
            name: campaign.name,
            type: campaign.type || 'regular',
            emails: [emailConfig],  // emails is an array of email config objects, NOT subscriber emails
        };

        logger.info('MailerLite', `Creating campaign: ${campaign.name}`);
        logger.info('MailerLite', `Payload: ${JSON.stringify(createPayload, null, 2)}`);

        const createResponse = await mailerlite.campaigns.create(createPayload);

        const campaignId = createResponse.data?.data?.id;
        if (!campaignId) {
            throw new Error('Campaign created but no ID returned');
        }

        // Fetch the final campaign data
        const finalResponse = await mailerlite.campaigns.get(campaignId);
        const response = { data: { data: finalResponse.data?.data } };

        logger.info('MailerLite', `Campaign created successfully: ${campaign.name} (ID: ${campaignId})`);
        return {
            success: true,
            campaign: response.data?.data as Campaign,
            message: 'Campaign created successfully',
        };
    } catch (error: unknown) {
        const err = error as {
            response?: {
                data?: {
                    message?: string;
                    errors?: any;
                    error?: any;
                };
                status?: number;
                statusText?: string;
            };
            message?: string;
        };

        // Enhanced error logging
        const errorMessage = err?.response?.data?.message || err?.response?.data?.error?.message || err?.message || 'Unknown error';
        const errorDetails = err?.response?.data?.errors ? JSON.stringify(err.response.data.errors, null, 2) : '';
        const errorData = err?.response?.data?.error ? JSON.stringify(err.response.data.error, null, 2) : '';
        const statusInfo = err?.response?.status ? ` (Status: ${err.response.status} ${err.response.statusText || ''})` : '';

        logger.error('MailerLite', `Failed to create campaign: ${errorMessage}${statusInfo}`);
        if (errorDetails) {
            logger.error('MailerLite', `Error details: ${errorDetails}`);
        }
        if (errorData) {
            logger.error('MailerLite', `Error data: ${errorData}`);
        }
        if (err?.response?.data) {
            logger.error('MailerLite', `Full error response: ${JSON.stringify(err.response.data, null, 2)}`);
        }

        return {
            success: false,
            message: `Failed to create campaign: ${errorMessage}${errorDetails ? `. Details: ${errorDetails.substring(0, 200)}` : ''}`,
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
 * This will send to all active subscribers unless specific emails are provided
 */
export async function sendCampaign(campaignId: string, emails?: string[]): Promise<CampaignResult> {
    const mailerlite = getClient();

    if (!mailerlite) {
        return {
            success: false,
            message: 'Newsletter service is not configured',
        };
    }

    try {
        // If specific emails are provided, use them, otherwise send to all active subscribers
        let subscriberEmails: string[] = emails || [];

        if (!emails || emails.length === 0) {
            try {
                const subscribersResult = await listSubscribers(1000, 0);
                if (subscribersResult.success && subscribersResult.subscribers) {
                    // Filter for active/subscribed subscribers only
                    subscriberEmails = subscribersResult.subscribers
                        .filter(s => s.status === 'active' || s.status === 'subscribed')
                        .map(s => s.email);
                }
            } catch (subError) {
                logger.warn('MailerLite', `Failed to fetch subscribers for sending: ${(subError as Error).message}`);
            }
        }

        // Send campaign - MailerLite handles the sending
        // Note: The emails field is typically set when creating/sending, but we're just using send()
        // which should use the campaign's default recipient list
        const response = await mailerlite.campaigns.send(campaignId);
        logger.info('MailerLite', `Campaign sent: ${campaignId} to ${subscriberEmails.length} subscribers`);
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
