/**
 * Newsletter Service
 * 
 * Frontend service for newsletter subscription API
 */

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080';

interface SubscribeResponse {
    success: boolean;
    message: string;
}

/**
 * Subscribe to the newsletter
 */
export async function subscribeToNewsletter(email: string): Promise<SubscribeResponse> {
    try {
        const response = await fetch(`${API_BASE_URL}/api/newsletter/subscribe`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ email }),
        });

        const data = await response.json();
        return {
            success: data.success,
            message: data.message,
        };
    } catch (error) {
        console.error('Newsletter subscription error:', error);
        return {
            success: false,
            message: 'Failed to subscribe. Please try again later.',
        };
    }
}
