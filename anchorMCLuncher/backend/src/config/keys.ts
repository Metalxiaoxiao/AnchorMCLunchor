import { generateKeyPairSync } from 'crypto';
import fs from 'fs';
import path from 'path';

const KEYS_DIR = path.resolve(__dirname, '../../keys');
const PUBLIC_KEY_PATH = path.join(KEYS_DIR, 'public.pem');
const PRIVATE_KEY_PATH = path.join(KEYS_DIR, 'private.pem');

if (!fs.existsSync(KEYS_DIR)) {
    fs.mkdirSync(KEYS_DIR, { recursive: true });
}

let publicKey: string;
let privateKey: string;

if (fs.existsSync(PUBLIC_KEY_PATH) && fs.existsSync(PRIVATE_KEY_PATH)) {
    console.log("Loading existing RSA keys...");
    publicKey = fs.readFileSync(PUBLIC_KEY_PATH, 'utf-8');
    privateKey = fs.readFileSync(PRIVATE_KEY_PATH, 'utf-8');
} else {
    console.log("Generating new RSA keys...");
    // Generate RSA key pair
    const keys = generateKeyPairSync('rsa', {
        modulusLength: 4096,
        publicKeyEncoding: {
            type: 'spki',
            format: 'pem'
        },
        privateKeyEncoding: {
            type: 'pkcs8',
            format: 'pem'
        }
    });
    publicKey = keys.publicKey;
    privateKey = keys.privateKey;

    fs.writeFileSync(PUBLIC_KEY_PATH, publicKey);
    fs.writeFileSync(PRIVATE_KEY_PATH, privateKey);
}

export const keys = { publicKey, privateKey };
