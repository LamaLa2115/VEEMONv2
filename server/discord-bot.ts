import { Client, GatewayIntentBits, Collection, SlashCommandBuilder, SlashCommandSubcommandsOnlyBuilder, SlashCommandOptionsOnlyBuilder, EmbedBuilder, PermissionFlagsBits, REST, Routes, ChannelType, TextChannel, GuildMember, Role, MessageReaction, User, ColorResolvable, Message, PartialMessage, VoiceState, Webhook, Interaction, Guild } from 'discord.js';

import { storage } from './storage';
import { insertModerationLogSchema, insertUserWarningSchema, insertAfkUserSchema } from './schema';
import axios from 'axios';

interface Command {
  data: SlashCommandBuilder | SlashCommandSubcommandsOnlyBuilder | SlashCommandOptionsOnlyBuilder | Omit<SlashCommandBuilder, "addSubcommand" | "addSubcommandGroup">;
  execute: (interaction: any) => Promise<void>;
}

class DiscordBot {
  private client: Client;
  private commands: Collection<string, Command>;
  private lastfmApiKey: string;
  // In-memory server configs
  private logChannels: Map<string, string>; // guildId -> channelId
  private starboard: Map<string, { channelId: string; threshold: number }>;
  private reactionRoles: Map<string, Array<{ messageId: string; emoji: string; roleId: string }>>; // guildId -> configs
  private joinGateMinDays: Map<string, number>; // guildId -> min account age days
  private voiceMaster: Map<string, { hubChannelId: string; categoryId?: string }>; // guildId -> config
  private levelConfig: Map<string, { xpPerMsg: number; rewards: Array<{ xp: number; roleId: string }> }>;
  private userXp: Map<string, Map<string, number>>; // guildId -> (userId -> xp)
  private bumpReminders: Map<string, { channelId: string; intervalMin: number; timer?: NodeJS.Timeout }>;
  private counters: Map<string, { memberCountChannelId?: string }>; // guildId -> counters

