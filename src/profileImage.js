
// Modern /mcinfo profile image generator with custom fonts and effects
const Jimp = require('jimp');
const axios = require('axios');
const path = require('path');

// Font paths
const FONT_MINECRAFTIA = path.join(__dirname, '../assets/fonts/Minecraftia.ttf');
const FONT_MONTSERRAT = path.join(__dirname, '../assets/fonts/Montserrat-Bold.ttf');

// Helper: load TTF font for Jimp
async function loadFontTTF(fontPath, size = 32) {
    // Use jimp's built-in font loader for TTF via @jimp/plugin-print (if available)
    // Otherwise, fallback to default Jimp fonts
    // For best results, use jimp@0.22+ and @jimp/plugin-print
    try {
        const { loadFont } = require('@jimp/plugin-print');
        return await loadFont({
            fontFile: fontPath,
            size,
        });
    } catch {
        // fallback: use built-in Jimp font
        return Jimp.FONT_SANS_32_WHITE;
    }
}

/**
 * Create a modern Minecraft profile image with skin, username, rank, stats, and capes
 * @param {object} options
 * @param {string} options.uuid - Player UUID
 * @param {string} options.username - Player username
 * @param {string} [options.rank] - Player rank (optional)
 * @param {object} [options.stats] - Hypixel stats (optional)
 * @param {string[]} [options.capeUrls] - Array of cape image URLs
 * @returns {Promise<Buffer>} PNG buffer
 */
