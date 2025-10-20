const crypto = require('crypto');

console.log('Generated ENCRYPTION_KEY:', crypto.randomBytes(32).toString('hex'));
console.log('\nCopy this 64-character key and add it to your Replit Secrets as ENCRYPTION_KEY');
