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
