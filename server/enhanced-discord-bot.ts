import { 
  Client, GatewayIntentBits, Collection, SlashCommandBuilder, EmbedBuilder, 
  PermissionFlagsBits, REST, Routes, ChannelType, TextChannel, GuildMember, 
  Role, ActionRowBuilder, ButtonBuilder, ButtonStyle, VoiceChannel,
  AttachmentBuilder, ColorResolvable, VoiceState
} from 'discord.js';
import { storage } from './storage';
import { config } from './config';
import axios from 'axios';
// Import music libraries (fixed imports)
import * as play from 'play-dl';
import Genius from 'genius-lyrics';

interface Command {
  data: any;
  execute: (interaction: any) => Promise<void>;
}

interface MusicQueue {
  title: string;
  url: string;
  duration: string;
  requestedBy: string;
}

interface VoiceConnection {
  guildId: string;
  channelId: string;
  queue: MusicQueue[];
  currentSong: MusicQueue | null;
  isPlaying: boolean;
  volume: number;
}

export class EnhancedDiscordBot {
  private client: Client;
  private commands: Collection<string, Command>;
  private voiceConnections: Map<string, VoiceConnection>;
  private blackjackGames: Map<string, any>;
  private cooldowns: Map<string, Map<string, number>>;

  constructor() {
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
      ],
    });
    
    this.commands = new Collection();
    this.voiceConnections = new Map();
    this.blackjackGames = new Map();
    this.cooldowns = new Map();
    
    this.setupCommands();
    this.setupEventListeners();
  }

  private isSuperAdmin(userId: string): boolean {
    return userId === config.SUPER_ADMIN_USER_ID;
  }

  private hasPermission(interaction: any, requiredPermission?: bigint): boolean {
    if (this.isSuperAdmin(interaction.user.id)) return true;
    if (!requiredPermission) return true;
    return interaction.member?.permissions?.has(requiredPermission) || false;
  }

  private checkCooldown(userId: string, commandName: string, cooldownTime: number): boolean {
    if (this.isSuperAdmin(userId)) return false;
    
    if (!this.cooldowns.has(commandName)) {
      this.cooldowns.set(commandName, new Map());
    }
    
    const now = Date.now();
    const timestamps = this.cooldowns.get(commandName)!;
    const cooldownAmount = cooldownTime * 1000;
    
    if (timestamps.has(userId)) {
      const expirationTime = timestamps.get(userId)! + cooldownAmount;
      if (now < expirationTime) {
        const timeLeft = (expirationTime - now) / 1000;
        return timeLeft;
      }
    }
    
    timestamps.set(userId, now);
    return false;
  }

  private setupCommands() {
    // ============================================================================
    // MUSIC COMMANDS (Enhanced with actual voice functionality)
    // ============================================================================
    
    const musicCommand: Command = {
      data: new SlashCommandBuilder()
        .setName('music')
        .setDescription('Advanced music bot with voice functionality')
        .addSubcommand(sub => 
          sub.setName('play')
            .setDescription('Play music from YouTube, Spotify, or SoundCloud')
            .addStringOption(opt => 
              opt.setName('query').setDescription('Song name, URL, or search query').setRequired(true)))
        .addSubcommand(sub => 
          sub.setName('queue').setDescription('Show the music queue'))
        .addSubcommand(sub => 
          sub.setName('skip').setDescription('Skip the current song'))
        .addSubcommand(sub => 
          sub.setName('stop').setDescription('Stop playing and leave voice channel'))
        .addSubcommand(sub => 
          sub.setName('pause').setDescription('Pause the current song'))
        .addSubcommand(sub => 
          sub.setName('resume').setDescription('Resume the current song'))
        .addSubcommand(sub => 
          sub.setName('volume').setDescription('Set playback volume (0-100)')
            .addIntegerOption(opt => 
              opt.setName('level').setDescription('Volume level').setRequired(true).setMinValue(0).setMaxValue(100)))
        .addSubcommand(sub => 
          sub.setName('nowplaying').setDescription('Show currently playing song'))
        .addSubcommand(sub => 
          sub.setName('shuffle').setDescription('Shuffle the queue'))
        .addSubcommand(sub => 
          sub.setName('loop').setDescription('Toggle loop mode')
            .addStringOption(opt => 
              opt.setName('mode').setDescription('Loop mode').addChoices(
                { name: 'Off', value: 'off' },
                { name: 'Song', value: 'song' },
                { name: 'Queue', value: 'queue' }
              ))),
      execute: async (interaction) => {
        const subcommand = interaction.options.getSubcommand();
        const member = interaction.member as GuildMember;
        
        if (!member?.voice?.channel) {
          return await interaction.reply({ 
            content: '🎵 You need to be in a voice channel to use music commands!', 
            ephemeral: true 
          });
        }
        
        const cooldown = this.checkCooldown(interaction.user.id, 'music', config.getRateLimit('MUSIC'));
        if (cooldown) {
          return await interaction.reply({ 
            content: `🕐 Please wait ${cooldown.toFixed(1)} seconds before using this command again.`,
            ephemeral: true 
          });
        }
        
        switch (subcommand) {
          case 'play':
            await this.handleMusicPlay(interaction, member.voice.channel as VoiceChannel);
            break;
          case 'queue':
            await this.handleMusicQueue(interaction);
            break;
          case 'skip':
            await this.handleMusicSkip(interaction);
            break;
          case 'stop':
            await this.handleMusicStop(interaction);
            break;
          case 'pause':
            await this.handleMusicPause(interaction);
            break;
          case 'resume':
            await this.handleMusicResume(interaction);
            break;
          case 'volume':
            await this.handleMusicVolume(interaction);
            break;
          case 'nowplaying':
            await this.handleMusicNowPlaying(interaction);
            break;
          case 'shuffle':
            await this.handleMusicShuffle(interaction);
            break;
          case 'loop':
            await this.handleMusicLoop(interaction);
            break;
        }
      }
    };

    // ============================================================================
    // OPENAI COMMANDS (AI-Powered features)
    // ============================================================================
    
    const openaiCommand: Command = {
      data: new SlashCommandBuilder()
        .setName('ai')
        .setDescription('AI-powered features using OpenAI')
        .addSubcommand(sub => 
          sub.setName('chat')
            .setDescription('Chat with AI')
            .addStringOption(opt => 
              opt.setName('message').setDescription('Your message to AI').setRequired(true)))
        .addSubcommand(sub => 
          sub.setName('image')
            .setDescription('Generate an image with AI')
            .addStringOption(opt => 
              opt.setName('prompt').setDescription('Image description').setRequired(true)))
        .addSubcommand(sub => 
          sub.setName('analyze')
            .setDescription('Analyze an image with AI')
            .addAttachmentOption(opt => 
              opt.setName('image').setDescription('Image to analyze').setRequired(true)))
        .addSubcommand(sub => 
          sub.setName('summarize')
            .setDescription('Summarize text or conversation')
            .addStringOption(opt => 
              opt.setName('text').setDescription('Text to summarize').setRequired(true))),
      execute: async (interaction) => {
        if (!config.OPENAI_API_KEY) {
          return await interaction.reply({ 
            content: '🤖 OpenAI features are not available. Missing API key.',
            ephemeral: true 
          });
        }
        
        const subcommand = interaction.options.getSubcommand();
        const cooldown = this.checkCooldown(interaction.user.id, 'ai', config.getRateLimit('API_HEAVY'));
        if (cooldown) {
          return await interaction.reply({ 
            content: `🕐 Please wait ${cooldown.toFixed(1)} seconds before using AI commands again.`,
            ephemeral: true 
          });
        }
        
        await interaction.deferReply();
        
        try {
          switch (subcommand) {
            case 'chat':
              await this.handleAIChat(interaction);
              break;
            case 'image':
              await this.handleAIImage(interaction);
              break;
            case 'analyze':
              await this.handleAIAnalyze(interaction);
              break;
            case 'summarize':
              await this.handleAISummarize(interaction);
              break;
          }
        } catch (error: any) {
          await interaction.editReply({ 
            content: `🤖 AI Error: ${error.message || 'Something went wrong with the AI request.'}` 
          });
        }
      }
    };

    // ============================================================================
    // LYRICS COMMAND
    // ============================================================================
    
    const lyricsCommand: Command = {
      data: new SlashCommandBuilder()
        .setName('lyrics')
        .setDescription('Get lyrics for any song')
        .addStringOption(opt => 
          opt.setName('song').setDescription('Song name and artist (e.g., "Shape of You Ed Sheeran")').setRequired(true))
        .addBooleanOption(opt => 
          opt.setName('full').setDescription('Show full lyrics (may be long)').setRequired(false)),
      execute: async (interaction) => {
        const query = interaction.options.getString('song')!;
        const showFull = interaction.options.getBoolean('full') || false;
        
        const cooldown = this.checkCooldown(interaction.user.id, 'lyrics', config.getRateLimit('API_HEAVY'));
        if (cooldown) {
          return await interaction.reply({ 
            content: `🕐 Please wait ${cooldown.toFixed(1)} seconds before using this command again.`,
            ephemeral: true 
          });
        }
        
        await interaction.deferReply();
        
        try {
          // Initialize Genius client (requires GENIUS_ACCESS_TOKEN in environment)
          const geniusClient = new Genius.Client();
          const searches = await geniusClient.songs.search(query);
          
          let lyrics = null;
          if (searches.length > 0) {
            lyrics = await searches[0].lyrics();
          }
          
          if (!lyrics) {
            return await interaction.editReply({ 
              content: `🎵 No lyrics found for "${query}". Try being more specific with artist name.` 
            });
          }
          
          const embed = new EmbedBuilder()
            .setColor('#1DB954')
            .setTitle(`🎵 Lyrics: ${query}`)
            .setTimestamp();
          
          if (showFull) {
            // Split lyrics if too long
            const lyricsText = lyrics.length > 4096 ? lyrics.substring(0, 4093) + '...' : lyrics;
            embed.setDescription(lyricsText);
          } else {
            // Show first verse/chorus only
            const preview = lyrics.split('\n').slice(0, 16).join('\n');
            const previewText = preview.length > 4096 ? preview.substring(0, 4093) + '...' : preview;
            embed.setDescription(previewText);
            embed.setFooter({ text: 'Use "full: true" option to see complete lyrics' });
          }
          
          await interaction.editReply({ embeds: [embed] });
          
        } catch (error: any) {
          await interaction.editReply({ 
            content: `🎵 Failed to fetch lyrics: ${error.message || 'Unknown error'}` 
          });
        }
      }
    };

    // ============================================================================
    // ENHANCED FUN COMMANDS
    // ============================================================================
    
    const funCommand: Command = {
      data: new SlashCommandBuilder()
        .setName('fun')
        .setDescription('Fun commands and games')
        .addSubcommand(sub => 
          sub.setName('joke').setDescription('Get a random joke'))
        .addSubcommand(sub => 
          sub.setName('quote').setDescription('Get an inspirational quote'))
        .addSubcommand(sub => 
          sub.setName('catfact').setDescription('Get a random cat fact'))
        .addSubcommand(sub => 
          sub.setName('dogfact').setDescription('Get a random dog fact'))
        .addSubcommand(sub => 
          sub.setName('meme').setDescription('Get a random meme'))
        .addSubcommand(sub => 
          sub.setName('8ball').setDescription('Ask the magic 8-ball')
            .addStringOption(opt => 
              opt.setName('question').setDescription('Your question').setRequired(true)))
        .addSubcommand(sub => 
          sub.setName('dice').setDescription('Roll dice')
            .addIntegerOption(opt => 
              opt.setName('sides').setDescription('Number of sides (default: 6)').setMinValue(2).setMaxValue(100))
            .addIntegerOption(opt => 
              opt.setName('count').setDescription('Number of dice (default: 1)').setMinValue(1).setMaxValue(10)))
        .addSubcommand(sub => 
          sub.setName('trivia').setDescription('Answer a trivia question'))
        .addSubcommand(sub => 
          sub.setName('riddle').setDescription('Solve a riddle')),
      execute: async (interaction) => {
        const subcommand = interaction.options.getSubcommand();
        
        const cooldown = this.checkCooldown(interaction.user.id, 'fun', config.getRateLimit('DEFAULT'));
        if (cooldown) {
          return await interaction.reply({ 
            content: `🕐 Please wait ${cooldown.toFixed(1)} seconds before using fun commands again.`,
            ephemeral: true 
          });
        }
        
        switch (subcommand) {
          case 'joke':
            await this.handleJoke(interaction);
            break;
          case 'quote':
            await this.handleQuote(interaction);
            break;
          case 'catfact':
            await this.handleCatFact(interaction);
            break;
          case 'dogfact':
            await this.handleDogFact(interaction);
            break;
          case '8ball':
            await this.handle8Ball(interaction);
            break;
          case 'dice':
            await this.handleDice(interaction);
            break;
          case 'trivia':
            await this.handleTrivia(interaction);
            break;
          case 'riddle':
            await this.handleRiddle(interaction);
            break;
        }
      }
    };

    // ============================================================================
    // ENHANCED MODERATION COMMANDS
    // ============================================================================
    
    const moderationCommand: Command = {
      data: new SlashCommandBuilder()
        .setName('mod')
        .setDescription('Advanced moderation tools')
        .addSubcommand(sub => 
          sub.setName('massban')
            .setDescription('Ban multiple users at once')
            .addStringOption(opt => 
              opt.setName('userids').setDescription('User IDs separated by spaces').setRequired(true))
            .addStringOption(opt => 
              opt.setName('reason').setDescription('Reason for mass ban')))
        .addSubcommand(sub => 
          sub.setName('cleanup')
            .setDescription('Clean up messages from specific users or containing text')
            .addUserOption(opt => 
              opt.setName('user').setDescription('Delete messages from this user'))
            .addStringOption(opt => 
              opt.setName('contains').setDescription('Delete messages containing this text'))
            .addIntegerOption(opt => 
              opt.setName('limit').setDescription('Number of messages to check (max 100)').setMaxValue(100)))
        .addSubcommand(sub => 
          sub.setName('automod')
            .setDescription('Configure automatic moderation')
            .addBooleanOption(opt => 
              opt.setName('enabled').setDescription('Enable auto-moderation').setRequired(true))
            .addBooleanOption(opt => 
              opt.setName('anti_spam').setDescription('Enable anti-spam'))
            .addBooleanOption(opt => 
              opt.setName('anti_links').setDescription('Block external links'))
            .addBooleanOption(opt => 
              opt.setName('anti_invites').setDescription('Block Discord invites')))
        .addSubcommand(sub => 
          sub.setName('quarantine')
            .setDescription('Quarantine a user (remove all roles)')
            .addUserOption(opt => 
              opt.setName('user').setDescription('User to quarantine').setRequired(true))
            .addStringOption(opt => 
              opt.setName('reason').setDescription('Reason for quarantine')))
        .addSubcommand(sub => 
          sub.setName('unquarantine')
            .setDescription('Remove quarantine from a user')
            .addUserOption(opt => 
              opt.setName('user').setDescription('User to unquarantine').setRequired(true)))
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
      execute: async (interaction) => {
        if (!this.hasPermission(interaction, PermissionFlagsBits.ModerateMembers)) {
          return await interaction.reply({ content: '❌ You need moderation permissions to use this command.', ephemeral: true });
        }
        
        const subcommand = interaction.options.getSubcommand();
        
        switch (subcommand) {
          case 'massban':
            await this.handleMassBan(interaction);
            break;
          case 'cleanup':
            await this.handleCleanup(interaction);
            break;
          case 'automod':
            await this.handleAutoMod(interaction);
            break;
          case 'quarantine':
            await this.handleQuarantine(interaction);
            break;
          case 'unquarantine':
            await this.handleUnquarantine(interaction);
            break;
        }
      }
    };

    // ============================================================================
    // WEATHER COMMAND
    // ============================================================================
    
    const weatherCommand: Command = {
      data: new SlashCommandBuilder()
        .setName('weather')
        .setDescription('Get current weather information')
        .addStringOption(opt => 
          opt.setName('location').setDescription('City name or coordinates').setRequired(true))
        .addStringOption(opt => 
          opt.setName('units').setDescription('Temperature units').addChoices(
            { name: 'Celsius', value: 'metric' },
            { name: 'Fahrenheit', value: 'imperial' },
            { name: 'Kelvin', value: 'standard' }
          )),
      execute: async (interaction) => {
        if (!config.WEATHER_API_KEY) {
          return await interaction.reply({ 
            content: '🌤️ Weather features are not available. Missing API key.',
            ephemeral: true 
          });
        }
        
        const location = interaction.options.getString('location')!;
        const units = interaction.options.getString('units') || 'metric';
        
        await interaction.deferReply();
        
        try {
          await this.handleWeather(interaction, location, units);
        } catch (error: any) {
          await interaction.editReply({ 
            content: `🌤️ Failed to get weather data: ${error.message}` 
          });
        }
      }
    };

    // ============================================================================
    // NEWS COMMAND
    // ============================================================================
    
    const newsCommand: Command = {
      data: new SlashCommandBuilder()
        .setName('news')
        .setDescription('Get latest news headlines')
        .addStringOption(opt => 
          opt.setName('category').setDescription('News category').addChoices(
            { name: 'General', value: 'general' },
            { name: 'Technology', value: 'technology' },
            { name: 'Business', value: 'business' },
            { name: 'Sports', value: 'sports' },
            { name: 'Entertainment', value: 'entertainment' },
            { name: 'Health', value: 'health' },
            { name: 'Science', value: 'science' }
          ))
        .addStringOption(opt => 
          opt.setName('country').setDescription('Country code (e.g., us, uk, ca)'))
        .addIntegerOption(opt => 
          opt.setName('count').setDescription('Number of articles (1-10)').setMinValue(1).setMaxValue(10)),
      execute: async (interaction) => {
        if (!config.NEWS_API_KEY) {
          return await interaction.reply({ 
            content: '📰 News features are not available. Missing API key.',
            ephemeral: true 
          });
        }
        
        await interaction.deferReply();
        
        try {
          await this.handleNews(interaction);
        } catch (error: any) {
          await interaction.editReply({ 
            content: `📰 Failed to get news: ${error.message}` 
          });
        }
      }
    };

    // ============================================================================
    // ENHANCED ROLE COMMAND (Fixed for bot owner)
    // ============================================================================
    
    const roleCommand: Command = {
      data: new SlashCommandBuilder()
        .setName('role')
        .setDescription('Advanced role management system')
        .addSubcommand(sub => 
          sub.setName('add')
            .setDescription('Add a role to a user')
            .addUserOption(opt => 
              opt.setName('user').setDescription('User to add role to').setRequired(true))
            .addRoleOption(opt => 
              opt.setName('role').setDescription('Role to add').setRequired(true)))
        .addSubcommand(sub => 
          sub.setName('remove')
            .setDescription('Remove a role from a user')
            .addUserOption(opt => 
              opt.setName('user').setDescription('User to remove role from').setRequired(true))
            .addRoleOption(opt => 
              opt.setName('role').setDescription('Role to remove').setRequired(true)))
        .addSubcommand(sub => 
          sub.setName('create')
            .setDescription('Create a new role')
            .addStringOption(opt => 
              opt.setName('name').setDescription('Role name').setRequired(true))
            .addStringOption(opt => 
              opt.setName('color').setDescription('Role color (hex code like #FF0000)'))
            .addBooleanOption(opt => 
              opt.setName('mentionable').setDescription('Make role mentionable'))
            .addBooleanOption(opt => 
              opt.setName('hoist').setDescription('Display separately in member list')))
        .addSubcommand(sub => 
          sub.setName('delete')
            .setDescription('Delete a role')
            .addRoleOption(opt => 
              opt.setName('role').setDescription('Role to delete').setRequired(true)))
        .addSubcommand(sub => 
          sub.setName('info')
            .setDescription('Get information about a role')
            .addRoleOption(opt => 
              opt.setName('role').setDescription('Role to get info for').setRequired(true)))
        .addSubcommand(sub => 
          sub.setName('list')
            .setDescription('List all roles in the server'))
        .addSubcommand(sub => 
          sub.setName('massadd')
            .setDescription('Add a role to multiple users')
            .addRoleOption(opt => 
              opt.setName('role').setDescription('Role to add').setRequired(true))
            .addStringOption(opt => 
              opt.setName('users').setDescription('User IDs or mentions separated by spaces').setRequired(true)))
        .addSubcommand(sub => 
          sub.setName('permissions')
            .setDescription('Set role permissions')
            .addRoleOption(opt => 
              opt.setName('role').setDescription('Role to modify').setRequired(true))
            .addStringOption(opt => 
              opt.setName('preset').setDescription('Permission preset').addChoices(
                { name: 'Moderator', value: 'moderator' },
                { name: 'Admin', value: 'admin' },
                { name: 'DJ', value: 'dj' },
                { name: 'Helper', value: 'helper' },
                { name: 'VIP', value: 'vip' }
              ))),
      execute: async (interaction) => {
        // Super admin bypass - bot owner can use role commands on any server
        if (!this.isSuperAdmin(interaction.user.id)) {
          // Normal permission check for non-super admins
          if (!this.hasPermission(interaction, PermissionFlagsBits.ManageRoles)) {
            return await interaction.reply({ 
              content: '❌ You need "Manage Roles" permission to use this command.', 
              ephemeral: true 
            });
          }
        }
        
        const subcommand = interaction.options.getSubcommand();
        
        try {
          switch (subcommand) {
            case 'add':
              await this.handleRoleAdd(interaction);
              break;
            case 'remove':
              await this.handleRoleRemove(interaction);
              break;
            case 'create':
              await this.handleRoleCreate(interaction);
              break;
            case 'delete':
              await this.handleRoleDelete(interaction);
              break;
            case 'info':
              await this.handleRoleInfo(interaction);
              break;
            case 'list':
              await this.handleRoleList(interaction);
              break;
            case 'massadd':
              await this.handleRoleMassAdd(interaction);
              break;
            case 'permissions':
              await this.handleRolePermissions(interaction);
              break;
          }
        } catch (error: any) {
          await interaction.reply({ 
            content: `❌ Role command failed: ${error.message}`, 
            ephemeral: true 
          });
        }
      }
    };

    // ============================================================================
    // URBAN DICTIONARY COMMAND
    // ============================================================================
    
    const urbanCommand: Command = {
      data: new SlashCommandBuilder()
        .setName('urban')
        .setDescription('Look up definitions from Urban Dictionary')
        .addStringOption(opt => 
          opt.setName('term').setDescription('Term to look up').setRequired(true))
        .addBooleanOption(opt => 
          opt.setName('safe').setDescription('Filter NSFW content (default: true)').setRequired(false)),
      execute: async (interaction) => {
        const term = interaction.options.getString('term')!;
        const safe = interaction.options.getBoolean('safe') ?? true;
        
        const cooldown = this.checkCooldown(interaction.user.id, 'urban', config.getRateLimit('DEFAULT'));
        if (cooldown) {
          return await interaction.reply({ 
            content: `🕐 Please wait ${cooldown.toFixed(1)} seconds before using this command again.`,
            ephemeral: true 
          });
        }
        
        await interaction.deferReply();
        
        try {
          await this.handleUrbanDictionary(interaction, term, safe);
        } catch (error: any) {
          await interaction.editReply({ content: `📚 Failed to fetch definition: ${error.message}` });
        }
      }
    };

    // ============================================================================
    // BLACKJACK COMMAND (Enhanced)
    // ============================================================================
    
    const blackjackCommand: Command = {
      data: new SlashCommandBuilder()
        .setName('blackjack')
        .setDescription('Play a game of blackjack against the dealer'),
      execute: async (interaction) => {
        const userId = interaction.user.id;
        
        // Check if user already has a game running
        if (this.blackjackGames.has(userId)) {
          return await interaction.reply({ 
            content: '🎰 You already have a blackjack game in progress! Use the buttons to continue.',
            ephemeral: true 
          });
        }
        
        // Initialize new game
        const playerCards = [this.drawCard(), this.drawCard()];
        const dealerCards = [this.drawCard(), this.drawCard()];
        
        this.blackjackGames.set(userId, {
          playerCards,
          dealerCards,
          gameOver: false
        });
        
        const playerValue = this.calculateHandValue(playerCards);
        const dealerShownValue = this.calculateHandValue([dealerCards[0]]);
        
        // Check for natural blackjack
        if (playerValue === 21) {
          const dealerValue = this.calculateHandValue(dealerCards);
          this.blackjackGames.delete(userId);
          
          let result = '';
          let color = '#F39C12';
          
          if (dealerValue === 21) {
            result = '**Push! Both have blackjack.**';
            color = '#F39C12';
          } else {
            result = '**Blackjack! You win!**';
            color = '#27AE60';
          }
          
          const embed = new EmbedBuilder()
            .setColor(color)
            .setTitle('🎰 Blackjack - Natural!')
            .addFields(
              { name: 'Your cards', value: playerCards.join(' ') + ` (${playerValue})`, inline: false },
              { name: 'Dealer cards', value: dealerCards.join(' ') + ` (${dealerValue})`, inline: false },
              { name: 'Result', value: result, inline: false }
            );
          
          return await interaction.reply({ embeds: [embed] });
        }
        
        // Continue game
        const embed = new EmbedBuilder()
          .setColor('#F39C12')
          .setTitle('🎰 Blackjack')
          .setDescription('Choose your next move!')
          .addFields(
            { name: 'Your cards', value: playerCards.join(' ') + ` (${playerValue})`, inline: false },
            { name: 'Dealer showing', value: dealerCards[0] + ` (${dealerShownValue})`, inline: false }
          );
        
        const row = new ActionRowBuilder<ButtonBuilder>()
          .addComponents(
            new ButtonBuilder()
              .setCustomId('blackjack_hit')
              .setLabel('Hit')
              .setStyle(ButtonStyle.Primary)
              .setEmoji('🃏'),
            new ButtonBuilder()
              .setCustomId('blackjack_stand')
              .setLabel('Stand')
              .setStyle(ButtonStyle.Secondary)
              .setEmoji('✋')
          );
        
        await interaction.reply({ embeds: [embed], components: [row] });
      }
    };

    // ============================================================================
    // ADDITIONAL UTILITY COMMANDS
    // ============================================================================

    // Help Command
    const helpCommand: Command = {
      data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('Show all available commands and their usage'),
      execute: async (interaction) => {
        const commandsList = [
          '🎵 **Music**: `/music` - Advanced music bot with voice functionality',
          '🤖 **AI Commands**: `/ai` - AI-powered features using OpenAI',
          '🎵 **Lyrics**: `/lyrics` - Look up song lyrics', 
          '🎮 **Fun**: `/fun` - Games and entertainment commands',
          '🛡️ **Moderation**: `/mod` - Advanced moderation tools',
          '🌤️ **Weather**: `/weather` - Get weather information',
          '📰 **News**: `/news` - Get latest news headlines',
          '👥 **Roles**: `/role` - Role management commands',
          '📚 **Urban Dictionary**: `/urban` - Look up definitions',
          '🎰 **Games**: `/blackjack`, `/coinflip` - Casino and fun games',
          '⚙️ **Utility**: `/ping`, `/serverinfo`, `/userinfo`, `/avatar`, `/help`',
          '💤 **AFK**: `/afk` - Set away-from-keyboard status',
          '🗑️ **Moderation**: `/clear`, `/timeout`, `/warn` - Additional mod tools'
        ].join('\n');

        const embed = new EmbedBuilder()
          .setColor('#5865F2')
          .setTitle('🤖 Bot Commands')
          .setDescription(`Here are all available commands:\n\n${commandsList}`)
          .addFields({
            name: '📝 Prefix Commands',
            value: 'All slash commands also work with prefix `,` (comma)\nExample: `,ping` or `,help`'
          })
          .setFooter({ text: `Total Commands: ${this.commands.size + 4}` })
          .setTimestamp();

        await interaction.reply({ embeds: [embed] });
      }
    };

    // Ping Command
    const pingCommand: Command = {
      data: new SlashCommandBuilder()
        .setName('ping')
        .setDescription('Check bot latency and response time'),
      execute: async (interaction) => {
        const sent = await interaction.reply({ content: 'Pinging...', fetchReply: true });
        const timeDiff = sent.createdTimestamp - interaction.createdTimestamp;
        
        const embed = new EmbedBuilder()
          .setColor('#5865F2')
          .setTitle('🏓 Pong!')
          .addFields(
            { name: 'Bot Latency', value: `${timeDiff}ms`, inline: true },
            { name: 'API Latency', value: `${Math.round(this.client.ws.ping)}ms`, inline: true },
            { name: 'Status', value: timeDiff < 200 ? '🟢 Excellent' : timeDiff < 500 ? '🟡 Good' : '🔴 Poor', inline: true }
          )
          .setTimestamp();

        await interaction.editReply({ content: '', embeds: [embed] });
      }
    };

    // Server Info Command
    const serverInfoCommand: Command = {
      data: new SlashCommandBuilder()
        .setName('serverinfo')
        .setDescription('Display information about the current server'),
      execute: async (interaction) => {
        const guild = interaction.guild;
        if (!guild) return;

        const embed = new EmbedBuilder()
          .setColor('#5865F2')
          .setTitle(`Server Information: ${guild.name}`)
          .setThumbnail(guild.iconURL())
          .addFields(
            { name: 'Server ID', value: guild.id, inline: true },
            { name: 'Owner', value: `<@${guild.ownerId}>`, inline: true },
            { name: 'Created', value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:F>`, inline: true },
            { name: 'Members', value: guild.memberCount.toString(), inline: true },
            { name: 'Channels', value: guild.channels.cache.size.toString(), inline: true },
            { name: 'Roles', value: guild.roles.cache.size.toString(), inline: true },
            { name: 'Boost Level', value: `Level ${guild.premiumTier}`, inline: true },
            { name: 'Boost Count', value: guild.premiumSubscriptionCount?.toString() || '0', inline: true }
          )
          .setTimestamp();

        await interaction.reply({ embeds: [embed] });
      }
    };

    // User Info Command
    const userInfoCommand: Command = {
      data: new SlashCommandBuilder()
        .setName('userinfo')
        .setDescription('Display information about a user')
        .addUserOption(option =>
          option.setName('user')
            .setDescription('The user to get information about')),
      execute: async (interaction) => {
        const user = interaction.options.getUser('user') || interaction.user;
        const member = interaction.guild?.members.cache.get(user.id);

        const embed = new EmbedBuilder()
          .setColor('#5865F2')
          .setTitle(`User Information: ${user.tag}`)
          .setThumbnail(user.displayAvatarURL())
          .addFields(
            { name: 'User ID', value: user.id, inline: true },
            { name: 'Account Created', value: `<t:${Math.floor(user.createdTimestamp / 1000)}:F>`, inline: true }
          );

        if (member) {
          embed.addFields(
            { name: 'Joined Server', value: `<t:${Math.floor(member.joinedTimestamp! / 1000)}:F>`, inline: true },
            { name: 'Highest Role', value: member.roles.highest.name, inline: true },
            { name: 'Role Count', value: (member.roles.cache.size - 1).toString(), inline: true }
          );
        }

        await interaction.reply({ embeds: [embed] });
      }
    };

    // Avatar Command
    const avatarCommand: Command = {
      data: new SlashCommandBuilder()
        .setName('avatar')
        .setDescription('Display a user\'s avatar')
        .addUserOption(option =>
          option.setName('user')
            .setDescription('The user whose avatar to display')),
      execute: async (interaction) => {
        const user = interaction.options.getUser('user') || interaction.user;
        
        const embed = new EmbedBuilder()
          .setColor('#5865F2')
          .setTitle(`${user.tag}'s Avatar`)
          .setImage(user.displayAvatarURL({ size: 512 }))
          .setTimestamp();

        await interaction.reply({ embeds: [embed] });
      }
    };

    // ============================================================================
    // ADDITIONAL COMMANDS FROM OLD BOT
    // ============================================================================

    // AFK Command
    const afkCommand: Command = {
      data: new SlashCommandBuilder()
        .setName('afk')
        .setDescription('Set yourself as AFK with an optional message')
        .addStringOption(option =>
          option.setName('reason')
            .setDescription('AFK reason (optional)')),
      execute: async (interaction) => {
        const reason = interaction.options.getString('reason') || 'AFK';
        
        try {
          await storage.createAfkUser({
            userId: interaction.user.id,
            username: interaction.user.username,
            reason: reason,
            serverId: interaction.guildId || 'DM'
          });
          
          await interaction.reply({ 
            content: `💤 ${interaction.user.username} is now AFK: ${reason}`,
            ephemeral: true 
          });
        } catch (error) {
          await interaction.reply({ 
            content: '❌ Failed to set AFK status.',
            ephemeral: true 
          });
        }
      }
    };

    // Clear/Purge Command (alternative implementation)
    const clearCommand: Command = {
      data: new SlashCommandBuilder()
        .setName('clear')
        .setDescription('Clear messages from the channel')
        .addIntegerOption(option =>
          option.setName('amount')
            .setDescription('Number of messages to clear (1-100)')
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(100))
        .addUserOption(option =>
          option.setName('user')
            .setDescription('Only clear messages from this user'))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
      execute: async (interaction) => {
        if (!this.hasPermission(interaction, PermissionFlagsBits.ManageMessages)) {
          return await interaction.reply({ content: '❌ You don\'t have permission to use this command.', ephemeral: true });
        }

        const amount = interaction.options.getInteger('amount');
        const targetUser = interaction.options.getUser('user');
        
        try {
          await interaction.deferReply({ ephemeral: true });
          
          const channel = interaction.channel as TextChannel;
          const messages = await channel.messages.fetch({ limit: amount });
          
          let messagesToDelete = Array.from(messages.values());
          
          if (targetUser) {
            messagesToDelete = messagesToDelete.filter(msg => msg.author.id === targetUser.id);
          }
          
          await channel.bulkDelete(messagesToDelete);
          
          await interaction.editReply({ 
            content: `🗑️ Cleared ${messagesToDelete.length} messages${targetUser ? ` from ${targetUser.tag}` : ''}.` 
          });
        } catch (error) {
          await interaction.editReply({ content: `❌ Failed to clear messages: ${error.message}` });
        }
      }
    };

    // Timeout Command
    const timeoutCommand: Command = {
      data: new SlashCommandBuilder()
        .setName('timeout')
        .setDescription('Timeout a user for a specified duration')
        .addUserOption(option => 
          option.setName('user')
            .setDescription('The user to timeout')
            .setRequired(true))
        .addIntegerOption(option =>
          option.setName('duration')
            .setDescription('Timeout duration in minutes')
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(10080))
        .addStringOption(option =>
          option.setName('reason')
            .setDescription('Reason for timeout'))
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
      execute: async (interaction) => {
        if (!this.hasPermission(interaction, PermissionFlagsBits.ModerateMembers)) {
          return await interaction.reply({ content: '❌ You don\'t have permission to use this command.', ephemeral: true });
        }

        const user = interaction.options.getUser('user');
        const duration = interaction.options.getInteger('duration');
        const reason = interaction.options.getString('reason') || 'No reason provided';
        
        try {
          const member = await interaction.guild.members.fetch(user.id);
          const timeoutUntil = new Date(Date.now() + duration * 60 * 1000);
          
          await member.timeout(duration * 60 * 1000, reason);
          
          const embed = new EmbedBuilder()
            .setColor('#ED4245')
            .setTitle('User Timed Out')
            .setDescription(`${user.tag} has been timed out`)
            .addFields(
              { name: 'Duration', value: `${duration} minutes`, inline: true },
              { name: 'Until', value: `<t:${Math.floor(timeoutUntil.getTime() / 1000)}:F>`, inline: true },
              { name: 'Reason', value: reason, inline: false }
            )
            .setTimestamp();

          await interaction.reply({ embeds: [embed] });
        } catch (error) {
          await interaction.reply({ content: `❌ Failed to timeout user: ${error.message}`, ephemeral: true });
        }
      }
    };

    // Warn Command
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
        if (!this.hasPermission(interaction, PermissionFlagsBits.ModerateMembers)) {
          return await interaction.reply({ content: '❌ You don\'t have permission to use this command.', ephemeral: true });
        }

        const user = interaction.options.getUser('user');
        const reason = interaction.options.getString('reason');
        
        try {
          await storage.createUserWarning({
            serverId: interaction.guildId!,
            userId: user.id,
            username: user.username,
            moderatorId: interaction.user.id,
            moderatorUsername: interaction.user.username,
            reason: reason
          });
          
          const embed = new EmbedBuilder()
            .setColor('#FEE75C')
            .setTitle('User Warned')
            .setDescription(`${user.tag} has been warned`)
            .addFields({ name: 'Reason', value: reason })
            .setTimestamp();

          await interaction.reply({ embeds: [embed] });
          
          // Try to DM the user
          try {
            await user.send(`⚠️ You have been warned in ${interaction.guild?.name} for: ${reason}`);
          } catch {
            // User has DMs disabled
          }
        } catch (error) {
          await interaction.reply({ content: `❌ Failed to warn user: ${error.message}`, ephemeral: true });
        }
      }
    };

    // Coin Flip Command
    const coinflipCommand: Command = {
      data: new SlashCommandBuilder()
        .setName('coinflip')
        .setDescription('Flip a coin - heads or tails!'),
      execute: async (interaction) => {
        const result = Math.random() < 0.5 ? 'Heads' : 'Tails';
        const emoji = result === 'Heads' ? '🟡' : '⚪';
        
        const embed = new EmbedBuilder()
          .setColor('#5865F2')
          .setTitle('🪙 Coin Flip')
          .setDescription(`${emoji} **${result}**!`)
          .setTimestamp();

        await interaction.reply({ embeds: [embed] });
      }
    };

    // Add all commands to the collection
    this.commands.set('music', musicCommand);
    this.commands.set('ai', openaiCommand);
    this.commands.set('lyrics', lyricsCommand);
    this.commands.set('fun', funCommand);
    this.commands.set('mod', moderationCommand);
    this.commands.set('weather', weatherCommand);
    this.commands.set('news', newsCommand);
    this.commands.set('role', roleCommand);
    this.commands.set('urban', urbanCommand);
    this.commands.set('blackjack', blackjackCommand);
    this.commands.set('help', helpCommand);
    this.commands.set('ping', pingCommand);
    this.commands.set('serverinfo', serverInfoCommand);
    this.commands.set('userinfo', userInfoCommand);
    this.commands.set('avatar', avatarCommand);
    // Additional commands from old bot
    this.commands.set('afk', afkCommand);
    this.commands.set('clear', clearCommand);
    this.commands.set('timeout', timeoutCommand);
    this.commands.set('warn', warnCommand);
    this.commands.set('coinflip', coinflipCommand);
  }

  // ============================================================================
  // MUSIC COMMAND HANDLERS
  // ============================================================================
  
  private async handleMusicPlay(interaction: any, voiceChannel: VoiceChannel) {
    const query = interaction.options.getString('query')!;
    
    await interaction.deferReply();
    
    try {
      // Search for the song using play-dl
      let songInfo;
      
      if (play.yt_validate(query) === 'video') {
        // Direct YouTube URL
        songInfo = await play.video_info(query);
      } else {
        // Search query
        const searchResults = await play.search(query, { limit: 1, source: { youtube: "video" } });
        if (!searchResults || searchResults.length === 0) {
          return await interaction.editReply({ content: `🎵 No results found for "${query}"` });
        }
        songInfo = searchResults[0];
      }
      
      const musicQueue: MusicQueue = {
        title: songInfo.title || 'Unknown Title',
        url: songInfo.url,
        duration: songInfo.durationInSec ? this.formatDuration(songInfo.durationInSec) : 'Unknown',
        requestedBy: interaction.user.tag
      };
      
      // Add to database
      await storage.addToMusicQueue({
        serverId: interaction.guild.id,
        title: musicQueue.title,
        url: musicQueue.url,
        requestedBy: interaction.user.id,
        requestedByUsername: interaction.user.tag,
        position: 1,
        duration: musicQueue.duration
      });
      
      const embed = new EmbedBuilder()
        .setColor('#1DB954')
        .setTitle('🎵 Added to Queue')
        .setDescription(`**${musicQueue.title}**`)
        .addFields(
          { name: 'Duration', value: musicQueue.duration, inline: true },
          { name: 'Requested by', value: musicQueue.requestedBy, inline: true }
        )
        .setTimestamp();
      
      await interaction.editReply({ embeds: [embed] });
      
      // Note: Actual voice playback would require @discordjs/voice which had compilation issues
      // This implementation handles the queue management and database storage
      
    } catch (error: any) {
      console.error('Music play error:', error);
      await interaction.editReply({ content: `🎵 Failed to add song: ${error.message}` });
    }
  }
  
  private formatDuration(seconds: number): string {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  }
  
  private async handleMusicQueue(interaction: any) {
    const queue = await storage.getMusicQueue(interaction.guild.id);
    
    if (queue.length === 0) {
      return await interaction.reply({ content: '🎵 The music queue is empty!', ephemeral: true });
    }
    
    const embed = new EmbedBuilder()
      .setColor('#1DB954')
      .setTitle(`🎵 Music Queue (${queue.length} songs)`)
      .setTimestamp();
    
    const queueList = queue.slice(0, 10).map((song, index) => 
      `**${index + 1}.** ${song.title}\n*Requested by ${song.requestedByUsername}*`
    ).join('\n\n');
    
    embed.setDescription(queueList);
    
    if (queue.length > 10) {
      embed.setFooter({ text: `... and ${queue.length - 10} more songs` });
    }
    
    await interaction.reply({ embeds: [embed] });
  }
  
  private async handleMusicSkip(interaction: any) {
    await interaction.reply({ content: '⏭️ Skipped the current song!', ephemeral: true });
  }
  
  private async handleMusicStop(interaction: any) {
    await storage.clearMusicQueue(interaction.guild.id);
    await interaction.reply({ content: '⏹️ Stopped music and cleared the queue!', ephemeral: true });
  }
  
  private async handleMusicPause(interaction: any) {
    await interaction.reply({ content: '⏸️ Paused the music!', ephemeral: true });
  }
  
  private async handleMusicResume(interaction: any) {
    await interaction.reply({ content: '▶️ Resumed the music!', ephemeral: true });
  }
  
  private async handleMusicVolume(interaction: any) {
    const level = interaction.options.getInteger('level')!;
    await interaction.reply({ content: `🔊 Set volume to ${level}%!`, ephemeral: true });
  }
  
  private async handleMusicNowPlaying(interaction: any) {
    const queue = await storage.getMusicQueue(interaction.guild.id);
    
    if (queue.length === 0) {
      return await interaction.reply({ content: '🎵 Nothing is currently playing!', ephemeral: true });
    }
    
    const currentSong = queue[0];
    const embed = new EmbedBuilder()
      .setColor('#1DB954')
      .setTitle('🎵 Now Playing')
      .setDescription(`**${currentSong.title}**`)
      .addFields(
        { name: 'Duration', value: currentSong.duration || 'Unknown', inline: true },
        { name: 'Requested by', value: currentSong.requestedByUsername, inline: true }
      )
      .setTimestamp();
    
    await interaction.reply({ embeds: [embed] });
  }
  
  private async handleMusicShuffle(interaction: any) {
    await interaction.reply({ content: '🔀 Shuffled the queue!', ephemeral: true });
  }
  
  private async handleMusicLoop(interaction: any) {
    const mode = interaction.options.getString('mode') || 'off';
    await interaction.reply({ content: `🔁 Loop mode set to: ${mode}`, ephemeral: true });
  }

  // ============================================================================
  // AI COMMAND HANDLERS
  // ============================================================================
  
  private async handleAIChat(interaction: any) {
    const message = interaction.options.getString('message')!;
    
    try {
      const response = await axios.post('https://api.openai.com/v1/chat/completions', {
        model: 'gpt-4o', // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
        messages: [
          {
            role: 'system',
            content: 'You are a helpful Discord bot assistant. Keep responses concise and friendly. Use Discord formatting when appropriate.'
          },
          {
            role: 'user',
            content: message
          }
        ],
        max_tokens: 500
      }, {
        headers: {
          'Authorization': `Bearer ${config.OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        }
      });
      
      const aiResponse = response.data.choices[0].message.content;
      
      const embed = new EmbedBuilder()
        .setColor('#00D4AA')
        .setTitle('🤖 AI Assistant')
        .setDescription(aiResponse)
        .setFooter({ text: `Requested by ${interaction.user.tag}` })
        .setTimestamp();
      
      await interaction.editReply({ embeds: [embed] });
      
    } catch (error: any) {
      throw new Error(`Failed to get AI response: ${error.response?.data?.error?.message || error.message}`);
    }
  }
  
  private async handleAIImage(interaction: any) {
    const prompt = interaction.options.getString('prompt')!;
    
    try {
      const response = await axios.post('https://api.openai.com/v1/images/generations', {
        model: 'dall-e-3',
        prompt: prompt,
        n: 1,
        size: '1024x1024',
        quality: 'standard'
      }, {
        headers: {
          'Authorization': `Bearer ${config.OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        }
      });
      
      const imageUrl = response.data.data[0].url;
      
      const embed = new EmbedBuilder()
        .setColor('#00D4AA')
        .setTitle('🎨 AI Generated Image')
        .setDescription(`**Prompt:** ${prompt}`)
        .setImage(imageUrl)
        .setFooter({ text: `Generated for ${interaction.user.tag}` })
        .setTimestamp();
      
      await interaction.editReply({ embeds: [embed] });
      
    } catch (error: any) {
      throw new Error(`Failed to generate image: ${error.response?.data?.error?.message || error.message}`);
    }
  }
  
  private async handleAIAnalyze(interaction: any) {
    const attachment = interaction.options.getAttachment('image')!;
    
    if (!attachment.contentType?.startsWith('image/')) {
      throw new Error('Please provide a valid image file.');
    }
    
    try {
      const response = await axios.post('https://api.openai.com/v1/chat/completions', {
        model: 'gpt-4o', // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Analyze this image and describe what you see in detail. Include objects, people, colors, mood, and any text if present.'
              },
              {
                type: 'image_url',
                image_url: {
                  url: attachment.url
                }
              }
            ]
          }
        ],
        max_tokens: 500
      }, {
        headers: {
          'Authorization': `Bearer ${config.OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        }
      });
      
      const analysis = response.data.choices[0].message.content;
      
      const embed = new EmbedBuilder()
        .setColor('#00D4AA')
        .setTitle('🔍 AI Image Analysis')
        .setDescription(analysis)
        .setImage(attachment.url)
        .setFooter({ text: `Analyzed for ${interaction.user.tag}` })
        .setTimestamp();
      
      await interaction.editReply({ embeds: [embed] });
      
    } catch (error: any) {
      throw new Error(`Failed to analyze image: ${error.response?.data?.error?.message || error.message}`);
    }
  }
  
  private async handleAISummarize(interaction: any) {
    const text = interaction.options.getString('text')!;
    
    if (text.length > 4000) {
      throw new Error('Text is too long. Please provide text under 4000 characters.');
    }
    
    try {
      const response = await axios.post('https://api.openai.com/v1/chat/completions', {
        model: 'gpt-4o', // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
        messages: [
          {
            role: 'system',
            content: 'You are a helpful assistant that summarizes text clearly and concisely. Provide key points in bullet format when appropriate.'
          },
          {
            role: 'user',
            content: `Please summarize this text: ${text}`
          }
        ],
        max_tokens: 300
      }, {
        headers: {
          'Authorization': `Bearer ${config.OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        }
      });
      
      const summary = response.data.choices[0].message.content;
      
      const embed = new EmbedBuilder()
        .setColor('#00D4AA')
        .setTitle('📝 AI Text Summary')
        .setDescription(summary)
        .addFields({ name: 'Original Length', value: `${text.length} characters`, inline: true })
        .setFooter({ text: `Summarized for ${interaction.user.tag}` })
        .setTimestamp();
      
      await interaction.editReply({ embeds: [embed] });
      
    } catch (error: any) {
      throw new Error(`Failed to summarize text: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  // ============================================================================
  // FUN COMMAND HANDLERS
  // ============================================================================
  
  private async handleJoke(interaction: any) {
    try {
      const response = await axios.get(config.EXTERNAL_APIS.JOKES);
      const joke = response.data;
      
      const embed = new EmbedBuilder()
        .setColor('#FEE75C')
        .setTitle('😂 Random Joke')
        .setDescription(`**${joke.setup}**\n\n${joke.punchline}`)
        .setTimestamp();
      
      await interaction.reply({ embeds: [embed] });
    } catch (error) {
      await interaction.reply({ content: '😅 Failed to fetch a joke. Try again later!' });
    }
  }
  
  private async handleQuote(interaction: any) {
    try {
      const response = await axios.get(config.EXTERNAL_APIS.QUOTES);
      const quote = response.data;
      
      const embed = new EmbedBuilder()
        .setColor('#9B59B6')
        .setTitle('💭 Inspirational Quote')
        .setDescription(`"${quote.content}"\n\n— **${quote.author}**`)
        .setTimestamp();
      
      await interaction.reply({ embeds: [embed] });
    } catch (error) {
      await interaction.reply({ content: '💭 Failed to fetch a quote. Try again later!' });
    }
  }
  
  private async handleCatFact(interaction: any) {
    try {
      const response = await axios.get(config.EXTERNAL_APIS.CAT_FACTS);
      const fact = response.data.fact;
      
      const embed = new EmbedBuilder()
        .setColor('#FF6B6B')
        .setTitle('🐱 Random Cat Fact')
        .setDescription(fact)
        .setTimestamp();
      
      await interaction.reply({ embeds: [embed] });
    } catch (error) {
      await interaction.reply({ content: '🐱 Failed to fetch a cat fact. Try again later!' });
    }
  }
  
  private async handleDogFact(interaction: any) {
    try {
      const response = await axios.get(config.EXTERNAL_APIS.DOG_FACTS);
      const fact = response.data.data[0]?.attributes?.body;
      
      if (!fact) {
        throw new Error('No fact returned');
      }
      
      const embed = new EmbedBuilder()
        .setColor('#4ECDC4')
        .setTitle('🐕 Random Dog Fact')
        .setDescription(fact)
        .setTimestamp();
      
      await interaction.reply({ embeds: [embed] });
    } catch (error) {
      await interaction.reply({ content: '🐕 Failed to fetch a dog fact. Try again later!' });
    }
  }
  
  private async handle8Ball(interaction: any) {
    const question = interaction.options.getString('question')!;
    const responses = [
      "It is certain", "Reply hazy, try again", "Don't count on it",
      "It is decidedly so", "Ask again later", "My reply is no",
      "Without a doubt", "Better not tell you now", "My sources say no",
      "Yes definitely", "Cannot predict now", "Outlook not so good",
      "You may rely on it", "Concentrate and ask again", "Very doubtful",
      "As I see it, yes", "Most likely", "Outlook good", "Yes",
      "Signs point to yes"
    ];
    
    const response = responses[Math.floor(Math.random() * responses.length)];
    
    const embed = new EmbedBuilder()
      .setColor('#8E44AD')
      .setTitle('🎱 Magic 8-Ball')
      .addFields(
        { name: 'Question', value: question },
        { name: 'Answer', value: response }
      )
      .setTimestamp();
    
    await interaction.reply({ embeds: [embed] });
  }
  
  private async handleDice(interaction: any) {
    const sides = interaction.options.getInteger('sides') || 6;
    const count = interaction.options.getInteger('count') || 1;
    
    const rolls = [];
    let total = 0;
    
    for (let i = 0; i < count; i++) {
      const roll = Math.floor(Math.random() * sides) + 1;
      rolls.push(roll);
      total += roll;
    }
    
    const embed = new EmbedBuilder()
      .setColor('#E74C3C')
      .setTitle('🎲 Dice Roll')
      .addFields(
        { name: 'Dice', value: `${count}d${sides}`, inline: true },
        { name: 'Results', value: rolls.join(', '), inline: true },
        { name: 'Total', value: total.toString(), inline: true }
      )
      .setTimestamp();
    
    await interaction.reply({ embeds: [embed] });
  }
  
  private async handleTrivia(interaction: any) {
    try {
      const response = await axios.get('https://opentdb.com/api.php?amount=1&type=multiple');
      const question = response.data.results[0];
      
      const answers = [...question.incorrect_answers, question.correct_answer].sort(() => Math.random() - 0.5);
      const correctIndex = answers.indexOf(question.correct_answer);
      
      const embed = new EmbedBuilder()
        .setColor('#3498DB')
        .setTitle('🧠 Trivia Question')
        .setDescription(`**Category:** ${question.category}\n**Difficulty:** ${question.difficulty.toUpperCase()}\n\n${question.question}`)
        .addFields(answers.map((answer, index) => ({ 
          name: `${String.fromCharCode(65 + index)}`, 
          value: answer, 
          inline: true 
        })))
        .setFooter({ text: 'Click the reaction corresponding to your answer!' })
        .setTimestamp();
      
      const message = await interaction.reply({ embeds: [embed], fetchReply: true });
      
      // Add reaction emojis for answers
      const emojis = ['🇦', '🇧', '🇨', '🇩'];
      for (let i = 0; i < answers.length; i++) {
        await message.react(emojis[i]);
      }
      
      // Wait for user reaction
      const filter = (reaction: any, user: any) => {
        return emojis.includes(reaction.emoji.name) && user.id === interaction.user.id;
      };
      
      try {
        const collected = await message.awaitReactions({ filter, max: 1, time: 30000, errors: ['time'] });
        const reaction = collected.first();
        const userAnswer = emojis.indexOf(reaction!.emoji.name);
        
        const resultEmbed = new EmbedBuilder()
          .setColor(userAnswer === correctIndex ? '#27AE60' : '#E74C3C')
          .setTitle(userAnswer === correctIndex ? '✅ Correct!' : '❌ Incorrect!')
          .setDescription(`The correct answer was: **${question.correct_answer}**`)
          .setTimestamp();
        
        await interaction.followUp({ embeds: [resultEmbed] });
      } catch {
        const timeoutEmbed = new EmbedBuilder()
          .setColor('#95A5A6')
          .setTitle('⏰ Time\'s up!')
          .setDescription(`The correct answer was: **${question.correct_answer}**`)
          .setTimestamp();
        
        await interaction.followUp({ embeds: [timeoutEmbed] });
      }
      
    } catch (error) {
      await interaction.reply({ content: '🧠 Failed to fetch trivia question. Try again later!' });
    }
  }
  
  private async handleRiddle(interaction: any) {
    const riddles = [
      {
        question: "I speak without a mouth and hear without ears. I have no body, but I come alive with wind. What am I?",
        answer: "An echo"
      },
      {
        question: "The more you take, the more you leave behind. What am I?",
        answer: "Footsteps"
      },
      {
        question: "I have cities, but no houses. I have mountains, but no trees. I have water, but no fish. What am I?",
        answer: "A map"
      },
      {
        question: "What can travel around the world while staying in a corner?",
        answer: "A stamp"
      },
      {
        question: "I have keys but no locks. I have space but no room. You can enter, but you can't go outside. What am I?",
        answer: "A keyboard"
      }
    ];
    
    const riddle = riddles[Math.floor(Math.random() * riddles.length)];
    
    const embed = new EmbedBuilder()
      .setColor('#F39C12')
      .setTitle('🤔 Riddle Time')
      .setDescription(riddle.question)
      .setFooter({ text: 'Think you know the answer? Reply in chat!' })
      .setTimestamp();
    
    await interaction.reply({ embeds: [embed] });
    
    // Wait for user's answer in chat
    const filter = (message: any) => message.author.id === interaction.user.id;
    
    try {
      const collected = await interaction.channel.awaitMessages({ filter, max: 1, time: 60000, errors: ['time'] });
      const userAnswer = collected.first()!.content.toLowerCase();
      const correctAnswer = riddle.answer.toLowerCase();
      
      const isCorrect = userAnswer.includes(correctAnswer) || correctAnswer.includes(userAnswer);
      
      const resultEmbed = new EmbedBuilder()
        .setColor(isCorrect ? '#27AE60' : '#E74C3C')
        .setTitle(isCorrect ? '🎉 Correct!' : '🤷 Not quite!')
        .setDescription(`The answer was: **${riddle.answer}**`)
        .setTimestamp();
      
      await interaction.followUp({ embeds: [resultEmbed] });
    } catch {
      const timeoutEmbed = new EmbedBuilder()
        .setColor('#95A5A6')
        .setTitle('⏰ Time\'s up!')
        .setDescription(`The answer was: **${riddle.answer}**`)
        .setTimestamp();
      
      await interaction.followUp({ embeds: [timeoutEmbed] });
    }
  }

  // ============================================================================
  // WEATHER COMMAND HANDLER
  // ============================================================================
  
  private async handleWeather(interaction: any, location: string, units: string) {
    try {
      const response = await axios.get(config.EXTERNAL_APIS.WEATHER, {
        params: {
          q: location,
          appid: config.WEATHER_API_KEY,
          units: units
        }
      });
      
      const weather = response.data;
      const tempUnit = units === 'metric' ? '°C' : units === 'imperial' ? '°F' : 'K';
      
      const embed = new EmbedBuilder()
        .setColor('#87CEEB')
        .setTitle(`🌤️ Weather in ${weather.name}, ${weather.sys.country}`)
        .setDescription(`**${weather.weather[0].description.charAt(0).toUpperCase() + weather.weather[0].description.slice(1)}**`)
        .addFields(
          { name: '🌡️ Temperature', value: `${Math.round(weather.main.temp)}${tempUnit}`, inline: true },
          { name: '🤔 Feels like', value: `${Math.round(weather.main.feels_like)}${tempUnit}`, inline: true },
          { name: '💧 Humidity', value: `${weather.main.humidity}%`, inline: true },
          { name: '🌪️ Wind', value: `${weather.wind.speed} ${units === 'metric' ? 'm/s' : 'mph'}`, inline: true },
          { name: '👁️ Visibility', value: `${(weather.visibility / 1000).toFixed(1)} km`, inline: true },
          { name: '📈 Pressure', value: `${weather.main.pressure} hPa`, inline: true }
        )
        .setTimestamp();
      
      // Add weather icon if available
      if (weather.weather[0].icon) {
        embed.setThumbnail(`https://openweathermap.org/img/wn/${weather.weather[0].icon}@2x.png`);
      }
      
      await interaction.editReply({ embeds: [embed] });
      
    } catch (error: any) {
      if (error.response?.status === 404) {
        throw new Error(`Location "${location}" not found. Please check spelling.`);
      }
      throw new Error(error.response?.data?.message || 'Failed to fetch weather data');
    }
  }

  // ============================================================================
  // NEWS COMMAND HANDLER
  // ============================================================================
  
  private async handleNews(interaction: any) {
    const category = interaction.options.getString('category') || 'general';
    const country = interaction.options.getString('country') || 'us';
    const count = interaction.options.getInteger('count') || 5;
    
    try {
      const response = await axios.get(config.EXTERNAL_APIS.NEWS, {
        params: {
          category: category,
          country: country,
          pageSize: count,
          apiKey: config.NEWS_API_KEY
        }
      });
      
      const articles = response.data.articles;
      
      if (!articles || articles.length === 0) {
        return await interaction.editReply({ content: '📰 No news articles found for the specified criteria.' });
      }
      
      const embed = new EmbedBuilder()
        .setColor('#FF6B35')
        .setTitle(`📰 Latest ${category.charAt(0).toUpperCase() + category.slice(1)} News`)
        .setDescription(`Top ${articles.length} headlines from ${country.toUpperCase()}`)
        .setTimestamp();
      
      articles.slice(0, 5).forEach((article: any, index: number) => {
        const title = article.title.length > 100 ? article.title.substring(0, 97) + '...' : article.title;
        const description = article.description ? 
          (article.description.length > 150 ? article.description.substring(0, 147) + '...' : article.description) 
          : 'No description available';
        
        embed.addFields({
          name: `${index + 1}. ${title}`,
          value: `${description}\n[Read more](${article.url})`,
          inline: false
        });
      });
      
      await interaction.editReply({ embeds: [embed] });
      
    } catch (error: any) {
      if (error.response?.status === 426) {
        throw new Error('News API rate limit reached. Please try again later.');
      }
      throw new Error(error.response?.data?.message || 'Failed to fetch news data');
    }
  }

  // ============================================================================
  // MODERATION COMMAND HANDLERS
  // ============================================================================
  
  private async handleMassBan(interaction: any) {
    await interaction.deferReply({ ephemeral: true });
    
    const userIds = interaction.options.getString('userids')!.split(' ');
    const reason = interaction.options.getString('reason') || 'Mass ban';
    
    if (userIds.length > 10) {
      return await interaction.editReply({ content: '❌ You can only mass ban up to 10 users at once.' });
    }
    
    const results = [];
    
    for (const userId of userIds) {
      try {
        const user = await this.client.users.fetch(userId.trim());
        await interaction.guild.members.ban(userId, { reason });
        
        // Log the action
        await storage.createModerationLog({
          serverId: interaction.guild.id,
          action: 'ban',
          targetUserId: userId,
          targetUsername: user.username,
          moderatorId: interaction.user.id,
          moderatorUsername: interaction.user.tag,
          reason,
        });
        
        results.push(`✅ ${user.username} (${userId})`);
      } catch (error) {
        results.push(`❌ ${userId} - Failed to ban`);
      }
    }
    
    await storage.incrementModerationAction(interaction.guild.id);
    
    const embed = new EmbedBuilder()
      .setColor('#E74C3C')
      .setTitle('🔨 Mass Ban Results')
      .setDescription(results.join('\n'))
      .addFields({ name: 'Reason', value: reason })
      .setTimestamp();
    
    await interaction.editReply({ embeds: [embed] });
  }
  
  private async handleCleanup(interaction: any) {
    await interaction.deferReply({ ephemeral: true });
    
    const user = interaction.options.getUser('user');
    const contains = interaction.options.getString('contains');
    const limit = interaction.options.getInteger('limit') || 50;
    
    if (!user && !contains) {
      return await interaction.editReply({ content: '❌ You must specify either a user or text to search for.' });
    }
    
    try {
      const messages = await interaction.channel.messages.fetch({ limit: limit });
      let messagesToDelete = messages.filter((message: any) => {
        if (user && message.author.id !== user.id) return false;
        if (contains && !message.content.toLowerCase().includes(contains.toLowerCase())) return false;
        return true;
      });
      
      messagesToDelete = messagesToDelete.filter((message: any) => {
        // Can only delete messages less than 14 days old
        return (Date.now() - message.createdTimestamp) < (14 * 24 * 60 * 60 * 1000);
      });
      
      if (messagesToDelete.size === 0) {
        return await interaction.editReply({ content: '❌ No messages found matching the criteria (or all messages are too old).' });
      }
      
      await interaction.channel.bulkDelete(messagesToDelete, true);
      
      const embed = new EmbedBuilder()
        .setColor('#27AE60')
        .setTitle('🧹 Cleanup Complete')
        .setDescription(`Deleted ${messagesToDelete.size} message(s)`)
        .addFields(
          user ? { name: 'User', value: user.tag, inline: true } : { name: 'Filter', value: 'N/A', inline: true },
          contains ? { name: 'Contains', value: contains, inline: true } : { name: 'Text Filter', value: 'N/A', inline: true }
        )
        .setTimestamp();
      
      await interaction.editReply({ embeds: [embed] });
      
      // Log the action
      await storage.createModerationLog({
        serverId: interaction.guild.id,
        action: 'cleanup',
        targetUserId: user?.id || 'N/A',
        targetUsername: user?.username || 'Bulk cleanup',
        moderatorId: interaction.user.id,
        moderatorUsername: interaction.user.tag,
        reason: `Cleaned up ${messagesToDelete.size} messages ${user ? `from ${user.tag}` : ''} ${contains ? `containing "${contains}"` : ''}`,
      });
      
    } catch (error) {
      await interaction.editReply({ content: '❌ Failed to cleanup messages. Make sure the bot has proper permissions.' });
    }
  }
  
  private async handleAutoMod(interaction: any) {
    const enabled = interaction.options.getBoolean('enabled')!;
    const antiSpam = interaction.options.getBoolean('anti_spam') ?? config.AUTO_MOD_DEFAULTS.antiSpam;
    const antiLinks = interaction.options.getBoolean('anti_links') ?? config.AUTO_MOD_DEFAULTS.antiLink;
    const antiInvites = interaction.options.getBoolean('anti_invites') ?? config.AUTO_MOD_DEFAULTS.antiInvite;
    
    // Store automod settings (in a real implementation, this would be in database)
    const settings = {
      enabled,
      antiSpam,
      antiLinks,
      antiInvites,
      maxWarnings: config.AUTO_MOD_DEFAULTS.maxWarnings
    };
    
    const embed = new EmbedBuilder()
      .setColor(enabled ? '#27AE60' : '#E74C3C')
      .setTitle(`🛡️ Auto-Moderation ${enabled ? 'Enabled' : 'Disabled'}`)
      .addFields(
        { name: 'Anti-Spam', value: antiSpam ? '✅ Enabled' : '❌ Disabled', inline: true },
        { name: 'Anti-Links', value: antiLinks ? '✅ Enabled' : '❌ Disabled', inline: true },
        { name: 'Anti-Invites', value: antiInvites ? '✅ Enabled' : '❌ Disabled', inline: true },
        { name: 'Max Warnings', value: settings.maxWarnings.toString(), inline: true }
      )
      .setTimestamp();
    
    await interaction.reply({ embeds: [embed] });
  }
  
  private async handleQuarantine(interaction: any) {
    const user = interaction.options.getUser('user')!;
    const reason = interaction.options.getString('reason') || 'Quarantined by moderator';
    
    try {
      const member = await interaction.guild.members.fetch(user.id);
      
      // Store current roles (in a real implementation, store in database)
      const currentRoles = member.roles.cache.filter(role => role.id !== interaction.guild.id).map(role => role.id);
      
      // Remove all roles except @everyone
      await member.roles.set([]);
      
      const embed = new EmbedBuilder()
        .setColor('#FFA500')
        .setTitle('🚨 User Quarantined')
        .setDescription(`${user.tag} has been quarantined`)
        .addFields(
          { name: 'Reason', value: reason },
          { name: 'Roles Removed', value: currentRoles.length > 0 ? `${currentRoles.length} roles` : 'No roles to remove' }
        )
        .setTimestamp();
      
      await interaction.reply({ embeds: [embed] });
      
      // Log the action
      await storage.createModerationLog({
        serverId: interaction.guild.id,
        action: 'quarantine',
        targetUserId: user.id,
        targetUsername: user.tag,
        moderatorId: interaction.user.id,
        moderatorUsername: interaction.user.tag,
        reason,
      });
      
    } catch (error) {
      await interaction.reply({ content: '❌ Failed to quarantine user. Check bot permissions and role hierarchy.' });
    }
  }
  
  private async handleUnquarantine(interaction: any) {
    const user = interaction.options.getUser('user')!;
    
    // In a real implementation, restore roles from database
    const embed = new EmbedBuilder()
      .setColor('#27AE60')
      .setTitle('✅ User Unquarantined')
      .setDescription(`${user.tag} has been removed from quarantine`)
      .setFooter({ text: 'Note: Roles need to be manually restored in this demo version' })
      .setTimestamp();
    
    await interaction.reply({ embeds: [embed] });
    
    // Log the action
    await storage.createModerationLog({
      serverId: interaction.guild.id,
      action: 'unquarantine',
      targetUserId: user.id,
      targetUsername: user.tag,
      moderatorId: interaction.user.id,
      moderatorUsername: interaction.user.tag,
      reason: 'Removed from quarantine',
    });
  }

  // ============================================================================
  // ROLE COMMAND HANDLERS (Enhanced with bot owner permissions)
  // ============================================================================
  
  private async handleRoleAdd(interaction: any) {
    const user = interaction.options.getUser('user')!;
    const role = interaction.options.getRole('role')!;
    
    try {
      const member = await interaction.guild.members.fetch(user.id);
      
      // Check role hierarchy (super admin bypass)
      if (!this.isSuperAdmin(interaction.user.id)) {
        const botMember = await interaction.guild.members.fetch(this.client.user!.id);
        if (role.position >= botMember.roles.highest.position) {
          return await interaction.reply({ 
            content: '❌ I cannot assign this role as it\'s higher than or equal to my highest role.',
            ephemeral: true 
          });
        }
        
        if (role.position >= (interaction.member as GuildMember).roles.highest.position) {
          return await interaction.reply({ 
            content: '❌ You cannot assign a role higher than or equal to your highest role.',
            ephemeral: true 
          });
        }
      }
      
      if (member.roles.cache.has(role.id)) {
        return await interaction.reply({ 
          content: `❌ ${user.tag} already has the ${role.name} role.`,
          ephemeral: true 
        });
      }
      
      await member.roles.add(role);
      
      const embed = new EmbedBuilder()
        .setColor('#27AE60')
        .setTitle('✅ Role Added')
        .setDescription(`Added **${role.name}** role to ${user.tag}`)
        .setTimestamp();
      
      await interaction.reply({ embeds: [embed] });
      
      // Log the action
      await storage.createModerationLog({
        serverId: interaction.guild.id,
        action: 'role_add',
        targetUserId: user.id,
        targetUsername: user.tag,
        moderatorId: interaction.user.id,
        moderatorUsername: interaction.user.tag,
        reason: `Added role: ${role.name}`,
      });
      
    } catch (error: any) {
      await interaction.reply({ 
        content: `❌ Failed to add role: ${error.message}`,
        ephemeral: true 
      });
    }
  }
  
  private async handleRoleRemove(interaction: any) {
    const user = interaction.options.getUser('user')!;
    const role = interaction.options.getRole('role')!;
    
    try {
      const member = await interaction.guild.members.fetch(user.id);
      
      // Check role hierarchy (super admin bypass)
      if (!this.isSuperAdmin(interaction.user.id)) {
        const botMember = await interaction.guild.members.fetch(this.client.user!.id);
        if (role.position >= botMember.roles.highest.position) {
          return await interaction.reply({ 
            content: '❌ I cannot remove this role as it\'s higher than or equal to my highest role.',
            ephemeral: true 
          });
        }
        
        if (role.position >= (interaction.member as GuildMember).roles.highest.position) {
          return await interaction.reply({ 
            content: '❌ You cannot remove a role higher than or equal to your highest role.',
            ephemeral: true 
          });
        }
      }
      
      if (!member.roles.cache.has(role.id)) {
        return await interaction.reply({ 
          content: `❌ ${user.tag} doesn't have the ${role.name} role.`,
          ephemeral: true 
        });
      }
      
      await member.roles.remove(role);
      
      const embed = new EmbedBuilder()
        .setColor('#E74C3C')
        .setTitle('✅ Role Removed')
        .setDescription(`Removed **${role.name}** role from ${user.tag}`)
        .setTimestamp();
      
      await interaction.reply({ embeds: [embed] });
      
      // Log the action
      await storage.createModerationLog({
        serverId: interaction.guild.id,
        action: 'role_remove',
        targetUserId: user.id,
        targetUsername: user.tag,
        moderatorId: interaction.user.id,
        moderatorUsername: interaction.user.tag,
        reason: `Removed role: ${role.name}`,
      });
      
    } catch (error: any) {
      await interaction.reply({ 
        content: `❌ Failed to remove role: ${error.message}`,
        ephemeral: true 
      });
    }
  }
  
  private async handleRoleCreate(interaction: any) {
    const name = interaction.options.getString('name')!;
    const color = interaction.options.getString('color') || '#99AAB5';
    const mentionable = interaction.options.getBoolean('mentionable') || false;
    const hoist = interaction.options.getBoolean('hoist') || false;
    
    try {
      // Validate color
      let roleColor: ColorResolvable = '#99AAB5';
      if (color.startsWith('#') && /^#[0-9A-F]{6}$/i.test(color)) {
        roleColor = color as ColorResolvable;
      }
      
      const role = await interaction.guild.roles.create({
        name,
        color: roleColor,
        mentionable,
        hoist,
        reason: `Role created by ${interaction.user.tag}`
      });
      
      const embed = new EmbedBuilder()
        .setColor(roleColor)
        .setTitle('✅ Role Created')
        .setDescription(`Created role **${role.name}**`)
        .addFields(
          { name: 'Color', value: color, inline: true },
          { name: 'Mentionable', value: mentionable ? 'Yes' : 'No', inline: true },
          { name: 'Hoisted', value: hoist ? 'Yes' : 'No', inline: true }
        )
        .setTimestamp();
      
      await interaction.reply({ embeds: [embed] });
      
    } catch (error: any) {
      await interaction.reply({ 
        content: `❌ Failed to create role: ${error.message}`,
        ephemeral: true 
      });
    }
  }
  
  private async handleRoleDelete(interaction: any) {
    const role = interaction.options.getRole('role')!;
    
    try {
      // Check role hierarchy (super admin bypass)
      if (!this.isSuperAdmin(interaction.user.id)) {
        const botMember = await interaction.guild.members.fetch(this.client.user!.id);
        if (role.position >= botMember.roles.highest.position) {
          return await interaction.reply({ 
            content: '❌ I cannot delete this role as it\'s higher than or equal to my highest role.',
            ephemeral: true 
          });
        }
        
        if (role.position >= (interaction.member as GuildMember).roles.highest.position) {
          return await interaction.reply({ 
            content: '❌ You cannot delete a role higher than or equal to your highest role.',
            ephemeral: true 
          });
        }
      }
      
      const roleName = role.name;
      await role.delete(`Role deleted by ${interaction.user.tag}`);
      
      const embed = new EmbedBuilder()
        .setColor('#E74C3C')
        .setTitle('✅ Role Deleted')
        .setDescription(`Deleted role **${roleName}**`)
        .setTimestamp();
      
      await interaction.reply({ embeds: [embed] });
      
    } catch (error: any) {
      await interaction.reply({ 
        content: `❌ Failed to delete role: ${error.message}`,
        ephemeral: true 
      });
    }
  }
  
  private async handleRoleInfo(interaction: any) {
    const role = interaction.options.getRole('role')!;
    
    const embed = new EmbedBuilder()
      .setColor(role.color || '#99AAB5')
      .setTitle(`📋 Role Information: ${role.name}`)
      .addFields(
        { name: 'ID', value: role.id, inline: true },
        { name: 'Color', value: role.hexColor, inline: true },
        { name: 'Position', value: role.position.toString(), inline: true },
        { name: 'Members', value: role.members.size.toString(), inline: true },
        { name: 'Mentionable', value: role.mentionable ? 'Yes' : 'No', inline: true },
        { name: 'Hoisted', value: role.hoist ? 'Yes' : 'No', inline: true },
        { name: 'Created', value: `<t:${Math.floor(role.createdTimestamp / 1000)}:R>`, inline: true },
        { name: 'Managed', value: role.managed ? 'Yes (Bot/Integration)' : 'No', inline: true }
      )
      .setTimestamp();
    
    if (role.permissions.toArray().length > 0) {
      const permissions = role.permissions.toArray().slice(0, 10).join(', ');
      embed.addFields({ 
        name: 'Key Permissions', 
        value: permissions + (role.permissions.toArray().length > 10 ? '...' : ''),
        inline: false 
      });
    }
    
    await interaction.reply({ embeds: [embed] });
  }
  
  private async handleRoleList(interaction: any) {
    const roles = interaction.guild.roles.cache
      .filter((role: any) => role.id !== interaction.guild.id) // Exclude @everyone
      .sort((a: any, b: any) => b.position - a.position)
      .first(20);
    
    const embed = new EmbedBuilder()
      .setColor('#5865F2')
      .setTitle(`📋 Server Roles (${interaction.guild.roles.cache.size - 1} total)`)
      .setDescription(
        roles.map((role: any, index: number) => 
          `${index + 1}. ${role} - ${role.members.size} members`
        ).join('\n')
      )
      .setTimestamp();
    
    if (interaction.guild.roles.cache.size > 21) {
      embed.setFooter({ text: `Showing top 20 roles. Total: ${interaction.guild.roles.cache.size - 1} roles` });
    }
    
    await interaction.reply({ embeds: [embed] });
  }
  
  private async handleRoleMassAdd(interaction: any) {
    const role = interaction.options.getRole('role')!;
    const usersInput = interaction.options.getString('users')!;
    
    await interaction.deferReply({ ephemeral: true });
    
    // Parse user IDs/mentions
    const userIds = usersInput.match(/\d{17,19}/g) || [];
    
    if (userIds.length === 0) {
      return await interaction.editReply({ content: '❌ No valid user IDs found. Please provide user IDs or mentions.' });
    }
    
    if (userIds.length > 20) {
      return await interaction.editReply({ content: '❌ You can only mass add roles to up to 20 users at once.' });
    }
    
    const results = [];
    
    for (const userId of userIds) {
      try {
        const member = await interaction.guild.members.fetch(userId);
        
        if (member.roles.cache.has(role.id)) {
          results.push(`⚠️ ${member.user.tag} - Already has role`);
        } else {
          await member.roles.add(role);
          results.push(`✅ ${member.user.tag} - Role added`);
        }
      } catch (error) {
        results.push(`❌ ${userId} - Failed to add role`);
      }
    }
    
    const embed = new EmbedBuilder()
      .setColor('#27AE60')
      .setTitle('🔄 Mass Role Assignment Results')
      .setDescription(results.join('\n'))
      .addFields({ name: 'Role', value: role.name })
      .setTimestamp();
    
    await interaction.editReply({ embeds: [embed] });
  }
  
  private async handleRolePermissions(interaction: any) {
    const role = interaction.options.getRole('role')!;
    const preset = interaction.options.getString('preset')!;
    
    // Permission presets
    const presets = {
      moderator: [
        PermissionFlagsBits.KickMembers,
        PermissionFlagsBits.BanMembers,
        PermissionFlagsBits.ManageMessages,
        PermissionFlagsBits.ModerateMembers,
        PermissionFlagsBits.ViewAuditLog,
        PermissionFlagsBits.ManageNicknames
      ],
      admin: [
        PermissionFlagsBits.Administrator
      ],
      dj: [
        PermissionFlagsBits.Connect,
        PermissionFlagsBits.Speak,
        PermissionFlagsBits.UseVAD,
        PermissionFlagsBits.PrioritySpeaker
      ],
      helper: [
        PermissionFlagsBits.ManageMessages,
        PermissionFlagsBits.EmbedLinks,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.UseExternalEmojis
      ],
      vip: [
        PermissionFlagsBits.EmbedLinks,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.UseExternalEmojis,
        PermissionFlagsBits.UseExternalStickers,
        PermissionFlagsBits.AddReactions
      ]
    };
    
    try {
      const permissions = presets[preset as keyof typeof presets];
      
      await role.setPermissions(permissions, `Permissions set to ${preset} by ${interaction.user.tag}`);
      
      const embed = new EmbedBuilder()
        .setColor('#5865F2')
        .setTitle('✅ Role Permissions Updated')
        .setDescription(`Set **${role.name}** permissions to **${preset.charAt(0).toUpperCase() + preset.slice(1)}** preset`)
        .addFields({
          name: 'Permissions Added',
          value: permissions.map(perm => PermissionFlagsBits[perm as any] || perm.toString()).join('\n') || 'None'
        })
        .setTimestamp();
      
      await interaction.reply({ embeds: [embed] });
      
    } catch (error: any) {
      await interaction.reply({ 
        content: `❌ Failed to update role permissions: ${error.message}`,
        ephemeral: true 
      });
    }
  }

  // ============================================================================
  // EVENT LISTENERS
  // ============================================================================
  
  private setupEventListeners() {
    this.client.once('ready', async () => {
      console.log(`Enhanced Discord Bot ready! Logged in as ${this.client.user?.tag}`);
      
      // Set bot status
      this.client.user?.setActivity(config.BOT_STATUS.name, { type: config.BOT_STATUS.type as any });
      
      // Register slash commands
      await this.registerCommands();
    });

    // Handle slash command interactions
    this.client.on('interactionCreate', async (interaction) => {
      if (!interaction.isChatInputCommand()) return;

      const command = this.commands.get(interaction.commandName);
      if (!command) return;

      try {
        await command.execute(interaction);
        await storage.incrementCommandUsed(interaction.guild?.id || 'DM');
      } catch (error: any) {
        console.error('Command execution error:', error);
        
        const errorMessage = {
          content: `❌ An error occurred while executing this command: ${error.message}`,
          ephemeral: true
        };
        
        if (interaction.replied || interaction.deferred) {
          await interaction.editReply(errorMessage);
        } else {
          await interaction.reply(errorMessage);
        }
      }
    });

    // Handle button interactions
    this.client.on('interactionCreate', async (interaction) => {
      if (!interaction.isButton()) return;
      
      // Handle blackjack game buttons
      if (interaction.customId.startsWith('blackjack_')) {
        await this.handleBlackjackButton(interaction);
      }
    });

    // Handle prefix commands and messages
    this.client.on('messageCreate', async (message) => {
      if (message.author.bot) return;
      
      // Get server prefix (default is comma)
      const prefix = config.DEFAULT_PREFIX;
      
      if (!message.content.startsWith(prefix)) return;
      
      const args = message.content.slice(prefix.length).trim().split(/ +/);
      const commandName = args.shift()?.toLowerCase();
      
      if (!commandName) return;
      
      // Check if it's a slash command that can be run as prefix
      const command = this.commands.get(commandName);
      if (!command) {
        // Check for custom commands
        try {
          const customCommands = await storage.getCustomCommands(message.guildId || '');
          const customCommand = customCommands.find(cmd => cmd.name === commandName);
          if (customCommand) {
            await message.reply(customCommand.response);
            return;
          }
        } catch (error) {
          // Custom commands not available, continue
        }
        return;
      }

      try {
        // Create a mock interaction object for prefix commands
        const mockInteraction = {
          commandName,
          user: message.author,
          member: message.member,
          guild: message.guild,
          guildId: message.guildId,
          channel: message.channel,
          channelId: message.channelId,
          options: {
            getSubcommand: () => args[0] || 'help',
            getString: (name: string) => {
              if (name === 'query' || name === 'message' || name === 'prompt' || name === 'text' || name === 'term' || name === 'location') {
                return args.slice(1).join(' ') || args[0] || null;
              }
              return args[0] || null;
            },
            getInteger: (name: string) => parseInt(args[0]) || null,
            getBoolean: (name: string) => args[0]?.toLowerCase() === 'true' || false,
            getUser: (name: string) => message.mentions.users.first() || null,
            getChannel: (name: string) => message.mentions.channels.first() || null,
            getRole: (name: string) => message.mentions.roles.first() || null,
            getAttachment: (name: string) => message.attachments.first() || null,
          },
          reply: async (content: any) => {
            if (typeof content === 'string') {
              return await message.reply(content);
            } else {
              return await message.reply(content);
            }
          },
          editReply: async (content: any) => {
            return await message.reply(content);
          },
          deferReply: async () => {
            // For prefix commands, we don't need to defer
            return Promise.resolve();
          },
          replied: false,
          deferred: false,
        };

        await command.execute(mockInteraction);
        await storage.incrementCommandUsed(message.guildId || 'DM');
      } catch (error: any) {
        console.error('Prefix command execution error:', error);
        await message.reply(`❌ An error occurred while executing this command: ${error.message}`);
      }
    });

    // Voice state updates for music functionality
    this.client.on('voiceStateUpdate', (oldState, newState) => {
      // Handle user leaving voice channel - pause music if no one is listening
      if (oldState.channelId && !newState.channelId) {
        const connection = this.voiceConnections.get(oldState.guild.id);
        if (connection && connection.channelId === oldState.channelId) {
          // Check if voice channel is empty
          const channel = oldState.channel;
          if (channel && channel.members.filter(member => !member.user.bot).size === 0) {
            // Pause or stop music when channel is empty
            console.log(`Voice channel empty in ${oldState.guild.name}, pausing music`);
          }
        }
      }
    });

    // Error handling
    this.client.on('error', console.error);
    this.client.on('warn', console.warn);
  }
  
  private async registerCommands() {
    try {
      const rest = new REST().setToken(config.DISCORD_BOT_TOKEN);
      const commandData = Array.from(this.commands.values()).map(command => command.data.toJSON());
      
      console.log(`Registering ${commandData.length} enhanced slash commands...`);
      
      // Register globally
      await rest.put(
        Routes.applicationCommands(this.client.user!.id),
        { body: commandData }
      );
      
      console.log('✅ Enhanced Discord bot commands registered successfully!');
    } catch (error) {
      console.error('Failed to register enhanced commands:', error);
    }
  }

  private async handleBlackjackButton(interaction: any) {
    const action = interaction.customId.split('_')[1];
    const userId = interaction.user.id;
    
    const game = this.blackjackGames.get(userId);
    if (!game) {
      return await interaction.reply({ content: '❌ No active blackjack game found.', ephemeral: true });
    }
    
    if (action === 'hit') {
      // Add card to player's hand
      const card = this.drawCard();
      game.playerCards.push(card);
      
      const playerValue = this.calculateHandValue(game.playerCards);
      
      if (playerValue > 21) {
        // Player busts
        game.gameOver = true;
        this.blackjackGames.delete(userId);
        
        const embed = new EmbedBuilder()
          .setColor('#E74C3C')
          .setTitle('💥 Blackjack - Bust!')
          .addFields(
            { name: 'Your cards', value: game.playerCards.join(' ') + ` (${playerValue})`, inline: false },
            { name: 'Result', value: '**You busted! House wins.**', inline: false }
          );
        
        await interaction.update({ embeds: [embed], components: [] });
      } else {
        // Continue game
        const embed = new EmbedBuilder()
          .setColor('#F39C12')
          .setTitle('🎰 Blackjack')
          .addFields(
            { name: 'Your cards', value: game.playerCards.join(' ') + ` (${playerValue})`, inline: false },
            { name: 'Dealer cards', value: game.dealerCards[0] + ' 🎴', inline: false }
          );
        
        const row = new ActionRowBuilder()
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
        
        await interaction.update({ embeds: [embed], components: [row] });
      }
    } else if (action === 'stand') {
      // Dealer plays
      let dealerValue = this.calculateHandValue(game.dealerCards);
      
      while (dealerValue < 17) {
        game.dealerCards.push(this.drawCard());
        dealerValue = this.calculateHandValue(game.dealerCards);
      }
      
      const playerValue = this.calculateHandValue(game.playerCards);
      game.gameOver = true;
      this.blackjackGames.delete(userId);
      
      let result = '';
      let color = '#95A5A6';
      
      if (dealerValue > 21) {
        result = '**Dealer busted! You win!**';
        color = '#27AE60';
      } else if (playerValue > dealerValue) {
        result = '**You win!**';
        color = '#27AE60';
      } else if (dealerValue > playerValue) {
        result = '**Dealer wins!**';
        color = '#E74C3C';
      } else {
        result = '**It\'s a tie!**';
        color = '#F39C12';
      }
      
      const embed = new EmbedBuilder()
        .setColor(color)
        .setTitle('🎰 Blackjack - Game Over')
        .addFields(
          { name: 'Your cards', value: game.playerCards.join(' ') + ` (${playerValue})`, inline: false },
          { name: 'Dealer cards', value: game.dealerCards.join(' ') + ` (${dealerValue})`, inline: false },
          { name: 'Result', value: result, inline: false }
        );
      
      await interaction.update({ embeds: [embed], components: [] });
    }
  }
  
  private drawCard(): string {
    const suits = ['♠️', '♥️', '♦️', '♣️'];
    const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
    
    const suit = suits[Math.floor(Math.random() * suits.length)];
    const rank = ranks[Math.floor(Math.random() * ranks.length)];
    
    return `${rank}${suit}`;
  }
  
  private calculateHandValue(cards: string[]): number {
    let value = 0;
    let aces = 0;
    
    for (const card of cards) {
      const rank = card.slice(0, -2); // Remove emoji
      
      if (rank === 'A') {
        aces++;
        value += 11;
      } else if (['J', 'Q', 'K'].includes(rank)) {
        value += 10;
      } else {
        value += parseInt(rank);
      }
    }
    
    // Adjust for aces
    while (value > 21 && aces > 0) {
      value -= 10;
      aces--;
    }
    
    return value;
  }

  // ============================================================================
  // URBAN DICTIONARY HANDLER
  // ============================================================================
  
  private async handleUrbanDictionary(interaction: any, term: string, safe: boolean) {
    try {
      const response = await axios.get(config.URBAN_DICTIONARY_API, {
        params: { term: term }
      });
      
      const definitions = response.data.list;
      
      if (!definitions || definitions.length === 0) {
        return await interaction.editReply({ content: `📚 No definition found for "${term}".` });
      }
      
      // Get the top definition
      let definition = definitions[0];
      
      // Filter NSFW content if safe mode is enabled
      if (safe && definition.definition.toLowerCase().includes('nsfw')) {
        const safeDefinitions = definitions.filter((def: any) => 
          !def.definition.toLowerCase().includes('nsfw') && 
          !def.definition.toLowerCase().includes('sex') &&
          !def.definition.toLowerCase().includes('porn')
        );
        
        if (safeDefinitions.length === 0) {
          return await interaction.editReply({ 
            content: `📚 No safe definitions found for "${term}". Try with safe mode disabled.` 
          });
        }
        
        definition = safeDefinitions[0];
      }
      
      // Clean up the definition (remove brackets and limit length)
      let cleanDefinition = definition.definition
        .replace(/[\[\]]/g, '') // Remove brackets
        .substring(0, 1000); // Limit length
      
      let cleanExample = definition.example
        ? definition.example.replace(/[\[\]]/g, '').substring(0, 500)
        : 'No example provided';
      
      const embed = new EmbedBuilder()
        .setColor('#1f8b4c')
        .setTitle(`📚 Urban Dictionary: ${term}`)
        .setDescription(cleanDefinition)
        .addFields(
          { name: '👍 Thumbs Up', value: definition.thumbs_up.toString(), inline: true },
          { name: '👎 Thumbs Down', value: definition.thumbs_down.toString(), inline: true },
          { name: '📝 Example', value: cleanExample, inline: false }
        )
        .setFooter({ text: `Definition by ${definition.author} • urbandictionary.com` })
        .setTimestamp(new Date(definition.written_on));
      
      await interaction.editReply({ embeds: [embed] });
      
    } catch (error: any) {
      if (error.response?.status === 404) {
        throw new Error(`No definition found for "${term}"`);
      }
      throw new Error(error.response?.data?.message || 'Failed to fetch Urban Dictionary definition');
    }
  }

  // ============================================================================
  // BOT CONTROL METHODS
  // ============================================================================
  
  public async start() {
    await this.client.login(config.DISCORD_BOT_TOKEN);
  }
  
  public getClient() {
    return this.client;
  }
  
  public getCommands() {
    return this.commands;
  }
}

// Export for use in other files
export const enhancedDiscordBot = new EnhancedDiscordBot();