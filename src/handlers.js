// handlers.js
const db = require('./database');
const utils = require('./utils');

// --- handleButton ---
async function handleButton(interaction, client, env) {
    console.log(`handleButton called for customId='${interaction.customId}'`);
    // --- شرکت در گیووای ---
    if (interaction.customId === 'join_giveaway') {
        // پیدا کردن گیووای فعال بر اساس آیدی پیام
        const giveaway = db.giveaways.get(interaction.message.id);
        if (!giveaway || giveaway.ended) {
            return interaction.reply({ content: 'گیووای فعال یافت نشد یا به پایان رسیده است.', ephemeral: true });
        }
        if (!giveaway.participants) giveaway.participants = [];
        if (giveaway.participants.includes(interaction.user.id)) {
            return interaction.reply({ content: 'شما قبلاً در این گیووای شرکت کرده‌اید.', ephemeral: true });
        }
        giveaway.participants.push(interaction.user.id);
        db.giveaways.set(interaction.message.id, giveaway);
        // آپدیت شمارنده شرکت‌کننده‌ها در امبد
        const msg = await interaction.channel.messages.fetch(interaction.message.id).catch(() => null);
        if (msg && msg.embeds && msg.embeds[0]) {
            const oldEmbed = msg.embeds[0];
            let newDesc = oldEmbed.description || '';
            if (newDesc.includes('👥 شرکت‌کننده تا این لحظه:')) {
                newDesc = newDesc.replace(/👥 شرکت‌کننده تا این لحظه: \*\*\d+ نفر\*\*/, `👥 شرکت‌کننده تا این لحظه: **${giveaway.participants.length} نفر**`);
            } else {
                newDesc += `\n\n👥 شرکت‌کننده تا این لحظه: **${giveaway.participants.length} نفر**`;
            }
            const { EmbedBuilder } = require('discord.js');
            const newEmbed = EmbedBuilder.from(oldEmbed).setDescription(newDesc);
            await msg.edit({ embeds: [newEmbed], components: msg.components });
        }
        await interaction.reply({ content: 'شما با موفقیت در گیووای شرکت کردید! موفق باشید! 🎉', ephemeral: true });
        return;
    }
    console.log(`Checking role button for customId='${interaction.customId}' (startsWith 'rolebtn_': ${interaction.customId ? interaction.customId.startsWith('rolebtn_') : false})`);
    // --- Role Button Handler ---
    if (interaction.customId && interaction.customId.startsWith('rolebtn_')) {
        const roleId = interaction.customId.split('_')[1];
        const member = await interaction.guild.members.fetch(interaction.user.id);
        const role = interaction.guild.roles.cache.get(roleId);
        if (!role) {
            const errorEmbed = new EmbedBuilder().setColor('Red').setDescription('❌ رول مورد نظر یافت نشد.');
            return interaction.reply({ embeds: [errorEmbed], flags: 64 });
        }
        let action, color, emoji;
        if (member.roles.cache.has(roleId)) {
            await member.roles.remove(roleId);
            action = '❌ رول برداشته شد';
            color = 'Red';
            emoji = '➖';
        } else {
            await member.roles.add(roleId);
            action = '✅ رول اضافه شد';
            color = 'Green';
            emoji = '➕';
        }
        const embed = new EmbedBuilder().setColor(color).setDescription(`${emoji} ${action}: <@&${roleId}>`);
        await interaction.reply({ embeds: [embed], ephemeral: true });
        return;
    }
    const { customId, user, guild, channel } = interaction;
    const { BUYER_ROLE_ID, REVIEW_CHANNEL_ID } = process.env;

    // Handle different button interactions
    if (customId === 'close_ticket_user') {
        // Handle ticket closing logic
        await interaction.deferReply({ flags: 64 });
        
        const ticketInfo = db.ticketInfo.get(channel.id);
        if (!ticketInfo) {
            const errorEmbed = new EmbedBuilder()
                .setColor('Red')
                .setDescription('❌ این چنل یک تیکت نیست یا اطلاعات تیکت پیدا نشد.');
            return interaction.editReply({ embeds: [errorEmbed] });
        }

        // Delete ticket from database
        db.tickets.delete(ticketInfo.ownerId);
        db.ticketInfo.delete(channel.id);
        
        const successEmbed = new EmbedBuilder()
            .setColor('Red')
            .setDescription('🔒 تیکت بسته شد. این چنل در 10 ثانیه حذف خواهد شد...');
        await interaction.editReply({ embeds: [successEmbed] });
        
        await logAction(guild, `🔒 تیکت ${channel.name} توسط ${user.tag} بسته شد.`);
        
        // Delete channel after 10 seconds
        setTimeout(async () => {
            try {
                await channel.delete();
            } catch (e) {
                console.error('Error deleting ticket channel:', e);
            }
        }, 10000);
    }
    else if (customId === 'claim_ticket') {
        // Handle ticket claiming logic
        await interaction.deferReply({ flags: 64 });
        
        const ticketInfo = db.ticketInfo.get(channel.id);
        if (!ticketInfo) {
            const errorEmbed = new EmbedBuilder()
                .setColor('Red')
                .setDescription('❌ اطلاعات تیکت پیدا نشد.');
            return interaction.editReply({ embeds: [errorEmbed] });
        }
        
        // Update ticket info with claimer
        db.ticketInfo.set(channel.id, { ...ticketInfo, claimedBy: user.id, status: 'claimed' });
        
        const successEmbed = new EmbedBuilder()
            .setColor('Blue')
            .setDescription(`✅ تیکت توسط ${user.tag} تصدی شد.`);
        await interaction.editReply({ embeds: [successEmbed] });
        await logAction(guild, `👤 تیکت ${channel.name} توسط ${user.tag} تصدی شد.`);
    }
    else if (customId === 'complete_purchase') {
        // Handle purchase completion - show rating menu
        await interaction.deferReply({ flags: 64 });
        
        const ratingMenu = new StringSelectMenuBuilder()
            .setCustomId('rating_input')
            .setPlaceholder('امتیاز خود را انتخاب کنید')
            .addOptions(
                new StringSelectMenuOptionBuilder().setLabel('⭐ 1 ستاره').setValue('1').setEmoji('⭐'),
                new StringSelectMenuOptionBuilder().setLabel('⭐⭐ 2 ستاره').setValue('2').setEmoji('⭐'),
                new StringSelectMenuOptionBuilder().setLabel('⭐⭐⭐ 3 ستاره').setValue('3').setEmoji('⭐'),
                new StringSelectMenuOptionBuilder().setLabel('⭐⭐⭐⭐ 4 ستاره').setValue('4').setEmoji('⭐'),
                new StringSelectMenuOptionBuilder().setLabel('⭐⭐⭐⭐⭐ 5 ستاره').setValue('5').setEmoji('⭐')
            );
        
        const row = new ActionRowBuilder().addComponents(ratingMenu);
        
        const embed = new EmbedBuilder()
            .setColor('Green')
            .setTitle('✅ تکمیل خرید')
            .setDescription('خرید شما با موفقیت تکمیل شد! لطفاً تجربه خود را با ما به اشتراک بگذارید.');
            
        await interaction.editReply({ embeds: [embed], components: [row] });
        await logAction(guild, `✅ خرید کاربر ${user.tag} در تیکت ${channel.name} تکمیل شد.`);
    }
    else if (customId === 'complete_purchase_admin') {
        // Only admins
        if (!interaction.member.permissions.has('Administrator')) {
            const errorEmbed = new EmbedBuilder().setColor('Red').setDescription('شما دسترسی لازم برای این عملیات را ندارید.');
            return interaction.reply({ embeds: [errorEmbed], flags: 64 });
        }
        const ticketInfo = db.ticketInfo.get(channel.id);
        if (!ticketInfo) {
            const errorEmbed = new EmbedBuilder().setColor('Red').setDescription('اطلاعات تیکت یافت نشد.');
            return interaction.reply({ embeds: [errorEmbed], flags: 64 });
        }
        const owner = await client.users.fetch(ticketInfo.ownerId).catch(() => null);
        if (!owner) {
            const errorEmbed = new EmbedBuilder().setColor('Red').setDescription('کاربر تیکت یافت نشد.');
            return interaction.reply({ embeds: [errorEmbed], flags: 64 });
        }
        // DM to ticket owner
        const dmEmbed = new EmbedBuilder()
            .setColor('#9B59B6')
            .setTitle('🎉 سفارش شما تکمیل شد!')
            .setDescription(`خبر خوش! سفارش شما در **${guild.name}** با موفقیت تکمیل و آماده استفاده است. از اعتماد شما نسبت به خدمات ما بی‌نهایت سپاسگزاریم.\n\nکیفیت و رضایت شما مهمترین اولویت ماست. لطفاً **نظر و تجربه خود را از تکمیل خرید حتماً ثبت کنید**. در صورت داشتن هرگونه سؤال، نظر یا مشکل، خوشحال می‌شویم مجدداً در خدمت شما باشیم.`)
            .addFields(
                { name: '🏪 فروشگاه', value: guild.name, inline: true },
                { name: '📅 تاریخ تکمیل', value: `<t:${Math.floor(Date.now()/1000)}:f>`, inline: true },
                { name: '👤 کاربر', value: owner.tag, inline: true },
                { name: '📋 وضعیت', value: '✅ تکمیل شده و تحویل داده شده', inline: false },
                { name: '🔄 خدمات بعدی', value: 'برای سفارش‌های جدید می‌توانید مجدداً تیکت باز کنید', inline: false }
            )
            .setThumbnail(guild.iconURL())
            .setFooter({ text: '💎 با تشکر از اعتماد شما - تیم پشتیبانی', iconURL: guild.iconURL() })
            .setTimestamp();
        try {
            await owner.send({ embeds: [dmEmbed] });
        } catch {
            // Ignore DM errors
        }
        // Notify in ticket channel
        const notifyEmbed = new EmbedBuilder()
            .setColor('#9B59B6')
            .setTitle('✅ سفارش تکمیل شد')
            .setDescription(`سفارش کاربر <@${owner.id}> با موفقیت توسط ${interaction.user} تکمیل شد.\n\n📨 **پیام اطلاع‌رسانی ارسال شد**\nپیام تکمیل سفارش با جزئیات کامل به پیام خصوصی کاربر ارسال شد.`)
            .addFields(
                { name: '👤 مدیر مسئول', value: interaction.user.tag, inline: true },
                { name: '⏰ زمان تکمیل', value: `<t:${Math.floor(Date.now()/1000)}:R>`, inline: true }
            )
            .setTimestamp();
        await interaction.reply({ embeds: [notifyEmbed] });
        await logAction(guild, `سفارش تیکت ${channel.name} توسط ${interaction.user.tag} تکمیل شد.`);
    }
    else if (customId === 'record_order_admin') {
        // Only admins can record orders
        if (!interaction.member.permissions.has('Administrator')) {
            const errorEmbed = new EmbedBuilder().setColor('Red').setDescription('شما دسترسی لازم برای این عملیات را ندارید.');
            return interaction.reply({ embeds: [errorEmbed], flags: 64 });
        }
        const ticketInfo = db.ticketInfo.get(channel.id);
        if (!ticketInfo) {
            const errorEmbed = new EmbedBuilder().setColor('Red').setDescription('اطلاعات تیکت یافت نشد.');
            return interaction.reply({ embeds: [errorEmbed], flags: 64 });
        }
        const owner = await client.users.fetch(ticketInfo.ownerId).catch(() => null);
        if (!owner) {
            const errorEmbed = new EmbedBuilder().setColor('Red').setDescription('کاربر تیکت یافت نشد.');
            return interaction.reply({ embeds: [errorEmbed], flags: 64 });
        }
        // DM to ticket owner for order recorded
        const dmEmbed = new EmbedBuilder()
            .setColor('#9B59B6')
            .setTitle('📝 سفارش شما ثبت شد!')
            .setDescription(`سفارش شما در **${guild.name}** با موفقیت ثبت شد و در صف پردازش قرار گرفت. تیم ما در حال آماده‌سازی سفارش شما هستند.\n\nبه زودی اطلاعات بیشتری درباره وضعیت سفارش‌تان دریافت خواهید کرد. لطفاً صبور باشید.`)
            .addFields(
                { name: '🏪 فروشگاه', value: guild.name, inline: true },
                { name: '📅 تاریخ ثبت', value: `<t:${Math.floor(Date.now()/1000)}:f>`, inline: true },
                { name: '👤 کاربر', value: owner.tag, inline: true },
                { name: '📋 وضعیت', value: '📝 ثبت شده - در حال پردازش', inline: false },
                { name: '⏱️ زمان تحویل', value: 'اطلاعات دقیق زمان تحویل به زودی ارسال خواهد شد', inline: false }
            )
            .setThumbnail(guild.iconURL())
            .setFooter({ text: '📋 تیم پردازش سفارشات در خدمت شما', iconURL: guild.iconURL() })
            .setTimestamp();
        try {
            await owner.send({ embeds: [dmEmbed] });
        } catch {
            // Ignore DM errors
        }
        // Notify in ticket channel
        const notifyEmbed = new EmbedBuilder()
            .setColor('#9B59B6')
            .setTitle('📝 سفارش ثبت شد')
            .setDescription(`سفارش کاربر <@${owner.id}> با موفقیت توسط ${interaction.user} ثبت شد.\n\n📨 **پیام اطلاع‌رسانی ارسال شد**\nپیام تأیید ثبت سفارش به پیام خصوصی کاربر ارسال شد.`)
            .addFields(
                { name: '👤 مدیر مسئول', value: interaction.user.tag, inline: true },
                { name: '⏰ زمان ثبت', value: `<t:${Math.floor(Date.now()/1000)}:R>`, inline: true }
            )
            .setTimestamp();
        await interaction.reply({ embeds: [notifyEmbed] });
        await logAction(guild, `سفارش تیکت ${channel.name} توسط ${interaction.user.tag} ثبت شد.`);
    }
    else if (customId === 'transcript_ticket') {
        // Handle ticket transcript
        await interaction.deferReply({ flags: 64 });
        
        const infoEmbed = new EmbedBuilder()
            .setColor('Blue')
            .setDescription('📄 قابلیت transcript در آینده اضافه خواهد شد.');
        await interaction.editReply({ embeds: [infoEmbed] });
    }
    else {
        // Handle unknown button
        await interaction.deferReply({ flags: 64 });
        console.log(`Unknown button clicked: customId='${interaction.customId}', user='${interaction.user.id}', guild='${interaction.guild.id}'`);
        const errorEmbed = new EmbedBuilder()
            .setColor('Red')
            .setDescription(`❌ دکمه نامشخص: ${customId}`);
        await interaction.editReply({ embeds: [errorEmbed] });
    }
}

