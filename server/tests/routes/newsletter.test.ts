/**
 * Newsletter Routes Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';

// Mock the MailerLite service before importing the route
vi.mock('../../src/services/mailerlite.js', () => ({
    addSubscriber: vi.fn(),
}));

import newsletterRoutes from '../../src/routes/newsletter.js';
import { addSubscriber } from '../../src/services/mailerlite.js';

// Create test app
const app = express();
app.use(express.json());
app.use('/api/newsletter', newsletterRoutes);

describe('Newsletter Routes', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('POST /api/newsletter/subscribe', () => {
        it('should return 400 when email is missing', async () => {
            const response = await request(app)
                .post('/api/newsletter/subscribe')
                .send({});

            expect(response.status).toBe(400);
            expect(response.body).toHaveProperty('success', false);
            expect(response.body).toHaveProperty('message', 'Email is required');
        });

        it('should return 400 when email is empty string', async () => {
            const response = await request(app)
                .post('/api/newsletter/subscribe')
                .send({ email: '' });

            expect(response.status).toBe(400);
            expect(response.body).toHaveProperty('success', false);
            expect(response.body).toHaveProperty('message', 'Email is required');
        });

        it('should return 400 for invalid email format', async () => {
            const response = await request(app)
                .post('/api/newsletter/subscribe')
                .send({ email: 'not-an-email' });

            expect(response.status).toBe(400);
            expect(response.body).toHaveProperty('success', false);
            expect(response.body).toHaveProperty('message', 'Please enter a valid email address');
        });

        it('should return 400 for email without TLD', async () => {
            const response = await request(app)
                .post('/api/newsletter/subscribe')
                .send({ email: 'test@domain' });

            expect(response.status).toBe(400);
            expect(response.body).toHaveProperty('success', false);
        });

        it('should return 200 for valid email subscription', async () => {
            (addSubscriber as ReturnType<typeof vi.fn>).mockResolvedValue({
                success: true,
                message: 'Successfully subscribed to newsletter',
            });

            const response = await request(app)
                .post('/api/newsletter/subscribe')
                .send({ email: 'test@example.com' });

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('success', true);
            expect(response.body).toHaveProperty('message', 'Successfully subscribed to newsletter');
            expect(addSubscriber).toHaveBeenCalledWith('test@example.com');
        });

        it('should trim email before subscribing', async () => {
            (addSubscriber as ReturnType<typeof vi.fn>).mockResolvedValue({
                success: true,
                message: 'Successfully subscribed to newsletter',
            });

            const response = await request(app)
                .post('/api/newsletter/subscribe')
                .send({ email: '  test@example.com  ' });

            expect(response.status).toBe(200);
            // Route trims but service handles lowercasing
            expect(addSubscriber).toHaveBeenCalledWith('test@example.com');
        });

        it('should return 500 when MailerLite service fails', async () => {
            (addSubscriber as ReturnType<typeof vi.fn>).mockResolvedValue({
                success: false,
                message: 'Failed to subscribe. Please try again later.',
            });

            const response = await request(app)
                .post('/api/newsletter/subscribe')
                .send({ email: 'test@example.com' });

            expect(response.status).toBe(500);
            expect(response.body).toHaveProperty('success', false);
        });

        it('should handle already subscribed users gracefully', async () => {
            (addSubscriber as ReturnType<typeof vi.fn>).mockResolvedValue({
                success: true,
                message: 'You are already subscribed to our newsletter',
            });

            const response = await request(app)
                .post('/api/newsletter/subscribe')
                .send({ email: 'existing@example.com' });

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('success', true);
            expect(response.body.message).toContain('already subscribed');
        });
    });

    describe('Email Validation', () => {
        beforeEach(() => {
            (addSubscriber as ReturnType<typeof vi.fn>).mockResolvedValue({
                success: true,
                message: 'Successfully subscribed to newsletter',
            });
        });

        const validEmails = [
            'test@example.com',
            'user.name@domain.org',
            'user+tag@gmail.com',
            'test123@sub.domain.co.uk',
        ];

        const invalidEmails = [
            'notanemail',
            '@nodomain.com',
            'nousername@',
            'spaces in@email.com',
            'missing@tld',
        ];

        validEmails.forEach((email) => {
            it(`should accept valid email: ${email}`, async () => {
                const response = await request(app)
                    .post('/api/newsletter/subscribe')
                    .send({ email });

                expect(response.status).toBe(200);
            });
        });

        invalidEmails.forEach((email) => {
            it(`should reject invalid email: ${email}`, async () => {
                const response = await request(app)
                    .post('/api/newsletter/subscribe')
                    .send({ email });

                expect(response.status).toBe(400);
            });
        });
    });
});
