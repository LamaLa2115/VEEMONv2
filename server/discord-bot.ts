import { Client, GatewayIntentBits, Collection, SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, REST, Routes } from 'discord.js';
import { storage } from './storage';
import { insertModerationLogSchema, insertUserWarningSchema, insertAfkUserSchema } from '@shared/schema';
import axios from 'axios';

interface Command {
  data: SlashCommandBuilder | Omit<SlashCommandBuilder, "addSubcommand" | "addSubcommandGroup">;
  execute: (interaction: any) => Promise<void>;
}

class DiscordBot {
  private client: Client;
  private commands: Collection<string, Command>;
  private lastfmApiKey: string;

  constructor() {
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildVoiceStates,
      ],
    });
    
    this.commands = new Collection();
    this.lastfmApiKey = process.env.LASTFM_API_KEY || '';
    this.setupCommands();
    this.setupEventListeners();
  }

  private setupCommands() {
    // Moderation Commands
    const kickCommand: Command = {
      data: new SlashCommandBuilder()
        .setName('kick')
        .setDescription('Kick a user from the server')
        .addUserOption(option => 
          option.setName('user')
            .setDescription('The user to kick')
            .setRequired(true))
        .addStringOption(option =>
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

    const banCommand: Command = {
      data: new SlashCommandBuilder()
        .setName('ban')
        .setDescription('Ban a user from the server')
        .addUserOption(option => 
          option.setName('user')
            .setDescription('The user to ban')
            .setRequired(true))
        .addStringOption(option =>
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
        .addUserOption(option => 
          option.setName('user')
            .setDescription('The user to warn')
            .setRequired(true))
        .addStringOption(option =>
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
        .addStringOption(option =>
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
        .addStringOption(option =>
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
        .addStringOption(option =>
          option.setName('name')
            .setDescription('Command name')
            .setRequired(true))
        .addStringOption(option =>
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
        .addStringOption(option =>
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
        .addStringOption(option =>
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
        .addSubcommand(subcommand =>
          subcommand
            .setName('toggle')
            .setDescription('Enable/disable antinuke protection')
            .addBooleanOption(option =>
              option.setName('enabled')
                .setDescription('Enable or disable antinuke')
                .setRequired(true)))
        .addSubcommand(subcommand =>
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
        .addSubcommand(subcommand =>
          subcommand
            .setName('set')
            .setDescription('Set a new prefix')
            .addStringOption(option =>
              option.setName('prefix')
                .setDescription('New prefix for the bot')
                .setRequired(true)
                .setMaxLength(5)))
        .addSubcommand(subcommand =>
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
          const currentPrefix = server?.prefix || '!';
          
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
        .addUserOption(option =>
          option.setName('user')
            .setDescription('User to timeout')
            .setRequired(true))
        .addIntegerOption(option =>
          option.setName('duration')
            .setDescription('Timeout duration in minutes')
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(40320))
        .addStringOption(option =>
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
        .addIntegerOption(option =>
          option.setName('amount')
            .setDescription('Number of messages to delete (1-100)')
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(100))
        .addUserOption(option =>
          option.setName('user')
            .setDescription('Only delete messages from this user'))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
      execute: async (interaction) => {
        const amount = interaction.options.getInteger('amount');
        const targetUser = interaction.options.getUser('user');
        
        try {
          const messages = await interaction.channel.messages.fetch({ limit: amount });
          
          if (targetUser) {
            const userMessages = messages.filter(msg => msg.author.id === targetUser.id);
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
        .setDescription('Manage user roles')
        .addSubcommand(subcommand =>
          subcommand
            .setName('add')
            .setDescription('Add a role to a user')
            .addUserOption(option =>
              option.setName('user')
                .setDescription('User to add role to')
                .setRequired(true))
            .addRoleOption(option =>
              option.setName('role')
                .setDescription('Role to add')
                .setRequired(true)))
        .addSubcommand(subcommand =>
          subcommand
            .setName('remove')
            .setDescription('Remove a role from a user')
            .addUserOption(option =>
              option.setName('user')
                .setDescription('User to remove role from')
                .setRequired(true))
            .addRoleOption(option =>
              option.setName('role')
                .setDescription('Role to remove')
                .setRequired(true)))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),
      execute: async (interaction) => {
        const subcommand = interaction.options.getSubcommand();
        const user = interaction.options.getUser('user');
        const role = interaction.options.getRole('role');
        
        try {
          const member = await interaction.guild.members.fetch(user.id);
          
          if (subcommand === 'add') {
            await member.roles.add(role);
            const embed = new EmbedBuilder()
              .setColor('#57F287')
              .setTitle('✅ Role Added')
              .setDescription(`Added **${role.name}** role to ${user.username}`)
              .setTimestamp();
            await interaction.reply({ embeds: [embed] });
          } else if (subcommand === 'remove') {
            await member.roles.remove(role);
            const embed = new EmbedBuilder()
              .setColor('#ED4245')
              .setTitle('❌ Role Removed')
              .setDescription(`Removed **${role.name}** role from ${user.username}`)
              .setTimestamp();
            await interaction.reply({ embeds: [embed] });
          }
        } catch (error) {
          await interaction.reply({ content: 'Failed to modify roles. Check permissions and role hierarchy.', ephemeral: true });
        }
      }
    };

    // MUSIC COMMANDS
    const musicCommand: Command = {
      data: new SlashCommandBuilder()
        .setName('music')
        .setDescription('Music controls')
        .addSubcommand(subcommand =>
          subcommand
            .setName('play')
            .setDescription('Play a song')
            .addStringOption(option =>
              option.setName('query')
                .setDescription('Song name or URL')
                .setRequired(true)))
        .addSubcommand(subcommand =>
          subcommand
            .setName('queue')
            .setDescription('Show music queue'))
        .addSubcommand(subcommand =>
          subcommand
            .setName('skip')
            .setDescription('Skip current song'))
        .addSubcommand(subcommand =>
          subcommand
            .setName('stop')
            .setDescription('Stop music and clear queue'))
        .addSubcommand(subcommand =>
          subcommand
            .setName('volume')
            .setDescription('Set volume')
            .addIntegerOption(option =>
              option.setName('level')
                .setDescription('Volume level (1-100)')
                .setRequired(true)
                .setMinValue(1)
                .setMaxValue(100))),
      execute: async (interaction) => {
        const subcommand = interaction.options.getSubcommand();
        
        if (subcommand === 'play') {
          const query = interaction.options.getString('query');
          
          await storage.addToMusicQueue({
            serverId: interaction.guild.id,
            title: query,
            artist: 'Unknown Artist',
            url: `https://youtube.com/search?q=${encodeURIComponent(query)}`,
            requestedBy: interaction.user.id,
            requestedByUsername: interaction.user.username,
            position: 1,
            duration: '3:45'
          });
          
          const embed = new EmbedBuilder()
            .setColor('#1DB954')
            .setTitle('🎵 Added to Queue')
            .setDescription(`**${query}** has been added to the queue`)
            .addFields({ name: 'Requested by', value: interaction.user.username })
            .setTimestamp();
            
          await interaction.reply({ embeds: [embed] });
        } else if (subcommand === 'queue') {
          const queue = await storage.getMusicQueue(interaction.guild.id);
          
          if (queue.length === 0) {
            await interaction.reply({ content: 'The music queue is empty.', ephemeral: true });
            return;
          }
          
          const queueList = queue.slice(0, 10).map((song, index) => 
            `${index + 1}. **${song.title}** - ${song.artist} (${song.requestedByUsername})`
          ).join('\n');
          
          const embed = new EmbedBuilder()
            .setColor('#1DB954')
            .setTitle('🎵 Music Queue')
            .setDescription(queueList)
            .setFooter({ text: `${queue.length} songs in queue` })
            .setTimestamp();
            
          await interaction.reply({ embeds: [embed] });
        } else if (subcommand === 'volume') {
          const level = interaction.options.getInteger('level');
          await storage.updateServer(interaction.guild.id, { musicVolume: level });
          
          const embed = new EmbedBuilder()
            .setColor('#1DB954')
            .setTitle('🔊 Volume Updated')
            .setDescription(`Volume set to ${level}%`)
            .setTimestamp();
            
          await interaction.reply({ embeds: [embed] });
        } else {
          const embed = new EmbedBuilder()
            .setColor('#1DB954')
            .setTitle(`🎵 ${subcommand === 'skip' ? 'Skipped' : 'Stopped'}`)
            .setDescription(`Music has been ${subcommand === 'skip' ? 'skipped' : 'stopped'}`)
            .setTimestamp();
            
          await interaction.reply({ embeds: [embed] });
        }
      }
    };

    // GIVEAWAY COMMANDS
    const giveawayCommand: Command = {
      data: new SlashCommandBuilder()
        .setName('giveaway')
        .setDescription('Manage giveaways')
        .addSubcommand(subcommand =>
          subcommand
            .setName('create')
            .setDescription('Create a new giveaway')
            .addStringOption(option =>
              option.setName('prize')
                .setDescription('What to give away')
                .setRequired(true))
            .addIntegerOption(option =>
              option.setName('duration')
                .setDescription('Duration in minutes')
                .setRequired(true)
                .setMinValue(1))
            .addIntegerOption(option =>
              option.setName('winners')
                .setDescription('Number of winners')
                .setRequired(true)
                .setMinValue(1)
                .setMaxValue(10)))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageEvents),
      execute: async (interaction) => {
        const subcommand = interaction.options.getSubcommand();
        
        if (subcommand === 'create') {
          const prize = interaction.options.getString('prize');
          const duration = interaction.options.getInteger('duration');
          const winners = interaction.options.getInteger('winners');
          
          const embed = new EmbedBuilder()
            .setColor('#FF69B4')
            .setTitle('🎉 GIVEAWAY!')
            .setDescription(`**Prize:** ${prize}`)
            .addFields(
              { name: 'Duration', value: `${duration} minutes`, inline: true },
              { name: 'Winners', value: winners.toString(), inline: true },
              { name: 'How to Enter', value: 'React with 🎉 to enter!', inline: false }
            )
            .setTimestamp()
            .setFooter({ text: 'Ends' });
            
          const message = await interaction.reply({ embeds: [embed], fetchReply: true });
          await message.react('🎉');
        }
      }
    };

    // WEBHOOK COMMANDS
    const webhookCommand: Command = {
      data: new SlashCommandBuilder()
        .setName('webhook')
        .setDescription('Manage webhooks')
        .addSubcommand(subcommand =>
          subcommand
            .setName('create')
            .setDescription('Create a webhook')
            .addStringOption(option =>
              option.setName('name')
                .setDescription('Webhook name')
                .setRequired(true)))
        .addSubcommand(subcommand =>
          subcommand
            .setName('list')
            .setDescription('List all webhooks'))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageWebhooks),
      execute: async (interaction) => {
        const subcommand = interaction.options.getSubcommand();
        
        if (subcommand === 'create') {
          const name = interaction.options.getString('name');
          
          try {
            const webhook = await interaction.channel.createWebhook({
              name: name,
              avatar: interaction.guild.iconURL()
            });
            
            const embed = new EmbedBuilder()
              .setColor('#5865F2')
              .setTitle('🔗 Webhook Created')
              .setDescription(`Webhook **${name}** has been created`)
              .addFields({ name: 'URL', value: `||${webhook.url}||` })
              .setTimestamp();
              
            await interaction.reply({ embeds: [embed], ephemeral: true });
          } catch (error) {
            await interaction.reply({ content: 'Failed to create webhook. Check permissions.', ephemeral: true });
          }
        } else if (subcommand === 'list') {
          try {
            const webhooks = await interaction.guild.fetchWebhooks();
            
            if (webhooks.size === 0) {
              await interaction.reply({ content: 'No webhooks found in this server.', ephemeral: true });
              return;
            }
            
            const webhookList = webhooks.map(webhook => 
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
        .addUserOption(option =>
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
            { name: 'Roles', value: member.roles.cache.map(role => role.name).join(', ') || 'None', inline: false }
          )
          .setTimestamp();
          
        await interaction.reply({ embeds: [embed] });
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
  }

  private setupEventListeners() {
    this.client.once('ready', async () => {
      console.log(`Bot is ready! Logged in as ${this.client.user?.tag}`);
      
      // Register slash commands
      const rest = new REST().setToken(process.env.DISCORD_BOT_TOKEN || '');
      
      try {
        const commandData = Array.from(this.commands.values()).map(command => command.data.toJSON());
        
        await rest.put(
          Routes.applicationCommands(this.client.user!.id),
          { body: commandData }
        );
        
        console.log('Successfully registered slash commands.');
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
        prefix: '!',
        autoModEnabled: false,
        musicVolume: 50,
        lastfmUsername: null,
      });
      
      // Initialize bot stats
      await storage.updateBotStats(guild.id, {
        activeMembers: guild.memberCount,
      });
    });

    this.client.on('messageCreate', async (message) => {
      if (message.author.bot) return;

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

      // Handle custom commands
      const server = await storage.getServer(message.guild!.id);
      if (server && message.content.startsWith(server.prefix)) {
        const commandName = message.content.slice(server.prefix.length).trim().split(' ')[0].toLowerCase();
        const customCommands = await storage.getCustomCommands(message.guild!.id);
        const customCommand = customCommands.find(cmd => cmd.name === commandName);
        
        if (customCommand) {
          await message.reply(customCommand.response);
          await storage.incrementCommandUsed(message.guild!.id);
        }
      }
    });
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