// --- handleSelectMenu ---
async function handleSelectMenu(interaction, client, env) {
    const { customId, values, user, guild } = interaction;
    const db = require('./database');
    const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, EmbedBuilder } = require('discord.js');
    const { createTicketChannel, logAction } = require('./utils');
    const { REVIEW_CHANNEL_ID, BUYER_ROLE_ID } = process.env;

    if (customId === 'ticket_select') {
        const reason = values[0];
        if (reason === 'other') {
            const modal = new ModalBuilder().setCustomId('other_reason_modal').setTitle('دلیل دیگر برای باز کردن تیکت');
            const input = new TextInputBuilder().setCustomId('other_reason_input').setLabel('لطفا دلیل خود را بنویسید').setStyle(TextInputStyle.Paragraph).setRequired(true);
            modal.addComponents(new ActionRowBuilder().addComponents(input));
            return interaction.showModal(modal);
        }
        await interaction.deferReply({ flags: 64 });
        if (db.tickets.has(user.id)) {
            const errorEmbed = new EmbedBuilder().setColor('Red').setDescription(`❌ شما از قبل یک تیکت باز دارید: <#${db.tickets.get(user.id)}>`);
            return interaction.editReply({ embeds: [errorEmbed] });
        }
        await createTicketChannel(guild, user, reason);
        const successEmbed = new EmbedBuilder().setColor('Green').setDescription(`✅ تیکت شما ساخته شد: <#${db.tickets.get(user.id)}>`);
        await interaction.editReply({ embeds: [successEmbed] });
    }

    if (customId === 'rating_input') {
        const rating = values[0];
        const modal = new ModalBuilder().setCustomId(`review_comment_modal_${rating}`).setTitle('نظر خود را بنویسید');
        const commentInput = new TextInputBuilder().setCustomId('comment_input').setLabel('نظر خود را بنویسید (اختیاری)').setStyle(TextInputStyle.Paragraph).setRequired(false);
        modal.addComponents(new ActionRowBuilder().addComponents(commentInput));
        await interaction.showModal(modal);
    }

}

