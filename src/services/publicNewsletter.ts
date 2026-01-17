/**
 * Public Newsletter Service
 * 
 * Frontend service for accessing public newsletter API (no auth required)
 */

const API_BASE_URL = import.meta.env.VITE_API_URL || '';

export interface NewsletterAttachment {
    name: string;
    url: string;
    type: string;
    size?: number;
}

export interface PublicNewsletter {
    id: string;
    name: string;
    subject: string;
    sent_at?: string;
    content?: {
        html?: string;
        plain?: string;
    };
    attachments?: NewsletterAttachment[];
}

export interface NewsletterListResponse {
    success: boolean;
    newsletters?: PublicNewsletter[];
    message?: string;
}

export interface NewsletterDetailResponse {
    success: boolean;
    newsletter?: PublicNewsletter;
    message?: string;
}

/**
 * List all sent newsletters (public, no auth required)
 */
export async function listPublicNewsletters(
    limit: number = 50,
    offset: number = 0
): Promise<NewsletterListResponse> {
    try {
        const response = await fetch(
            `${API_BASE_URL}/api/public-newsletters?limit=${limit}&offset=${offset}`
        );

        const data = await response.json();

        if (!response.ok) {
            return {
                success: false,
                message: data.message || 'Failed to fetch newsletters',
            };
        }

        return {
            success: true,
            newsletters: data.newsletters || [],
        };
    } catch (error) {
        console.error('Failed to list newsletters:', error);
        return {
            success: false,
            message: (error as Error).message || 'Network error',
        };
    }
}

/**
 * Get a single newsletter by ID (public, no auth required)
 */
export async function getPublicNewsletter(
    id: string
): Promise<NewsletterDetailResponse> {
    try {
        const response = await fetch(
            `${API_BASE_URL}/api/public-newsletters/${id}`
        );

        const data = await response.json();

        if (!response.ok) {
            return {
                success: false,
                message: data.message || 'Newsletter not found',
            };
        }

        return {
            success: true,
            newsletter: data.newsletter,
        };
    } catch (error) {
        console.error('Failed to get newsletter:', error);
        return {
            success: false,
            message: (error as Error).message || 'Network error',
        };
    }
}

export interface CheckSubscriptionResponse {
    success: boolean;
    isSubscribed: boolean;
    message?: string;
}

/**
 * Check if an email is subscribed to the newsletter
 */
export async function checkSubscription(
    email: string
): Promise<CheckSubscriptionResponse> {
    try {
        const response = await fetch(
            `${API_BASE_URL}/api/newsletter/check-subscription`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ email }),
            }
        );

        const data = await response.json();

        return {
            success: data.success ?? false,
            isSubscribed: data.isSubscribed ?? false,
            message: data.message,
        };
    } catch (error) {
        console.error('Failed to check subscription:', error);
        return {
            success: false,
            isSubscribed: false,
            message: (error as Error).message || 'Network error',
        };
    }
}
