/**
 * Newsletter Admin Service
 * 
 * Handles newsletter/campaign management API calls for admins
 */

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

export interface Campaign {
    id?: string;
    name: string;
    subject: string;
    type: 'regular' | 'ab';
    content?: {
        html?: string;
        plain?: string;
    };
    html?: string;
    plain?: string;
    from_name?: string;
    from_email?: string;
    reply_to?: string;
    status?: 'draft' | 'outbox' | 'sent';
    created_at?: string;
    updated_at?: string;
    sent_at?: string;
    // Statistics from MailerLite
    stats?: CampaignStats;
}

export interface CampaignListResponse {
    success: boolean;
    campaigns?: Campaign[];
    message?: string;
}

export interface CampaignResponse {
    success: boolean;
    campaign?: Campaign;
    message?: string;
}

export interface SubscriberResponse {
    success: boolean;
    message: string;
    subscriberId?: string;
}

import { supabase } from '@/lib/supabase';

const API_URL = import.meta.env.VITE_API_URL || '';

async function getAuthHeaders(): Promise<HeadersInit> {
    const { data: { session } } = await supabase.auth.getSession();
    const headers: HeadersInit = {
        'Content-Type': 'application/json',
    };

    if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
    }

    return headers;
}

/**
 * List all campaigns/newsletters
 */
export async function listCampaigns(limit: number = 100, offset: number = 0): Promise<CampaignListResponse> {
    try {
        const headers = await getAuthHeaders();
        const response = await fetch(
            `${API_URL}/api/admin/newsletters?limit=${limit}&offset=${offset}`,
            {
                method: 'GET',
                headers,
            }
        );

        if (!response.ok) {
            const error = await response.json();
            return {
                success: false,
                message: error.message || 'Failed to fetch campaigns',
            };
        }

        const data = await response.json();
        return data;
    } catch (error) {
        return {
            success: false,
            message: `Error: ${(error as Error).message}`,
        };
    }
}

/**
 * Get a single campaign by ID
 */
export async function getCampaign(campaignId: string): Promise<CampaignResponse> {
    try {
        const headers = await getAuthHeaders();
        const response = await fetch(
            `${API_URL}/api/admin/newsletters/${campaignId}`,
            {
                method: 'GET',
                headers,
            }
        );

        if (!response.ok) {
            const error = await response.json();
            return {
                success: false,
                message: error.message || 'Failed to fetch campaign',
            };
        }

        const data = await response.json();
        return data;
    } catch (error) {
        return {
            success: false,
            message: `Error: ${(error as Error).message}`,
        };
    }
}

/**
 * Create a new campaign
 */
export async function createCampaign(campaign: Omit<Campaign, 'id' | 'status' | 'created_at' | 'updated_at' | 'sent_at'>): Promise<CampaignResponse> {
    try {
        const headers = await getAuthHeaders();
        const response = await fetch(
            `${API_URL}/api/admin/newsletters`,
            {
                method: 'POST',
                headers,
                body: JSON.stringify(campaign),
            }
        );

        if (!response.ok) {
            const error = await response.json();
            return {
                success: false,
                message: error.message || 'Failed to create campaign',
            };
        }

        const data = await response.json();
        return data;
    } catch (error) {
        return {
            success: false,
            message: `Error: ${(error as Error).message}`,
        };
    }
}

/**
 * Create a new campaign with attachments
 */
export async function createCampaignWithAttachments(
    campaign: Omit<Campaign, 'id' | 'status' | 'created_at' | 'updated_at' | 'sent_at'>,
    attachments: File[]
): Promise<CampaignResponse> {
    try {
        const headers = await getAuthHeaders();
        const formData = new FormData();

        // Add campaign data as JSON
        formData.append('campaign', JSON.stringify(campaign));

        // Add attachments
        attachments.forEach((file) => {
            formData.append('attachments', file);
        });

        // Remove Content-Type header to let browser set it with boundary for FormData
        const { 'Content-Type': _, ...headersWithoutContentType } = headers as Record<string, string>;

        const response = await fetch(
            `${API_URL}/api/admin/newsletters`,
            {
                method: 'POST',
                headers: headersWithoutContentType,
                body: formData,
            }
        );

        if (!response.ok) {
            const error = await response.json();
            return {
                success: false,
                message: error.message || 'Failed to create campaign',
            };
        }

        const data = await response.json();
        return data;
    } catch (error) {
        return {
            success: false,
            message: `Error: ${(error as Error).message}`,
        };
    }
}