// --- handleModal ---
async function handleModal(interaction, client, env) {
    const { customId, fields, user, guild } = interaction;
    const db = require('./database');
    const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, EmbedBuilder } = require('discord.js');
    const { createTicketChannel, logAction } = require('./utils');
    const { REVIEW_CHANNEL_ID, BUYER_ROLE_ID } = process.env;

    if (customId.startsWith('review_comment_modal_')) {
        const rating = customId.split('_')[3];
        const comment = fields.getTextInputValue('comment_input');
        const stars = '⭐'.repeat(parseInt(rating));
        const reviewChannel = guild.channels.cache.get(REVIEW_CHANNEL_ID);

        if (reviewChannel && reviewChannel.isTextBased()) {
            const embed = new EmbedBuilder()
                .setColor('Gold')
                .setTitle('⭐ نظر جدید ثبت شد ⭐')
                .setAuthor({ name: user.username, iconURL: user.displayAvatarURL() })
                .addFields({ name: 'امتیاز ثبت شده', value: stars, inline: true })
                .setTimestamp();

            if (comment) embed.addFields({ name: 'نظر کاربر', value: comment, inline: false });
            await reviewChannel.send({ embeds: [embed] });
        }

        const successEmbed = new EmbedBuilder().setColor('Green').setDescription('ممنون! نظر و امتیاز شما با موفقیت ثبت شد.');
        await interaction.reply({ embeds: [successEmbed], flags: 64 });

        try {
            if (BUYER_ROLE_ID) {
                const member = await guild.members.fetch(user.id);
                await member.roles.add(BUYER_ROLE_ID);
                await logAction(guild, `✅ رول خریدار به ${user.tag} داده شد.`);
            }
        } catch (err) {
            console.error("Error giving buyer role:", err);
            await logAction(guild, `❌ خطا در دادن رول خریدار به ${user.tag}.`);
        }
        await logAction(guild, `⭐ ${user.tag} امتیاز ${rating} و یک نظر را ثبت کرد.`);
    }

    if (customId === 'other_reason_modal') {
        const reason = fields.getTextInputValue('other_reason_input');
        await createTicketChannel(guild, user, 'غیره', reason);
        const successEmbed = new EmbedBuilder().setColor('Green').setDescription(`✅ تیکت شما با موفقیت ساخته شد: <#${db.tickets.get(user.id)}>`);
        await interaction.reply({ embeds: [successEmbed], flags: 64 });
    }

    if (customId.startsWith('sendmessage_modal_')) {
        await interaction.deferReply({ flags: 64 });

        const parts = customId.split('_');
        const targetId = parts[2];
        const useEmbed = parts[3] === 'true';
        const color = parts[4] || 'Blue';
        const text = fields.getTextInputValue('message_text');
        const embedTitle = useEmbed ? (fields.getTextInputValue('embed_title') || null) : null;

        // Color presets
        const colorMap = {
            Blue: 0x3498db,
            Green: 0x2ecc71,
            Red: 0xe74c3c,
            Yellow: 0xf1c40f,
            Orange: 0xe67e22,
            Purple: 0x9b59b6,
            Grey: 0x95a5a6
        };
        const embedColor = colorMap[color] || colorMap['Blue'];

        try {
            if (targetId === user.id) {
                try {
                    if (useEmbed) {
                        const embed = new EmbedBuilder()
                            .setColor(embedColor)
                            .setDescription(text)
                            .setFooter({ text: `ارسال شده توسط ${interaction.user.tag} از سرور ${guild.name}` })
                            .setTimestamp();
                        
                        if (embedTitle) {
                            embed.setTitle(embedTitle);
                        }

                        await user.send({ embeds: [embed] });
                    } else {
                        await user.send(text);
                    }

                    const successEmbed = new EmbedBuilder()
                        .setColor('Green')
                        .setDescription(`✅ پیام با موفقیت به <@${targetId}> ارسال شد.`);
                    await interaction.editReply({ embeds: [successEmbed] });

                    await logAction(guild, `📩 ${interaction.user.tag} به کاربر پیام ارسال کرد.`);

                } catch (dmError) {
                    const errorEmbed = new EmbedBuilder()
                        .setColor('Red')
                        .setDescription(`❌ امکان ارسال DM به کاربر وجود ندارد.`);
                    await interaction.editReply({ embeds: [errorEmbed] });
                }
            } else {
                const targetChannel = guild.channels.cache.get(targetId);
                if (!targetChannel) {
                    const errorEmbed = new EmbedBuilder()
                        .setColor('Red')
                        .setDescription('❌ چنل مورد نظر یافت نشد.');
                    return interaction.editReply({ embeds: [errorEmbed] });
                }

                if (useEmbed) {
                    const embed = new EmbedBuilder()
                        .setColor(embedColor)
                        .setDescription(text)
                        .setFooter({ text: `ارسال شده توسط ${interaction.user.tag}` })
                        .setTimestamp();
                    
                    if (embedTitle) {
                        embed.setTitle(embedTitle);
                    }

                    await targetChannel.send({ embeds: [embed] });
                } else {
                    await targetChannel.send(text);
                }

                const successEmbed = new EmbedBuilder()
                    .setColor('Green')
                    .setDescription(`✅ پیام با موفقیت در <#${targetId}> ارسال شد.`);
                await interaction.editReply({ embeds: [successEmbed] });

                await logAction(guild, `📤 ${interaction.user.tag} پیامی در ${targetChannel.name} ارسال کرد.`);
            }

        } catch (error) {
            console.error('Error sending message:', error);
            const errorEmbed = new EmbedBuilder()
                .setColor('Red')
                .setDescription('❌ خطا در ارسال پیام. ممکن است دسترسی کافی نداشته باشم.');
            await interaction.editReply({ embeds: [errorEmbed] });
        }
    }
}


module.exports = {
    handleButton,
    handleSelectMenu,
    handleModal
};
