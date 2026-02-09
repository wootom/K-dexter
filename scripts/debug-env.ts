
import { config } from 'dotenv';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

console.log('Current working directory:', process.cwd());
const envPath = resolve(process.cwd(), '.env');
console.log('.env path:', envPath);
console.log('.env exists:', existsSync(envPath));

if (existsSync(envPath)) {
    const content = readFileSync(envPath, 'utf-8');
    console.log('.env content length:', content.length);
    const openAILine = content.split('\n').find(l => l.startsWith('OPENAI_API_KEY'));
    console.log('OPENAI_API_KEY line in file:', openAILine ? 'Found' : 'Not Found');
    if (openAILine) {
        console.log('Line chars:', openAILine.substring(0, 20) + '...');
    }
}

// Load dotenv
const result = config();
console.log('dotenv load result:', result.error ? result.error.message : 'Success');

const apiKey = process.env.OPENAI_API_KEY;
console.log('process.env.OPENAI_API_KEY:', apiKey ? `Present (Starts with ${apiKey.substring(0, 5)}...)` : 'Missing');

if (!apiKey) {
    console.log('Current process.env keys:', Object.keys(process.env).filter(k => k.includes('API')));
}
