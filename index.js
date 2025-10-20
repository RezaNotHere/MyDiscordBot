// index.js
require('dotenv').config();
const { Client, GatewayIntentBits, Partials, Events } = require('discord.js');
const db = require('./src/database');
const utils = require('./src/utils');
const commands = require('./src/commands');
const events = require('./src/events');
const handlers = require('./src/handlers');
const LoggerUtils = require('./src/utils/LoggerUtils');

// Initialize Logger
const logger = new LoggerUtils({
    errorWebhookUrl: process.env.ERROR_WEBHOOK_URL,
    debug: process.env.NODE_ENV !== 'production'
});

// Setup keep-alive server
const keepAlive = require('./keep_alive');
keepAlive();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.GuildPresences,
    ],
    partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});

const env = process.env;
// provide dependencies to modules
utils.setClient(client);
utils.setLogger(logger);
db.setLogger(logger);
commands.setLogger(logger);
commands.setLogger(logger);


client.once(Events.ClientReady, async (readyClient) => {
    try {
        if (events.onReady) await events.onReady(readyClient);
        
        // Validate required environment variables
        if (!env.CLIENT_ID || !env.GUILD_ID || !env.TOKEN) {
            throw new Error('Missing required environment variables (CLIENT_ID, GUILD_ID, or TOKEN)');
        }
        
        await utils.registerCommands(env.CLIENT_ID, env.GUILD_ID, env.TOKEN);
        
        // Set up periodic giveaway checks with proper error handling
        setTimeout(() => {
            utils.checkGiveaways().catch(error => {
                logger.logError(error, 'GiveawayCheck');
            });
        }, 5000); // 5 second delay
    } catch (error) {
        logger.logError(error, 'ClientReady');
    }
});

client.on(Events.MessageCreate, async message => {
    await events.onMessageCreate(message, client, env);
});

client.on(Events.GuildMemberAdd, async member => {
    await events.onGuildMemberAdd(member, client, env);
});

client.on(Events.GuildMemberRemove, async member => {
    await events.onGuildMemberRemove(member, client, env);
});

client.on(Events.GuildBanAdd, async ban => {
    await events.onGuildBanAdd(ban, client, env);
});


// فراخوانی هندلر جدید برای اینتراکشن‌ها (mcinfo/send_account و ...)
client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.guild) return;
    try {
        // Centralized command and component handling
        if (interaction.isChatInputCommand()) {
            await commands.handleSlashCommand(interaction, client, env);
        } else if (interaction.isButton()) {
            // Skip specific buttons to prevent duplicate processing if handled elsewhere
            if (interaction.customId.startsWith('confirm_send_') || interaction.customId.startsWith('cancel_send_')) {
                // Assuming these are handled in handleButton or another specific handler
                return;
            }
            await handlers.handleButton(interaction, client, env);
        } else if (interaction.isStringSelectMenu()) {
            await handlers.handleSelectMenu(interaction, client, env);
        } else if (interaction.isModalSubmit()) {
            await handlers.handleModal(interaction, client, env);
        } else if (events.onInteractionCreate) {
            // Handle any other types of interactions
            await events.onInteractionCreate(interaction, client, env);
        }
    } catch (error) {
        console.error("Interaction handling error:", error);
        if (!interaction.replied && !interaction.deferred) {
            try {
                await interaction.reply({ content: 'An error occurred while processing your request.', ephemeral: true });
            } catch (replyError) {
                console.error('Failed to send error reply:', replyError);
            }
        }
    }
});

client.login(env.TOKEN);
