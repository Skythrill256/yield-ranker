import dotenv from 'dotenv';
import MailerLiteSDK from '@mailerlite/mailerlite-nodejs';

// Handle CJS/ESM interop
const MailerLite = (MailerLiteSDK as any).default || MailerLiteSDK;

dotenv.config();

const apiKey = process.env.MAILERLITE_API_KEY;

if (!apiKey) {
  console.error('❌ MAILERLITE_API_KEY not found in environment variables');
  process.exit(1);
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-call
const mailerlite = new MailerLite({
  api_key: apiKey
});

console.log('Testing MailerLite API connection...\n');

try {
  const response = await mailerlite.subscribers.get({ limit: 1 });
  console.log('✅ API connection successful!');
  console.log('Response:', JSON.stringify(response, null, 2));
} catch (error) {
  console.error('❌ API connection failed:');
  console.error('Error:', error);
  process.exit(1);
}
