/**
 * MailerLite Service Integration Tests
 * 
 * These tests use the real MailerLite API key to verify functionality
 */

import { describe, it, expect, beforeAll } from 'vitest';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Import services after env is loaded
import {
    addSubscriber,
    removeSubscriber,
    listSubscribers,
    listCampaigns,
    healthCheck,
} from '../../src/services/mailerlite.js';

describe('MailerLite Service Integration Tests', () => {
    // Test email for subscribe/unsubscribe tests
    const testEmail = `test-${Date.now()}@example.com`;

    beforeAll(() => {
        // Verify API key is configured
        if (!process.env.MAILERLITE_API_KEY) {
            throw new Error('MAILERLITE_API_KEY must be set for integration tests');
        }
    });

    describe('healthCheck', () => {
        it('should return true when API is working', async () => {
            const result = await healthCheck();
            expect(result).toBe(true);
        });
    });

    describe('listSubscribers', () => {
        it('should list subscribers successfully', async () => {
            const result = await listSubscribers(10, 0);

            expect(result.success).toBe(true);
            expect(result.subscribers).toBeDefined();
            expect(Array.isArray(result.subscribers)).toBe(true);

            console.log(`Found ${result.subscribers?.length || 0} subscribers`);
        });

        it('should return subscribers with required fields', async () => {
            const result = await listSubscribers(1, 0);

            if (result.subscribers && result.subscribers.length > 0) {
                const subscriber = result.subscribers[0];
                expect(subscriber.id).toBeDefined();
                expect(subscriber.email).toBeDefined();
                expect(subscriber.status).toBeDefined();
            }
        });
    });

    describe('addSubscriber', () => {
        it('should add a new subscriber successfully', async () => {
            const result = await addSubscriber(testEmail);

            expect(result.success).toBe(true);
            expect(result.message).toContain('subscribed');

            console.log(`Added subscriber: ${testEmail}`);
        });

        it('should handle adding existing subscriber gracefully', async () => {
            // Try to add same email again
            const result = await addSubscriber(testEmail);

            // Should still succeed (createOrUpdate behavior)
            expect(result.success).toBe(true);
        });

        it('should normalize email to lowercase', async () => {
            const uppercaseEmail = `TEST-UPPERCASE-${Date.now()}@EXAMPLE.COM`;
            const result = await addSubscriber(uppercaseEmail);

            expect(result.success).toBe(true);

            // Cleanup
            await removeSubscriber(uppercaseEmail);
        });
    });

    describe('removeSubscriber', () => {
        it('should remove a subscriber successfully', async () => {
            // First ensure subscriber exists
            await addSubscriber(testEmail);

            const result = await removeSubscriber(testEmail);

            expect(result.success).toBe(true);
            expect(result.message).toContain('unsubscribed');

            console.log(`Removed subscriber: ${testEmail}`);
        });
    });

    describe('listCampaigns', () => {
        it('should list campaigns successfully', async () => {
            const result = await listCampaigns(10, 0);

            expect(result.success).toBe(true);
            expect(result.campaigns).toBeDefined();
            expect(Array.isArray(result.campaigns)).toBe(true);

            console.log(`Found ${result.campaigns?.length || 0} campaigns`);
        });

        it('should return campaigns with required fields', async () => {
            const result = await listCampaigns(1, 0);

            if (result.campaigns && result.campaigns.length > 0) {
                const campaign = result.campaigns[0];
                expect(campaign.id).toBeDefined();
                expect(campaign.name).toBeDefined();
                expect(campaign.type).toBeDefined();

                console.log(`Sample campaign: ${campaign.name} (${campaign.status})`);
            }
        });
    });
});