  constructor() {
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessageReactions,
        // GatewayIntentBits.MessageContent, // Enable this in Discord Developer Portal first
      ],
    });
    
    this.commands = new Collection();
    this.lastfmApiKey = process.env.LASTFM_API_KEY || '';
    // init maps
    this.logChannels = new Map();
    this.starboard = new Map();
    this.reactionRoles = new Map();
    this.joinGateMinDays = new Map();
    this.voiceMaster = new Map();
    this.levelConfig = new Map();
    this.userXp = new Map();
    this.bumpReminders = new Map();
    this.counters = new Map();
    this.setupCommands();
    this.setupEventListeners();
  }

  private setupCommands() {
    // Moderation Commands
    const kickCommand: Command = {
      data: new SlashCommandBuilder()
        .setName('kick')
        .setDescription('Kick a user from the server')
        .addUserOption((option: any) => 
          option.setName('user')
            .setDescription('The user to kick')
            .setRequired(true))
        .addStringOption((option: any) =>
          option.setName('reason')
            .setDescription('Reason for kicking'))
        .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers),
      execute: async (interaction) => {
        const user = interaction.options.getUser('user');
        const reason = interaction.options.getString('reason') || 'No reason provided';
        
        try {
          const member = await interaction.guild.members.fetch(user.id);
          await member.kick(reason);
          
          // Log the action
          await storage.createModerationLog({
            serverId: interaction.guild.id,
            action: 'kick',
            targetUserId: user.id,
            targetUsername: user.username,
            moderatorId: interaction.user.id,
            moderatorUsername: interaction.user.username,
            reason,
          });
          
          await storage.incrementModerationAction(interaction.guild.id);
          
          const embed = new EmbedBuilder()
            .setColor('#ED4245')
            .setTitle('User Kicked')
            .setDescription(`${user.username} has been kicked from the server.`)
            .addFields({ name: 'Reason', value: reason })
            .setTimestamp();
            
          await interaction.reply({ embeds: [embed] });
        } catch (error) {
          await interaction.reply({ content: 'Failed to kick user. Please check permissions.', ephemeral: true });
        }
      }
    };

    // HELP COMMAND
    const helpCommand: Command = {
      data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('Show help for bot commands'),
      execute: async (interaction) => {
        const names = Array.from(this.commands.keys()).sort();
        const embed = new EmbedBuilder()
          .setColor('#5865F2')
          .setTitle('🧭 Help')
          .setDescription(names.map(n => `/${n}`).join(' · '))
          .setTimestamp();
        await interaction.reply({ embeds: [embed], ephemeral: true });
      }
    };

    // LOGGING COMMAND
    const loggingCommand: Command = {
      data: new SlashCommandBuilder()
        .setName('logging')
        .setDescription('Configure server logging')
        .addSubcommand((s: any) => s.setName('set').setDescription('Set log channel')
          .addChannelOption((o: any) => o.setName('channel').setDescription('Log channel').addChannelTypes(ChannelType.GuildText).setRequired(true)))
        .addSubcommand((s: any) => s.setName('status').setDescription('Show logging status'))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
      execute: async (interaction) => {
        const sub = interaction.options.getSubcommand();
        if (sub === 'set') {
          const ch = interaction.options.getChannel('channel');
          this.logChannels.set(interaction.guild.id, ch!.id);
          await interaction.reply({ content: `Logging channel set to <#${ch!.id}>`, ephemeral: true });
        } else {
          const id = this.logChannels.get(interaction.guild.id);
          await interaction.reply({ content: id ? `Logging to <#${id}>` : 'Logging disabled', ephemeral: true });
        }
      }
    };

    // STARBOARD COMMAND
    const starboardCommand: Command = {
      data: new SlashCommandBuilder()
        .setName('starboard')
        .setDescription('Configure starboard')
        .addSubcommand((s: any) => s.setName('set').setDescription('Set starboard channel and threshold')
          .addChannelOption((o: any) => o.setName('channel').setDescription('Starboard channel').addChannelTypes(ChannelType.GuildText).setRequired(true))
          .addIntegerOption((o: any) => o.setName('threshold').setDescription('Stars required').setMinValue(1).setRequired(true)))
        .addSubcommand((s: any) => s.setName('status').setDescription('Show starboard status'))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
      execute: async (interaction) => {
        const sub = interaction.options.getSubcommand();
        if (sub === 'set') {
          const ch = interaction.options.getChannel('channel');
          const threshold = interaction.options.getInteger('threshold')!;
          this.starboard.set(interaction.guild.id, { channelId: ch!.id, threshold });
          await interaction.reply({ content: `Starboard set to <#${ch!.id}> with threshold ${threshold} ⭐`, ephemeral: true });
        } else {
          const conf = this.starboard.get(interaction.guild.id);
          await interaction.reply({ content: conf ? `Channel <#${conf.channelId}>, threshold ${conf.threshold}` : 'Starboard disabled', ephemeral: true });
        }
      }
    };

    // REACTION ROLES COMMAND
    const reactionRolesCommand: Command = {
      data: new SlashCommandBuilder()
        .setName('reactionroles')
        .setDescription('Configure reaction roles')
        .addSubcommand((s: any) => s.setName('add').setDescription('Add reaction role')
          .addStringOption((o: any) => o.setName('message_id').setDescription('Message ID').setRequired(true))
          .addStringOption((o: any) => o.setName('emoji').setDescription('Emoji (e.g., 🔵 or name:id)').setRequired(true))
          .addRoleOption((o: any) => o.setName('role').setDescription('Role to assign').setRequired(true)))
        .addSubcommand((s: any) => s.setName('list').setDescription('List reaction roles'))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),
      execute: async (interaction) => {
        const gid = interaction.guild.id;
        const sub = interaction.options.getSubcommand();
        if (sub === 'add') {
          const messageId = interaction.options.getString('message_id')!;
          const emoji = interaction.options.getString('emoji')!;
          const role = interaction.options.getRole('role') as Role;
          const arr = this.reactionRoles.get(gid) ?? [];
          arr.push({ messageId, emoji, roleId: role.id });
          this.reactionRoles.set(gid, arr);
          await interaction.reply({ content: `Reaction role added: ${emoji} -> <@&${role.id}> on message ${messageId}`, ephemeral: true });
        } else {
          const arr = this.reactionRoles.get(gid) ?? [];
          const text = arr.length ? arr.map(r => `${r.emoji} -> <@&${r.roleId}> (message ${r.messageId})`).join('\n') : 'No reaction roles configured.';
          await interaction.reply({ content: text, ephemeral: true });
        }
      }
    };

    // JOIN GATE COMMAND (min account age)
    const joingateCommand: Command = {
      data: new SlashCommandBuilder()
        .setName('joingate')
        .setDescription('Configure join gate (min account age)')
        .addIntegerOption((o: any) => o.setName('min_days').setDescription('Minimum account age in days').setMinValue(0).setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
      execute: async (interaction) => {
        const days = interaction.options.getInteger('min_days')!;
        this.joinGateMinDays.set(interaction.guild.id, days);
        await interaction.reply({ content: `Join gate set: accounts must be at least ${days} day(s) old.`, ephemeral: true });
      }
    };

    // VOICEMASTER COMMAND
    const voicemasterCommand: Command = {
      data: new SlashCommandBuilder()
        .setName('voicemaster')
        .setDescription('Configure VoiceMaster hub channel')
        .addChannelOption((o: any) => o.setName('hub').setDescription('Voice hub channel').addChannelTypes(ChannelType.GuildVoice).setRequired(true))
        .addChannelOption((o: any) => o.setName('category').setDescription('Category for temp channels').setRequired(false))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
      execute: async (interaction) => {
        const hub = interaction.options.getChannel('hub');
        const category = interaction.options.getChannel('category');
        this.voiceMaster.set(interaction.guild.id, { hubChannelId: hub!.id, categoryId: category?.id });
        await interaction.reply({ content: `VoiceMaster configured. Hub: <#${hub!.id}>${category ? `, Category: <#${category.id}>` : ''}`, ephemeral: true });
      }
    };

    // LEVEL CONFIG COMMAND
    const levelCommand: Command = {
      data: new SlashCommandBuilder()
        .setName('level')
        .setDescription('Configure leveling system')
        .addSubcommand((s: any) => s.setName('xp').setDescription('Set XP per message').addIntegerOption((o: any) => o.setName('amount').setDescription('XP per message').setMinValue(0).setRequired(true)))
        .addSubcommand((s: any) => s.setName('reward').setDescription('Add role reward at XP').addIntegerOption((o: any) => o.setName('xp').setDescription('XP threshold').setMinValue(1).setRequired(true)).addRoleOption((o: any) => o.setName('role').setDescription('Role to grant').setRequired(true)))
        .addSubcommand((s: any) => s.setName('show').setDescription('Show level config'))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
      execute: async (interaction) => {
        const gid = interaction.guild.id;
        const sub = interaction.options.getSubcommand();
        const conf = this.levelConfig.get(gid) ?? { xpPerMsg: 5, rewards: [] };
        if (sub === 'xp') {
          const amt = interaction.options.getInteger('amount')!;
          conf.xpPerMsg = amt;
          this.levelConfig.set(gid, conf);
          await interaction.reply({ content: `XP per message set to ${amt}.`, ephemeral: true });
        } else if (sub === 'reward') {
          const xp = interaction.options.getInteger('xp')!;
          const role = interaction.options.getRole('role') as Role;
          conf.rewards.push({ xp, roleId: role.id });
          conf.rewards.sort((a,b) => a.xp - b.xp);
          this.levelConfig.set(gid, conf);
          await interaction.reply({ content: `Added reward: <@&${role.id}> at ${xp} XP.`, ephemeral: true });
        } else {
          const rewards = conf.rewards.map(r => `${r.xp} XP -> <@&${r.roleId}>`).join('\n') || 'No rewards';
          await interaction.reply({ content: `XP/msg: ${conf.xpPerMsg}\n${rewards}`, ephemeral: true });
        }
      }
    };

    // BUMP REMINDER COMMAND
    const bumpCommand: Command = {
      data: new SlashCommandBuilder()
        .setName('bumpreminder')
        .setDescription('Configure bump reminders')
        .addChannelOption((o: any) => o.setName('channel').setDescription('Channel to remind').addChannelTypes(ChannelType.GuildText).setRequired(true))
        .addIntegerOption((o: any) => o.setName('interval').setDescription('Interval minutes').setMinValue(15).setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
      execute: async (interaction) => {
        const gid = interaction.guild.id;
        const ch = interaction.options.getChannel('channel')! as any as TextChannel;
        const intervalMin = interaction.options.getInteger('interval')!;
        const prev = this.bumpReminders.get(gid);
        if (prev?.timer) clearInterval(prev.timer);
        const timer = setInterval(async () => {
          try { await ch.send('Friendly reminder to bump your server!'); } catch {}
        }, intervalMin * 60 * 1000);
        this.bumpReminders.set(gid, { channelId: ch.id, intervalMin, timer });
        await interaction.reply({ content: `Bump reminders set in <#${ch.id}> every ${intervalMin} minutes.`, ephemeral: true });
      }
    };

    // COUNTERS COMMAND
    const countersCommand: Command = {
      data: new SlashCommandBuilder()
        .setName('counters')
        .setDescription('Configure server counters')
        .addChannelOption((o: any) => o.setName('member_count_channel').setDescription('Voice or text channel to show member count').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
      execute: async (interaction) => {
        const ch = interaction.options.getChannel('member_count_channel')!;
        const gid = interaction.guild.id;
        const c = this.counters.get(gid) ?? {};
        c.memberCountChannelId = ch.id;
        this.counters.set(gid, c);
        await this.updateMemberCounter(interaction.guild.id);
        await interaction.reply({ content: `Member counter bound to <#${ch.id}>.`, ephemeral: true });
      }
    };

    const banCommand: Command = {
      data: new SlashCommandBuilder()
        .setName('ban')
        .setDescription('Ban a user from the server')
        .addUserOption((option: any) => 
          option.setName('user')
            .setDescription('The user to ban')
            .setRequired(true))
        .addStringOption((option: any) =>
          option.setName('reason')
            .setDescription('Reason for banning'))
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),
      execute: async (interaction) => {
        const user = interaction.options.getUser('user');
        const reason = interaction.options.getString('reason') || 'No reason provided';
        
        try {
          await interaction.guild.members.ban(user, { reason });
          
          await storage.createModerationLog({
            serverId: interaction.guild.id,
            action: 'ban',
            targetUserId: user.id,
            targetUsername: user.username,
            moderatorId: interaction.user.id,
            moderatorUsername: interaction.user.username,
            reason,
          });
          
          await storage.incrementModerationAction(interaction.guild.id);
          
          const embed = new EmbedBuilder()
            .setColor('#ED4245')
            .setTitle('User Banned')
            .setDescription(`${user.username} has been banned from the server.`)
            .addFields({ name: 'Reason', value: reason })
            .setTimestamp();
            
          await interaction.reply({ embeds: [embed] });
        } catch (error) {
          await interaction.reply({ content: 'Failed to ban user. Please check permissions.', ephemeral: true });
        }
      }
    };

    const warnCommand: Command = {
      data: new SlashCommandBuilder()
        .setName('warn')
        .setDescription('Warn a user')
        .addUserOption((option: any) => 
          option.setName('user')
            .setDescription('The user to warn')
            .setRequired(true))
        .addStringOption((option: any) =>
          option.setName('reason')
            .setDescription('Reason for warning')
            .setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
      execute: async (interaction) => {
        const user = interaction.options.getUser('user');
        const reason = interaction.options.getString('reason')!;
        
        await storage.createWarning({
          serverId: interaction.guild.id,
          userId: user.id,
          username: user.username,
          reason,
          moderatorId: interaction.user.id,
          moderatorUsername: interaction.user.username,
        });
        
        await storage.createModerationLog({
          serverId: interaction.guild.id,
          action: 'warn',
          targetUserId: user.id,
          targetUsername: user.username,
          moderatorId: interaction.user.id,
          moderatorUsername: interaction.user.username,
          reason,
        });
        
        const warningCount = await storage.getWarningsCount(interaction.guild.id, user.id);
        
        const embed = new EmbedBuilder()
          .setColor('#FEE75C')
          .setTitle('User Warned')
          .setDescription(`${user.username} has been warned.`)
          .addFields(
            { name: 'Reason', value: reason },
            { name: 'Total Warnings', value: warningCount.toString() }
          )
          .setTimestamp();
          
        await interaction.reply({ embeds: [embed] });
      }
    };

    // Game Commands
    const coinflipCommand: Command = {
      data: new SlashCommandBuilder()
        .setName('coinflip')
        .setDescription('Flip a coin')
        .addStringOption((option: any) =>
          option.setName('guess')
            .setDescription('Your guess: heads or tails')
            .addChoices(
              { name: 'Heads', value: 'heads' },
              { name: 'Tails', value: 'tails' }
            )),
      execute: async (interaction) => {
        const guess = interaction.options.getString('guess');
        const result = Math.random() < 0.5 ? 'heads' : 'tails';
        const won = guess === result;
        
        const embed = new EmbedBuilder()
          .setColor(won ? '#57F287' : '#ED4245')
          .setTitle('🪙 Coin Flip')
          .setDescription(`The coin landed on **${result}**!`)
          .addFields({ 
            name: 'Result', 
            value: guess ? (won ? '🎉 You won!' : '❌ You lost!') : `It's ${result}!`
          })
          .setTimestamp();
          
        await interaction.reply({ embeds: [embed] });
        await storage.incrementCommandUsed(interaction.guild.id);
      }
    };

    const blackjackCommand: Command = {
      data: new SlashCommandBuilder()
        .setName('blackjack')
        .setDescription('Start a blackjack game'),
      execute: async (interaction) => {
        const cards = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
        const getRandomCard = () => cards[Math.floor(Math.random() * cards.length)];
        const getCardValue = (card: string) => {
          if (card === 'A') return 11;
          if (['J', 'Q', 'K'].includes(card)) return 10;
          return parseInt(card);
        };
        
        const playerCards = [getRandomCard(), getRandomCard()];
        const dealerCards = [getRandomCard(), getRandomCard()];
        
        const playerValue = playerCards.reduce((sum, card) => sum + getCardValue(card), 0);
        const dealerValue = getCardValue(dealerCards[0]); // Only show first card
        
        const embed = new EmbedBuilder()
          .setColor('#5865F2')
          .setTitle('🃏 Blackjack')
          .setDescription('A new blackjack game has started!')
          .addFields(
            { 
              name: 'Your Cards', 
              value: `${playerCards.join(', ')} (Value: ${playerValue})`,
              inline: true 
            },
            { 
              name: 'Dealer Cards', 
              value: `${dealerCards[0]}, ?? (Showing: ${dealerValue})`,
              inline: true 
            }
          )
          .setFooter({ text: 'Use /hit or /stand to continue' })
          .setTimestamp();
          
        await interaction.reply({ embeds: [embed] });
        await storage.incrementCommandUsed(interaction.guild.id);
      }
    };

    // AFK System
    const afkCommand: Command = {
      data: new SlashCommandBuilder()
        .setName('afk')
        .setDescription('Set your AFK status')
        .addStringOption((option: any) =>
          option.setName('reason')
            .setDescription('Reason for being AFK')),
      execute: async (interaction) => {
        const reason = interaction.options.getString('reason') || 'AFK';
        
        await storage.setAfkUser({
          serverId: interaction.guild.id,
          userId: interaction.user.id,
          username: interaction.user.username,
          reason,
        });
        
        const embed = new EmbedBuilder()
          .setColor('#FEE75C')
          .setTitle('AFK Status Set')
          .setDescription(`${interaction.user.username} is now AFK: ${reason}`)
          .setTimestamp();
          
        await interaction.reply({ embeds: [embed] });
      }
    };

    // Custom Commands
    const createCommandCommand: Command = {
      data: new SlashCommandBuilder()
        .setName('createcommand')
        .setDescription('Create a custom command')
        .addStringOption((option: any) =>
          option.setName('name')
            .setDescription('Command name')
            .setRequired(true))
        .addStringOption((option: any) =>
          option.setName('response')
            .setDescription('Command response')
            .setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
      execute: async (interaction) => {
        const name = interaction.options.getString('name')!.toLowerCase();
        const response = interaction.options.getString('response')!;
        
        await storage.createCustomCommand({
          serverId: interaction.guild.id,
          name,
          response,
          createdBy: interaction.user.id,
        });
        
        const embed = new EmbedBuilder()
          .setColor('#57F287')
          .setTitle('Custom Command Created')
          .setDescription(`Command \`${name}\` has been created!`)
          .setTimestamp();
          
        await interaction.reply({ embeds: [embed] });
      }
    };

    // Web Search
    const searchCommand: Command = {
      data: new SlashCommandBuilder()
        .setName('search')
        .setDescription('Search the web')
        .addStringOption((option: any) =>
          option.setName('query')
            .setDescription('Search query')
            .setRequired(true)),
      execute: async (interaction) => {
        const query = interaction.options.getString('query')!;
        
        // Using DuckDuckGo Instant Answer API (no key required)
        try {
          const response = await axios.get(`https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&pretty=1&no_html=1`);
          const data = response.data;
          
          const embed = new EmbedBuilder()
            .setColor('#5865F2')
            .setTitle(`🔍 Search Results for "${query}"`)
            .setTimestamp();
          
          if (data.AbstractText) {
            embed.setDescription(data.AbstractText);
            if (data.AbstractURL) {
              embed.setURL(data.AbstractURL);
            }
          } else if (data.Answer) {
            embed.setDescription(data.Answer);
          } else {
            embed.setDescription('No direct answer found. Try refining your search query.');
          }
          
          await interaction.reply({ embeds: [embed] });
        } catch (error) {
          await interaction.reply({ content: 'Failed to perform search. Please try again later.', ephemeral: true });
        }
        
        await storage.incrementCommandUsed(interaction.guild.id);
      }
    };

    // Last.fm Integration
    const nowPlayingCommand: Command = {
      data: new SlashCommandBuilder()
        .setName('nowplaying')
        .setDescription('Show what you\'re currently playing on Last.fm')
        .addStringOption((option: any) =>
          option.setName('username')
            .setDescription('Last.fm username')),
      execute: async (interaction) => {
        let username = interaction.options.getString('username');
        
        if (!username) {
          const server = await storage.getServer(interaction.guild.id);
          username = server?.lastfmUsername;
        }
        
        if (!username) {
          await interaction.reply({ content: 'Please provide a Last.fm username or set one in server settings.', ephemeral: true });
          return;
        }
        
        if (!this.lastfmApiKey) {
          await interaction.reply({ content: 'Last.fm integration is not configured.', ephemeral: true });
          return;
        }
        
        try {
          const response = await axios.get(`https://ws.audioscrobbler.com/2.0/?method=user.getrecenttracks&user=${username}&api_key=${this.lastfmApiKey}&format=json&limit=1`);
          const track = response.data.recenttracks.track[0];
          
          if (!track) {
            await interaction.reply({ content: 'No recent tracks found for this user.', ephemeral: true });
            return;
          }
          
          const embed = new EmbedBuilder()
            .setColor('#d92323')
            .setTitle('🎵 Now Playing')
            .setDescription(`**${track.name}**\nby ${track.artist['#text']}`)
            .addFields({ name: 'Album', value: track.album['#text'] || 'Unknown' })
            .setFooter({ text: `via Last.fm • ${username}` })
            .setTimestamp();
          
          if (track.image && track.image[2] && track.image[2]['#text']) {
            embed.setThumbnail(track.image[2]['#text']);
          }
          
          await interaction.reply({ embeds: [embed] });
        } catch (error) {
          await interaction.reply({ content: 'Failed to fetch Last.fm data. Please check the username.', ephemeral: true });
        }
        
        await storage.incrementCommandUsed(interaction.guild.id);
      }
    };

    // ANTINUKE COMMANDS
    const antinukeCommand: Command = {
      data: new SlashCommandBuilder()
        .setName('antinuke')
        .setDescription('Configure antinuke protection')
        .addSubcommand((subcommand: any) =>
          subcommand
            .setName('toggle')
            .setDescription('Enable/disable antinuke protection')
            .addBooleanOption((option: any) =>
              option.setName('enabled')
                .setDescription('Enable or disable antinuke')
                .setRequired(true)))
        .addSubcommand((subcommand: any) =>
          subcommand
            .setName('status')
            .setDescription('Check antinuke status'))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
      execute: async (interaction) => {
        const subcommand = interaction.options.getSubcommand();
        
        if (subcommand === 'toggle') {
          const enabled = interaction.options.getBoolean('enabled');
          await storage.updateServer(interaction.guild.id, { autoModEnabled: enabled });
          
          const embed = new EmbedBuilder()
            .setColor(enabled ? '#57F287' : '#ED4245')
            .setTitle('🛡️ Antinuke Protection')
            .setDescription(`Antinuke protection has been **${enabled ? 'enabled' : 'disabled'}**`)
            .setTimestamp();
            
          await interaction.reply({ embeds: [embed] });
        } else if (subcommand === 'status') {
          const server = await storage.getServer(interaction.guild.id);
          const status = server?.autoModEnabled ? 'Enabled' : 'Disabled';
          
          const embed = new EmbedBuilder()
            .setColor(server?.autoModEnabled ? '#57F287' : '#ED4245')
            .setTitle('🛡️ Antinuke Status')
            .setDescription(`Antinuke protection is **${status}**`)
            .setTimestamp();
            
          await interaction.reply({ embeds: [embed] });
        }
      }
    };

    // PREFIX COMMANDS
    const prefixCommand: Command = {
      data: new SlashCommandBuilder()
        .setName('prefix')
        .setDescription('Manage server prefix')
        .addSubcommand((subcommand: any) =>
          subcommand
            .setName('set')
            .setDescription('Set a new prefix')
            .addStringOption((option: any) =>
              option.setName('prefix')
                .setDescription('New prefix for the bot')
                .setRequired(true)
                .setMaxLength(5)))
        .addSubcommand((subcommand: any) =>
          subcommand
            .setName('show')
            .setDescription('Show current prefix'))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
      execute: async (interaction) => {
        const subcommand = interaction.options.getSubcommand();
        
        if (subcommand === 'set') {
          const newPrefix = interaction.options.getString('prefix');
          await storage.updateServer(interaction.guild.id, { prefix: newPrefix });
          
          const embed = new EmbedBuilder()
            .setColor('#5865F2')
            .setTitle('⚙️ Prefix Updated')
            .setDescription(`Server prefix has been changed to: **${newPrefix}**`)
            .setTimestamp();
            
          await interaction.reply({ embeds: [embed] });
        } else if (subcommand === 'show') {
          const server = await storage.getServer(interaction.guild.id);
          const currentPrefix = server?.prefix || ',';
          
          const embed = new EmbedBuilder()
            .setColor('#5865F2')
            .setTitle('⚙️ Current Prefix')
            .setDescription(`Server prefix is: **${currentPrefix}**`)
            .setTimestamp();
            
          await interaction.reply({ embeds: [embed] });
        }
      }
    };

    // TIMEOUT COMMAND
    const timeoutCommand: Command = {
      data: new SlashCommandBuilder()
        .setName('timeout')
        .setDescription('Timeout a user')
        .addUserOption((option: any) =>
          option.setName('user')
            .setDescription('User to timeout')
            .setRequired(true))
        .addIntegerOption((option: any) =>
          option.setName('duration')
            .setDescription('Timeout duration in minutes')
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(40320))
        .addStringOption((option: any) =>
          option.setName('reason')
            .setDescription('Reason for timeout'))
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
      execute: async (interaction) => {
        const user = interaction.options.getUser('user');
        const duration = interaction.options.getInteger('duration');
        const reason = interaction.options.getString('reason') || 'No reason provided';
        
        try {
          const member = await interaction.guild.members.fetch(user.id);
          await member.timeout(duration * 60 * 1000, reason);
          
          const embed = new EmbedBuilder()
            .setColor('#FEE75C')
            .setTitle('⏰ User Timed Out')
            .setDescription(`${user.username} has been timed out for ${duration} minutes.`)
            .addFields({ name: 'Reason', value: reason })
            .setTimestamp();
            
          await interaction.reply({ embeds: [embed] });
          
          await storage.createModerationLog({
            serverId: interaction.guild.id,
            action: 'timeout',
            targetUserId: user.id,
            targetUsername: user.username,
            moderatorId: interaction.user.id,
            moderatorUsername: interaction.user.username,
            reason: `${reason} (${duration} minutes)`,
          });
        } catch (error) {
          await interaction.reply({ content: 'Failed to timeout user. Please check permissions.', ephemeral: true });
        }
      }
    };

    // CLEAR COMMAND
    const clearCommand: Command = {
      data: new SlashCommandBuilder()
        .setName('clear')
        .setDescription('Clear messages from the channel')
        .addIntegerOption((option: any) =>
          option.setName('amount')
            .setDescription('Number of messages to delete (1-100)')
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(100))
        .addUserOption((option: any) =>
          option.setName('user')
            .setDescription('Only delete messages from this user'))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
      execute: async (interaction) => {
        const amount = interaction.options.getInteger('amount');
        const targetUser = interaction.options.getUser('user');
        
        try {
          const messages = await interaction.channel.messages.fetch({ limit: amount });
          
          if (targetUser) {
            const userMessages = messages.filter((msg: Message) => msg.author.id === targetUser.id);
            await interaction.channel.bulkDelete(userMessages);
            await interaction.reply({ content: `Deleted ${userMessages.size} messages from ${targetUser.username}.`, ephemeral: true });
          } else {
            await interaction.channel.bulkDelete(messages);
            await interaction.reply({ content: `Deleted ${messages.size} messages.`, ephemeral: true });
          }
        } catch (error) {
          await interaction.reply({ content: 'Failed to delete messages. They may be too old.', ephemeral: true });
        }
      }
    };

    // ROLE MANAGEMENT
    const roleCommand: Command = {
      data: new SlashCommandBuilder()
        .setName('role')
        .setDescription('Role management (coming soon)')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),
      execute: async (interaction) => {
        await interaction.reply({ content: 'Role management is not implemented yet.', ephemeral: true });
      }
    };

    // MUSIC COMMAND (placeholder)
    const musicCommand: Command = {
      data: new SlashCommandBuilder()
        .setName('music')
        .setDescription('Music controls (coming soon)'),
      execute: async (interaction) => {
        await interaction.reply({ content: 'Music feature is not implemented yet.', ephemeral: true });
      }
    };

    // GIVEAWAY COMMAND (placeholder)
    const giveawayCommand: Command = {
      data: new SlashCommandBuilder()
        .setName('giveaway')
        .setDescription('Giveaway management (coming soon)')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
      execute: async (interaction) => {
        await interaction.reply({ content: 'Giveaway feature is not implemented yet.', ephemeral: true });
      }
    };

    // WEBHOOK COMMANDS
    const webhookCommand: Command = {
      data: new SlashCommandBuilder()
        .setName('webhook')
        .setDescription('Manage webhooks')
        .addSubcommand((subcommand: any) =>
          subcommand
            .setName('create')
            .setDescription('Create a webhook')
            .addStringOption((option: any) =>
              option.setName('name')
                .setDescription('Webhook name')
                .setRequired(true)))
        .addSubcommand((subcommand: any) =>
          subcommand
            .setName('list')
            .setDescription('List all webhooks'))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageWebhooks),
      execute: async (interaction) => {
        const subcommand = interaction.options.getSubcommand();
        
        if (subcommand === 'create') {
          // ...
        } else if (subcommand === 'list') {
          try {
            const webhooks = await interaction.guild.fetchWebhooks();
            
            if (webhooks.size === 0) {
              await interaction.reply({ content: 'No webhooks found in this server.', ephemeral: true });
              return;
            }
            
            const webhookList = webhooks.map((webhook: Webhook) => 
              `**${webhook.name}** (${webhook.channelId})`
            ).join('\n');
            
            const embed = new EmbedBuilder()
              .setColor('#5865F2')
              .setTitle('🔗 Server Webhooks')
              .setDescription(webhookList)
              .setTimestamp();
              
            await interaction.reply({ embeds: [embed], ephemeral: true });
          } catch (error) {
            await interaction.reply({ content: 'Failed to fetch webhooks.', ephemeral: true });
          }
        }
      }
    };

    // TEA GAMES
    const whiteTeaCommand: Command = {
      data: new SlashCommandBuilder()
        .setName('whitetea')
        .setDescription('Play white tea game - guess the number!'),
      execute: async (interaction) => {
        const number = Math.floor(Math.random() * 100) + 1;
        
        const embed = new EmbedBuilder()
          .setColor('#F0F8FF')
          .setTitle('🍃 White Tea Game')
          .setDescription('I\'m thinking of a number between 1 and 100!')
          .addFields({ name: 'Your Challenge', value: `Try to guess: **${number}**\nYou got it right!` })
          .setTimestamp();
          
        await interaction.reply({ embeds: [embed] });
        await storage.incrementCommandUsed(interaction.guild.id);
      }
    };

    const blackTeaCommand: Command = {
      data: new SlashCommandBuilder()
        .setName('blacktea')
        .setDescription('Play black tea game - fortune telling!'),
      execute: async (interaction) => {
        const fortunes = [
          'Your future holds great success!',
          'A surprise awaits you this week.',
          'Fortune favors the bold - take a chance!',
          'Good news is coming your way.',
          'Your creativity will lead to rewards.',
          'A new friendship will brighten your days.'
        ];
        
        const fortune = fortunes[Math.floor(Math.random() * fortunes.length)];
        
        const embed = new EmbedBuilder()
          .setColor('#2F1B14')
          .setTitle('🍵 Black Tea Fortune')
          .setDescription(`*Swirls tea leaves...*\n\n**${fortune}**`)
          .setTimestamp();
          
        await interaction.reply({ embeds: [embed] });
        await storage.incrementCommandUsed(interaction.guild.id);
      }
    };

    // INFO COMMANDS
    const serverInfoCommand: Command = {
      data: new SlashCommandBuilder()
        .setName('serverinfo')
        .setDescription('Display server information'),
      execute: async (interaction) => {
        const guild = interaction.guild;
        
        const embed = new EmbedBuilder()
          .setColor('#5865F2')
          .setTitle(`📊 ${guild.name}`)
          .setThumbnail(guild.iconURL())
          .addFields(
            { name: 'Owner', value: `<@${guild.ownerId}>`, inline: true },
            { name: 'Members', value: guild.memberCount.toString(), inline: true },
            { name: 'Created', value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:R>`, inline: true },
            { name: 'Channels', value: guild.channels.cache.size.toString(), inline: true },
            { name: 'Roles', value: guild.roles.cache.size.toString(), inline: true },
            { name: 'Boost Level', value: guild.premiumTier.toString(), inline: true }
          )
          .setTimestamp();
          
        await interaction.reply({ embeds: [embed] });
      }
    };

    const userInfoCommand: Command = {
      data: new SlashCommandBuilder()
        .setName('userinfo')
        .setDescription('Display user information')
        .addUserOption((option: any) =>
          option.setName('user')
            .setDescription('User to get info about')),
      execute: async (interaction) => {
        const user = interaction.options.getUser('user') || interaction.user;
        const member = await interaction.guild.members.fetch(user.id);
        
        const embed = new EmbedBuilder()
          .setColor('#5865F2')
          .setTitle(`👤 ${user.username}`)
          .setThumbnail(user.displayAvatarURL())
          .addFields(
            { name: 'ID', value: user.id, inline: true },
            { name: 'Joined Discord', value: `<t:${Math.floor(user.createdTimestamp / 1000)}:R>`, inline: true },
            { name: 'Joined Server', value: `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>`, inline: true },
            { name: 'Roles', value: member.roles.cache.map((role: Role) => role.name).join(', ') || 'None', inline: false }
          )
          .setTimestamp();
          
        await interaction.reply({ embeds: [embed] });
      }
    };

    // ADDITIONAL MODERATION COMMANDS
    const purgeCommand: Command = {
      data: new SlashCommandBuilder()
        .setName('purge')
        .setDescription('Bulk delete messages from the channel')
        .addIntegerOption((option: any) =>
          option.setName('amount')
            .setDescription('Number of messages to delete (1-100)')
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(100))
        .addUserOption((option: any) =>
          option.setName('user')
            .setDescription('Only delete messages from this user'))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
      execute: async (interaction) => {
        const amount = interaction.options.getInteger('amount');
        const targetUser = interaction.options.getUser('user');
        
        try {
          const channel = interaction.channel as TextChannel;
          
          if (targetUser) {
            // Fetch messages and filter by user
            const messages = await channel.messages.fetch({ limit: Math.min(amount * 2, 100) });
            const userMessages = messages.filter(msg => msg.author.id === targetUser.id).first(amount);
            
            if (userMessages.length === 0) {
              await interaction.reply({ content: `No messages found from ${targetUser.tag}`, ephemeral: true });
              return;
            }
            
            await channel.bulkDelete(userMessages);
            await interaction.reply({ content: `🗑️ Deleted ${userMessages.length} messages from ${targetUser.tag}`, ephemeral: true });
          } else {
            // Delete last X messages
            const messages = await channel.messages.fetch({ limit: amount });
            await channel.bulkDelete(messages);
            await interaction.reply({ content: `🗑️ Deleted ${messages.size} messages`, ephemeral: true });
          }
          
          // Log the action
          await storage.createModerationLog({
            serverId: interaction.guild.id,
            action: 'purge',
            targetUserId: targetUser?.id || 'bulk',
            targetUsername: targetUser?.tag || 'bulk',
            moderatorId: interaction.user.id,
            moderatorUsername: interaction.user.tag,
            reason: `Purged ${amount} messages${targetUser ? ` from ${targetUser.tag}` : ''}`,
          });
          
          await storage.incrementModerationAction(interaction.guild.id);
        } catch (error) {
          await interaction.reply({ content: '❌ Failed to delete messages. Make sure they are less than 14 days old.', ephemeral: true });
        }
      }
    };

    const lockCommand: Command = {
      data: new SlashCommandBuilder()
        .setName('lock')
        .setDescription('Lock a channel to prevent users from sending messages')
        .addChannelOption((option: any) =>
          option.setName('channel')
            .setDescription('Channel to lock (defaults to current)')
            .addChannelTypes(ChannelType.GuildText))
        .addStringOption((option: any) =>
          option.setName('reason')
            .setDescription('Reason for locking the channel'))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
      execute: async (interaction) => {
        const channel = interaction.options.getChannel('channel') as TextChannel || interaction.channel as TextChannel;
        const reason = interaction.options.getString('reason') || 'No reason provided';
        
        try {
          // Remove SEND_MESSAGES permission for @everyone
          await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
            SendMessages: false,
          });
          
          const embed = new EmbedBuilder()
            .setColor('#ED4245')
            .setTitle('🔒 Channel Locked')
            .setDescription(`This channel has been locked by ${interaction.user.tag}`)
            .addFields({ name: 'Reason', value: reason })
            .setTimestamp();
          
          await channel.send({ embeds: [embed] });
          await interaction.reply({ content: `🔒 Locked ${channel} successfully`, ephemeral: true });
          
          // Log the action
          await storage.createModerationLog({
            serverId: interaction.guild.id,
            action: 'lock',
            targetUserId: channel.id,
            targetUsername: channel.name,
            moderatorId: interaction.user.id,
            moderatorUsername: interaction.user.tag,
            reason: `Locked ${channel.name}: ${reason}`,
          });
          
          await storage.incrementModerationAction(interaction.guild.id);
        } catch (error) {
          await interaction.reply({ content: '❌ Failed to lock the channel. Check bot permissions.', ephemeral: true });
        }
      }
    };

    const unlockCommand: Command = {
      data: new SlashCommandBuilder()
        .setName('unlock')
        .setDescription('Unlock a previously locked channel')
        .addChannelOption((option: any) =>
          option.setName('channel')
            .setDescription('Channel to unlock (defaults to current)')
            .addChannelTypes(ChannelType.GuildText))
        .addStringOption((option: any) =>
          option.setName('reason')
            .setDescription('Reason for unlocking the channel'))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
      execute: async (interaction) => {
        const channel = interaction.options.getChannel('channel') as TextChannel || interaction.channel as TextChannel;
        const reason = interaction.options.getString('reason') || 'No reason provided';
        
        try {
          // Remove the SEND_MESSAGES override for @everyone (restore to default)
          await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
            SendMessages: null,
          });
          
          const embed = new EmbedBuilder()
            .setColor('#57F287')
            .setTitle('🔓 Channel Unlocked')
            .setDescription(`This channel has been unlocked by ${interaction.user.tag}`)
            .addFields({ name: 'Reason', value: reason })
            .setTimestamp();
          
          await channel.send({ embeds: [embed] });
          await interaction.reply({ content: `🔓 Unlocked ${channel} successfully`, ephemeral: true });
          
          // Log the action
          await storage.createModerationLog({
            serverId: interaction.guild.id,
            action: 'unlock',
            targetUserId: channel.id,
            targetUsername: channel.name,
            moderatorId: interaction.user.id,
            moderatorUsername: interaction.user.tag,
            reason: `Unlocked ${channel.name}: ${reason}`,
          });
          
          await storage.incrementModerationAction(interaction.guild.id);
        } catch (error) {
          await interaction.reply({ content: '❌ Failed to unlock the channel. Check bot permissions.', ephemeral: true });
        }
      }
    };

    const slowmodeCommand: Command = {
      data: new SlashCommandBuilder()
        .setName('slowmode')
        .setDescription('Set slowmode delay for the channel')
        .addIntegerOption((option: any) =>
          option.setName('seconds')
            .setDescription('Slowmode delay in seconds (0 to disable, max 21600)')
            .setRequired(true)
            .setMinValue(0)
            .setMaxValue(21600))
        .addChannelOption((option: any) =>
          option.setName('channel')
            .setDescription('Channel to apply slowmode to (defaults to current)')
            .addChannelTypes(ChannelType.GuildText))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
      execute: async (interaction) => {
        const seconds = interaction.options.getInteger('seconds');
        const channel = interaction.options.getChannel('channel') as TextChannel || interaction.channel as TextChannel;
        
        try {
          await channel.setRateLimitPerUser(seconds);
          
          if (seconds === 0) {
            await interaction.reply(`🔓 Slowmode disabled in ${channel}`);
          } else {
            await interaction.reply(`🐌 Slowmode set to ${seconds} seconds in ${channel}`);
          }
          
          // Log the action
          await storage.createModerationLog({
            serverId: interaction.guild.id,
            action: 'slowmode',
            targetUserId: channel.id,
            targetUsername: channel.name,
            moderatorId: interaction.user.id,
            moderatorUsername: interaction.user.tag,
            reason: `Set slowmode to ${seconds} seconds in ${channel.name}`,
          });
          
          await storage.incrementModerationAction(interaction.guild.id);
        } catch (error) {
          await interaction.reply({ content: '❌ Failed to set slowmode. Check bot permissions.', ephemeral: true });
        }
      }
    };

    // Last.fm Integration Commands
    const lastfmSetCommand: Command = {
      data: new SlashCommandBuilder()
        .setName('lastfm')
        .setDescription('Last.fm integration commands')
        .addSubcommand((subcommand: any) =>
          subcommand
            .setName('set')
            .setDescription('Set your Last.fm username')
            .addStringOption((option: any) =>
              option.setName('username')
                .setDescription('Your Last.fm username')
                .setRequired(true)))
        .addSubcommand((subcommand: any) =>
          subcommand
            .setName('nowplaying')
            .setDescription('Show what you\'re currently listening to'))
        .addSubcommand((subcommand: any) =>
          subcommand
            .setName('recent')
            .setDescription('Show your recent tracks'))
        .addSubcommand((subcommand: any) =>
          subcommand
            .setName('top')
            .setDescription('Show your top artists')),
      execute: async (interaction) => {
        const subcommand = interaction.options.getSubcommand();
        
        if (subcommand === 'set') {
          const username = interaction.options.getString('username');
          await storage.updateServer(interaction.guild.id, { lastfmUsername: username });
          await interaction.reply(`✅ Set Last.fm username to **${username}**`);
          await storage.incrementCommandUsed(interaction.guild.id);
        }
        
        else if (subcommand === 'nowplaying') {
          const server = await storage.getServer(interaction.guild.id);
          if (!server?.lastfmUsername) {
            await interaction.reply('❌ No Last.fm username set! Use `/lastfm set <username>` first.');
            return;
          }
          
          try {
            const response = await axios.get(`https://ws.audioscrobbler.com/2.0/`, {
              params: {
                method: 'user.getrecenttracks',
                user: server.lastfmUsername,
                api_key: this.lastfmApiKey,
                format: 'json',
                limit: 1
              }
            });
            
            const track = response.data.recenttracks?.track?.[0];
            if (!track) {
              await interaction.reply('❌ No recent tracks found.');
              return;
            }
            
            const embed = new EmbedBuilder()
              .setColor('#D51007')
              .setTitle('🎵 Now Playing')
              .setDescription(`**${track.name}**\nby ${track.artist['#text']}\n${track.album ? `from *${track.album['#text']}*` : ''}`)
              .setThumbnail(track.image && track.image[3] ? track.image[3]['#text'] : null)
              .setFooter({ text: `Last.fm • ${server.lastfmUsername}` })
              .setTimestamp();
              
            if (track['@attr']?.nowplaying) {
              embed.setDescription(`🔴 **Currently Playing**\n\n**${track.name}**\nby ${track.artist['#text']}\n${track.album ? `from *${track.album['#text']}*` : ''}`);
            }
            
            await interaction.reply({ embeds: [embed] });
          } catch (error) {
            await interaction.reply('❌ Error fetching Last.fm data. Check if the username is correct.');
          }
          await storage.incrementCommandUsed(interaction.guild.id);
        }
        
        else if (subcommand === 'recent') {
          const server = await storage.getServer(interaction.guild.id);
          if (!server?.lastfmUsername) {
            await interaction.reply('❌ No Last.fm username set! Use `/lastfm set <username>` first.');
            return;
          }
          
          try {
            const response = await axios.get(`https://ws.audioscrobbler.com/2.0/`, {
              params: {
                method: 'user.getrecenttracks',
                user: server.lastfmUsername,
                api_key: this.lastfmApiKey,
                format: 'json',
                limit: 10
              }
            });
            
            const tracks = response.data.recenttracks?.track || [];
            if (tracks.length === 0) {
              await interaction.reply('❌ No recent tracks found.');
              return;
            }
            
            const trackList = tracks.map((track: any, index: number) => {
              const nowPlaying = track['@attr']?.nowplaying ? '🔴 ' : '';
              return `${nowPlaying}**${index + 1}.** ${track.name} - ${track.artist['#text']}`;
            }).join('\n');
            
            const embed = new EmbedBuilder()
              .setColor('#D51007')
              .setTitle('🎶 Recent Tracks')
              .setDescription(trackList)
              .setFooter({ text: `Last.fm • ${server.lastfmUsername}` })
              .setTimestamp();
            
            await interaction.reply({ embeds: [embed] });
          } catch (error) {
            await interaction.reply('❌ Error fetching Last.fm data. Check if the username is correct.');
          }
          await storage.incrementCommandUsed(interaction.guild.id);
        }
        
        else if (subcommand === 'top') {
          const server = await storage.getServer(interaction.guild.id);
          if (!server?.lastfmUsername) {
            await interaction.reply('❌ No Last.fm username set! Use `/lastfm set <username>` first.');
            return;
          }
          
          try {
            const response = await axios.get(`https://ws.audioscrobbler.com/2.0/`, {
              params: {
                method: 'user.gettopartists',
                user: server.lastfmUsername,
                api_key: this.lastfmApiKey,
                format: 'json',
                period: '7day',
                limit: 10
              }
            });
            
            const artists = response.data.topartists?.artist || [];
            if (artists.length === 0) {
              await interaction.reply('❌ No top artists found.');
              return;
            }
            
            const artistList = artists.map((artist: any, index: number) => {
              return `**${index + 1}.** ${artist.name} (${artist.playcount} plays)`;
            }).join('\n');
            
            const embed = new EmbedBuilder()
              .setColor('#D51007')
              .setTitle('🎤 Top Artists (Past 7 Days)')
              .setDescription(artistList)
              .setFooter({ text: `Last.fm • ${server.lastfmUsername}` })
              .setTimestamp();
            
            await interaction.reply({ embeds: [embed] });
          } catch (error) {
            await interaction.reply('❌ Error fetching Last.fm data. Check if the username is correct.');
          }
          await storage.incrementCommandUsed(interaction.guild.id);
        }
      }
    };

    // Add all commands to collection
    this.commands.set('kick', kickCommand);
    this.commands.set('ban', banCommand);
    this.commands.set('warn', warnCommand);
    this.commands.set('coinflip', coinflipCommand);
    this.commands.set('blackjack', blackjackCommand);
    this.commands.set('afk', afkCommand);
    this.commands.set('createcommand', createCommandCommand);
    this.commands.set('search', searchCommand);
    this.commands.set('nowplaying', nowPlayingCommand);
    
    // New comprehensive commands
    this.commands.set('antinuke', antinukeCommand);
    this.commands.set('prefix', prefixCommand);
    this.commands.set('timeout', timeoutCommand);
    this.commands.set('clear', clearCommand);
    this.commands.set('role', roleCommand);
    this.commands.set('music', musicCommand);
    this.commands.set('giveaway', giveawayCommand);
    this.commands.set('webhook', webhookCommand);
    this.commands.set('whitetea', whiteTeaCommand);
    this.commands.set('blacktea', blackTeaCommand);
    this.commands.set('serverinfo', serverInfoCommand);
    this.commands.set('userinfo', userInfoCommand);
    this.commands.set('help', helpCommand);
    this.commands.set('logging', loggingCommand);
    this.commands.set('starboard', starboardCommand);
    this.commands.set('reactionroles', reactionRolesCommand);
    this.commands.set('joingate', joingateCommand);
    this.commands.set('voicemaster', voicemasterCommand);
    this.commands.set('level', levelCommand);
    this.commands.set('bumpreminder', bumpCommand);
    this.commands.set('counters', countersCommand);
    this.commands.set('lastfm', lastfmSetCommand);
    this.commands.set('purge', purgeCommand);
    this.commands.set('lock', lockCommand);
    this.commands.set('unlock', unlockCommand);
    this.commands.set('slowmode', slowmodeCommand);
  }

  private setupEventListeners() {
    this.client.once('ready', async () => {
      console.log(`Bot is ready! Logged in as ${this.client.user?.tag}`);
      
      // Register slash commands
      const rest = new REST().setToken(process.env.DISCORD_BOT_TOKEN || '');
      
      try {
        const commandData = Array.from(this.commands.values()).map(command => command.data.toJSON());
        
        console.log(`Registering ${commandData.length} slash commands:`, commandData.map(cmd => cmd.name).join(', '));
        
        // Clear existing commands first
        await rest.put(
          Routes.applicationCommands(this.client.user!.id),
          { body: [] }
        );
        
        // Wait a moment then re-register
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        await rest.put(
          Routes.applicationCommands(this.client.user!.id),
          { body: commandData }
        );
        
        console.log('Successfully registered slash commands.');
        console.log('If new commands don\'t appear immediately, try: 1) Refresh Discord, 2) Leave and rejoin the server, 3) Wait up to 1 hour for global commands to sync');
      } catch (error) {
        console.error('Error registering slash commands:', error);
      }
    });

    this.client.on('interactionCreate', async (interaction) => {
      if (!interaction.isChatInputCommand()) return;

      const command = this.commands.get(interaction.commandName);
      if (!command) return;

      try {
        await command.execute(interaction);
      } catch (error) {
        console.error('Error executing command:', error);
        const reply = { content: 'There was an error executing this command!', ephemeral: true };
        
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp(reply);
        } else {
          await interaction.reply(reply);
        }
      }
    });

    this.client.on('guildCreate', async (guild) => {
      // Auto-create server entry when bot joins
      await storage.createServer({
        id: guild.id,
        name: guild.name,
        prefix: ',',
        autoModEnabled: false,
        musicVolume: 50,
        lastfmUsername: null,
      });
      
      // Initialize bot stats
      await storage.updateBotStats(guild.id, {
        activeMembers: guild.memberCount,
      });
    });

    // Join gate and counters
    this.client.on('guildMemberAdd', async (member: GuildMember) => {
      const minDays = this.joinGateMinDays.get(member.guild.id) ?? 0;
      if (minDays > 0) {
        const ageMs = Date.now() - member.user.createdTimestamp;
        const minMs = minDays * 24 * 60 * 60 * 1000;
        if (ageMs < minMs) {
          try { await member.kick(`JoinGate: account younger than ${minDays} day(s)`); } catch {}
          return;
        }
      }
      await this.updateMemberCounter(member.guild.id);
      await this.log(member.guild.id, `➕ <@${member.id}> joined.`, '#57F287');
    });

    this.client.on('guildMemberRemove', async (member) => {
      await this.updateMemberCounter(member.guild.id);
      await this.log(member.guild.id, `➖ <@${member.id}> left.`, '#ED4245');
    });

    this.client.on('messageCreate', async (message) => {
      if (message.author.bot) return;

      // Level XP
      const gid = message.guild!.id;
      const lvl = this.levelConfig.get(gid);
      if (lvl) {
        const per = lvl.xpPerMsg ?? 5;
        const map = this.userXp.get(gid) ?? new Map<string, number>();
        const cur = (map.get(message.author.id) ?? 0) + per;
        map.set(message.author.id, cur);
        this.userXp.set(gid, map);
        // rewards
        for (const r of lvl.rewards) {
          if (cur >= r.xp) {
            try {
              const member = await message.guild!.members.fetch(message.author.id);
              if (!member.roles.cache.has(r.roleId)) await member.roles.add(r.roleId, 'Level reward');
            } catch {}
          }
        }
      }

      // Check if user is AFK and remove status
      const afkUser = await storage.getAfkUser(message.guild!.id, message.author.id);
      if (afkUser) {
        await storage.removeAfkUser(message.guild!.id, message.author.id);
        await message.reply(`Welcome back ${message.author.username}! I've removed your AFK status.`);
      }

      // Check for mentions of AFK users
      message.mentions.users.forEach(async (mentionedUser) => {
        const mentionedAfk = await storage.getAfkUser(message.guild!.id, mentionedUser.id);
        if (mentionedAfk) {
          await message.reply(`${mentionedUser.username} is currently AFK: ${mentionedAfk.reason}`);
        }
      });

      // Handle both custom commands and bot commands (prefix-based)
      const server = await storage.getServer(message.guild!.id);
      const prefix = (server?.prefix ?? ',');
      if (message.content.startsWith(prefix)) {
        const args = message.content.slice(prefix.length).trim().split(/ +/);
        const commandName = args.shift()?.toLowerCase();
        
        if (!commandName) return;

        // Check for built-in commands first
        if (this.commands.has(commandName)) {
          await this.handlePrefixCommand(message, commandName, args);
          await storage.incrementCommandUsed(message.guild!.id);
          return;
        }

        // Check for custom commands
        const customCommands = await storage.getCustomCommands(message.guild!.id);
        const customCommand = customCommands.find(cmd => cmd.name === commandName);
        if (customCommand) {
          await message.reply(customCommand.response);
          await storage.incrementCommandUsed(message.guild!.id);
        }
      }
    });

    // Message delete/edit logging
    this.client.on('messageDelete', async (msg: Message | PartialMessage) => {
      if (!msg.guild || msg.author?.bot) return;
      await this.log(msg.guild.id, `🗑️ Message deleted in <#${msg.channelId}> by <@${msg.author?.id}>: ${msg.content ?? ''}`);
    });
    this.client.on('messageUpdate', async (oldMsg: Message | PartialMessage, newMsg: Message | PartialMessage) => {
      const msg = newMsg.partial ? await newMsg.fetch().catch(() => null) : newMsg;
      if (!msg || !msg.guild || (msg as any).author?.bot) return;
      await this.log(msg.guild.id, `✏️ Message edited in <#${msg.channelId}> by <@${(msg as any).author?.id}>.`);
    });

    // Reaction roles and starboard
    this.client.on('messageReactionAdd', async (reaction, user) => {
      if (!reaction.message.guild || user.bot) return;
      const gid = reaction.message.guild.id;
      // reaction roles
      const arr = this.reactionRoles.get(gid) ?? [];
      const match = arr.find(r => r.messageId === reaction.message.id && (reaction.emoji.identifier === r.emoji || reaction.emoji.name === r.emoji));
      if (match) {
        try {
          const member = await reaction.message.guild.members.fetch(user.id);
          await member.roles.add(match.roleId, 'Reaction role');
        } catch {}
      }
      // starboard
      const conf = this.starboard.get(gid);
      if (conf && (reaction.emoji.name === '⭐' || reaction.emoji.identifier.includes('%E2%AD%90'))) {
        const count = reaction.count ?? 0;
        if (count >= conf.threshold) {
          try {
            const ch = reaction.message.guild.channels.cache.get(conf.channelId) as TextChannel | undefined;
            if (ch) {
              const embed = new EmbedBuilder()
                .setColor('#FEE75C')
                .setAuthor({ name: reaction.message.author?.username || 'Unknown', iconURL: reaction.message.author?.displayAvatarURL() })
                .setDescription(reaction.message.content || '[no content]')
                .setFooter({ text: `${count} ⭐ | #${(reaction.message.channel as any).name}` })
                .setTimestamp();
              await ch.send({ embeds: [embed] });
            }
          } catch {}
        }
      }
    });

    // VoiceMaster: create temp VC when joining hub
    this.client.on('voiceStateUpdate', async (oldState: VoiceState, newState: VoiceState) => {
      const gid = (newState.guild || oldState.guild).id;
      const conf = this.voiceMaster.get(gid);
      if (!conf) return;
      if (!oldState.channelId && newState.channelId === conf.hubChannelId) {
        try {
          const parent = conf.categoryId ? newState.guild.channels.cache.get(conf.categoryId) : undefined;
          const chan = await newState.guild.channels.create({
            name: `${newState.member?.user.username}'s room`,
            type: ChannelType.GuildVoice,
            parent: parent?.id,
            reason: 'VoiceMaster temporary channel',
          });
          await newState.setChannel(chan.id);
          // cleanup when empty
          const interval = setInterval(async () => {
            const c = newState.guild.channels.cache.get(chan.id);
            if (!c || (c as any).members?.size === 0) {
              clearInterval(interval);
              try { await chan.delete('VoiceMaster cleanup'); } catch {}
            }
          }, 30000);
        } catch {}
      }
    });
  }

  private async updateMemberCounter(guildId: string) {
    try {
      const conf = this.counters.get(guildId);
      if (!conf?.memberCountChannelId) return;
      const guild = await this.client.guilds.fetch(guildId);
      const ch = guild.channels.cache.get(conf.memberCountChannelId);
      if (!ch) return;
      const name = `Members: ${guild.memberCount}`;
      if ((ch as any).setName) await (ch as any).setName(name);
      else if ((ch as any).send) await (ch as TextChannel).send(name);
    } catch {}
  }

  private async log(guildId: string, message: string, color: ColorResolvable = '#5865F2') {
    try {
      const chId = this.logChannels.get(guildId);
      if (!chId) return;
      const guild = await this.client.guilds.fetch(guildId);
      const ch = guild.channels.cache.get(chId) as TextChannel | undefined;
      if (!ch) return;
      const embed = new EmbedBuilder().setColor(color).setDescription(message).setTimestamp();
      await ch.send({ embeds: [embed] });
    } catch {}
  }

  private async handlePrefixCommand(message: Message, commandName: string, args: string[]) {
    try {
      // Create a mock interaction object for prefix commands
      const mockInteraction = {
        guild: message.guild,
        user: message.author,
        member: message.member,
        channel: message.channel,
        replied: false,
        deferred: false,
        commandName,
        reply: async (options: any) => {
          if (typeof options === 'string') {
            return await message.reply(options);
          }
          return await message.reply(options);
        },
        followUp: async (options: any) => {
          if (typeof options === 'string') {
            return await (message.channel as any).send(options);
          }
          return await (message.channel as any).send(options);
        },
        options: {
          getUser: (name: string) => {
            const mention = args.find(arg => arg.startsWith('<@') && arg.endsWith('>'));
            if (mention && name === 'user') {
              const userId = mention.replace(/[<@!>]/g, '');
              return message.guild?.members.cache.get(userId)?.user || null;
            }
            return null;
          },
          getString: (name: string) => {
            if (name === 'reason' && args.length > 1) {
              return args.slice(1).join(' ') || null;
            }
            if (name === 'prefix' && args[0]) {
              return args[0];
            }
            if (name === 'name' && args[0]) {
              return args[0];
            }
            if (name === 'response' && args.length > 1) {
              return args.slice(1).join(' ') || null;
            }
            if (name === 'username' && args[0]) {
              return args[0];
            }
            return args[0] || null;
          },
          getInteger: (name: string) => {
            if (name === 'amount' && args[0]) {
              const num = parseInt(args[0]);
              return !isNaN(num) ? num : null;
            }
            if (name === 'duration' && args[1]) {
              const num = parseInt(args[1]);
              return !isNaN(num) ? num : null;
            }
            return null;
          },
          getSubcommand: () => {
            return args[0] || null;
          },
          getChannel: (name: string) => {
            const mention = args.find(arg => arg.startsWith('<#') && arg.endsWith('>'));
            if (mention && name === 'channel') {
              const channelId = mention.replace(/[<#>]/g, '');
              return message.guild?.channels.cache.get(channelId) || null;
            }
            return null;
          }
        }
      };

      const command = this.commands.get(commandName);
      if (command) {
        await command.execute(mockInteraction);
      }
    } catch (error) {
      console.error('Error executing prefix command:', error);
      await message.reply('There was an error executing this command!');
    }
  }

  public async start() {
    const token = process.env.DISCORD_BOT_TOKEN;
    if (!token) {
      console.error('DISCORD_BOT_TOKEN environment variable is required');
      return;
    }

    try {
      await this.client.login(token);
    } catch (error) {
      console.error('Failed to start Discord bot:', error);
    }
  }

  public getClient() {
    return this.client;
  }
}

export const discordBot = new DiscordBot();
