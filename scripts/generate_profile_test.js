const fs = require('fs');
const path = require('path');
const { createProfileImage } = require(path.join(__dirname, '..', 'src', 'profileImage'));

(async () => {
  try {
    // Example UUID for testing (example Mojang UUID)
    const uuid = '853c80ef3c3749fdaa49938b674adae6'; // Notch's UUID
    const username = 'Notch';
    const buffer = await createProfileImage({ uuid, username, rank: 'MVP+', stats: { level: 42, karma: 12345 }, capeUrls: [] });
    const outPath = path.join(__dirname, '..', 'profile_test.png');
    fs.writeFileSync(outPath, buffer);
    console.log('Wrote', outPath);
  } catch (e) {
    console.error('Test failed:', e);
    process.exitCode = 1;
  }
})();