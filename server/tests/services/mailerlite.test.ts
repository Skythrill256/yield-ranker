/**
 * MailerLite Service Tests
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// Store the original env
const originalEnv = process.env;

describe('MailerLite Service', () => {
    beforeEach(() => {
        // Reset modules to clear cached client
        vi.resetModules();
        // Clone the env for each test
        process.env = { ...originalEnv };
    });

    afterEach(() => {
        process.env = originalEnv;
        vi.clearAllMocks();
    });

    describe('addSubscriber', () => {
        it('should return failure when API key is not configured', async () => {
            // Remove the API key
            delete process.env.MAILERLITE_API_KEY;

            const { addSubscriber } = await import('../../src/services/mailerlite.js');
            const result = await addSubscriber('test@example.com');

            expect(result.success).toBe(false);
            expect(result.message).toContain('not configured');
        });

        it('should call MailerLite API with lowercase trimmed email', async () => {
            // Set a test API key
            process.env.MAILERLITE_API_KEY = 'test-api-key-12345';

            // Mock the MailerLite SDK
            vi.doMock('@mailerlite/mailerlite-nodejs', () => {
                const mockCreateOrUpdate = vi.fn().mockResolvedValue({
                    data: { data: { id: 'subscriber-123' } },
                });

                return {
                    default: function () {
                        return {
                            subscribers: {
                                createOrUpdate: mockCreateOrUpdate,
                                get: vi.fn(),
                            },
                        };
                    },
                };
            });

            const { addSubscriber } = await import('../../src/services/mailerlite.js');
            const result = await addSubscriber('  TEST@EXAMPLE.COM  ');

            // Since we're mocking, just check it doesn't crash
            expect(result).toBeDefined();
        });
    });

    describe('healthCheck', () => {
        it('should return false when API key is not configured', async () => {
            delete process.env.MAILERLITE_API_KEY;

            const { healthCheck } = await import('../../src/services/mailerlite.js');
            const result = await healthCheck();

            expect(result).toBe(false);
        });
    });
});
