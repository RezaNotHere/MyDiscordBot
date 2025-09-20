const Enmap = require('enmap');
const { encrypt, decrypt } = require('./encryption');

// A wrapper for Enmap that automatically encrypts and decrypts data.
class SecureEnmap extends Enmap {
    constructor(options) {
        super(options);
    }

    // Encrypt value before setting
    set(key, value) {
        // To handle objects and other types, we stringify them before encryption.
        const stringValue = JSON.stringify(value);
        const encryptedValue = encrypt(stringValue);
        return super.set(key, encryptedValue);
    }

    // Decrypt value after getting
    get(key) {
        const encryptedValue = super.get(key);
        if (encryptedValue) {
            try {
                const decryptedValue = decrypt(encryptedValue);
                // We parse the JSON string back into its original form.
                return JSON.parse(decryptedValue);
            } catch (e) {
                // This could happen if the data is not valid JSON or not encrypted.
                // It might be unencrypted legacy data, so we return it as is.
                console.warn(`[DB] Could not decrypt or parse value for key '${key}'. Returning raw value.`, e);
                return encryptedValue;
            }
        }
        return undefined;
    }
}

const db = {
    warnings: new Enmap({ name: 'warnings' }),
    bannedWords: new Enmap({ name: 'bannedWords' }),
    tickets: new Enmap({ name: 'tickets' }),
    ticketInfo: new Enmap({ name: 'ticketInfo' }),
    giveaways: new Enmap({ name: 'giveaways' }),
    cards: new Enmap({ name: 'cards' }),
    polls: new Enmap({ name: 'polls' }),
    invites: new Enmap({ name: 'invites' }),
    // Use SecureEnmap for sensitive data like pending accounts
    pendingAccounts: new SecureEnmap({ 
        name: 'pendingAccounts',
        // Auto-fetch all data on startup to allow for expiration checks
        fetchAll: true,
    }),
};

// --- Automatic Cleanup for Pending Accounts ---
function cleanupPendingAccounts() {
    const now = Date.now();
    const ONE_HOUR_MS = 60 * 60 * 1000; // 1 hour in milliseconds

    // The .each() method is safer as it uses the overridden .get() internally.
    db.pendingAccounts.each((value, key) => {
        // 'value' is already decrypted here because .each() uses .get()
        if (value && value.timestamp && (now - value.timestamp > ONE_HOUR_MS)) {
            console.log(`[DB] Expired pending account found, deleting: ${key}`);
            db.pendingAccounts.delete(key);
        }
    });
}

// Run cleanup every 15 minutes to keep the database clean.
console.log('[DB] Setting up periodic cleanup for pending accounts.');
setInterval(cleanupPendingAccounts, 15 * 60 * 1000);

// Initial cleanup on startup
cleanupPendingAccounts();

module.exports = db;