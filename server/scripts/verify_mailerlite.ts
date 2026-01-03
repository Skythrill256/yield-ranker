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

// Try multiple .env file paths
const envPaths = [
    path.resolve(__dirname, '../../.env'),  // Root .env
    path.resolve(__dirname, '../.env'),     // Server .env
    path.resolve(process.cwd(), '.env'),    // Current directory .env
];

let envFileFound = false;
for (const envPath of envPaths) {
    if (existsSync(envPath)) {
        dotenv.config({ path: envPath });
        envFileFound = true;
        break;
    }
}

// Also try default location
if (!process.env.MAILERLITE_API_KEY) {
    dotenv.config();
}

async function verifyMailerLite() {
    console.log('============================================');
    console.log('Verifying MailerLite Connection');
    console.log('============================================\n');

    if (!envFileFound) {
        console.log('⚠️  .env file not found in common locations:');
        envPaths.forEach(p => console.log(`   - ${p}`));
        console.log('\n   Trying to load from environment anyway...\n');
    }

    const apiKey = process.env.MAILERLITE_API_KEY;
    if (!apiKey) {
        console.log('❌ MAILERLITE_API_KEY not found in environment variables');
        console.log('\n   To fix this:');
        console.log('   1. Create or edit .env file in the project root');
        console.log('   2. Add: MAILERLITE_API_KEY=your_api_key_here');
        console.log('   3. Get your API key from: MailerLite Dashboard → Integrations → API');
        console.log('\n   Example .env file location:');
        console.log(`   ${path.resolve(__dirname, '../../.env')}\n`);
        return;
    }

    console.log('✅ MAILERLITE_API_KEY found\n');

    try {
        // Dynamic import to handle missing package gracefully
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const MailerLite = require('@mailerlite/mailerlite-nodejs');
        
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

