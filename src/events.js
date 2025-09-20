// events.js
const db = require('./database');
const utils = require('./utils');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

async function onMessageCreate(message, client, env) {
    // Skip bot messages
    if (message.author.bot) return;

    // --- Bad Words Filter ---
    if (utils.isBadWord(message.content)) {
        try {
            await message.delete();
        } catch {}
        // اخطار به کاربر
        const warnCount = utils.addWarning(message.author.id);
        try {
            await message.author.send({
                embeds: [
                    new EmbedBuilder()
                        .setColor('Red')
                        .setTitle('⚠️ اخطار رفتاری')
                        .setDescription('پیام شما به دلیل استفاده از کلمات غیرمجاز حذف شد. لطفاً قوانین سرور را رعایت کنید.')
                        .addFields({ name: 'تعداد اخطارها', value: `${warnCount} / 3` })
                        .setFooter({ text: 'در صورت تکرار، از سرور بن خواهید شد.' })
                        .setTimestamp()
                ]
            });
        } catch {}
        // لاگ
        await utils.logAction(message.guild, `🚫 پیام حاوی کلمه غیرمجاز از ${message.author.tag} حذف شد. (${warnCount}/3 اخطار)`);
        // بن بعد از ۳ اخطار
        if (warnCount >= 3) {
            try {
                // Send Persian ban DM
                try {
                    const banEmbed = new EmbedBuilder()
                        .setColor(0xFF0000)
                        .setTitle('بن شدن از سرور')
                        .setDescription('شما به دلیل دریافت ۳ اخطار از سرور بن شدید. برای اطلاعات بیشتر با ادمین تماس بگیرید.')
                        .setTimestamp();
                    await message.author.send({ embeds: [banEmbed] });
                } catch (dmError) {
                    console.error('Failed to send ban DM:', dmError);
                }
                await message.member.ban({ reason: 'دریافت ۳ اخطار به دلیل استفاده مکرر از کلمات غیرمجاز' });
                utils.clearWarnings(message.author.id);
                await utils.logAction(message.guild, `⛔️ ${message.author.tag} به دلیل دریافت ۳ اخطار بن شد.`);
            } catch {}
        }
        return;
    }
    // ...existing code...
}

async function onGuildMemberAdd(member, client, env) {
    // Welcome new members
    console.log(`New member joined: ${member.user.tag}`);

    // Send mention message in role channel and delete it quickly
    const roleChannelId = process.env.ROLE_CHANNEL_ID;
    if (roleChannelId) {
        try {
            const channel = member.guild.channels.cache.get(roleChannelId);
            if (channel && channel.isTextBased()) {
                const msg = await channel.send({ content: `${member} لطفا رول خود را از منوی بالا انتخاب کن.` });
                setTimeout(() => msg.delete().catch(() => {}), 1000);
            }
        } catch (e) {
            console.error('Error sending quick role mention:', e);
        }
    }
    try {
        await utils.logAction(member.guild, `👋 ${member.user.tag} به سرور پیوست.`);
    } catch (e) {
        console.error('Error logging member join:', e);
    }
}

async function onGuildMemberRemove(member, client, env) {
    // Handle member leaving
    console.log(`Member left: ${member.user.tag}`);
    
    // Cleanup user data if they leave
    if (db.tickets.has(member.id)) {
        const ticketChannelId = db.tickets.get(member.id);
        db.tickets.delete(member.id);
        if (db.ticketInfo.has(ticketChannelId)) {
            db.ticketInfo.delete(ticketChannelId);
        }
    }
    
    try {
        await utils.logAction(member.guild, `👋 ${member.user.tag} از سرور خارج شد.`);
    } catch (e) {
        console.error('Error logging member leave:', e);
    }
}

async function onReady(client) {
    console.log(`✅ بات لاگین شد: ${client.user.tag}`);
}

async function onInteractionCreate(interaction, client, env) {
    console.log(`events.onInteractionCreate entry: type=${interaction.type}, isButton=${interaction.isButton()}, customId='${interaction.customId || 'N/A'}', replied=${interaction.replied}, deferred=${interaction.deferred}`);
    // All slash command logic has been moved to commands.js to avoid dual processing.
    // This function can be used for other interaction types like buttons or select menus if needed in the future.
}
async function onGuildBanAdd(ban, client, env) {
    const { user, guild } = ban;

    // Find a suitable channel for creating an invite
    let inviteUrl = 'Unable to create invite at this time.';
    try {
        const channel = guild.channels.cache.find(c =>
            c.isTextBased() &&
            c.permissionsFor(guild.members.me).has('CreateInvite')
        );
        if (channel) {
            const invite = await channel.createInvite({
                maxAge: 86400, // 24 hours
                maxUses: 1,
                reason: 'Temporary invite for ban notification'
            });
            inviteUrl = invite.url;
        }
    } catch (inviteError) {
        console.error('Error creating invite:', inviteError);
    }

    const embed = new EmbedBuilder()
        .setColor('Red')
        .setTitle('You have been banned')
        .setDescription('You have been banned from the server for violating our community guidelines. If you believe this was a mistake, please contact server administration for more details.')
        .setFooter({ text: `Server Invite: ${inviteUrl}` })
        .setTimestamp();

    try {
        await user.send({
            content: 'You have been banned from the server.',
            embeds: [embed]
        });
    } catch (dmError) {
        console.error('Failed to send DM to banned user:', dmError);
    }

    // Log the ban action
    try {
        await utils.logAction(guild, `⛔️ ${user.tag} was banned from the server.`);
    } catch (logError) {
        console.error('Failed to log ban:', logError);
    }
}

module.exports = {
    onMessageCreate,
    onGuildMemberAdd,
    onGuildMemberRemove,
    onReady,
    onInteractionCreate,
    onGuildBanAdd
};