async function createProfileImage({ uuid, username, rank = '', stats = {}, capeUrls = [] }) {
    try {
        // --- Layout constants ---
        const WIDTH = 900;
        const HEIGHT = 420;
        const PADDING = 32;
        const SKIN_SIZE = 256;
        const CAPE_SIZE = 80;
        const CAPES_PER_ROW = 4;
        const CAPES_ROWS = 2;
        const CAPE_FRAME = 12;
        const STATS_BOX_W = 340;
        const STATS_BOX_H = 120;

        // --- Load fonts ---
        // For best quality, use @jimp/plugin-print for TTF. Otherwise, fallback to built-in.
        let fontUsername, fontStats;
        try {
            fontUsername = await Jimp.loadFont(FONT_MINECRAFTIA);
        } catch {
            fontUsername = await Jimp.loadFont(Jimp.FONT_SANS_32_WHITE);
        }
        try {
            fontStats = await Jimp.loadFont(FONT_MONTSERRAT);
        } catch {
            fontStats = await Jimp.loadFont(Jimp.FONT_SANS_16_WHITE);
        }

        // --- Background: gradient + blur + glassmorphism ---
        const bg = new Jimp(WIDTH, HEIGHT, 0x23272eff);
        // Horizontal gradient
        for (let x = 0; x < WIDTH; x++) {
            const r = 35 + Math.floor(40 * x / WIDTH);
            const g = 39 + Math.floor(40 * x / WIDTH);
            const b = 46 + Math.floor(80 * x / WIDTH);
            const color = Jimp.rgbaToInt(r, g, b, 255);
            for (let y = 0; y < HEIGHT; y++) {
                bg.setPixelColor(color, x, y);
            }
        }
        // Blur for glass effect
        bg.blur(2);

        // --- Skin: left, with shadow and rainbow glow ---
        const skinUrl = `https://mc-heads.net/body/${uuid}/right?size=${SKIN_SIZE}`;
        const skinResp = await axios.get(skinUrl, { responseType: 'arraybuffer' });
        const skin = await Jimp.read(skinResp.data);
        // Shadow
        const shadow = new Jimp(SKIN_SIZE + 40, SKIN_SIZE + 40, 0x00000000);
        shadow.scan(0, 0, shadow.bitmap.width, shadow.bitmap.height, function(x, y, idx) {
            const dx = x - shadow.bitmap.width / 2;
            const dy = y - shadow.bitmap.height / 2;
            const dist = Math.sqrt(dx * dx + (dy * 0.7) * (dy * 0.7));
            if (dist < SKIN_SIZE / 2 + 30) {
                this.bitmap.data[idx + 3] = Math.max(0, 90 - dist * 1.1);
            }
        });
        bg.composite(shadow, PADDING - 20, (HEIGHT - SKIN_SIZE) / 2 - 20, { mode: Jimp.BLEND_SOURCE_OVER });
        // Rainbow glow
        const glow = new Jimp(SKIN_SIZE + 32, SKIN_SIZE + 32, 0x00000000);
        for (let i = 0; i < glow.bitmap.width; i++) {
            for (let j = 0; j < glow.bitmap.height; j++) {
                const dx = i - glow.bitmap.width / 2;
                const dy = j - glow.bitmap.height / 2;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist > SKIN_SIZE / 2 && dist < SKIN_SIZE / 2 + 16) {
                    // Rainbow hue
                    const hue = ((Math.atan2(dy, dx) * 180 / Math.PI) + 360) % 360;
                    const rgb = hslToRgb(hue / 360, 1, 0.6);
                    const alpha = Math.max(0, 80 - (dist - SKIN_SIZE / 2) * 5);
                    const idx = glow.getPixelIndex(i, j);
                    glow.bitmap.data[idx + 0] = rgb[0];
                    glow.bitmap.data[idx + 1] = rgb[1];
                    glow.bitmap.data[idx + 2] = rgb[2];
                    glow.bitmap.data[idx + 3] = alpha;
                }
            }
        }
        glow.blur(8);
        bg.composite(glow, PADDING - 16, (HEIGHT - SKIN_SIZE) / 2 - 16, { mode: Jimp.BLEND_SOURCE_OVER });
        // Skin
        bg.composite(skin, PADDING, (HEIGHT - SKIN_SIZE) / 2, { mode: Jimp.BLEND_SOURCE_OVER });

        // --- Helper: HSL to RGB for rainbow glow ---
        function hslToRgb(h, s, l) {
            let r, g, b;
            if (s === 0) {
                r = g = b = l;
            } else {
                const hue2rgb = (p, q, t) => {
                    if (t < 0) t += 1;
                    if (t > 1) t -= 1;
                    if (t < 1/6) return p + (q - p) * 6 * t;
                    if (t < 1/2) return q;
                    if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
                    return p;
                };
                const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
                const p = 2 * l - q;
                r = hue2rgb(p, q, h + 1/3);
                g = hue2rgb(p, q, h);
                b = hue2rgb(p, q, h - 1/3);
            }
            return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
        }

        // --- Username & rank: top center ---
        const nameText = rank ? `[${rank}] ${username}` : username;
        // Draw username with Minecraftia font, shadowed
        const nameX = SKIN_SIZE + PADDING * 2 + 10;
        const nameY = PADDING;
        // Shadow
        const nameShadow = new Jimp(500, 48, 0x00000000);
        nameShadow.print(fontUsername, 2, 2, nameText);
        nameShadow.blur(2);
        bg.composite(nameShadow, nameX, nameY);
        // Main text
        bg.print(fontUsername, nameX, nameY, {
            text: nameText,
            alignmentX: Jimp.HORIZONTAL_ALIGN_LEFT,
            alignmentY: Jimp.VERTICAL_ALIGN_TOP
        }, 500, 48);

        // --- Stats box: glassmorphism center + Hypixel logo badge ---
        const statsBoxX = SKIN_SIZE + PADDING * 2 + 10;
        const statsBoxY = nameY + 56;
        const statsBox = new Jimp(STATS_BOX_W, STATS_BOX_H, 0xffffff33);
        statsBox.blur(2);
        // Border-radius (manual, for glass card)
        const radius = 24;
        statsBox.scan(0, 0, STATS_BOX_W, STATS_BOX_H, function(x, y, idx) {
            // Soft border
            if (x < 4 || x > STATS_BOX_W - 5 || y < 4 || y > STATS_BOX_H - 5) {
                this.bitmap.data[idx + 3] = 80;
            }
            // Rounded corners
            if ((x < radius && y < radius && Math.hypot(x - radius, y - radius) > radius) ||
                (x > STATS_BOX_W - radius && y < radius && Math.hypot(x - (STATS_BOX_W - radius), y - radius) > radius) ||
                (x < radius && y > STATS_BOX_H - radius && Math.hypot(x - radius, y - (STATS_BOX_H - radius)) > radius) ||
                (x > STATS_BOX_W - radius && y > STATS_BOX_H - radius && Math.hypot(x - (STATS_BOX_W - radius), y - (STATS_BOX_H - radius)) > radius)) {
                this.bitmap.data[idx + 3] = 0;
            }
        });
        // Stats text
        let statsText = '';
        if (stats && Object.keys(stats).length > 0) {
            for (const [key, value] of Object.entries(stats)) {
                statsText += `${key}: ${value}\n`;
            }
        } else {
            statsText = 'No Hypixel stats';
        }
        statsBox.print(fontStats, 56, 16, {
            text: statsText,
            alignmentX: Jimp.HORIZONTAL_ALIGN_LEFT,
            alignmentY: Jimp.VERTICAL_ALIGN_TOP
        }, STATS_BOX_W - 72, STATS_BOX_H - 32);
        // Hypixel logo badge (top-left of stats box)
        try {
            const hypixelLogo = await Jimp.read(path.join(__dirname, '../assets/HypixelLogo.png'));
            hypixelLogo.resize(32, 32).opacity(0.92);
            // Glassy circle behind logo
            const badge = new Jimp(40, 40, 0xffffff66);
            badge.blur(2);
            statsBox.composite(badge, 8, 8);
            statsBox.composite(hypixelLogo, 12, 12);
        } catch {}
        bg.composite(statsBox, statsBoxX, statsBoxY);

        // --- Capes: below stats, modern frames ---
        const capesStartX = statsBoxX;
        const capesStartY = statsBoxY + STATS_BOX_H + 32;
        let capeImages = [];
        for (const url of capeUrls.slice(0, CAPES_PER_ROW * CAPES_ROWS)) {
            try {
                const resp = await axios.get(url, { responseType: 'arraybuffer' });
                let img = await Jimp.read(resp.data);
                img.resize(CAPE_SIZE, CAPE_SIZE);
                capeImages.push(img);
            } catch (e) {
                // skip failed cape
            }
        }
        for (let i = 0; i < capeImages.length; i++) {
            const row = Math.floor(i / CAPES_PER_ROW);
            const col = i % CAPES_PER_ROW;
            const x = capesStartX + col * (CAPE_SIZE + CAPE_FRAME + 8);
            const y = capesStartY + row * (CAPE_SIZE + CAPE_FRAME + 8);
            // Frame: glassy, soft border
            const frame = new Jimp(CAPE_SIZE + CAPE_FRAME, CAPE_SIZE + CAPE_FRAME, 0xffffff55);
            frame.blur(1);
            frame.scan(0, 0, frame.bitmap.width, frame.bitmap.height, function(x, y, idx) {
                if (x < 3 || x > frame.bitmap.width - 4 || y < 3 || y > frame.bitmap.height - 4) {
                    this.bitmap.data[idx + 3] = 80;
                }
            });
            frame.composite(capeImages[i], CAPE_FRAME / 2, CAPE_FRAME / 2);
            bg.composite(frame, x, y);
        }
        if (capeImages.length === 0) {
            // Show placeholder if no capes
            const noCape = new Jimp(CAPE_SIZE * 2 + CAPE_FRAME * 2 + 8, CAPE_SIZE + CAPE_FRAME, 0x00000055);
            noCape.print(fontStats, 12, 18, 'No Capes Found');
            bg.composite(noCape, capesStartX, capesStartY);
        }

        // --- Final: return PNG buffer ---
        return await bg.getBufferAsync(Jimp.MIME_PNG);
    } catch (err) {
        console.error('Error creating modern profile image:', err);
        throw err;
    }
}

module.exports = { createProfileImage };