/**
 * lib/encryption.ts
 * 
 * Provides AES-256-CBC encryption and decryption helper functions.
 * Password and session secrets are encrypted before saving in Turso SQLite.
 */

import crypto from 'crypto';

const ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16; // AES block size in bytes

/**
 * Derives a 32-byte key from the environment variable using SHA-256.
 * This guarantees the key is exactly 256 bits, preventing initialization errors.
 */
function getEncryptionKey(): Buffer {
    const keySource = process.env.BOT_ENCRYPTION_KEY || 'default-bot-encryption-key-for-korea-visa-check';
    return crypto.createHash('sha256').update(keySource).digest();
}

/**
 * Encrypts clear text using AES-256-CBC.
 * Returns a colon-separated string of the IV and ciphertext, formatted in hex.
 */
export function encrypt(text: string): string {
    if (!text) return '';
    const iv = crypto.randomBytes(IV_LENGTH);
    const key = getEncryptionKey();
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    return `${iv.toString('hex')}:${encrypted}`;
}

/**
 * Decrypts a colon-separated string of the IV and ciphertext.
 * Returns the original clear text.
 */
export function decrypt(cipherText: string): string {
    if (!cipherText) return '';
    const parts = cipherText.split(':');
    if (parts.length !== 2) {
        throw new Error('Malformed encrypted text format (expected iv:ciphertext).');
    }
    
    const iv = Buffer.from(parts[0], 'hex');
    const encrypted = parts[1];
    const key = getEncryptionKey();
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
}