/**
 * Update an existing campaign
 */
export async function updateCampaign(campaignId: string, updates: Partial<Campaign>): Promise<CampaignResponse> {
    try {
        const headers = await getAuthHeaders();
        const response = await fetch(
            `${API_URL}/api/admin/newsletters/${campaignId}`,
            {
                method: 'PUT',
                headers,
                body: JSON.stringify(updates),
            }
        );

        if (!response.ok) {
            const error = await response.json();
            return {
                success: false,
                message: error.message || 'Failed to update campaign',
            };
        }

        const data = await response.json();
        return data;
    } catch (error) {
        return {
            success: false,
            message: `Error: ${(error as Error).message}`,
        };
    }
}

/**
 * Send a campaign
 */
export async function sendCampaign(campaignId: string): Promise<CampaignResponse> {
    try {
        const headers = await getAuthHeaders();
        const response = await fetch(
            `${API_URL}/api/admin/newsletters/${campaignId}/send`,
            {
                method: 'POST',
                headers,
            }
        );

        if (!response.ok) {
            const error = await response.json();
            return {
                success: false,
                message: error.message || 'Failed to send campaign',
            };
        }

        const data = await response.json();
        return data;
    } catch (error) {
        return {
            success: false,
            message: `Error: ${(error as Error).message}`,
        };
    }
}

/**
 * Add a subscriber (admin only)
 */
export async function addSubscriber(email: string): Promise<SubscriberResponse> {
    try {
        const headers = await getAuthHeaders();
        const response = await fetch(
            `${API_URL}/api/admin/newsletters/subscribers`,
            {
                method: 'POST',
                headers,
                body: JSON.stringify({ email }),
            }
        );

        if (!response.ok) {
            const error = await response.json();
            return {
                success: false,
                message: error.message || 'Failed to add subscriber',
            };
        }

        const data = await response.json();
        return data;
    } catch (error) {
        return {
            success: false,
            message: `Error: ${(error as Error).message}`,
        };
    }
}

/**
 * Remove a subscriber (admin only)
 */
export async function removeSubscriber(email: string): Promise<SubscriberResponse> {
    try {
        const headers = await getAuthHeaders();
        const response = await fetch(
            `${API_URL}/api/admin/newsletters/subscribers/${encodeURIComponent(email)}`,
            {
                method: 'DELETE',
                headers,
            }
        );

        if (!response.ok) {
            const error = await response.json();
            return {
                success: false,
                message: error.message || 'Failed to remove subscriber',
            };
        }

        const data = await response.json();
        return data;
    } catch (error) {
        return {
            success: false,
            message: `Error: ${(error as Error).message}`,
        };
    }
}

export interface Subscriber {
    id: string;
    email: string;
    status: string;
    subscribed_at?: string;
    unsubscribed_at?: string;
}

export interface SubscriberListResponse {
    success: boolean;
    subscribers?: Subscriber[];
    message?: string;
}

/**
 * List all subscribers (admin only)
 */
export async function listSubscribers(limit: number = 1000, offset: number = 0): Promise<SubscriberListResponse> {
    try {
        const headers = await getAuthHeaders();
        const response = await fetch(
            `${API_URL}/api/admin/newsletters/subscribers?limit=${limit}&offset=${offset}`,
            {
                method: 'GET',
                headers,
            }
        );

        if (!response.ok) {
            const error = await response.json();
            return {
                success: false,
                message: error.message || 'Failed to fetch subscribers',
            };
        }

        const data = await response.json();
        return data;
    } catch (error) {
        return {
            success: false,
            message: `Error: ${(error as Error).message}`,
        };
    }
}

