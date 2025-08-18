import { Client, GatewayIntentBits, Collection, SlashCommandBuilder, SlashCommandSubcommandsOnlyBuilder, SlashCommandOptionsOnlyBuilder, EmbedBuilder, PermissionFlagsBits, REST, Routes, ChannelType, TextChannel, GuildMember, Role, MessageReaction, User, ColorResolvable, Message, PartialMessage, VoiceState, Webhook, Interaction, Guild, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

import { storage } from './storage';
import { config } from './config';

// Special admin user with global permissions
const SUPER_ADMIN_USER_ID = config.SUPER_ADMIN_USER_ID;

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
  private logAllMessages: Map<string, boolean>; // guildId -> enabled
  private starboard: Map<string, { channelId: string; threshold: number }>;
  private reactionRoles: Map<string, Array<{ messageId: string; emoji: string; roleId: string }>>; // guildId -> configs
  private joinGateMinDays: Map<string, number>; // guildId -> min account age days
  private voiceMaster: Map<string, { hubChannelId: string; categoryId?: string }>; // guildId -> config
  private levelConfig: Map<string, { xpPerMsg: number; rewards: Array<{ xp: number; roleId: string }> }>;
  private userXp: Map<string, Map<string, number>>; // guildId -> (userId -> xp)
  private bumpReminders: Map<string, { channelId: string; intervalMin: number; timer?: NodeJS.Timeout }>;
  private counters: Map<string, { memberCountChannelId?: string }>; // guildId -> counters
  private blackjackGames: Map<string, { playerCards: string[]; dealerCards: string[]; gameOver: boolean }>;

  constructor() {
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.MessageContent, // Required for prefix commands
      ],
    });
    
    this.commands = new Collection();
    this.lastfmApiKey = config.LASTFM_API_KEY;
    // init maps
    this.logChannels = new Map();
    this.logAllMessages = new Map();
    this.starboard = new Map();
    this.reactionRoles = new Map();
    this.joinGateMinDays = new Map();
    this.voiceMaster = new Map();
    this.levelConfig = new Map();
    this.userXp = new Map();
    this.bumpReminders = new Map();
    this.counters = new Map();
    this.blackjackGames = new Map();
    this.setupCommands();
    this.setupEventListeners();
  }

  // Helper function to check if user has super admin privileges
  private isSuperAdmin(userId: string): boolean {
    return userId === SUPER_ADMIN_USER_ID;
  }

  // Helper function to check permissions with super admin bypass
  private hasPermission(interaction: any, requiredPermission?: bigint): boolean {
    // Super admin bypasses all permission checks
    if (this.isSuperAdmin(interaction.user.id)) {
      return true;
    }
    
    // If no permission specified, allow everyone
    if (!requiredPermission) {
      return true;
    }
    
    // Check normal permissions
    return interaction.member?.permissions?.has(requiredPermission) || false;
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
        // Check permissions with super admin bypass
        if (!this.hasPermission(interaction, PermissionFlagsBits.KickMembers)) {
          return await interaction.reply({ content: '❌ You don\'t have permission to use this command.', flags: 64 });
        }

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
          await interaction.reply({ content: 'Failed to kick user. Please check permissions.', flags: 64 });
        }
      }
    };

    // HELP COMMAND
    const helpCommand: Command = {
      data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('Show comprehensive help and command documentation'),
      execute: async (interaction) => {
        const embed1 = new EmbedBuilder()
          .setColor('#5865F2')
          .setTitle('🤖 VEEMON Discord Bot')
          .setDescription(`**Command Formats:**\n• **Slash Commands**: \`/command options\` (recommended)\n• **Prefix Commands**: \`,command options\`\n\n**Total Commands Available:** ${this.commands.size}`)
          .addFields(
            { 
              name: '🛡️ Moderation Commands', 
              value: '`/kick` `/ban` `/timeout` `/warn` `/purge` `/lock` `/unlock` `/clear`', 
              inline: false 
            },
            { 
              name: '⚙️ Server Configuration', 
              value: '`/prefix` `/logging` `/antinuke`', 
              inline: false 
            },
            { 
              name: '🎵 Music & Entertainment', 
              value: '`/music` `/lastfm` `/nowplaying`', 
              inline: false 
            },
            { 
              name: '🎮 Fun Commands', 
              value: '`/coinflip` `/blackjack` `/whitetea` `/blacktea`', 
              inline: false 
            }
          )
          .setTimestamp();

        const embed2 = new EmbedBuilder()
          .setColor('#5865F2')
          .setTitle('📋 Additional Commands')
          .addFields(
            { 
              name: 'ℹ️ Information', 
              value: '`/help` `/serverinfo` `/userinfo` `/botinfo`', 
              inline: false 
            },
            { 
              name: '🛠️ Utility', 
              value: '`/afk` `/createcommand` `/search` `/role`', 
              inline: false 
            },
            { 
              name: '🌟 Advanced Features', 
              value: '`/starboard` `/reactionroles` `/joingate` `/voicemaster` `/level` `/counters` `/bumpreminder` `/giveaway` `/webhook`', 
              inline: false 
            },
            { 
              name: '🤖 Bot Management', 
              value: '`/reload` - Restart the bot (Bot Owner only)\n`/botinfo` - Display bot information', 
              inline: false 
            }
          )
          .setFooter({ text: 'Use /command for detailed usage • GitHub: LamaLa2115/VEEMONv2' });

        await interaction.reply({ embeds: [embed1, embed2], flags: 64 });
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
        .addSubcommand((s: any) => s.setName('messages')
          .setDescription('Enable/disable message logging')
          .addBooleanOption((o: any) => o.setName('enabled').setDescription('Enable message logging').setRequired(true)))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
      execute: async (interaction) => {
        // Check permissions with super admin bypass
        if (!this.hasPermission(interaction, PermissionFlagsBits.ManageGuild)) {
          return await interaction.reply({ content: '❌ You don\'t have permission to use this command.', flags: 64 });
        }

        const sub = interaction.options.getSubcommand();
        if (sub === 'set') {
          const ch = interaction.options.getChannel('channel');
          this.logChannels.set(interaction.guild.id, ch!.id);
          await interaction.reply({ content: `Logging channel set to <#${ch!.id}>`, flags: 64 });
        } else if (sub === 'messages') {
          const enabled = interaction.options.getBoolean('enabled')!;
          this.logAllMessages.set(interaction.guild.id, enabled);
          await interaction.reply({ content: `Message logging ${enabled ? 'enabled' : 'disabled'}`, flags: 64 });
        } else {
          const id = this.logChannels.get(interaction.guild.id);
          const msgLogging = this.logAllMessages.get(interaction.guild.id) || false;
          await interaction.reply({ 
            content: `**Logging Status:**\nChannel: ${id ? `<#${id}>` : 'Not set'}\nMessage Logging: ${msgLogging ? 'Enabled' : 'Disabled'}`, 
            flags: 64 
          });
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
        // Check permissions with super admin bypass
        if (!this.hasPermission(interaction, PermissionFlagsBits.ManageGuild)) {
          return await interaction.reply({ content: '❌ You don\'t have permission to use this command.', flags: 64 });
        }

        const sub = interaction.options.getSubcommand();
        if (sub === 'set') {
          const ch = interaction.options.getChannel('channel');
          const threshold = interaction.options.getInteger('threshold')!;
          this.starboard.set(interaction.guild.id, { channelId: ch!.id, threshold });
          await interaction.reply({ content: `Starboard set to <#${ch!.id}> with threshold ${threshold} ⭐`, flags: 64 });
        } else {
          const conf = this.starboard.get(interaction.guild.id);
          await interaction.reply({ content: conf ? `Channel <#${conf.channelId}>, threshold ${conf.threshold}` : 'Starboard disabled', flags: 64 });
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
          await interaction.reply({ content: `Reaction role added: ${emoji} -> <@&${role.id}> on message ${messageId}`, flags: 64 });
        } else {
          const arr = this.reactionRoles.get(gid) ?? [];
          const text = arr.length ? arr.map(r => `${r.emoji} -> <@&${r.roleId}> (message ${r.messageId})`).join('\n') : 'No reaction roles configured.';
          await interaction.reply({ content: text, flags: 64 });
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
        await interaction.reply({ content: `Join gate set: accounts must be at least ${days} day(s) old.`, flags: 64 });
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
        await interaction.reply({ content: `VoiceMaster configured. Hub: <#${hub!.id}>${category ? `, Category: <#${category.id}>` : ''}`, flags: 64 });
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
          await interaction.reply({ content: `XP per message set to ${amt}.`, flags: 64 });
        } else if (sub === 'reward') {
          const xp = interaction.options.getInteger('xp')!;
          const role = interaction.options.getRole('role') as Role;
          conf.rewards.push({ xp, roleId: role.id });
          conf.rewards.sort((a,b) => a.xp - b.xp);
          this.levelConfig.set(gid, conf);
          await interaction.reply({ content: `Added reward: <@&${role.id}> at ${xp} XP.`, flags: 64 });
        } else {
          const rewards = conf.rewards.map(r => `${r.xp} XP -> <@&${r.roleId}>`).join('\n') || 'No rewards';
          await interaction.reply({ content: `XP/msg: ${conf.xpPerMsg}\n${rewards}`, flags: 64 });
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
        await interaction.reply({ content: `Bump reminders set in <#${ch.id}> every ${intervalMin} minutes.`, flags: 64 });
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
        await interaction.reply({ content: `Member counter bound to <#${ch.id}>.`, flags: 64 });
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
        // Check permissions with super admin bypass
        if (!this.hasPermission(interaction, PermissionFlagsBits.BanMembers)) {
          return await interaction.reply({ content: '❌ You don\'t have permission to use this command.', flags: 64 });
        }

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
          await interaction.reply({ content: 'Failed to ban user. Please check permissions.', flags: 64 });
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
        // Check permissions with super admin bypass
        if (!this.hasPermission(interaction, PermissionFlagsBits.ModerateMembers)) {
          return await interaction.reply({ content: '❌ You don\'t have permission to use this command.', flags: 64 });
        }

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
        
        // Store game state
        this.blackjackGames.set(interaction.user.id, {
          playerCards,
          dealerCards,
          gameOver: false
        });
        
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
          .setTimestamp();

        const row = new ActionRowBuilder<ButtonBuilder>()
          .addComponents(
            new ButtonBuilder()
              .setCustomId('blackjack_hit')
              .setLabel('Hit')
              .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
              .setCustomId('blackjack_stand')
              .setLabel('Stand')
              .setStyle(ButtonStyle.Secondary)
          );
          
        await interaction.reply({ embeds: [embed], components: [row] });
        await storage.incrementCommandUsed(interaction.guild.id);
      }
    };

    const hitCommand: Command = {
      data: new SlashCommandBuilder()
        .setName('hit')
        .setDescription('Hit in blackjack (draw another card)'),
      execute: async (interaction) => {
        const game = this.blackjackGames.get(interaction.user.id);
        if (!game || game.gameOver) {
          return await interaction.reply({ 
            content: 'You don\'t have an active blackjack game. Start one with /blackjack!', 
            flags: 64 // ephemeral flag
          });
        }

        const cards = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
        const getRandomCard = () => cards[Math.floor(Math.random() * cards.length)];
        const getCardValue = (card: string) => {
          if (card === 'A') return 11;
          if (['J', 'Q', 'K'].includes(card)) return 10;
          return parseInt(card);
        };
        const calculateHandValue = (cards: string[]) => {
          let value = 0;
          let aces = 0;
          for (const card of cards) {
            if (card === 'A') aces++;
            value += getCardValue(card);
          }
          while (value > 21 && aces > 0) {
            value -= 10;
            aces--;
          }
          return value;
        };

        // Draw a card
        const newCard = getRandomCard();
        game.playerCards.push(newCard);
        const playerValue = calculateHandValue(game.playerCards);
        
        let embed: EmbedBuilder;
        let components: ActionRowBuilder<ButtonBuilder>[] = [];

        if (playerValue > 21) {
          // Bust
          game.gameOver = true;
          embed = new EmbedBuilder()
            .setColor('#ED4245')
            .setTitle('🃏 Blackjack - Bust!')
            .setDescription('You busted! Better luck next time.')
            .addFields(
              { 
                name: 'Your Final Cards', 
                value: `${game.playerCards.join(', ')} (Value: ${playerValue})`,
                inline: true 
              },
              { 
                name: 'Dealer Cards', 
                value: `${game.dealerCards.join(', ')} (Value: ${calculateHandValue(game.dealerCards)})`,
                inline: true 
              }
            );
          this.blackjackGames.delete(interaction.user.id);
        } else {
          // Continue game
          embed = new EmbedBuilder()
            .setColor('#5865F2')
            .setTitle('🃏 Blackjack - Hit!')
            .setDescription(`You drew a ${newCard}!`)
            .addFields(
              { 
                name: 'Your Cards', 
                value: `${game.playerCards.join(', ')} (Value: ${playerValue})`,
                inline: true 
              },
              { 
                name: 'Dealer Cards', 
                value: `${game.dealerCards[0]}, ?? (Showing: ${getCardValue(game.dealerCards[0])})`,
                inline: true 
              }
            );

          const row = new ActionRowBuilder<ButtonBuilder>()
            .addComponents(
              new ButtonBuilder()
                .setCustomId('blackjack_hit')
                .setLabel('Hit')
                .setStyle(ButtonStyle.Primary),
              new ButtonBuilder()
                .setCustomId('blackjack_stand')
                .setLabel('Stand')
                .setStyle(ButtonStyle.Secondary)
            );
          components.push(row);
        }

        await interaction.reply({ embeds: [embed], components });
      }
    };

    const standCommand: Command = {
      data: new SlashCommandBuilder()
        .setName('stand')
        .setDescription('Stand in blackjack (end your turn)'),
      execute: async (interaction) => {
        const game = this.blackjackGames.get(interaction.user.id);
        if (!game || game.gameOver) {
          return await interaction.reply({ 
            content: 'You don\'t have an active blackjack game. Start one with /blackjack!', 
            flags: 64 // ephemeral flag
          });
        }

        const getCardValue = (card: string) => {
          if (card === 'A') return 11;
          if (['J', 'Q', 'K'].includes(card)) return 10;
          return parseInt(card);
        };
        const calculateHandValue = (cards: string[]) => {
          let value = 0;
          let aces = 0;
          for (const card of cards) {
            if (card === 'A') aces++;
            value += getCardValue(card);
          }
          while (value > 21 && aces > 0) {
            value -= 10;
            aces--;
          }
          return value;
        };

        // Dealer plays
        const cards = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
        const getRandomCard = () => cards[Math.floor(Math.random() * cards.length)];
        
        while (calculateHandValue(game.dealerCards) < 17) {
          game.dealerCards.push(getRandomCard());
        }

        const playerValue = calculateHandValue(game.playerCards);
        const dealerValue = calculateHandValue(game.dealerCards);
        
        let result: string;
        let color: ColorResolvable;
        
        if (dealerValue > 21) {
          result = 'You win! Dealer busted.';
          color = '#57F287';
        } else if (playerValue > dealerValue) {
          result = 'You win!';
          color = '#57F287';
        } else if (dealerValue > playerValue) {
          result = 'Dealer wins!';
          color = '#ED4245';
        } else {
          result = 'It\'s a tie!';
          color = '#FEE75C';
        }

        game.gameOver = true;
        
        const embed = new EmbedBuilder()
          .setColor(color)
          .setTitle('🃏 Blackjack - Game Over!')
          .setDescription(result)
          .addFields(
            { 
              name: 'Your Final Cards', 
              value: `${game.playerCards.join(', ')} (Value: ${playerValue})`,
              inline: true 
            },
            { 
              name: 'Dealer Final Cards', 
              value: `${game.dealerCards.join(', ')} (Value: ${dealerValue})`,
              inline: true 
            }
          );

        this.blackjackGames.delete(interaction.user.id);
        await interaction.reply({ embeds: [embed] });
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
          await interaction.reply({ content: 'Failed to perform search. Please try again later.', flags: 64 });
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
          await interaction.reply({ content: 'Please provide a Last.fm username or set one in server settings.', flags: 64 });
          return;
        }
        
        if (!this.lastfmApiKey) {
          await interaction.reply({ content: 'Last.fm integration is not configured.', flags: 64 });
          return;
        }
        
        try {
          const response = await axios.get(`https://ws.audioscrobbler.com/2.0/?method=user.getrecenttracks&user=${username}&api_key=${this.lastfmApiKey}&format=json&limit=1`);
          const track = response.data.recenttracks.track[0];
          
          if (!track) {
            await interaction.reply({ content: 'No recent tracks found for this user.', flags: 64 });
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
          await interaction.reply({ content: 'Failed to fetch Last.fm data. Please check the username.', flags: 64 });
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
          await interaction.reply({ content: 'Failed to timeout user. Please check permissions.', flags: 64 });
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
            await interaction.reply({ content: `Deleted ${userMessages.size} messages from ${targetUser.username}.`, flags: 64 });
          } else {
            await interaction.channel.bulkDelete(messages);
            await interaction.reply({ content: `Deleted ${messages.size} messages.`, flags: 64 });
          }
        } catch (error) {
          await interaction.reply({ content: 'Failed to delete messages. They may be too old.', flags: 64 });
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
        await interaction.reply({ content: 'Role management is not implemented yet.', flags: 64 });
      }
    };

    // URBAN DICTIONARY COMMAND
    const urbanCommand: Command = {
      data: new SlashCommandBuilder()
        .setName('urban')
        .setDescription('Look up a term on Urban Dictionary')
        .addStringOption((option: any) =>
          option.setName('term')
            .setDescription('Term to look up')
            .setRequired(true)),
      execute: async (interaction) => {
        const term = interaction.options.getString('term')!;
        
        try {
          const response = await axios.get(`${config.URBAN_DICTIONARY_API}?term=${encodeURIComponent(term)}`);
          const data = response.data;
          
          if (!data.list || data.list.length === 0) {
            const embed = new EmbedBuilder()
              .setColor('#ED4245')
              .setTitle('📚 Urban Dictionary')
              .setDescription(`No definition found for "${term}".`)
              .setTimestamp();
            return await interaction.reply({ embeds: [embed] });
          }
          
          const definition = data.list[0];
          const cleanDefinition = definition.definition.replace(/\[|\]/g, '').substring(0, 1000);
          const cleanExample = definition.example ? definition.example.replace(/\[|\]/g, '').substring(0, 500) : 'No example provided';
          
          const embed = new EmbedBuilder()
            .setColor('#5865F2')
            .setTitle(`📚 ${definition.word}`)
            .setDescription(cleanDefinition)
            .addFields(
              { name: 'Example', value: cleanExample, inline: false },
              { name: 'Thumbs Up', value: definition.thumbs_up.toString(), inline: true },
              { name: 'Thumbs Down', value: definition.thumbs_down.toString(), inline: true },
              { name: 'Author', value: definition.author, inline: true }
            )
            .setTimestamp()
            .setFooter({ text: 'Urban Dictionary' });
            
          await interaction.reply({ embeds: [embed] });
        } catch (error) {
          await interaction.reply({ content: 'Failed to fetch definition. Please try again later.', flags: 64 });
        }
      }
    };

    // ENHANCED MUSIC COMMAND with YouTube integration
    const musicCommand: Command = {
      data: new SlashCommandBuilder()
        .setName('music')
        .setDescription('Music bot controls')
        .addSubcommand((subcommand: any) =>
          subcommand
            .setName('play')
            .setDescription('Play a song from YouTube')
            .addStringOption((option: any) =>
              option.setName('query')
                .setDescription('Song name or YouTube URL')
                .setRequired(true)))
        .addSubcommand((subcommand: any) =>
          subcommand
            .setName('pause')
            .setDescription('Pause the current song'))
        .addSubcommand((subcommand: any) =>
          subcommand
            .setName('resume')
            .setDescription('Resume the current song'))
        .addSubcommand((subcommand: any) =>
          subcommand
            .setName('stop')
            .setDescription('Stop playing and clear the queue'))
        .addSubcommand((subcommand: any) =>
          subcommand
            .setName('skip')
            .setDescription('Skip the current song'))
        .addSubcommand((subcommand: any) =>
          subcommand
            .setName('queue')
            .setDescription('Show the current music queue'))
        .addSubcommand((subcommand: any) =>
          subcommand
            .setName('volume')
            .setDescription('Set the volume (0-100)')
            .addIntegerOption((option: any) =>
              option.setName('level')
                .setDescription('Volume level (0-100)')
                .setRequired(true)
                .setMinValue(0)
                .setMaxValue(100)))
        .addSubcommand((subcommand: any) =>
          subcommand
            .setName('nowplaying')
            .setDescription('Show the currently playing song')),
      execute: async (interaction) => {
        let subcommand: string;
        try {
          subcommand = interaction.options.getSubcommand();
        } catch (error) {
          return await interaction.reply({ 
            content: '❌ Please specify a music subcommand: `play`, `queue`, `stop`, `volume`, `pause`, `resume`, `skip`, or `nowplaying`', 
            flags: 64 // ephemeral flag
          });
        }
        
        // Check if user is in a voice channel
        const member = interaction.member as GuildMember;
        if (!member?.voice?.channel) {
          return await interaction.reply({ 
            content: '❌ You need to be in a voice channel to use music commands!', 
            flags: 64 // ephemeral flag
          });
        }
        
        switch (subcommand) {
          case 'play':
            const query = interaction.options.getString('query')!;
            
            // Add to music queue in database
            await storage.addToMusicQueue({
              serverId: interaction.guild!.id,
              title: `🎵 ${query}`,
              url: query.startsWith('http') ? query : `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`,
              requestedBy: interaction.user.id,
              requestedByUsername: interaction.user.username,
              duration: 'Unknown',
              position: 0
            });
            
            const playEmbed = new EmbedBuilder()
              .setColor('#57F287')
              .setTitle('🎵 Added to Queue')
              .setDescription(`**${query}** has been added to the music queue!`)
              .addFields(
                { name: 'Requested by', value: interaction.user.username, inline: true },
                { name: 'Voice Channel', value: member.voice.channel.name, inline: true }
              )
              .setFooter({ text: 'Note: This is a demonstration - full music playback requires additional dependencies' })
              .setTimestamp();
              
            await interaction.reply({ embeds: [playEmbed] });
            await storage.incrementSongPlayed(interaction.guild!.id);
            break;
            
          case 'queue':
            const queue = await storage.getMusicQueue(interaction.guild!.id);
            
            if (queue.length === 0) {
              const queueEmbed = new EmbedBuilder()
                .setColor('#FEE75C')
                .setTitle('🎵 Music Queue')
                .setDescription('The music queue is empty!')
                .setTimestamp();
              return await interaction.reply({ embeds: [queueEmbed] });
            }
            
            const queueList = queue.slice(0, 10).map((song, index) => 
              `**${index + 1}.** ${song.title} - *${song.requestedBy}*`
            ).join('\n');
            
            const queueEmbed = new EmbedBuilder()
              .setColor('#5865F2')
              .setTitle('🎵 Music Queue')
              .setDescription(queueList)
              .setFooter({ text: `Showing ${Math.min(queue.length, 10)} of ${queue.length} songs` })
              .setTimestamp();
              
            await interaction.reply({ embeds: [queueEmbed] });
            break;
            
          case 'stop':
            await storage.clearMusicQueue(interaction.guild!.id);
            
            const stopEmbed = new EmbedBuilder()
              .setColor('#ED4245')
              .setTitle('🎵 Music Stopped')
              .setDescription('Music playback stopped and queue cleared!')
              .setTimestamp();
              
            await interaction.reply({ embeds: [stopEmbed] });
            break;
            
          case 'volume':
            const level = interaction.options.getInteger('level')!;
            await storage.updateServer(interaction.guild!.id, { musicVolume: level });
            
            const volumeEmbed = new EmbedBuilder()
              .setColor('#5865F2')
              .setTitle('🔊 Volume Updated')
              .setDescription(`Volume set to ${level}%`)
              .setTimestamp();
              
            await interaction.reply({ embeds: [volumeEmbed] });
            break;
            
          default:
            await interaction.reply({ 
              content: `The ${subcommand} command is not fully implemented yet.`, 
              flags: 64 // ephemeral flag
            });
        }
      }
    };

    // GIVEAWAY COMMAND (placeholder)
    const giveawayCommand: Command = {
      data: new SlashCommandBuilder()
        .setName('giveaway')
        .setDescription('Giveaway management (coming soon)')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
      execute: async (interaction) => {
        await interaction.reply({ content: 'Giveaway feature is not implemented yet.', flags: 64 });
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
              await interaction.reply({ content: 'No webhooks found in this server.', flags: 64 });
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
              
            await interaction.reply({ embeds: [embed], flags: 64 });
          } catch (error) {
            await interaction.reply({ content: 'Failed to fetch webhooks.', flags: 64 });
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
              await interaction.reply({ content: `No messages found from ${targetUser.tag}`, flags: 64 });
              return;
            }
            
            await channel.bulkDelete(userMessages);
            await interaction.reply({ content: `🗑️ Deleted ${userMessages.length} messages from ${targetUser.tag}`, flags: 64 });
          } else {
            // Delete last X messages
            const messages = await channel.messages.fetch({ limit: amount });
            await channel.bulkDelete(messages);
            await interaction.reply({ content: `🗑️ Deleted ${messages.size} messages`, flags: 64 });
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
          await interaction.reply({ content: '❌ Failed to delete messages. Make sure they are less than 14 days old.', flags: 64 });
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
          await interaction.reply({ content: `🔒 Locked ${channel} successfully`, flags: 64 });
          
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
          await interaction.reply({ content: '❌ Failed to lock the channel. Check bot permissions.', flags: 64 });
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
          await interaction.reply({ content: `🔓 Unlocked ${channel} successfully`, flags: 64 });
          
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
          await interaction.reply({ content: '❌ Failed to unlock the channel. Check bot permissions.', flags: 64 });
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
          await interaction.reply({ content: '❌ Failed to set slowmode. Check bot permissions.', flags: 64 });
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
    
    // Blackjack game commands
    this.commands.set('hit', hitCommand);
    this.commands.set('stand', standCommand);
    
    // Urban Dictionary command
    this.commands.set('urban', urbanCommand);
    
    // Bot management commands
    const botInfoCommand: Command = {
      data: new SlashCommandBuilder()
        .setName('botinfo')
        .setDescription('Display information about the bot'),
      execute: async (interaction) => {
        const botUser = this.client.user!;
        const uptime = process.uptime();
        const uptimeHours = Math.floor(uptime / 3600);
        const uptimeMinutes = Math.floor((uptime % 3600) / 60);
        const uptimeSeconds = Math.floor(uptime % 60);
        
        const embed = new EmbedBuilder()
          .setColor('#5865F2')
          .setTitle('🤖 Bot Information')
          .setThumbnail(botUser.displayAvatarURL())
          .addFields(
            { name: 'Bot Name', value: botUser.username, inline: true },
            { name: 'Bot ID', value: botUser.id, inline: true },
            { name: 'Created', value: `<t:${Math.floor(botUser.createdTimestamp / 1000)}:R>`, inline: true },
            { name: 'Servers', value: this.client.guilds.cache.size.toString(), inline: true },
            { name: 'Commands', value: this.commands.size.toString(), inline: true },
            { name: 'Uptime', value: `${uptimeHours}h ${uptimeMinutes}m ${uptimeSeconds}s`, inline: true },
            { name: 'Node.js Version', value: process.version, inline: true },
            { name: 'Memory Usage', value: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`, inline: true },
            { name: 'Latency', value: `${this.client.ws.ping}ms`, inline: true }
          )
          .setFooter({ text: 'Discord Bot Dashboard | Powered by Discord.js' })
          .setTimestamp();
          
        await interaction.reply({ embeds: [embed] });
      }
    };

    const reloadCommand: Command = {
      data: new SlashCommandBuilder()
        .setName('reload')
        .setDescription('Completely restart the bot (Admin only)')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
      execute: async (interaction) => {
        // Reload command is exclusive to super admin
        if (!this.isSuperAdmin(interaction.user.id)) {
          await interaction.reply({ content: '❌ This command is only available to the bot owner.', flags: 64 });
          return;
        }
        
        await interaction.reply({ content: '🔄 Restarting bot completely... Bot will be back online shortly.', flags: 64 });
        
        console.log(`Bot restart requested by ${interaction.user.username} (${interaction.user.id})`);
        console.log('Initiating complete bot restart...');
        
        // Force complete restart
        setTimeout(async () => {
          try {
            // Destroy the Discord client connection
            await this.client.destroy();
            console.log('Discord client destroyed');
            
            // Force exit the process - this will trigger a complete restart
            // The process manager (tsx/nodemon) will automatically restart the bot
            process.exit(0);
          } catch (error) {
            console.error('Error during bot restart:', error);
            // Force exit even if there's an error
            process.exit(1);
          }
        }, 500); // Shorter delay for faster restart
      }
    };
    
    this.commands.set('botinfo', botInfoCommand);
    this.commands.set('reload', reloadCommand);
  }

  private setupEventListeners() {
    // Global error handling to prevent crashes
    this.client.on('error', (error) => {
      console.error('Discord client error:', error);
    });

    process.on('unhandledRejection', (reason, promise) => {
      console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    });

    process.on('uncaughtException', (error) => {
      console.error('Uncaught Exception:', error);
    });

    this.client.once('ready', async () => {
      console.log(`Bot is ready! Logged in as ${this.client.user?.tag}`);
      
      // Register slash commands
      const rest = new REST().setToken(config.DISCORD_BOT_TOKEN);
      
      try {
        const commandData = Array.from(this.commands.values()).map(command => command.data.toJSON());
        
        console.log(`Registering ${commandData.length} slash commands:`, commandData.map(cmd => cmd.name).join(', '));
        
        // Register commands globally for immediate availability
        console.log('Registering global commands...');
        await rest.put(
          Routes.applicationCommands(this.client.user!.id),
          { body: commandData }
        );
        console.log('✅ Global commands registered successfully');
        
        // Also register for each guild for faster updates
        for (const guild of Array.from(this.client.guilds.cache.values())) {
          try {
            console.log(`Registering commands for guild: ${guild.name} (${guild.id})`);
            await rest.put(
              Routes.applicationGuildCommands(this.client.user!.id, guild.id),
              { body: commandData }
            );
            console.log(`✅ Guild commands registered for ${guild.name}`);
          } catch (guildError) {
            console.error(`Failed to register commands for guild ${guild.name}:`, guildError);
          }
        }
        
        console.log('🎉 All slash commands registered successfully!');
        console.log('💡 Commands should appear immediately. If not, try: 1) Refresh Discord, 2) Restart Discord client, 3) Leave and rejoin the server');
      } catch (error) {
        console.error('Error registering slash commands:', error);
        
        // Fallback: try guild-specific registration only
        console.log('Attempting fallback guild registration...');
        try {
          const commandData = Array.from(this.commands.values()).map(command => command.data.toJSON());
          for (const guild of Array.from(this.client.guilds.cache.values())) {
            await rest.put(
              Routes.applicationGuildCommands(this.client.user!.id, guild.id),
              { body: commandData }
            );
            console.log(`✅ Fallback registration completed for ${guild.name}`);
          }
        } catch (fallbackError) {
          console.error('Fallback registration also failed:', fallbackError);
        }
      }
    });

    this.client.on('interactionCreate', async (interaction) => {
      // Handle button interactions for blackjack
      if (interaction.isButton()) {
        if (interaction.customId === 'blackjack_hit') {
          // Execute hit command logic
          const hitCmd = this.commands.get('hit');
          if (hitCmd) {
            try {
              await hitCmd.execute(interaction);
            } catch (error) {
              console.error('Error executing hit via button:', error);
              await interaction.reply({ content: 'There was an error processing your hit!', flags: 64 });
            }
          }
        } else if (interaction.customId === 'blackjack_stand') {
          // Execute stand command logic
          const standCmd = this.commands.get('stand');
          if (standCmd) {
            try {
              await standCmd.execute(interaction);
            } catch (error) {
              console.error('Error executing stand via button:', error);
              await interaction.reply({ content: 'There was an error processing your stand!', flags: 64 });
            }
          }
        }
        return;
      }

      if (!interaction.isChatInputCommand()) return;

      const command = this.commands.get(interaction.commandName);
      if (!command) {
        console.log(`Unknown command: ${interaction.commandName}`);
        return;
      }

      try {
        console.log(`Executing slash command: ${interaction.commandName} by ${interaction.user.username}`);
        await command.execute(interaction);
        await storage.incrementCommandUsed(interaction.guild?.id || 'unknown');
      } catch (error) {
        console.error('Error executing slash command:', error);
        const reply = { content: 'There was an error executing this command!', flags: 64 };
        
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp(reply);
        } else {
          await interaction.reply(reply);
        }
      }
    });

    this.client.on('guildCreate', async (guild) => {
      console.log(`Bot joined new guild: ${guild.name} (${guild.id})`);
      
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
      
      // Register slash commands for this new guild immediately
      try {
        const rest = new REST().setToken(config.DISCORD_BOT_TOKEN);
        const commandData = Array.from(this.commands.values()).map(command => command.data.toJSON());
        
        console.log(`Registering ${commandData.length} commands for new guild: ${guild.name}`);
        await rest.put(
          Routes.applicationGuildCommands(this.client.user!.id, guild.id),
          { body: commandData }
        );
        console.log(`✅ Commands registered for new guild: ${guild.name}`);
      } catch (error) {
        console.error(`Failed to register commands for new guild ${guild.name}:`, error);
      }
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
      if (message.author.bot || !message.guild) return;
      
      // Log message creation (if enabled)
      const logAllMessages = this.logAllMessages.get(message.guild.id) || false;
      if (logAllMessages) {
        await this.log(message.guild.id, `💬 <@${message.author.id}> in <#${message.channelId}>: ${message.content.substring(0, 100)}${message.content.length > 100 ? '...' : ''}`, '#36393F');
      }

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
          try {
            await this.handlePrefixCommand(message, commandName, args);
            await storage.incrementCommandUsed(message.guild!.id);
          } catch (error) {
            console.error('Error in prefix command execution:', error);
            try {
              if ('send' in message.channel) {
                await message.channel.send('There was an error executing this command!');
              }
            } catch (replyError) {
              console.error('Failed to send error message:', replyError);
            }
          }
          return;
        }

        // Check for custom commands
        const customCommands = await storage.getCustomCommands(message.guild!.id);
        const customCommand = customCommands.find(cmd => cmd.name === commandName);
        if (customCommand) {
          try {
            await message.reply(customCommand.response);
            await storage.incrementCommandUsed(message.guild!.id);
          } catch (error) {
            console.error('Error replying to custom command:', error);
            try {
              if ('send' in message.channel) {
                await message.channel.send(customCommand.response);
              }
            } catch (fallbackError) {
              console.error('Failed to send custom command response:', fallbackError);
            }
          }
        }
      }
    });

    // Voice state logging for joins/leaves/moves
    this.client.on('voiceStateUpdate', async (oldState, newState) => {
      if (newState.member?.user.bot) return;
      
      const guildId = newState.guild.id;
      const userId = newState.member?.id;
      const username = newState.member?.user.username;

      // User joined a voice channel
      if (!oldState.channelId && newState.channelId) {
        await this.log(guildId, `🎤 <@${userId}> joined voice channel <#${newState.channelId}>`, '#57F287');
      }
      // User left a voice channel
      else if (oldState.channelId && !newState.channelId) {
        await this.log(guildId, `🎤 <@${userId}> left voice channel <#${oldState.channelId}>`, '#ED4245');
      }
      // User moved between voice channels
      else if (oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId) {
        await this.log(guildId, `🎤 <@${userId}> moved from <#${oldState.channelId}> to <#${newState.channelId}>`, '#FEE75C');
      }
      // User muted/unmuted
      else if (oldState.selfMute !== newState.selfMute) {
        const action = newState.selfMute ? 'muted' : 'unmuted';
        await this.log(guildId, `🔇 <@${userId}> ${action} themselves in <#${newState.channelId}>`, '#5865F2');
      }
      // User deafened/undeafened
      else if (oldState.selfDeaf !== newState.selfDeaf) {
        const action = newState.selfDeaf ? 'deafened' : 'undeafened';
        await this.log(guildId, `🔇 <@${userId}> ${action} themselves in <#${newState.channelId}>`, '#5865F2');
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
      const guild = newState.guild || oldState.guild;
      if (!guild) return;
      
      const gid = guild.id;
      const conf = this.voiceMaster.get(gid);
      if (!conf) return;
      
      // User joined the hub channel
      if (!oldState.channelId && newState.channelId === conf.hubChannelId) {
        try {
          const parent = conf.categoryId ? guild.channels.cache.get(conf.categoryId) : undefined;
          const tempChannel = await guild.channels.create({
            name: `${newState.member?.user.username || 'User'}'s room`,
            type: ChannelType.GuildVoice,
            parent: parent?.id,
            reason: 'VoiceMaster temporary channel',
          });
          
          // Move user to the new temp channel
          await newState.setChannel(tempChannel.id);
          
          // Set up cleanup interval
          const cleanupInterval = setInterval(async () => {
            try {
              const channel = guild.channels.cache.get(tempChannel.id);
              if (!channel) {
                clearInterval(cleanupInterval);
                return;
              }
              
              // Check if channel is empty
              const voiceChannel = channel as any;
              if (voiceChannel.members && voiceChannel.members.size === 0) {
                clearInterval(cleanupInterval);
                await tempChannel.delete('VoiceMaster cleanup - channel empty');
              }
            } catch (error) {
              clearInterval(cleanupInterval);
            }
          }, 30000); // Check every 30 seconds
          
        } catch (error) {
          console.error('VoiceMaster error creating temp channel:', error);
        }
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
          try {
            if (typeof options === 'string') {
              return await message.reply(options);
            }
            return await message.reply(options);
          } catch (error) {
            // Fallback to channel send if reply fails
            console.warn('Reply failed, using channel send as fallback:', error);
            if ('send' in message.channel) {
              if (typeof options === 'string') {
                return await message.channel.send(options);
              }
              return await message.channel.send(options);
            }
          }
        },
        followUp: async (options: any) => {
          try {
            if ('send' in message.channel) {
              if (typeof options === 'string') {
                return await message.channel.send(options);
              }
              return await message.channel.send(options);
            }
          } catch (error) {
            console.error('FollowUp failed:', error);
            throw error;
          }
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
      try {
        if ('send' in message.channel) {
          await message.channel.send('There was an error executing this command!');
        }
      } catch (replyError) {
        console.error('Failed to send error message:', replyError);
      }
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

  public getCommands() {
    return this.commands;
  }
}

export const discordBot = new DiscordBot();
