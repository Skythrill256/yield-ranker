/**
 * Verify MailerLite Connection
 * 
 * Simple script to verify MailerLite API connection and list available methods
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables - matching config/index.ts pattern exactly
// Try multiple paths, but don't override if already loaded
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../../yield-ranker/server/.env') });
dotenv.config(); // Try default location

// Also try to load via config (which may have already loaded it)
try {
    // Import config to ensure .env is loaded (it may already be loaded)
    await import('../src/config/index.js');
} catch (error) {
    // Config import may fail, but that's okay - we've already tried loading .env
}

async function verifyMailerLite() {
    console.log('============================================');
    console.log('Verifying MailerLite Connection');
    console.log('============================================\n');

    // Check which .env files exist
    const envPaths = [
        path.resolve(__dirname, '../../.env'),
        path.resolve(__dirname, '../../../yield-ranker/server/.env'),
        path.resolve(process.cwd(), '.env'),
    ];
    
    const existingEnvFiles = envPaths.filter(p => existsSync(p));
    if (existingEnvFiles.length > 0) {
        console.log('✅ Found .env file(s):');
        existingEnvFiles.forEach(p => console.log(`   - ${p}`));
        console.log('');
    } else {
        console.log('⚠️  No .env file found in common locations\n');
    }

    // Check for the API key with different possible names
    const apiKey = process.env.MAILERLITE_API_KEY || 
                   process.env.MAILERLITE_APIKEY || 
                   process.env.MAILERLITE_KEY ||
                   process.env.MAILER_API_KEY;
    
    if (!apiKey) {
        console.log('❌ MAILERLITE_API_KEY not found in environment variables');
        console.log('\n   Checked for:');
        console.log('   - MAILERLITE_API_KEY');
        console.log('   - MAILERLITE_APIKEY');
        console.log('   - MAILERLITE_KEY');
        console.log('   - MAILER_API_KEY');
        console.log('\n   To fix this:');
        console.log('   1. Create or edit .env file in the project root');
        console.log('   2. Add: MAILERLITE_API_KEY=your_api_key_here');
        console.log('   3. Get your API key from: MailerLite Dashboard → Integrations → API');
        console.log('\n   Example .env file location:');
        console.log(`   ${path.resolve(__dirname, '../../.env')}`);
        console.log(`   ${path.resolve(__dirname, '../.env')}`);
        console.log('\n   All environment variables containing "MAILER":');
        Object.keys(process.env)
            .filter(key => key.toUpperCase().includes('MAILER'))
            .forEach(key => console.log(`   - ${key}`));
        console.log('');
        return;
    }

    console.log('✅ MAILERLITE_API_KEY found\n');

    try {
        // Dynamic import to handle missing package gracefully
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const MailerLiteModule = await import('@mailerlite/mailerlite-nodejs');
        const MailerLite = MailerLiteModule.default || MailerLiteModule;
        
        console.log('✅ MailerLite SDK loaded\n');
        console.log('Available SDK methods:');
        console.log('--------------------------------------------');
        
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment
        const client = new MailerLite({ api_key: apiKey });
        
        // Check available methods
        const methods = Object.keys(client).filter(key => typeof client[key] === 'object' && client[key] !== null);
        console.log('Client object keys:', methods.join(', '));
        
        if (client.subscribers) {
            console.log('\n✅ Subscribers API available');
            const subscriberMethods = Object.keys(client.subscribers);
            console.log('   Methods:', subscriberMethods.join(', '));
        }
        
        if (client.campaigns) {
            console.log('\n✅ Campaigns API available');
            const campaignMethods = Object.keys(client.campaigns);
            console.log('   Methods:', campaignMethods.join(', '));
        } else {
            console.log('\n⚠️  Campaigns API not found - checking alternative structure...');
            console.log('   Full client structure:', Object.keys(client));
        }

        // Test health check
        console.log('\n--------------------------------------------');
        console.log('Testing API Connection...');
        try {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
            await client.subscribers.get({ limit: 1 });
            console.log('✅ API connection successful!');
        } catch (error) {
            console.log('❌ API connection failed:');
            console.log('   Error:', (error as Error).message);
            console.log('\n   This might be due to:');
            console.log('   - Invalid API key');
            console.log('   - Network issues');
            console.log('   - MailerLite service unavailable');
        }

    } catch (error) {
        console.log('❌ Failed to load MailerLite SDK:');
        console.log('   Error:', (error as Error).message);
        console.log('\n   Make sure @mailerlite/mailerlite-nodejs is installed:');
        console.log('   npm install @mailerlite/mailerlite-nodejs');
    }

    console.log('\n============================================\n');
}

verifyMailerLite().catch(console.error);

