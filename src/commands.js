// commands.js
// Slash command and message command handlers
const { 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    StringSelectMenuBuilder, 
    ModalBuilder, 
    TextInputBuilder, 
    TextInputStyle 
} = require('discord.js');
const db = require('./database');
const utils = require('./utils');
const InteractionUtils = require('./utils/InteractionUtils');
const { 
    PermissionError, 
    ValidationError, 
    ApiError,
    NotFoundError 
} = require('./errors/BotError');

let logger = null;

function setLogger(loggerInstance) {
    logger = loggerInstance;
}


// --- Minecraft & Hypixel Slash Commands ---
const { SlashCommandBuilder } = require('discord.js');

const mcCommands = [
    new SlashCommandBuilder()
        .setName("mcinfo")
        .setDescription("نمایش اطلاعات کامل اکانت ماینکرفت در هایپیکسل")
        .addStringOption(option => option.setName("username").setDescription("یوزرنیم ماینکرفت").setRequired(true))
        .addStringOption(option => option.setName("color").setDescription("رنگ امبد").setRequired(false)
            .addChoices(
                { name: "آبی", value: "blue" }, { name: "قرمز", value: "red" }, { name: "سبز", value: "green" },
                { name: "بنفش", value: "purple" }, { name: "طلایی", value: "gold" }, { name: "نارنجی", value: "orange" },
                { name: "پیش‌فرض", value: "default" }
            ))
        .addStringOption(option => option.setName("price").setDescription("قیمت اکانت (تومان)").setRequired(false)),
    new SlashCommandBuilder()
        .setName("send_account")
        .setDescription("ارسال اطلاعات اکانت برای خریدار")
        .addStringOption(option => option.setName("mail").setDescription("ایمیل اکانت").setRequired(true))
        .addStringOption(option => option.setName("recovery_code").setDescription("کد بازیابی اکانت").setRequired(true))
        .addStringOption(option => option.setName("account_num").setDescription("شماره اکانت").setRequired(true))
        .addStringOption(option => option.setName("username").setDescription("یوزرنیم اکانت (اختیاری)").setRequired(false))
        .addStringOption(option => option.setName("password").setDescription("پسورد اکانت (اختیاری)").setRequired(false))
];

// اگر سیستم ثبت commands دارید، این آرایه را به آن اضافه کنید یا export نمایید
module.exports = {
    mcCommands,
    setLogger
};

async function handleSlashCommand(interaction, client, env) {
    try {
        if (logger) {
            logger.info(`Command executed`, {
                command: interaction.commandName,
                user: interaction.user.id,
                guild: interaction.guild?.id,
                channel: interaction.channel?.id
            });
        }

        // --- mcinfo ---
    if (interaction.commandName === "mcinfo") {
        await InteractionUtils.deferReply(interaction, true);
        const username = interaction.options.getString("username").trim();
        const colorOption = interaction.options.getString("color") || "default";
        const color = utils.COLOR_PRESETS[colorOption.toUpperCase()] || utils.COLOR_PRESETS.DEFAULT;
        const price = interaction.options.getString("price");
        try {
            const mojangData = await utils.getMojangData(username);
            if (!mojangData) {
                throw new NotFoundError("اکانت ماینکرفت یافت نشد.", "MojangAccount");
            }

            const uuid = mojangData.id;
            const hypixelData = await utils.getHypixelData(uuid, process.env.HYPIXEL_API_KEY);
            if (!hypixelData?.player || !hypixelData.success) {
                if (logger) {
                    logger.warn('Hypixel API error', { 
                        username,
                        uuid,
                        response: hypixelData
                    });
                }
                throw new ApiError("خطا در دریافت اطلاعات هایپیکسل.", "Hypixel", hypixelData?.status);
            }

            const player = hypixelData.player;
            const hypixelRanks = utils.getHypixelRanks(player);
            const networkLevel = utils.getNetworkLevel(player);
            const karma = player.karma || 0;
            const achievementPoints = player.achievementPoints || 0;
            const cosmeticCapes = player.cosmeticCapes || [];
            const cosmetics = player.cosmeticTokens || [];
            const skinUrl = `https://crafatar.com/renders/body/${uuid}?size=512&overlay`;
            const avatarUrl = `https://crafatar.com/avatars/${uuid}?size=256&overlay`;
            
            const embed = new EmbedBuilder()
                .setColor(color)
                .setTitle(`🔍 اطلاعات هایپیکسل - ${username}`)
                .setDescription(`سطح شبکه: **${networkLevel}** | کارما: **${karma.toLocaleString()}**`)
                .addFields(
                    { name: "🎖️ رنک‌های هایپیکسل", value: hypixelRanks, inline: false },
                    { name: "🏆 امتیاز دستاوردها", value: achievementPoints.toLocaleString(), inline: true },
                    { name: "🧥 تعداد کیپ‌ها", value: cosmeticCapes.length.toString(), inline: true },
                    { name: "🎨 تعداد کازمتیک‌ها", value: cosmetics.length.toString(), inline: true },
                    ...(price ? [{ name: "💰 قیمت", value: `**${price} تومان**`, inline: true }] : [])
                )
                .setThumbnail(avatarUrl)
                .setImage(skinUrl)
                .setFooter({ text: `هایپیکسل ID: ${player._id || 'نامشخص'}`, iconURL: "https://hypixel.net/styles/hypixel-v2/images/header-logo.png" })
                .setTimestamp();

            await interaction.editReply({ embeds: [embed], ephemeral: true });
        } catch (error) {
            if (logger) {
                logger.logCommandError(error, 'mcinfo', interaction);
            }
            let msg = "خطا در دریافت اطلاعات.";
            if (error.code === 'ECONNABORTED') msg = "زمان درخواست به پایان رسید.";
            else if (error.response?.status === 429) msg = "تعداد درخواست‌ها زیاد است.";
            else if (error.response?.status === 403) msg = "کلید API معتبر نیست.";
            await InteractionUtils.sendError(interaction, msg, true);
        }
        return;
    }
    // --- /addbadword ---
    if (interaction.commandName === 'addbadword') {
        if (!interaction.member.permissions.has('Administrator')) {
            return await InteractionUtils.sendError(interaction, 'شما دسترسی لازم برای این دستور را ندارید.');
        }
        const word = interaction.options.getString('word');
        utils.addBadWord(word);
        await InteractionUtils.sendSuccess(interaction, `کلمه غیرمجاز «${word}» اضافه شد.`);
        return;
    }

    // --- /removebadword ---
    if (interaction.commandName === 'removebadword') {
        if (!interaction.member.permissions.has('Administrator')) {
            return await InteractionUtils.sendError(interaction, 'شما دسترسی لازم برای این دستور را ندارید.');
        }
        const word = interaction.options.getString('word');
        utils.removeBadWord(word);
        await InteractionUtils.sendSuccess(interaction, `کلمه غیرمجاز «${word}» حذف شد.`);
        return;
    }

    // --- /listbadwords ---
    if (interaction.commandName === 'listbadwords') {
        if (!interaction.member.permissions.has('Administrator')) {
            return await InteractionUtils.sendError(interaction, 'شما دسترسی لازم برای این دستور را ندارید.');
        }
        const list = utils.listBadWords();
        const embed = new EmbedBuilder()
            .setColor('Blue')
            .setTitle('📝 لیست کلمات غیرمجاز')
            .setDescription(list.length ? list.join(', ') : 'لیست خالی است.')
            .setTimestamp();
        await interaction.reply({ embeds: [embed], ephemeral: true });
        return;
    }

    // --- /clearwarnings ---
    if (interaction.commandName === 'clearwarnings') {
        if (!interaction.member.permissions.has('ModerateMembers')) {
            return await InteractionUtils.sendError(interaction, 'شما دسترسی لازم برای این دستور را ندارید.');
        }
        const user = interaction.options.getUser('user');
        utils.clearWarnings(user.id);
        await InteractionUtils.sendSuccess(interaction, `اخطارهای ${user.tag} پاک شد.`);
        return;
    }
    // --- اتصال سیستم اخطار به warn ---
    // --- /invites ---
    if (interaction.commandName === 'invites') {
        await interaction.deferReply();
        const user = interaction.options.getUser('user');
        try {
            const invites = await interaction.guild.invites.fetch();
            let total = 0, fake = 0, left = 0, normal = 0;
            const db = require('./database');
            // اگر دیتابیس یا سیستم فیک/لفت دارید اینجا جایگزین کنید
            invites.forEach(inv => {
                if (!inv.inviter || inv.inviter.id !== user.id) return;
                total += inv.uses || 0;
                // فرض: اگر invite maxAge داشت و هنوز معتبر بود، فیک حساب نشود
                // اگر invite منقضی شده یا maxUses پر شده، می‌تواند فیک یا لفت باشد (نیاز به سیستم دقیق‌تر)
                // اینجا فقط شمارش ساده انجام می‌شود
                normal += inv.uses || 0;
            });
            // اگر سیستم فیک/لفت دارید، اینجا مقداردهی کنید:
            // fake = ...; left = ...;
            const embed = new EmbedBuilder()
                .setColor('#f1c40f')
                .setTitle(`📨 آمار دعوت‌های ${user.tag}`)
                .setThumbnail(user.displayAvatarURL({ dynamic: true }))
                .addFields(
                    { name: '📥 مجموع دعوت‌ها', value: `${total} نفر`, inline: true },
                    { name: '✅ جوین واقعی', value: `${normal} نفر`, inline: true },
                    { name: '❌ جوین فیک', value: `${fake} نفر`, inline: true },
                    { name: '🚪 لفت داده‌اند', value: `${left} نفر`, inline: true }
                )
                .setFooter({ text: 'برای مشاهده لیست برترین دعوت‌کنندگان از /invites-leaderboard استفاده کنید' })
                .setTimestamp();
            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error('Invites details error:', error);
            await InteractionUtils.sendError(interaction, 'خطا در دریافت اطلاعات دعوت‌ها.', true);
        }
        return;
    }
    // --- /start-giveaway ---
    if (interaction.commandName === 'start-giveaway') {
        try {
            // Check permissions first
            if (!interaction.member.permissions.has('ManageMessages')) {
                throw new PermissionError(
                    'شما دسترسی لازم برای برگزاری گیووای را ندارید.',
                    'ManageMessages'
                );
            }

            const channel = interaction.options.getChannel('channel');
            const durationStr = interaction.options.getString('duration');
            const winners = interaction.options.getInteger('winners');
            const prize = interaction.options.getString('prize');

            // Validate input parameters
            if (!/^\d+[smhd]$/.test(durationStr)) {
                throw new ValidationError(
                    'فرمت زمان معتبر نیست. مثال: 1h یا 30m یا 2d',
                    'duration'
                );
            }

            if (winners < 1) {
                throw new ValidationError(
                    'تعداد برندگان باید حداقل 1 باشد.',
                    'winners'
                );
            }

            const ms = utils.ms;
            const durationMs = ms(durationStr);
            
            if (!durationMs || durationMs < 10000) {
                return await InteractionUtils.sendError(interaction, 'مدت زمان باید حداقل 10 ثانیه باشد.');
            }
            const endTime = Date.now() + durationMs;
            const embed = new EmbedBuilder()
                .setColor('#FFD700')
                .setTitle('🎉 گیووای بزرگ سرور!')
                .setDescription(`برای شرکت در گیووای روی 🎉 کلیک کنید!\n\n**جایزه:** ${prize}\n**تعداد برندگان:** ${winners}\n**پایان:** <t:${Math.floor(endTime/1000)}:R>\n👤 برگزارکننده: <@${interaction.user.id}>\n\n👥 شرکت‌کننده تا این لحظه: **0 نفر**`)
                .setFooter({ text: 'برای شرکت در گیووای روی دکمه زیر کلیک کنید.' })
                .setTimestamp();
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('join_giveaway').setLabel('شرکت در گیووای').setStyle(ButtonStyle.Success).setEmoji('🎉')
            );
            const msg = await channel.send({ embeds: [embed], components: [row] });
            // ذخیره اطلاعات گیووای
            const db = require('./database');
            db.giveaways.set(msg.id, {
                channelId: channel.id,
                prize,
                winnerCount: winners,
                endTime,
                ended: false,
                participants: [],
                host: interaction.user.id
            });
            await interaction.reply({ content: `گیووای با موفقیت ایجاد شد! [مشاهده](${msg.url})`, ephemeral: true });
            // زمان‌بندی پایان گیووای
            require('./utils').checkGiveaways();
            return;
        } catch (error) {
            if (logger) {
                logger.logCommandError(error, 'start-giveaway', interaction);
            }
            await InteractionUtils.sendError(interaction, 'خطا در ایجاد گیووای.', true);
            return;
        }
    }
    // --- /end-giveaway ---
    if (interaction.commandName === 'end-giveaway') {
        // Check permissions first
        if (!interaction.member.permissions.has('ManageMessages')) {
            return await InteractionUtils.sendError(interaction, 'شما دسترسی لازم برای پایان دادن به گیووای را ندارید.');
        }

        const messageId = interaction.options.getString('messageid');
        const giveaway = db.giveaways.get(messageId);

        if (!giveaway) {
            return await InteractionUtils.sendError(interaction, 'گیووای مورد نظر یافت نشد.');
        }

        if (giveaway.ended) {
            return await InteractionUtils.sendError(interaction, 'این گیووای قبلاً پایان یافته است.');
        }

        await utils.endGiveaway(messageId);
        await InteractionUtils.sendSuccess(interaction, 'گیووای به پایان رسید و برندگان انتخاب شدند.');
        return;
    }
    // --- /reroll-giveaway ---
    if (interaction.commandName === 'reroll-giveaway') {
        const messageId = interaction.options.getString('messageid');
        const db = require('./database');
        const giveaway = db.giveaways.get(messageId);
        if (!giveaway) {
            return await InteractionUtils.sendError(interaction, 'گیووای مورد نظر یافت نشد.');
        }
        if (!giveaway.ended) {
            return await InteractionUtils.sendError(interaction, 'این گیووای هنوز به پایان نرسیده است.');
        }
        // ری‌رول: انتخاب برندگان جدید
        const channel = interaction.guild.channels.cache.get(giveaway.channelId);
        if (!channel) {
            return await InteractionUtils.sendError(interaction, 'چنل گیووای یافت نشد.');
        }
        const message = await channel.messages.fetch(messageId).catch(() => null);
        if (!message) {
            return await InteractionUtils.sendError(interaction, 'پیام گیووای یافت نشد.');
        }
        const participants = giveaway.participants || [];
        if (participants.length === 0) {
            return await InteractionUtils.sendError(interaction, 'هیچ شرکت‌کننده‌ای وجود ندارد.');
        }
        const winners = [];
        for (let i = 0; i < giveaway.winnerCount; i++) {
            if (participants.length === 0) break;
            const winnerIndex = Math.floor(Math.random() * participants.length);
            winners.push(participants.splice(winnerIndex, 1)[0]);
        }
        const rerollEmbed = new EmbedBuilder()
            .setColor('#FFD700')
            .setTitle('🎉 ری‌رول گیووای!')
            .setDescription(`برندگان جدید:\n${winners.map(w => `<@${w}>`).join(', ')}`)
            .setTimestamp();
        await channel.send({ embeds: [rerollEmbed] });
        await interaction.reply({ content: 'برندگان جدید انتخاب شدند.', ephemeral: true });
        return;
    }
    // --- شرکت در گیووای ---
    if (interaction.customId === 'join_giveaway') {
        const db = require('./database');
        const giveaway = db.giveaways.find(g => g.channelId === interaction.channel.id && !g.ended);
        if (!giveaway) {
            return await InteractionUtils.sendError(interaction, 'گیووای فعال یافت نشد.');
        }
        if (!giveaway.participants) giveaway.participants = [];
        if (giveaway.participants.includes(interaction.user.id)) {
            return await InteractionUtils.sendError(interaction, 'شما قبلاً در این گیووای شرکت کرده‌اید.');
        }
        giveaway.participants.push(interaction.user.id);
        db.giveaways.set(interaction.message.id, giveaway);
        // آپدیت شمارنده شرکت‌کننده‌ها در امبد
        const msg = await interaction.channel.messages.fetch(interaction.message.id).catch(() => null);
        if (msg && msg.embeds && msg.embeds[0]) {
            const oldEmbed = msg.embeds[0];
            // متن جدید با شمارنده
            let newDesc = oldEmbed.description || '';
            if (newDesc.includes('👥 شرکت‌کننده تا این لحظه:')) {
                newDesc = newDesc.replace(/👥 شرکت‌کننده تا این لحظه: \*\*\d+ نفر\*\*/, `👥 شرکت‌کننده تا این لحظه: **${giveaway.participants.length} نفر**`);
            } else {
                newDesc += `\n\n👥 شرکت‌کننده تا این لحظه: **${giveaway.participants.length} نفر**`;
            }
            const newEmbed = EmbedBuilder.from(oldEmbed).setDescription(newDesc);
            await msg.edit({ embeds: [newEmbed], components: msg.components });
        }
        await InteractionUtils.sendSuccess(interaction, 'شما با موفقیت در گیووای شرکت کردید! موفق باشید! 🎉');
        return;
    }
    // --- /rolestats ---
    if (interaction.commandName === 'rolestats') {
        await interaction.deferReply();
        try {
            const roles = interaction.guild.roles.cache.filter(r => r.id !== interaction.guild.id && !r.managed).sort((a, b) => b.position - a.position);
            let desc = '';
            let total = 0;
            roles.forEach(role => {
                desc += `<@&${role.id}> : **${role.members.size} نفر**\n`;
                total += role.members.size;
            });
            if (!desc) desc = 'هیچ رولی یافت نشد.';
            const embed = new EmbedBuilder()
                .setColor('#7289da')
                .setTitle('📊 آمار اعضای هر رول سرور')
                .setDescription(desc)
                .addFields({ name: '👥 مجموع اعضای دارای رول (غیر از everyone)', value: `${total} نفر` })
                .setFooter({ text: 'برای مدیریت بهتر رول‌ها از این آمار استفاده کنید.' })
                .setTimestamp();
            // پیشنهاد: نمایش بیشترین و کمترین رول از نظر تعداد عضو
            if (roles.size > 0) {
                const maxRole = roles.reduce((a, b) => a.members.size > b.members.size ? a : b);
                const minRole = roles.reduce((a, b) => a.members.size < b.members.size ? a : b);
                embed.addFields(
                    { name: '🏆 بیشترین عضو', value: `<@&${maxRole.id}> (${maxRole.members.size} نفر)`, inline: true },
                    { name: '🔻 کمترین عضو', value: `<@&${minRole.id}> (${minRole.members.size} نفر)`, inline: true }
                );
            }
            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error('Role stats error:', error);
            await InteractionUtils.sendError(interaction, 'خطا در دریافت آمار رول‌ها.', true);
        }
        return;
    }
    // --- /invites-leaderboard ---
    if (interaction.commandName === 'invites-leaderboard') {
        await interaction.deferReply();
        try {
            const invites = await interaction.guild.invites.fetch();
            // جمع‌آوری تعداد دعوت‌ها برای هر کاربر
            const inviteCounts = {};
            invites.forEach(inv => {
                if (!inv.inviter) return;
                if (!inviteCounts[inv.inviter.id]) inviteCounts[inv.inviter.id] = 0;
                inviteCounts[inv.inviter.id] += inv.uses || 0;
            });
            // مرتب‌سازی و انتخاب 10 نفر برتر
            const sorted = Object.entries(inviteCounts)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 10);
            let desc = '';
            if (sorted.length === 0) {
                desc = 'هنوز هیچ دعوتی ثبت نشده است.';
            } else {
                desc = sorted.map(([uid, count], i) => `**${i+1}. <@${uid}>** — ${count} دعوت`).join('\n');
            }
            const embed = new EmbedBuilder()
                .setColor('#f1c40f')
                .setTitle('🏆 لیدربورد دعوت‌کنندگان سرور')
                .setDescription(desc)
                .setFooter({ text: 'برای قرار گرفتن در این لیست، دوستان خود را به سرور دعوت کنید!' })
                .setTimestamp();
            // پیشنهاد بهبود: نمایش جایگاه کاربر اجراکننده اگر جزو 10 نفر نبود
            if (sorted.length > 0 && !sorted.some(([uid]) => uid === interaction.user.id)) {
                const userCount = inviteCounts[interaction.user.id] || 0;
                if (userCount > 0) {
                    const rank = Object.entries(inviteCounts).sort((a, b) => b[1] - a[1]).findIndex(([uid]) => uid === interaction.user.id) + 1;
                    embed.addFields({ name: 'جایگاه شما', value: `رتبه ${rank} با ${userCount} دعوت` });
                }
            }
            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error('Invites leaderboard error:', error);
            await InteractionUtils.sendError(interaction, 'خطا در دریافت اطلاعات دعوت‌ها.', true);
        }
        return;
    }
    // --- /sentrolemenu ---
    if (interaction.commandName === 'sentrolemenu') {
        console.log(`sentrolemenu command executed by user ${interaction.user.id} in guild ${interaction.guild.id}`);
        if (!interaction.channel || interaction.channel.type !== 0) {
            return await InteractionUtils.sendError(interaction, 'این کامند فقط در چنل متنی قابل استفاده است.');
        }
        if (!interaction.member.permissions.has('ManageRoles')) {
            return await InteractionUtils.sendError(interaction, 'شما دسترسی لازم برای ارسال منوی رول را ندارید.');
        }
        // رول‌ها و تنظیمات
        console.log(`Role IDs from env: GIVEAWAY=${process.env.ROLE_GIVEAWAY_ID}, DROP=${process.env.ROLE_DROP_ID}, UPDATE=${process.env.ROLE_UPDATE_ID}`);
        const roles = [
            { id: process.env.ROLE_GIVEAWAY_ID, label: '🎉 افر/گیووای', color: ButtonStyle.Success, emoji: '🎉' },
            { id: process.env.ROLE_DROP_ID, label: '📦 دراپ', color: ButtonStyle.Primary, emoji: '📦' },
            { id: process.env.ROLE_UPDATE_ID, label: '🔔 اپدیت', color: ButtonStyle.Danger, emoji: '🔔' }
        ];
        console.log(`Roles array: ${JSON.stringify(roles)}`);
        const embed = new EmbedBuilder()
            .setColor('#2ecc71')
            .setTitle('📋 انتخاب رول اطلاع‌رسانی')
            .setDescription('برای دریافت اطلاع‌رسانی‌های مختلف، رول مورد نظر را انتخاب یا حذف کنید. با کلیک دوباره، رول برداشته می‌شود.\n\n**رول‌ها:**\n🎉 افر/گیووای\n📦 دراپ\n🔔 اپدیت')
            .setFooter({ text: 'برای فعال/غیرفعال کردن هر رول روی دکمه مربوطه کلیک کنید.' })
            .setTimestamp();
            console.log(`Fetching roles from guild...`);
        const row = new ActionRowBuilder().addComponents(
            ...roles.map(r => new ButtonBuilder().setCustomId(`rolebtn_${r.id}`).setLabel(r.label).setStyle(r.color).setEmoji(r.emoji))
        );
        console.log(`Buttons row created with customIds: ${roles.map(r => `rolebtn_${r.id}`).join(', ')}`);
        try {
            const message = await interaction.reply({ embeds: [embed], components: [row] });
            console.log(`sentrolemenu message sent successfully, ID: ${message.id}`);
        } catch (error) {
            console.log(`Error sending sentrolemenu message: ${error.message}\nStack: ${error.stack}`);
        }
        return;
    }
    // --- /sendticketmenu ---
    if (interaction.commandName === 'sendticketmenu') {
        // Only allow in text channels
        if (!interaction.channel || interaction.channel.type !== 0) {
            return await InteractionUtils.sendError(interaction, 'این کامند فقط در چنل متنی قابل استفاده است.');
        }
        // Only allow admins/mods
        if (!interaction.member.permissions.has('ManageChannels')) {
            return await InteractionUtils.sendError(interaction, 'شما دسترسی لازم برای ارسال منوی تیکت را ندارید.');
        }
        // Ticket menu embed (simplified)
        const embed = new EmbedBuilder()
            .setColor('#5865F2')
            .setTitle('📨 ساخت تیکت پشتیبانی')
            .setDescription('برای ارتباط با تیم پشتیبانی، خرید، یا طرح سوالات خود، لطفا از منوی زیر دلیل باز کردن تیکت را انتخاب کنید.')
            .setFooter({ text: 'تیم پشتیبانی' })
            .setThumbnail(interaction.guild?.iconURL({ dynamic: true }))
            .setTimestamp();

        const menu = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('ticket_select')
                .setPlaceholder('یک گزینه را انتخاب کنید')
                .addOptions([
                    { label: '🛒 خرید', value: 'buy', description: 'درخواست خرید یا پیگیری سفارش' },
                    { label: '🛠️ پشتیبانی', value: 'support', description: 'گزارش مشکل یا دریافت راهنمایی' },
                    { label: '🎁 دریافت جایزه', value: 'reward', description: 'درخواست دریافت جوایز یا گیفت' },
                    { label: '❓ سایر موارد', value: 'other', description: 'درخواست‌های دیگر' }
                ])
        );
        await interaction.reply({ embeds: [embed], components: [menu] });
        return;
    }
    // ...existing code...
    if (interaction.commandName === 'warn') {
        // Check if user has permission to moderate members
        if (!interaction.member.permissions.has('ModerateMembers')) {
            const errorEmbed = new EmbedBuilder()
                .setColor('Red')
                .setDescription('❌ شما دسترسی لازم برای اخطار دادن ندارید.');
            return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
        }

        const targetUser = interaction.options.getUser('user');
        const reason = interaction.options.getString('reason') || 'دلیل مشخص نشده';
        const maxWarnings = 3; // Default max warnings

        try {
            const member = await interaction.guild.members.fetch(targetUser.id);
            if (!member) {
                return await InteractionUtils.sendError(interaction, 'کاربر در سرور یافت نشد.');
            }

            // Check if trying to warn a moderator/admin
            if (member.permissions.has('ModerateMembers') || member.permissions.has('Administrator')) {
                return await InteractionUtils.sendError(interaction, 'نمی‌توانید به مدیران و مجری‌ها اخطار دهید.');
            }

            // Get current warnings
            const currentWarnings = db.warnings.get(targetUser.id) || 0;
            const newWarningCount = currentWarnings + 1;
            
            // Update warnings in database
            db.warnings.set(targetUser.id, newWarningCount);

            // Send warning DM
            const dmSent = await utils.sendWarningDM(member, newWarningCount, maxWarnings, reason, interaction.user);

            // Create response embed
            const responseEmbed = new EmbedBuilder()
                .setColor(newWarningCount >= maxWarnings ? 'Red' : 'Orange')
                .setTitle('⚠️ اخطار صادر شد')
                .setDescription(`کاربر <@${targetUser.id}> اخطار دریافت کرد.`)
                .addFields(
                    { name: 'دلیل', value: reason, inline: true },
                    { name: 'تعداد اخطارها', value: `${newWarningCount} از ${maxWarnings}`, inline: true },
                    { name: 'ارسال پیام خصوصی', value: dmSent ? '✅ موفق' : '❌ ناموفق', inline: true }
                )
                .setFooter({ text: `توسط ${interaction.user.tag}` })
                .setTimestamp();

            if (newWarningCount >= maxWarnings) {
                // Check if user can be banned before attempting
                if (member.bannable && member.id !== interaction.guild.ownerId) {
                    responseEmbed.addFields({ name: '🔨 عملیات', value: 'کاربر به دلیل رسیدن به حد مجاز اخطارها بن شد.', inline: false });
                    
                    try {
                        // Send Persian ban DM
                        try {
                            const banEmbed = new EmbedBuilder()
                                .setColor(0xFF0000)
                                .setTitle('بن شدن از سرور')
                                .setDescription('شما به دلیل دریافت ۳ اخطار از سرور بن شدید. برای اطلاعات بیشتر با ادمین تماس بگیرید.')
                                .setTimestamp();
                            await targetUser.send({ embeds: [banEmbed] });
                        } catch (dmError) {
                            console.error('Failed to send ban DM:', dmError);
                        }
                        await member.ban({ reason: `دریافت ${maxWarnings} اخطار - آخرین دلیل: ${reason}` });
                        db.warnings.delete(targetUser.id); // Clear warnings after ban
                    } catch (banError) {
                        console.error('Error banning user:', banError);
                        responseEmbed.addFields({ name: '❌ خطا', value: 'خطا در بن کردن کاربر. ممکن است دسترسی کافی نداشته باشم.', inline: false });
                    }
                } else {
                    responseEmbed.addFields({ name: '⚠️ هشدار', value: 'کاربر به حد مجاز اخطارها رسید ولی امکان بن کردن وجود ندارد. لطفاً دستی عمل کنید.', inline: false });
                    await utils.logAction(interaction.guild, `⚠️ ${targetUser.tag} به ${maxWarnings} اخطار رسید ولی قابل بن نیست`);
                }
            }

            await interaction.reply({ embeds: [responseEmbed] });
            await utils.logAction(interaction.guild, `⚠️ ${interaction.user.tag} به ${targetUser.tag} اخطار داد: ${reason} (${newWarningCount}/${maxWarnings})`);

        } catch (error) {
            console.error('Error in warn command:', error);
            const errorEmbed = new EmbedBuilder()
                .setColor('Red')
                .setDescription('❌ خطا در صدور اخطار. دوباره تلاش کنید.');
            await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
        }
    }
    else if (interaction.commandName === 'clear') {
        // Check permissions
        if (!interaction.member.permissions.has('ManageMessages')) {
            const errorEmbed = new EmbedBuilder()
                .setColor('Red')
                .setDescription('❌ شما دسترسی لازم برای پاک کردن پیام‌ها را ندارید.');
            return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
        }

        const amount = interaction.options.getInteger('amount');
        const targetUser = interaction.options.getUser('user');

        await interaction.deferReply({ ephemeral: true });

        try {
            let messages;
            if (targetUser) {
                // Fetch messages and filter by user
                const fetched = await interaction.channel.messages.fetch({ limit: 100 });
                const filteredArray = fetched.filter(msg => msg.author.id === targetUser.id).first(amount);
                // Convert array to Collection for bulkDelete
                messages = new (require('discord.js').Collection)();
                filteredArray.forEach(msg => messages.set(msg.id, msg));
            } else {
                // Delete specified amount
                messages = await interaction.channel.messages.fetch({ limit: amount });
            }

            if (messages.size === 0) {
                const errorEmbed = new EmbedBuilder()
                    .setColor('Red')
                    .setDescription(`❌ ${targetUser ? `پیام قدیمی از ${targetUser.tag} یافت نشد` : 'پیام قابل حذفی یافت نشد'}.`);
                return interaction.editReply({ embeds: [errorEmbed] });
            }

            const deleted = await interaction.channel.bulkDelete(messages, true);
            
            if (deleted.size === 0) {
                const errorEmbed = new EmbedBuilder()
                    .setColor('Orange')
                    .setDescription('⚠️ پیام‌ها خیلی قدیمی هستند (بیش از 14 روز) و نمی‌توان حذفشان کرد.');
                return interaction.editReply({ embeds: [errorEmbed] });
            }
            
            const successEmbed = new EmbedBuilder()
                .setColor('Green')
                .setTitle('🗑️ پیام‌ها پاک شدند')
                .setDescription(`✅ ${deleted.size} پیام${targetUser ? ` از ${targetUser.tag}` : ''} پاک شد.`);
            
            await interaction.editReply({ embeds: [successEmbed] });
            await utils.logAction(interaction.guild, `🗑️ ${interaction.user.tag} تعداد ${deleted.size} پیام${targetUser ? ` از ${targetUser.tag}` : ''} را در ${interaction.channel.name} پاک کرد.`);
            
        } catch (error) {
            console.error('Clear command error:', error);
            const errorEmbed = new EmbedBuilder()
                .setColor('Red')
                .setDescription('❌ خطا در پاک کردن پیام‌ها. ممکن است پیام‌ها قدیمی باشند.');
            await interaction.editReply({ embeds: [errorEmbed] });
        }
    }
    else if (interaction.commandName === 'userinfo') {
        const targetUser = interaction.options.getUser('user') || interaction.user;
        // محاسبه مدت زمان ساخت اکانت
        const now = Date.now();
        const created = targetUser.createdTimestamp;
        const diffMs = now - created;
        const years = Math.floor(diffMs / (1000 * 60 * 60 * 24 * 365));
        let agoText = '';
        if (years > 0) {
            agoText = ` (${years} سال پیش)`;
        } else {
            const months = Math.floor(diffMs / (1000 * 60 * 60 * 24 * 30));
            if (months > 0) agoText = ` (${months} ماه پیش)`;
        }
        try {
            const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
            const embed = new EmbedBuilder()
                .setColor('#3498DB')
                .setTitle(`🔍 اطلاعات ${targetUser.username}`)
                .setThumbnail(targetUser.displayAvatarURL({ dynamic: true, size: 256 }))
                .addFields(
                    { name: '👤 نام کاربری', value: targetUser.tag, inline: true },
                    { name: '🆔 شناسه', value: targetUser.id, inline: true },
                    { name: '📅 تاریخ ساخت اکانت', value: `<t:${Math.floor(targetUser.createdTimestamp / 1000)}:F>${agoText}`, inline: false }
                );
            if (member) {
                embed.addFields(
                    { name: '📥 تاریخ ورود به سرور', value: `<t:${Math.floor(member.joinedTimestamp / 1000)}:F>`, inline: false },
                    { name: '🏷️ نقش‌ها', value: member.roles.cache.filter(role => role.id !== interaction.guild.id).map(role => `<@&${role.id}>`).join(' ') || 'بدون نقش', inline: false }
                );
                if (member.premiumSince) {
                    embed.addFields({ name: '💎 تاریخ شروع Nitro Boost', value: `<t:${Math.floor(member.premiumSince.getTime() / 1000)}:F>`, inline: false });
                }
            } else {
                embed.addFields({ name: '❌ وضعیت', value: 'کاربر در سرور نیست', inline: false });
            }
            embed.setTimestamp();
            await interaction.reply({ embeds: [embed] });
        } catch (error) {
            console.error('Userinfo command error:', error);
            const errorEmbed = new EmbedBuilder()
                .setColor('Red')
                .setDescription('❌ خطا در دریافت اطلاعات کاربر.');
            await interaction.reply({ embeds: [errorEmbed] });
        }
    }
    else if (interaction.commandName === 'kick') {
        // Check permissions
        if (!interaction.member.permissions.has('KickMembers')) {
            return await InteractionUtils.sendError(interaction, 'شما دسترسی لازم برای اخراج کاربران را ندارید.');
        }

        const targetUser = interaction.options.getUser('user');
        const reason = interaction.options.getString('reason') || 'دلیل مشخص نشده';

        await interaction.deferReply({ ephemeral: true });

        try {
            const member = await interaction.guild.members.fetch(targetUser.id);
            if (!member) {
                return await InteractionUtils.sendError(interaction, 'کاربر در سرور یافت نشد.', true);
            }

            // Check if trying to kick a moderator/admin or bot owner
            if (member.permissions.has('KickMembers') || member.permissions.has('Administrator') || member.id === interaction.guild.ownerId) {
                return await InteractionUtils.sendError(interaction, 'نمی‌توانید مدیران، مجری‌ها یا مالک سرور را اخراج کنید.', true);
            }

            // Check if member is kickable
            if (!member.kickable) {
                return await InteractionUtils.sendError(interaction, 'امکان اخراج این کاربر وجود ندارد. ممکن است نقش بالاتری داشته باشد.', true);
            }

            await member.kick(reason);
            
            const successEmbed = new EmbedBuilder()
                .setColor('Orange')
                .setTitle('🚪 کاربر اخراج شد')
                .setDescription(`کاربر **${targetUser.tag}** با موفقیت اخراج شد.`)
                .addFields(
                    { name: 'دلیل', value: reason, inline: true },
                    { name: 'توسط', value: interaction.user.tag, inline: true }
                );
            
            await interaction.editReply({ embeds: [successEmbed] });
            await utils.logAction(interaction.guild, `🚪 ${targetUser.tag} توسط ${interaction.user.tag} اخراج شد. دلیل: ${reason}`);
            
        } catch (error) {
            console.error('Kick command error:', error);
            const errorEmbed = new EmbedBuilder()
                .setColor('Red')
                .setDescription('❌ خطا در اخراج کاربر.');
            await interaction.editReply({ embeds: [errorEmbed] });
        }
    }
    else if (interaction.commandName === 'ban') {
        // Check permissions
        if (!interaction.member.permissions.has('BanMembers')) {
            return await InteractionUtils.sendError(interaction, 'شما دسترسی لازم برای مسدود کردن کاربران را ندارید.');
        }

        const targetUser = interaction.options.getUser('user');
        const reason = interaction.options.getString('reason') || 'دلیل مشخص نشده';
        const deleteDays = interaction.options.getInteger('deletedays') || 0;

        await interaction.deferReply({ ephemeral: true });

        try {
            const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
            
            // Check if trying to ban a moderator/admin or bot owner (if member exists)
            if (member && (member.permissions.has('BanMembers') || member.permissions.has('Administrator') || member.id === interaction.guild.ownerId)) {
                const errorEmbed = new EmbedBuilder()
                    .setColor('Red')
                    .setDescription('❌ نمی‌توانید مدیران، مجری‌ها یا مالک سرور را مسدود کنید.');
                return interaction.editReply({ embeds: [errorEmbed] });
            }

            // Check if member is bannable (if member exists)
            if (member && !member.bannable) {
                const errorEmbed = new EmbedBuilder()
                    .setColor('Red')
                    .setDescription('❌ امکان مسدود کردن این کاربر وجود ندارد. ممکن است نقش بالاتری داشته باشد.');
                return interaction.editReply({ embeds: [errorEmbed] });
            }

            await interaction.guild.members.ban(targetUser.id, { 
                reason: reason,
                deleteMessageSeconds: deleteDays * 86400 
            });
            
            const successEmbed = new EmbedBuilder()
                .setColor('Red')
                .setTitle('🔨 کاربر مسدود شد')
                .setDescription(`کاربر **${targetUser.tag}** با موفقیت مسدود شد.`)
                .addFields(
                    { name: 'دلیل', value: reason, inline: true },
                    { name: 'توسط', value: interaction.user.tag, inline: true },
                    { name: 'پیام‌های پاک شده', value: `${deleteDays} روز`, inline: true }
                );
            
            await interaction.editReply({ embeds: [successEmbed] });
            await utils.logAction(interaction.guild, `🔨 ${targetUser.tag} توسط ${interaction.user.tag} مسدود شد. دلیل: ${reason}`);
            
        } catch (error) {
            console.error('Ban command error:', error);
            const errorEmbed = new EmbedBuilder()
                .setColor('Red')
                .setDescription('❌ خطا در مسدود کردن کاربر.');
            await interaction.editReply({ embeds: [errorEmbed] });
        }
    }
    else if (interaction.commandName === 'unban') {
        // Check permissions
        if (!interaction.member.permissions.has('BanMembers')) {
            return await InteractionUtils.sendError(interaction, 'شما دسترسی لازم برای رفع مسدودیت کاربران را ندارید.');
        }

        const userId = interaction.options.getString('userid');
        const reason = interaction.options.getString('reason') || 'دلیل مشخص نشده';

        await interaction.deferReply({ ephemeral: true });

        try {
            // Check if user is actually banned
            const banList = await interaction.guild.bans.fetch();
            const bannedUser = banList.get(userId);
            
            if (!bannedUser) {
                return await InteractionUtils.sendError(interaction, 'این کاربر مسدود نیست یا شناسه اشتباه است.', true);
            }

            await interaction.guild.members.unban(userId, reason);
            
            const successEmbed = new EmbedBuilder()
                .setColor('Green')
                .setTitle('✅ رفع مسدودیت')
                .setDescription(`مسدودیت کاربر **${bannedUser.user.tag}** رفع شد.`)
                .addFields(
                    { name: 'دلیل', value: reason, inline: true },
                    { name: 'توسط', value: interaction.user.tag, inline: true }
                );
            
            await interaction.editReply({ embeds: [successEmbed] });
            await utils.logAction(interaction.guild, `✅ مسدودیت ${bannedUser.user.tag} توسط ${interaction.user.tag} رفع شد. دلیل: ${reason}`);
            
        } catch (error) {
            console.error('Unban command error:', error);
            const errorEmbed = new EmbedBuilder()
                .setColor('Red')
                .setDescription('❌ خطا در رفع مسدودیت کاربر. شناسه کاربر را بررسی کنید.');
            await interaction.editReply({ embeds: [errorEmbed] });
        }
    }
    else if (interaction.commandName === 'serverinfo') {
        await interaction.deferReply({ flags: 64 });

        try {
            const { guild } = interaction;
            await guild.fetch(); // Fetch guild data
            
            const owner = await guild.fetchOwner();
            const channels = guild.channels.cache;
            const roles = guild.roles.cache;
            
            const embed = new EmbedBuilder()
                .setColor('#3498DB')
                .setTitle(`🏰 اطلاعات سرور ${guild.name}`)
                .setThumbnail(guild.iconURL({ dynamic: true, size: 256 }))
                .addFields(
                    { name: '👑 مالک سرور', value: owner.user.tag, inline: true },
                    { name: '🆔 شناسه سرور', value: guild.id, inline: true },
                    { name: '📅 تاریخ ساخت', value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:F>`, inline: false },
                    { name: '👥 اعضا', value: guild.memberCount.toString(), inline: true },
                    { name: '🤖 ربات‌ها', value: guild.members.cache.filter(member => member.user.bot).size.toString(), inline: true },
                    { name: '💬 کل چنل‌ها', value: channels.size.toString(), inline: true },
                    { name: '📝 چنل‌های متنی', value: channels.filter(ch => ch.type === 0).size.toString(), inline: true },
                    { name: '🔊 چنل‌های صوتی', value: channels.filter(ch => ch.type === 2).size.toString(), inline: true },
                    { name: '📋 چنل‌های دسته‌بندی', value: channels.filter(ch => ch.type === 4).size.toString(), inline: true },
                    { name: '🏷️ نقش‌ها', value: roles.size.toString(), inline: true },
                    { name: '😀 ایموجی‌ها', value: guild.emojis.cache.size.toString(), inline: true },
                    { name: '🔒 سطح تأیید', value: guild.verificationLevel.toString(), inline: true }
                )
                .setTimestamp();

            if (guild.banner) {
                embed.setImage(guild.bannerURL({ dynamic: true, size: 1024 }));
            }

            await interaction.editReply({ embeds: [embed] });
            
        } catch (error) {
            console.error('Serverinfo command error:', error);
            const errorEmbed = new EmbedBuilder()
                .setColor('Red')
                .setDescription('❌ خطا در دریافت اطلاعات سرور.');
            await interaction.editReply({ embeds: [errorEmbed] });
        }
    }
    else if (interaction.commandName === 'sendmessage') {
        const channel = interaction.options.getChannel('channel');
        const user = interaction.options.getUser('user');
        const useEmbed = interaction.options.getBoolean('embed') || false;
        const color = interaction.options.getString('color') || 'Blue';

        if (channel && user) {
            return await InteractionUtils.sendError(interaction, 'نمی‌توان همزمان هم چنل و هم کاربر انتخاب کرد. فقط یکی را انتخاب کنید.');
        }

        if (!channel && !user) {
            return await InteractionUtils.sendError(interaction, 'باید حداقل یک چنل یا کاربر انتخاب کنید.');
        }

        const targetId = channel ? channel.id : (user ? user.id : interaction.user.id);
        const modal = new ModalBuilder()
            .setCustomId(`sendmessage_modal_${targetId}_${useEmbed}_${color}`)
            .setTitle('ارسال پیام دلخواه');

        if (useEmbed) {
            const titleInput = new TextInputBuilder()
                .setCustomId('embed_title')
                .setLabel('تایتل امبد (اختیاری)')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('تایتل امبد خود را اینجا بنویسید...')
                .setRequired(false)
                .setMaxLength(256);

            const textInput = new TextInputBuilder()
                .setCustomId('message_text')
                .setLabel('متن پیام')
                .setStyle(TextInputStyle.Paragraph)
                .setPlaceholder('متن پیام خود را اینجا بنویسید...')
                .setRequired(true)
                .setMaxLength(2000);

            modal.addComponents(
                new ActionRowBuilder().addComponents(titleInput),
                new ActionRowBuilder().addComponents(textInput)
            );
        } else {
            const textInput = new TextInputBuilder()
                .setCustomId('message_text')
                .setLabel('متن پیام')
                .setStyle(TextInputStyle.Paragraph)
                .setPlaceholder('متن پیام خود را اینجا بنویسید...')
                .setRequired(true)
                .setMaxLength(2000);
            modal.addComponents(new ActionRowBuilder().addComponents(textInput));
        }
        await interaction.showModal(modal);
    }
    } catch (error) {
        if (logger) {
            logger.logCommandError(error, interaction.commandName, interaction);
        }
        try {
            // اگر هنوز پاسخی به اینتراکشن داده نشده، یک پیام خطا نمایش می‌دهیم
            if (!interaction.replied && !interaction.deferred) {
                await InteractionUtils.sendError(interaction, 'خطایی در اجرای دستور رخ داد.');
            } else {
                await interaction.editReply({ content: 'خطایی در اجرای دستور رخ داد.' });
            }
        } catch (replyError) {
            console.error('Error while sending error response:', replyError);
        }
    }
}

module.exports = {
    handleSlashCommand,
    setLogger,
    mcCommands
};
