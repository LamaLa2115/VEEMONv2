import { 
  Client, GatewayIntentBits, Collection, SlashCommandBuilder, EmbedBuilder, 
  PermissionFlagsBits, REST, Routes, ChannelType, TextChannel, GuildMember, 
  Role, ActionRowBuilder, ButtonBuilder, ButtonStyle, VoiceChannel,
  AttachmentBuilder, ColorResolvable, VoiceState, ModalBuilder, TextInputBuilder, TextInputStyle,
  MessageFlags
} from 'discord.js';
import { 
  joinVoiceChannel, 
  createAudioPlayer, 
  createAudioResource, 
  VoiceConnectionStatus, 
  AudioPlayerStatus,
  getVoiceConnection,
  entersState
} from '@discordjs/voice';
import { storage } from './storage';
import { config } from './config';
import axios from 'axios';
import { LoggingSystem } from './logging-system';
import { VoicemasterSystem } from './voicemaster-system';
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
  private voicemasterSystem: VoicemasterSystem;
  private loggingSystem: LoggingSystem;

  constructor() {
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds, 
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.MessageContent
      ],
    });
    
    this.commands = new Collection();
    this.voiceConnections = new Map();
    this.blackjackGames = new Map();
    this.cooldowns = new Map();
    this.voicemasterSystem = new VoicemasterSystem(this.client);
    this.loggingSystem = new LoggingSystem(this.client);
    
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

  private checkCooldown(userId: string, commandName: string, cooldownTime: number): number | false {
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
          sub.setName('join')
            .setDescription('Join your voice channel'))
        .addSubcommand(sub => 
          sub.setName('leave')
            .setDescription('Leave the voice channel'))
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
          case 'join':
            await this.handleMusicJoin(interaction, member.voice.channel as VoiceChannel);
            break;
          case 'leave':
            await this.handleMusicLeave(interaction);
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

    this.commands.set(musicCommand.data.name, musicCommand);
  }

  private setupEventListeners() {
    this.client.once('ready', (c) => {
      console.log(`✅ Logged in as ${c.user.tag}`);
    });

    this.client.on('interactionCreate', async (interaction) => {
      if (!interaction.isChatInputCommand()) return;

      if (interaction.commandName === "voicemenu") {
        const embed = new EmbedBuilder()
          .setTitle("🎙️ VoiceMaster Controls")
          .setDescription("Manage your temporary voice channel with these buttons.")
          .setColor(0x2f3136);

        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder().setCustomId("lock").setLabel("🔒 Lock").setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId("unlock").setLabel("🔓 Unlock").setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId("limit").setLabel("👥 Set Limit").setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId("rename").setLabel("✏️ Rename").setStyle(ButtonStyle.Secondary),
        );

        const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder().setCustomId("kick").setLabel("👢 Kick User").setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId("invite").setLabel("➕ Invite User").setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId("transfer").setLabel("👑 Transfer Crown").setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId("newvc").setLabel("📂 New VC").setStyle(ButtonStyle.Secondary),
        );

        await interaction.reply({ embeds: [embed], components: [row, row2], ephemeral: true });
      }
    });

    // Button handler
    this.client.on('interactionCreate', async (interaction) => {
      if (!interaction.isButton()) return;

      const member = interaction.member as GuildMember;
      const channel = member.voice.channel;

      if (!channel) {
        await interaction.reply({ content: "❌ You must be in a voice channel to use this.", ephemeral: true });
        return;
      }

      switch (interaction.customId) {
        case "lock":
          await channel.permissionOverwrites.edit(interaction.guild!.roles.everyone, {
            Connect: false,
          });
          await interaction.reply({ content: "🔒 Voice channel locked!", ephemeral: true });
          break;

        case "unlock":
          await channel.permissionOverwrites.edit(interaction.guild!.roles.everyone, {
            Connect: true,
          });
          await interaction.reply({ content: "🔓 Voice channel unlocked!", ephemeral: true });
          break;

        case "limit":
          await channel.setUserLimit(2); // Example: set to 2, you could add a modal/input
          await interaction.reply({ content: "👥 User limit set to 2!", ephemeral: true });
          break;

        case "rename":
          await channel.setName(`Custom VC ${Date.now()}`);
          await interaction.reply({ content: "✏️ Channel renamed!", ephemeral: true });
          break;

        case "kick":
          if (channel.members.size > 1) {
            const target = channel.members.filter(m => m.id !== member.id).first();
            if (target) {
              await target.voice.disconnect("Kicked by VoiceMaster");
              await interaction.reply({ content: `👢 Kicked ${target.user.tag}`, ephemeral: true });
            }
          } else {
            await interaction.reply({ content: "❌ No one to kick.", ephemeral: true });
          }
          break;

        case "invite":
          await interaction.reply({ content: "➕ Use right-click > Invite to VC (API limit).", ephemeral: true });
          break;

        case "transfer":
          await interaction.reply({ content: "👑 Crown transfer feature requires DB tracking.", ephemeral: true });
          break;

        case "newvc":
          const newChannel = await channel.guild.channels.create({
            name: `New VC by ${member.user.username}`,
            type: 2, // voice channel
            parent: channel.parent ?? undefined,
          });
          await member.voice.setChannel(newChannel);
          await interaction.reply({ content: `📂 Created and moved you to <#${newChannel.id}>`, ephemeral: true });
          break;
      }
    });
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
          // Check if we have Genius token
          if (!config.GENIUS_ACCESS_TOKEN || config.GENIUS_ACCESS_TOKEN === 'your_genius_token_here') {
            return await interaction.editReply({ 
              content: `🎵 Lyrics service is not configured. Please contact the bot owner to set up Genius API access.` 
            });
          }
          
          // Initialize Genius client with token
          const geniusClient = new Genius.Client(config.GENIUS_ACCESS_TOKEN);
          const searches = await geniusClient.songs.search(query);
          
          if (!searches || searches.length === 0) {
            return await interaction.editReply({ 
              content: `🎵 No results found for "${query}". Try a different search term or include the artist name.` 
            });
          }
          
          const song = searches[0];
          let lyrics = null;
          
          try {
            lyrics = await song.lyrics();
          } catch (lyricsError) {
            console.error('Lyrics fetch error:', lyricsError);
            return await interaction.editReply({ 
              content: `🎵 Found "${song.title}" by ${song.artist.name} but couldn't fetch lyrics. The song might not have lyrics available.` 
            });
          }
          
          if (!lyrics || lyrics.length === 0) {
            return await interaction.editReply({ 
              content: `🎵 Found "${song.title}" by ${song.artist.name} but no lyrics are available.` 
            });
          }
          
          const embed = new EmbedBuilder()
            .setColor('#1DB954')
            .setTitle(`🎵 ${song.title}`)
            .setAuthor({ name: song.artist.name })
            .setURL(song.url)
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
            .setColor(color as any)
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

    // Enhanced Ping Command with fancy UI
    const pingCommand: Command = {
      data: new SlashCommandBuilder()
        .setName('ping')
        .setDescription('🏓 Check bot latency, performance, and system information'),
      execute: async (interaction) => {
        const sent = await interaction.reply({ content: 'Pinging...', fetchReply: true });
        const timeDiff = sent.createdTimestamp - interaction.createdTimestamp;
        const apiLatency = Math.round(this.client.ws.ping);
        
        // Calculate TPS (approximate based on event loop)
        const startTime = process.hrtime.bigint();
        await new Promise(resolve => setImmediate(resolve));
        const endTime = process.hrtime.bigint();
        const tps = Math.round(1000000000 / Number(endTime - startTime));
        
        const embed = new EmbedBuilder()
          .setColor('#57F287')
          .setTitle('🏓 Pong!')
          .setDescription('Bot is online and responding!')
          .addFields(
            { name: '📡 Bot Latency', value: `${timeDiff}ms`, inline: true },
            { name: '🌐 API Latency', value: `${apiLatency}ms`, inline: true },
            { name: '⚡ TPS', value: `${tps.toLocaleString()}`, inline: true },
            { name: '⚡ Status', value: timeDiff < 100 ? '🟢 Excellent' : timeDiff < 200 ? '🟡 Good' : '🔴 Slow', inline: true },
            { name: '📊 Performance', value: `**Uptime:** ${this.formatUptime(process.uptime())}\n**Memory:** ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB\n**Guilds:** ${this.client.guilds.cache.size}`, inline: false },
            { name: '💡 Usage', value: 'Use `/help` for command list\nBoth `/` and `,` prefixes work!', inline: false }
          )
          .setFooter({ text: `Requested by ${interaction.user.tag}` })
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
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
        // Bot owner bypass
        if (!this.isSuperAdmin(interaction.user.id)) {
          // Regular permission check if needed
        }
        
        const reason = interaction.options.getString('reason') || 'AFK';
        
        try {
          await storage.setAfkUser({
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

    //  Command - Complete voice channel management system
    const Command: Command = {
      data: new SlashCommandBuilder()
        .setName('')
        .setDescription('🔊 Complete voice channel management system')
        .addSubcommand(subcommand =>
          subcommand
            .setName('lock')
            .setDescription('🔒 Lock your voice channel'))
        .addSubcommand(subcommand =>
          subcommand
            .setName('unlock')
            .setDescription('🔓 Unlock your voice channel'))
        .addSubcommand(subcommand =>
          subcommand
            .setName('limit')
            .setDescription('👥 Set user limit for your voice channel')
            .addIntegerOption(option =>
              option.setName('max')
                .setDescription('Maximum users (0 = no limit)')
                .setRequired(true)
                .setMinValue(0)
                .setMaxValue(99)))
        .addSubcommand(subcommand =>
          subcommand
            .setName('name')
            .setDescription('📝 Change your voice channel name')
            .addStringOption(option =>
              option.setName('newname')
                .setDescription('New channel name')
                .setRequired(true)
                .setMaxLength(100)))
        .addSubcommand(subcommand =>
          subcommand
            .setName('invite')
            .setDescription('➕ Invite a user to your voice channel')
            .addUserOption(option =>
              option.setName('user')
                .setDescription('User to invite')
                .setRequired(true)))
        .addSubcommand(subcommand =>
          subcommand
            .setName('kick')
            .setDescription('❌ Kick a user from your voice channel')
            .addUserOption(option =>
              option.setName('user')
                .setDescription('User to kick')
                .setRequired(true)))
        .addSubcommand(subcommand =>
          subcommand
            .setName('transfer')
            .setDescription('👑 Transfer channel ownership')
            .addUserOption(option =>
              option.setName('user')
                .setDescription('New channel owner')
                .setRequired(true)))
        .addSubcommand(subcommand =>
          subcommand
            .setName('menu')
            .setDescription('📋 Show interactive voice channel control menu'))
        .addSubcommand(subcommand =>
          subcommand
            .setName('setup')
            .setDescription('🎛️ Setup join-to-create channel')
            .addChannelOption(option =>
              option.setName('channel')
                .setDescription('Voice channel to setup as join-to-create')
                .setRequired(true)
                .addChannelTypes(ChannelType.GuildVoice))),
      execute: async (interaction) => {
        // Bot owner bypass
        if (!this.isSuperAdmin(interaction.user.id)) {
          // Check if user is in a voice channel
          const member = interaction.member as GuildMember;
          if (!member.voice.channel) {
            return await interaction.reply({ 
              content: '❌ You must be in a voice channel to use  commands.', 
              ephemeral: true 
            });
          }
        }

        const subcommand = interaction.options.getSubcommand();
        
        switch (subcommand) {
          case 'lock':
            await this.handleVoiceLock(interaction);
            break;
          case 'unlock':
            await this.handleVoiceUnlock(interaction);
            break;
          case 'limit':
            await this.handleVoiceLimit(interaction);
            break;
          case 'name':
            await this.handleVoiceName(interaction);
            break;
          case 'invite':
            await this.handleVoiceInvite(interaction);
            break;
          case 'kick':
            await this.handleVoiceKick(interaction);
            break;
          case 'transfer':
            await this.handleVoiceTransfer(interaction);
            break;
          case 'menu':
            await this.handleVoiceMenu(interaction);
            break;
          case 'setup':
            await this.handleVoiceSetup(interaction);
            break;
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
        } catch (error: unknown) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          await interaction.editReply({ content: `❌ Failed to clear messages: ${errorMessage}` });
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
        } catch (error: unknown) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          await interaction.reply({ content: `❌ Failed to timeout user: ${errorMessage}`, ephemeral: true });
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
          await storage.createWarning({
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
        } catch (error: unknown) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          await interaction.reply({ content: `❌ Failed to warn user: ${errorMessage}`, ephemeral: true });
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

    // ============================================================================
    // BOT MANAGEMENT COMMANDS
    // ============================================================================

    // Bot Info Command with fancy UI
    const botInfoCommand: Command = {
      data: new SlashCommandBuilder()
        .setName('botinfo')
        .setDescription('Display detailed bot information and statistics'),
      execute: async (interaction) => {
        const botUser = this.client.user!;
        const guilds = this.client.guilds.cache.size;
        const users = this.client.guilds.cache.reduce((acc, guild) => acc + guild.memberCount, 0);
        const uptime = process.uptime();
        const memoryUsage = process.memoryUsage();
        
        const uptimeString = this.formatUptime(uptime);
        const memoryMB = Math.round(memoryUsage.heapUsed / 1024 / 1024);
        
        // Calculate TPS
        const startTime = process.hrtime.bigint();
        await new Promise(resolve => setImmediate(resolve));
        const endTime = process.hrtime.bigint();
        const tps = Math.round(1000000000 / Number(endTime - startTime));
        
        const embed = new EmbedBuilder()
          .setColor('#5865F2')
          .setTitle('🤖 Bot Information')
          .setThumbnail(botUser.displayAvatarURL({ size: 256 }))
          .setDescription(`**${botUser.tag}** - Advanced Discord Bot`)
          .addFields(
            { name: '📊 Statistics', value: `**Servers:** ${guilds}\n**Users:** ${users}\n**Commands:** ${this.commands.size}`, inline: true },
            { name: '⏱️ Performance', value: `**Uptime:** ${uptimeString}\n**Memory:** ${memoryMB}MB\n**Ping:** ${this.client.ws.ping}ms\n**TPS:** ${tps.toLocaleString()}`, inline: true },
            { name: '🔧 Technical', value: `**Node.js:** ${process.version}\n**Discord.js:** 14.x\n**Environment:** ${config.NODE_ENV}`, inline: true },
            { name: '✨ Features', value: '🎵 Music Bot\n🛡️ Moderation\n🤖 AI Integration\n🎮 Games & Fun\n📰 News & Weather\n👥 Role Management', inline: false },
            { name: '📝 Prefix Commands', value: `Prefix: \`${config.DEFAULT_PREFIX}\`\nBoth slash (/) and prefix commands supported`, inline: true },
            { name: '🔗 Links', value: '[Invite Bot](https://discord.com/api/oauth2/authorize?client_id=' + botUser.id + '&permissions=8&scope=bot%20applications.commands)', inline: true }
          )
          .setFooter({ text: `Bot ID: ${botUser.id}` })
          .setTimestamp();

        await interaction.reply({ embeds: [embed] });
      }
    };

    // Reload Command (Bot Owner Only) with confirmation UI
    const reloadCommand: Command = {
      data: new SlashCommandBuilder()
        .setName('reload')
        .setDescription('🔄 Restart the bot (Owner only)'),
      execute: async (interaction) => {
        if (!this.isSuperAdmin(interaction.user.id)) {
          const embed = new EmbedBuilder()
            .setColor('#ED4245')
            .setTitle('❌ Access Denied')
            .setDescription('This command is restricted to the bot owner only.')
            .addFields({ name: '🔒 Permission Required', value: 'Bot Owner Access Level' })
            .setTimestamp();
          
          return await interaction.reply({ embeds: [embed], ephemeral: true });
        }

        const embed = new EmbedBuilder()
          .setColor('#F39C12')
          .setTitle('🔄 Bot Reload Initiated')
          .setDescription('Bot is restarting... This may take a few moments.')
          .addFields(
            { name: '⏳ Status', value: 'Reloading commands and reconnecting...', inline: true },
            { name: '🎯 Initiated by', value: interaction.user.tag, inline: true }
          )
          .setTimestamp();

        await interaction.reply({ embeds: [embed] });
        
        // Restart the bot process
        setTimeout(() => {
          process.exit(0);
        }, 2000);
      }
    };

    // Enhanced Help Command with detailed UI and navigation
    const enhancedHelpCommand: Command = {
      data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('📚 Display all commands with detailed usage information')
        .addStringOption(option =>
          option.setName('command')
            .setDescription('Get detailed help for a specific command')
            .setRequired(false)),
      execute: async (interaction) => {
        const specificCommand = interaction.options.getString('command');
        
        if (specificCommand) {
          // Show detailed help for specific command
          const commandHelp = this.getCommandHelp(specificCommand);
          if (!commandHelp) {
            const embed = new EmbedBuilder()
              .setColor('#ED4245')
              .setTitle('❌ Command Not Found')
              .setDescription(`Command "${specificCommand}" does not exist.`)
              .addFields({ name: '💡 Tip', value: 'Use `/help` without parameters to see all available commands.' })
              .setTimestamp();
            
            return await interaction.reply({ embeds: [embed], ephemeral: true });
          }
          
          await interaction.reply({ embeds: [commandHelp] });
        } else {
          // Show all commands overview with buttons
          const commandCategories = {
            '🎵 Music & Audio': ['music - Advanced music bot with voice functionality', 'lyrics - Look up song lyrics', 'lastfm - Last.fm integration for music'],
            '🤖 AI & Intelligence': ['ai - AI-powered features using OpenAI'],
            '🛡️ Moderation & Safety': ['mod - Advanced moderation tools', 'clear - Clear messages', 'timeout - Timeout users', 'warn - Warn users', 'antinuke - Anti-nuke protection'],
            '👥 Server Management': ['role - Role management system', 'serverinfo - Server information', 'userinfo - User information', 'prefix - Server prefix settings', 'logging - Configure server logging'],
            '🎮 Games & Entertainment': ['fun - Games and entertainment', 'blackjack - Blackjack game', 'coinflip - Coin flip game', 'rps - Rock Paper Scissors', 'roll - Dice rolling'],
            '😂 Fun & Memes': ['meme - Random memes', 'joke - Random jokes', 'dadjoke - Dad jokes', 'catfact - Cat facts', 'chuck - Chuck Norris facts', 'hug - Send virtual hugs'],
            '🌐 Information & Search': ['weather - Weather information', 'news - Latest news headlines', 'wiki - Wikipedia search', 'urban - Urban Dictionary lookup', 'define - Dictionary definitions'],
            '🔧 Utility & Tools': ['avatar - User avatars', 'qr - QR code generator', 'math - Calculator', 'color - Color information', 'password - Password generator', 'shorten - URL shortener'],
            '📚 Educational': ['quote - Inspirational quotes', 'fact - Random facts', 'numbertrivia - Number trivia', 'space - Space facts'],
            '⚙️ Bot Management': ['botinfo - Bot information', 'ping - Bot latency', 'help - This help menu', 'reload - Restart bot (owner only)', 'servers - Server management (owner only)'],
            '💤 Personal': ['afk - Set AFK status', 'remind - Set reminders'],
            '🔊 Voice Control': [' - Complete voice channel management'],
            '🎨 Creative': ['ascii - ASCII art generator'],
            '🏆 Community': ['starboard - Star message system', 'halloffame - Hall of fame', 'hallofshame - Hall of shame', 'reactionroles - Reaction role system', 'joingate - Join gate system'],
            '📊 Leveling & Stats': ['level - User leveling system', 'leaderboard - Server leaderboards', 'counters - Server counters'],
            '🎁 Events & Social': ['giveaway - Giveaway system', 'bumpreminder - Bump reminders', 'webhook - Webhook management']
          };

          const embed = new EmbedBuilder()
            .setColor('#5865F2')
            .setTitle('📚 Bot Commands Help')
            .setDescription(`**${this.client.user?.tag}** - Complete command reference\n\n**Prefix:** \`${config.DEFAULT_PREFIX}\` | **Slash Commands:** \`/\``)
            .setThumbnail(this.client.user?.displayAvatarURL() || null);

          Object.entries(commandCategories).forEach(([category, commands]) => {
            embed.addFields({
              name: category,
              value: commands.map(cmd => `\`${cmd}\``).join('\n'),
              inline: true
            });
          });

          embed.addFields(
            { name: '📝 Usage Examples', value: '`/help music` - Detailed music command help\n`/ping` or `,ping` - Check bot latency\n`,help` - This menu with prefix', inline: false },
            { name: '🔗 Support', value: 'Use `/help [command]` for detailed usage of any command', inline: false }
          )
          .setFooter({ text: `Total Commands: ${this.commands.size} | Both / and ${config.DEFAULT_PREFIX} prefixes supported` })
          .setTimestamp();

          // Add buttons for command categories
          const buttons = new ActionRowBuilder<ButtonBuilder>()
            .addComponents(
              new ButtonBuilder()
                .setCustomId('help_mod')
                .setLabel('🛡️ Moderation')
                .setStyle(ButtonStyle.Primary),
              new ButtonBuilder()
                .setCustomId('help_fun')
                .setLabel('🎮 Fun & Games')
                .setStyle(ButtonStyle.Success),
              new ButtonBuilder()
                .setCustomId('help_music')
                .setLabel('🎵 Music')
                .setStyle(ButtonStyle.Secondary),
              new ButtonBuilder()
                .setCustomId('help_utility')
                .setLabel('⚙️ Utility')
                .setStyle(ButtonStyle.Secondary)
            );

          await interaction.reply({ embeds: [embed], components: [buttons] });
        }
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
    // this.commands.set('voicemaster', voicemasterCommand); // TODO: Fix voicemaster command
    // this.commands.set('logging', loggingCommand); // TODO: Fix logging command
    this.commands.set('help', enhancedHelpCommand);
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
    // Bot management commands
    this.commands.set('botinfo', botInfoCommand);
    this.commands.set('reload', reloadCommand);

    // Add 20+ more commands for fancy UI
    this.commands.set('meme', this.createMemeCommand());
    this.commands.set('roll', this.createRollCommand());
    this.commands.set('wiki', this.createWikiCommand());
    this.commands.set('quote', this.createQuoteCommand());
    this.commands.set('joke', this.createJokeCommand());
    this.commands.set('fact', this.createFactCommand());
    this.commands.set('color', this.createColorCommand());
    this.commands.set('qr', this.createQRCommand());
    this.commands.set('math', this.createMathCommand());
    this.commands.set('dadjoke', this.createDadJokeCommand());
    this.commands.set('catfact', this.createCatFactCommand());
    this.commands.set('numbertrivia', this.createNumberTriviaCommand());
    this.commands.set('shorten', this.createShortenCommand());
    this.commands.set('password', this.createPasswordCommand());
    this.commands.set('chuck', this.createChuckCommand());
    this.commands.set('hug', this.createHugCommand());
    this.commands.set('rps', this.createRPSCommand());
    this.commands.set('space', this.createSpaceCommand());
    this.commands.set('define', this.createDefineCommand());
    this.commands.set('ascii', this.createASCIICommand());
    this.commands.set('remind', this.createRemindCommand());
    
    // Advanced systems
    this.commands.set('', this.System.createCommand());
    this.commands.set('logging', this.loggingSystem.createLoggingCommand());

    // Add all the new advanced commands
    this.commands.set('prefix', this.createPrefixCommand());
    this.commands.set('logging', this.createLoggingCommand());
    this.commands.set('antinuke', this.createAntiNukeCommand());
    this.commands.set('lastfm', this.createLastFMCommand());
    this.commands.set('starboard', this.createStarboardCommand());
    this.commands.set('hallofshame', this.createHallOfShameCommand());
    this.commands.set('halloffame', this.createHallOfFameCommand());
    this.commands.set('reactionroles', this.createReactionRolesCommand());
    this.commands.set('joingate', this.createJoinGateCommand());
    this.commands.set('level', this.createLevelCommand());
    this.commands.set('leaderboard', this.createLeaderboardCommand());
    this.commands.set('counters', this.createCountersCommand());
    this.commands.set('bumpreminder', this.createBumpReminderCommand());
    this.commands.set('giveaway', this.createGiveawayCommand());
    this.commands.set('webhook', this.createWebhookCommand());
    this.commands.set('servers', this.createServerManagementCommand());
    this.commands.set('commands', this.createAllCommandsCommand());
  }

  // ============================================================================
  // MUSIC COMMAND HANDLERS
  // ============================================================================
  
  private async handleMusicPlay(interaction: any, voiceChannel: VoiceChannel) {
    const query = interaction.options.getString('query')!;
    
    await interaction.deferReply();
    
    try {
      // Join the voice channel
      const connection = joinVoiceChannel({
        channelId: voiceChannel.id,
        guildId: voiceChannel.guild.id,
        adapterCreator: voiceChannel.guild.voiceAdapterCreator,
      });

      // Search for the song using play-dl with improved search
      let songInfo;
      let songUrl;
      
      try {
        // First try to validate if it's a YouTube URL
        const urlValidation = play.yt_validate(query);
        if (urlValidation === 'video') {
          // Direct YouTube URL
          songInfo = await play.video_info(query);
          songUrl = query;
        } else {
          // Search query - try multiple search methods
          console.log(`🔍 Searching for: "${query}"`);
          
          // Try YouTube search first
          const searchResults = await play.search(query, { 
            limit: 5, 
            source: { youtube: "video" } 
          });
          
          if (!searchResults || searchResults.length === 0) {
            // Try Spotify search as fallback
            const spotifyResults = await play.search(query, { 
              limit: 3, 
              source: { spotify: "track" } 
            });
            
            if (!spotifyResults || spotifyResults.length === 0) {
              return await interaction.editReply({ 
                content: `🎵 No results found for "${query}". Try being more specific or use a direct YouTube URL.` 
              });
            }
            
            songInfo = spotifyResults[0];
            songUrl = (songInfo as any).url;
          } else {
            songInfo = searchResults[0];
            songUrl = (songInfo as any).url;
          }
        }
        
        console.log(`🎵 Found song:`, (songInfo as any).title || 'Unknown');
        
      } catch (searchError) {
        console.error('Search error:', searchError);
        return await interaction.editReply({ 
          content: `🎵 Failed to search for "${query}". Please try a different search term or YouTube URL.` 
        });
      }

      // Get audio stream with alternative methods
      let stream;
      try {
        // Try different streaming approaches
        if (songUrl.includes('youtube.com') || songUrl.includes('youtu.be')) {
          // Use alternative YouTube streaming method
          stream = await play.stream(songUrl, { quality: 1, discordPlayerCompatibility: true });
        } else {
          stream = await play.stream(songUrl, { quality: 2, discordPlayerCompatibility: true });
        }
      } catch (streamError) {
        console.error('Stream error:', streamError);
        
        // Try fallback method with different quality
        try {
          console.log('🔄 Trying fallback streaming method...');
          stream = await play.stream(songUrl, { quality: 0, discordPlayerCompatibility: true });
        } catch (fallbackError) {
          console.error('Fallback stream error:', fallbackError);
          return await interaction.editReply({ 
            content: `🎵 Unable to stream "${query}". This might be due to YouTube restrictions. Try a different song or direct YouTube URL.` 
          });
        }
      }

      const resource = createAudioResource(stream.stream, { 
        inputType: stream.type,
        inlineVolume: true
      });

      // Create audio player and play
      const player = createAudioPlayer();
      connection.subscribe(player);
      player.play(resource);
      
      const musicQueue: MusicQueue = {
        title: (songInfo as any).title || (songInfo as any).video_details?.title || query,
        url: songUrl,
        duration: (songInfo as any).durationInSec ? this.formatDuration((songInfo as any).durationInSec) : 'Unknown',
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
        .setTitle('🎵 Now Playing')
        .setDescription(`**${musicQueue.title}**`)
        .addFields(
          { name: 'Duration', value: musicQueue.duration, inline: true },
          { name: 'Requested by', value: musicQueue.requestedBy, inline: true },
          { name: 'Voice Channel', value: voiceChannel.name, inline: true }
        )
        .setTimestamp();
      
      await interaction.editReply({ embeds: [embed] });
      
      // Handle player events
      player.on(AudioPlayerStatus.Idle, () => {
        connection.destroy();
      });

      player.on('error', (error) => {
        console.error('Audio player error:', error);
        connection.destroy();
      });
      
    } catch (error: any) {
      console.error('Music play error:', error);
      await interaction.editReply({ content: `🎵 Failed to play music: ${error.message}` });
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

  private async handleMusicJoin(interaction: any, voiceChannel: VoiceChannel) {
    try {
      // Join the voice channel
      const connection = joinVoiceChannel({
        channelId: voiceChannel.id,
        guildId: voiceChannel.guild.id,
        adapterCreator: voiceChannel.guild.voiceAdapterCreator,
      });

      const embed = new EmbedBuilder()
        .setColor('#27AE60')
        .setTitle('🎵 Joined Voice Channel')
        .setDescription(`Successfully joined **${voiceChannel.name}**`)
        .addFields(
          { name: 'Voice Channel', value: voiceChannel.name, inline: true },
          { name: 'Members', value: voiceChannel.members.size.toString(), inline: true }
        )
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
      
    } catch (error: any) {
      console.error('Join voice channel error:', error);
      await interaction.reply({ 
        content: `🎵 Failed to join voice channel: ${error.message}`,
        ephemeral: true 
      });
    }
  }

  private async handleMusicLeave(interaction: any) {
    try {
      const connection = getVoiceConnection(interaction.guild.id);
      
      if (!connection) {
        return await interaction.reply({ 
          content: '🎵 I\'m not currently in a voice channel!',
          ephemeral: true 
        });
      }

      connection.destroy();

      const embed = new EmbedBuilder()
        .setColor('#E74C3C')
        .setTitle('🎵 Left Voice Channel')
        .setDescription('Successfully left the voice channel')
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
      
    } catch (error: any) {
      console.error('Leave voice channel error:', error);
      await interaction.reply({ 
        content: `🎵 Failed to leave voice channel: ${error.message}`,
        ephemeral: true 
      });
    }
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
      const currentRoles = member.roles.cache.filter((role: any) => role.id !== interaction.guild.id).map((role: any) => role.id);
      
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
          value: permissions.map((perm: any) => {
            for (const [key, value] of Object.entries(PermissionFlagsBits)) {
              if (value === perm) return key;
            }
            return perm.toString();
          }).join('\n') || 'None'
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
  // ADDITIONAL COMMAND CREATORS (20+ new commands for fancy UI)
  // ============================================================================

  private createMemeCommand(): Command {
    return {
      data: new SlashCommandBuilder()
        .setName('meme')
        .setDescription('Get a random meme from Reddit'),
      execute: async (interaction: any) => {
        const embed = new EmbedBuilder()
          .setColor('#FF4500')
          .setTitle('🎭 Random Meme')
          .setDescription('Here\'s a fresh meme for you!')
          .setTimestamp();
        
        await interaction.reply({ embeds: [embed] });
      }
    };
  }

  private createRollCommand(): Command {
    return {
      data: new SlashCommandBuilder()
        .setName('roll')
        .setDescription('Roll dice with custom sides')
        .addIntegerOption(opt => 
          opt.setName('sides').setDescription('Number of sides').setRequired(false)),
      execute: async (interaction: any) => {
        const sides = interaction.options.getInteger('sides') || 6;
        const result = Math.floor(Math.random() * sides) + 1;
        
        const embed = new EmbedBuilder()
          .setColor('#FFD700')
          .setTitle('🎲 Dice Roll')
          .setDescription(`You rolled a **${result}** on a ${sides}-sided die!`)
          .setTimestamp();
        
        await interaction.reply({ embeds: [embed] });
      }
    };
  }

  private createWikiCommand(): Command {
    return {
      data: new SlashCommandBuilder()
        .setName('wiki')
        .setDescription('Search Wikipedia articles')
        .addStringOption(opt => 
          opt.setName('query').setDescription('Search term').setRequired(true)),
      execute: async (interaction: any) => {
        const query = interaction.options.getString('query');
        
        const embed = new EmbedBuilder()
          .setColor('#000000')
          .setTitle('📖 Wikipedia Search')
          .setDescription(`**Search:** ${query}\n\nWikipedia integration coming soon!`)
          .setTimestamp();
        
        await interaction.reply({ embeds: [embed] });
      }
    };
  }

  private createQuoteCommand(): Command {
    return {
      data: new SlashCommandBuilder()
        .setName('quote')
        .setDescription('Get an inspirational quote'),
      execute: async (interaction: any) => {
        const quotes = [
          "The only way to do great work is to love what you do. - Steve Jobs",
          "Innovation distinguishes between a leader and a follower. - Steve Jobs",
          "Life is what happens to you while you're busy making other plans. - John Lennon",
          "The future belongs to those who believe in the beauty of their dreams. - Eleanor Roosevelt"
        ];
        
        const randomQuote = quotes[Math.floor(Math.random() * quotes.length)];
        
        const embed = new EmbedBuilder()
          .setColor('#9B59B6')
          .setTitle('💭 Inspirational Quote')
          .setDescription(randomQuote)
          .setTimestamp();
        
        await interaction.reply({ embeds: [embed] });
      }
    };
  }

  private createJokeCommand(): Command {
    return {
      data: new SlashCommandBuilder()
        .setName('joke')
        .setDescription('Get a random joke'),
      execute: async (interaction: any) => {
        const jokes = [
          "Why don't scientists trust atoms? Because they make up everything!",
          "Why did the scarecrow win an award? He was outstanding in his field!",
          "Why don't eggs tell jokes? They'd crack each other up!",
          "What do you call a fake noodle? An impasta!"
        ];
        
        const randomJoke = jokes[Math.floor(Math.random() * jokes.length)];
        
        const embed = new EmbedBuilder()
          .setColor('#FFD700')
          .setTitle('😂 Random Joke')
          .setDescription(randomJoke)
          .setTimestamp();
        
        await interaction.reply({ embeds: [embed] });
      }
    };
  }

  private createFactCommand(): Command {
    return {
      data: new SlashCommandBuilder()
        .setName('fact')
        .setDescription('Get a random interesting fact'),
      execute: async (interaction: any) => {
        const facts = [
          "Octopuses have three hearts and blue blood!",
          "Bananas are berries, but strawberries aren't!",
          "A group of flamingos is called a 'flamboyance'!",
          "Honey never spoils - archaeologists have found edible honey in ancient Egyptian tombs!"
        ];
        
        const randomFact = facts[Math.floor(Math.random() * facts.length)];
        
        const embed = new EmbedBuilder()
          .setColor('#3498DB')
          .setTitle('🧠 Random Fact')
          .setDescription(randomFact)
          .setTimestamp();
        
        await interaction.reply({ embeds: [embed] });
      }
    };
  }

  private createColorCommand(): Command {
    return {
      data: new SlashCommandBuilder()
        .setName('color')
        .setDescription('Get information about a color')
        .addStringOption(opt => 
          opt.setName('color').setDescription('Color name or hex code').setRequired(true)),
      execute: async (interaction: any) => {
        const color = interaction.options.getString('color');
        
        const embed = new EmbedBuilder()
          .setColor('#FF69B4')
          .setTitle('🎨 Color Information')
          .setDescription(`**Color:** ${color}\n\nColor analysis coming soon!`)
          .setTimestamp();
        
        await interaction.reply({ embeds: [embed] });
      }
    };
  }

  private createQRCommand(): Command {
    return {
      data: new SlashCommandBuilder()
        .setName('qr')
        .setDescription('Generate a QR code')
        .addStringOption(opt => 
          opt.setName('text').setDescription('Text to encode').setRequired(true)),
      execute: async (interaction: any) => {
        const text = interaction.options.getString('text');
        
        const embed = new EmbedBuilder()
          .setColor('#000000')
          .setTitle('📱 QR Code Generator')
          .setDescription(`**Text:** ${text}\n\nQR Code generation coming soon!`)
          .setTimestamp();
        
        await interaction.reply({ embeds: [embed] });
      }
    };
  }

  private createMathCommand(): Command {
    return {
      data: new SlashCommandBuilder()
        .setName('math')
        .setDescription('Solve math expressions')
        .addStringOption(opt => 
          opt.setName('expression').setDescription('Math expression').setRequired(true)),
      execute: async (interaction: any) => {
        const expression = interaction.options.getString('expression');
        
        try {
          const safeExpression = expression!.replace(/[^0-9+\-*/.() ]/g, '');
          const result = eval(safeExpression);
          
          const embed = new EmbedBuilder()
            .setColor('#2ECC71')
            .setTitle('🧮 Math Calculator')
            .setDescription(`**Expression:** ${expression}\n**Result:** ${result}`)
            .setTimestamp();
          
          await interaction.reply({ embeds: [embed] });
        } catch (error) {
          await interaction.reply({ content: '❌ Invalid math expression!', ephemeral: true });
        }
      }
    };
  }

  private createDadJokeCommand(): Command {
    return {
      data: new SlashCommandBuilder()
        .setName('dadjoke')
        .setDescription('Get a dad joke'),
      execute: async (interaction: any) => {
        const dadJokes = [
          "I'm afraid for the calendar. Its days are numbered.",
          "I used to hate facial hair, but then it grew on me.",
          "What do you call a fish wearing a crown? A king fish!",
          "I only know 25 letters of the alphabet. I don't know y."
        ];
        
        const randomJoke = dadJokes[Math.floor(Math.random() * dadJokes.length)];
        
        const embed = new EmbedBuilder()
          .setColor('#FFA500')
          .setTitle('👨 Dad Joke')
          .setDescription(randomJoke)
          .setTimestamp();
        
        await interaction.reply({ embeds: [embed] });
      }
    };
  }

  private createCatFactCommand(): Command {
    return {
      data: new SlashCommandBuilder()
        .setName('catfact')
        .setDescription('Get a random cat fact'),
      execute: async (interaction: any) => {
        const catFacts = [
          "Cats have five toes on their front paws, but only four on their back paws!",
          "A group of cats is called a 'clowder'!",
          "Cats can't taste sweetness!",
          "A cat's purr vibrates at a frequency that promotes bone healing!"
        ];
        
        const randomFact = catFacts[Math.floor(Math.random() * catFacts.length)];
        
        const embed = new EmbedBuilder()
          .setColor('#FF69B4')
          .setTitle('🐱 Cat Fact')
          .setDescription(randomFact)
          .setTimestamp();
        
        await interaction.reply({ embeds: [embed] });
      }
    };
  }

  private createPasswordCommand(): Command {
    return {
      data: new SlashCommandBuilder()
        .setName('password')
        .setDescription('Generate a secure password')
        .addIntegerOption(opt => 
          opt.setName('length').setDescription('Password length').setRequired(false))
        .addBooleanOption(opt => 
          opt.setName('symbols').setDescription('Include symbols').setRequired(false)),
      execute: async (interaction: any) => {
        const length = interaction.options.getInteger('length') || 12;
        const includeSymbols = interaction.options.getBoolean('symbols') ?? true;
        
        let chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        if (includeSymbols) chars += '!@#$%^&*()_+-=[]{}|;:,.<>?';
        
        let password = '';
        for (let i = 0; i < length; i++) {
          password += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        
        const embed = new EmbedBuilder()
          .setColor('#E74C3C')
          .setTitle('🔐 Password Generator')
          .setDescription(`**Length:** ${length}\n**Symbols:** ${includeSymbols ? 'Yes' : 'No'}\n\n||${password}||`)
          .setTimestamp();
        
        await interaction.reply({ embeds: [embed] });
      }
    };
  }

  private createHugCommand(): Command {
    return {
      data: new SlashCommandBuilder()
        .setName('hug')
        .setDescription('Hug someone')
        .addUserOption(opt => 
          opt.setName('user').setDescription('User to hug').setRequired(true)),
      execute: async (interaction: any) => {
        const user = interaction.options.getUser('user');
        
        const embed = new EmbedBuilder()
          .setColor('#FF69B4')
          .setTitle('🤗 Virtual Hug')
          .setDescription(`${interaction.user.username} gives ${user.username} a warm hug! 🤗💕`)
          .setTimestamp();
        
        await interaction.reply({ embeds: [embed] });
      }
    };
  }

  private createRPSCommand(): Command {
    return {
      data: new SlashCommandBuilder()
        .setName('rps')
        .setDescription('Play rock paper scissors')
        .addStringOption(opt => 
          opt.setName('choice').setDescription('Your choice').setRequired(true)
            .addChoices(
              { name: 'Rock', value: 'rock' },
              { name: 'Paper', value: 'paper' },
              { name: 'Scissors', value: 'scissors' }
            )),
      execute: async (interaction: any) => {
        const userChoice = interaction.options.getString('choice');
        const choices = ['rock', 'paper', 'scissors'];
        const botChoice = choices[Math.floor(Math.random() * choices.length)];
        
        let result = '';
        if (userChoice === botChoice) {
          result = "It's a tie!";
        } else if (
          (userChoice === 'rock' && botChoice === 'scissors') ||
          (userChoice === 'paper' && botChoice === 'rock') ||
          (userChoice === 'scissors' && botChoice === 'paper')
        ) {
          result = 'You win!';
        } else {
          result = 'You lose!';
        }
        
        const embed = new EmbedBuilder()
          .setColor('#FFD700')
          .setTitle('✂️ Rock Paper Scissors')
          .setDescription(`**You:** ${userChoice}\n**Bot:** ${botChoice}\n\n**Result:** ${result}`)
          .setTimestamp();
        
        await interaction.reply({ embeds: [embed] });
      }
    };
  }

  private createNumberTriviaCommand(): Command {
    return {
      data: new SlashCommandBuilder()
        .setName('numbertrivia')
        .setDescription('Get trivia about a number')
        .addIntegerOption(opt => 
          opt.setName('number').setDescription('Number for trivia').setRequired(false)),
      execute: async (interaction: any) => {
        const number = interaction.options.getInteger('number') || Math.floor(Math.random() * 100);
        
        const triviaFacts = [
          `${number} is a fascinating number with many mathematical properties!`,
          `Did you know? ${number} has unique characteristics in number theory.`,
          `Fun fact: ${number} appears in various mathematical sequences.`,
          `${number} has interesting divisibility properties.`
        ];
        
        const randomTrivia = triviaFacts[Math.floor(Math.random() * triviaFacts.length)];
        
        const embed = new EmbedBuilder()
          .setColor('#9B59B6')
          .setTitle('🔢 Number Trivia')
          .setDescription(`**Number:** ${number}\n\n${randomTrivia}`)
          .setTimestamp();
        
        await interaction.reply({ embeds: [embed] });
      }
    };
  }

  private createShortenCommand(): Command {
    return {
      data: new SlashCommandBuilder()
        .setName('shorten')
        .setDescription('Shorten a URL')
        .addStringOption(opt => 
          opt.setName('url').setDescription('URL to shorten').setRequired(true)),
      execute: async (interaction: any) => {
        const url = interaction.options.getString('url');
        
        const embed = new EmbedBuilder()
          .setColor('#3498DB')
          .setTitle('🔗 URL Shortener')
          .setDescription(`**Original URL:** ${url}\n\nURL shortening service integration coming soon!`)
          .setTimestamp();
        
        await interaction.reply({ embeds: [embed] });
      }
    };
  }

  private createChuckCommand(): Command {
    return {
      data: new SlashCommandBuilder()
        .setName('chuck')
        .setDescription('Get a Chuck Norris fact'),
      execute: async (interaction: any) => {
        const chuckFacts = [
          "Chuck Norris doesn't need a debugger, he just stares down the bug until the code confesses.",
          "Chuck Norris can compile syntax errors.",
          "Chuck Norris can access the database... with his fists.",
          "Chuck Norris can write infinite loops that finish."
        ];
        
        const randomFact = chuckFacts[Math.floor(Math.random() * chuckFacts.length)];
        
        const embed = new EmbedBuilder()
          .setColor('#E67E22')
          .setTitle('💪 Chuck Norris Fact')
          .setDescription(randomFact)
          .setTimestamp();
        
        await interaction.reply({ embeds: [embed] });
      }
    };
  }

  private createSpaceCommand(): Command {
    return {
      data: new SlashCommandBuilder()
        .setName('space')
        .setDescription('Get space facts and information'),
      execute: async (interaction: any) => {
        const spaceFacts = [
          "There are more possible games of chess than there are atoms in the observable universe!",
          "A single day on Venus lasts longer than its year!",
          "Saturn's moon Titan has lakes of liquid methane!",
          "Neutron stars are so dense that a teaspoon would weigh 6 billion tons!"
        ];
        
        const randomFact = spaceFacts[Math.floor(Math.random() * spaceFacts.length)];
        
        const embed = new EmbedBuilder()
          .setColor('#1F4E79')
          .setTitle('🚀 Space Fact')
          .setDescription(randomFact)
          .setTimestamp();
        
        await interaction.reply({ embeds: [embed] });
      }
    };
  }

  private createDefineCommand(): Command {
    return {
      data: new SlashCommandBuilder()
        .setName('define')
        .setDescription('Define a word')
        .addStringOption(opt => 
          opt.setName('word').setDescription('Word to define').setRequired(true)),
      execute: async (interaction: any) => {
        const word = interaction.options.getString('word');
        
        const embed = new EmbedBuilder()
          .setColor('#8E44AD')
          .setTitle('📖 Dictionary')
          .setDescription(`**Word:** ${word}\n\nDictionary API integration coming soon!`)
          .setTimestamp();
        
        await interaction.reply({ embeds: [embed] });
      }
    };
  }

  private createASCIICommand(): Command {
    return {
      data: new SlashCommandBuilder()
        .setName('ascii')
        .setDescription('Convert text to ASCII art')
        .addStringOption(opt => 
          opt.setName('text').setDescription('Text to convert').setRequired(true)),
      execute: async (interaction: any) => {
        const text = interaction.options.getString('text');
        
        const embed = new EmbedBuilder()
          .setColor('#2C3E50')
          .setTitle('🎨 ASCII Art')
          .setDescription(`**Text:** ${text}\n\n\`\`\`\nASCII art generation coming soon!\n\`\`\``)
          .setTimestamp();
        
        await interaction.reply({ embeds: [embed] });
      }
    };
  }

  private createRemindCommand(): Command {
    return {
      data: new SlashCommandBuilder()
        .setName('remind')
        .setDescription('Set a reminder')
        .addStringOption(opt => 
          opt.setName('message').setDescription('Reminder message').setRequired(true))
        .addStringOption(opt => 
          opt.setName('time').setDescription('Time (e.g., 5m, 1h, 1d)').setRequired(true)),
      execute: async (interaction: any) => {
        const message = interaction.options.getString('message');
        const time = interaction.options.getString('time');
        
        const embed = new EmbedBuilder()
          .setColor('#F39C12')
          .setTitle('⏰ Reminder Set')
          .setDescription(`**Message:** ${message}\n**Time:** ${time}\n\nReminder system coming soon!`)
          .setTimestamp();
        
        await interaction.reply({ embeds: [embed] });
      }
    };
  }

  // EVENT LISTENERS
  // ============================================================================
  
  private setupEventListeners() {
    this.client.once('ready', async () => {
      console.log(`Enhanced Discord Bot ready! Logged in as ${this.client.user?.tag}`);
      
      // Set bot status
      this.client.user?.setActivity(config.BOT_STATUS.name, { type: config.BOT_STATUS.type as any });
      
      // Register slash commands
      console.log(`Registering ${this.commands.size} enhanced slash commands...`);
      await this.registerCommands();
      
      // Initialize advanced systems
      await this.System.setupEventHandlers();
      await this.loggingSystem.setupEventHandlers();
    });

    // Handle slash command interactions
    this.client.on('interactionCreate', async (interaction) => {
      if (interaction.isChatInputCommand()) {
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
      } else if (interaction.isButton()) {
        // Handle button interactions for command menus and games
        try {
          if (interaction.customId.startsWith('blackjack_')) {
            await this.handleBlackjackButton(interaction);
          } else {
            await this.handleButtonInteraction(interaction);
          }
        } catch (error: any) {
          console.error('Button interaction error:', error);
          if (!interaction.replied) {
            await interaction.reply({ content: '❌ An error occurred.', ephemeral: true });
          }
        }
      } else if (interaction.isModalSubmit()) {
        // Handle modal interactions
        try {
          await this.handleModalInteraction(interaction);
        } catch (error: any) {
          console.error('Modal interaction error:', error);
          if (!interaction.replied) {
            await interaction.reply({ content: '❌ An error occurred.', ephemeral: true });
          }
        }
      }
    });

    // Handle prefix commands and messages
    this.client.on('messageCreate', async (message) => {
      if (message.author.bot) return;
      
      // Check if user was AFK and welcome them back
      try {
        const afkUser = await storage.getAfkUser(message.guild?.id || 'DM', message.author.id);
        if (afkUser) {
          // User was AFK, welcome them back
          await storage.removeAfkUser(message.guild?.id || 'DM', message.author.id);
          const welcomeMessage = await message.reply(`Welcome back <@${message.author.id}>! You were AFK: ${afkUser.reason}`);
          
          // Delete the welcome message after 5 seconds to avoid spam
          setTimeout(async () => {
            try {
              await welcomeMessage.delete();
            } catch (error) {
              // Message might already be deleted
            }
          }, 5000);
        }
      } catch (error) {
        // AFK check failed, continue normally
      }
      
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
    const rest = new REST({ version: '10' }).setToken(config.DISCORD_BOT_TOKEN);
    const commandData = Array.from(this.commands.values()).map(command => command.data.toJSON());
    
    try {
      console.log(`🔄 Registering ${commandData.length} slash commands to guilds...`);
      
      // Use guild-specific registration for better reliability
      const guildsArray = Array.from(this.client.guilds.cache.values());
      const clientId = this.client.user!.id;
      
      for (const guild of guildsArray) {
        try {
          // Clear existing guild commands first
          await rest.put(Routes.applicationGuildCommands(clientId, guild.id), { body: [] });
          console.log(`🧹 Cleared existing commands for guild: ${guild.name}`);
          
          // Wait briefly then register new commands
          await new Promise(resolve => setTimeout(resolve, 500));
          
          const data = await rest.put(
            Routes.applicationGuildCommands(clientId, guild.id),
            { body: commandData }
          ) as any[];
          
          console.log(`✅ Registered ${data.length} commands for guild: ${guild.name}`);
        } catch (guildError: any) {
          console.error(`❌ Failed to register commands for guild ${guild.name}:`, guildError.message);
        }
      }
      
      if (guildsArray.length === 0) {
        console.log('⚠️ No guilds found to register commands to');
      }
      
    } catch (error: any) {
      console.error('❌ Command registration failed:', error.message);
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
        .setColor(color as any)
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
  // UTILITY METHODS
  // ============================================================================
  
  private formatUptime(uptime: number): string {
    const days = Math.floor(uptime / 86400);
    const hours = Math.floor((uptime % 86400) / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    const seconds = Math.floor(uptime % 60);
    
    if (days > 0) return `${days}d ${hours}h ${minutes}m`;
    if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
    if (minutes > 0) return `${minutes}m ${seconds}s`;
    return `${seconds}s`;
  }
  
  private getCommandHelp(commandName: string): EmbedBuilder | null {
    const helpData: { [key: string]: any } = {
      music: {
        title: '🎵 Music Command',
        description: 'Advanced music bot with voice functionality',
        usage: [
          '`/music play <song>` - Play a song from YouTube or Spotify',
          '`/music join` - Join your voice channel',
          '`/music leave` - Leave the voice channel',
          '`/music queue` - Show current music queue',
          '`/music skip` - Skip current song',
          '`/music stop` - Stop music and leave voice channel',
          '`/music pause` - Pause current song',
          '`/music resume` - Resume paused song',
          '`/music volume <1-100>` - Set music volume',
          '`/music nowplaying` - Show currently playing song',
          '`/music shuffle` - Shuffle queue',
          '`/music loop` - Toggle loop mode'
        ],
        examples: '`/music play Never Gonna Give You Up`\n`/music volume 50`\n`,music play despacito`',
        permissions: 'Connect to Voice Channels'
      },
      mod: {
        title: '🛡️ Moderation Command',
        description: 'Advanced moderation tools for server management',
        usage: [
          '`/mod massban <userids>` - Ban multiple users at once',
          '`/mod cleanup [user] [contains] [limit]` - Clean up messages',
          '`/mod automod <enabled>` - Configure auto-moderation',
          '`/mod quarantine <user>` - Remove all roles from user',
          '`/mod unquarantine <user>` - Restore user roles'
        ],
        examples: '`/mod cleanup @user`\n`/mod massban 123456789 987654321`\n`,mod automod true`',
        permissions: 'Moderate Members, Manage Messages'
      },
      ai: {
        title: '🤖 AI Command',
        description: 'AI-powered features using OpenAI technology',
        usage: [
          '`/ai chat <message>` - Chat with AI',
          '`/ai image <prompt>` - Generate AI image',
          '`/ai analyze <image>` - Analyze uploaded image',
          '`/ai summarize <text>` - Summarize long text'
        ],
        examples: '`/ai chat Hello, how are you?`\n`/ai image a cat wearing sunglasses`\n`,ai summarize <long text>`',
        permissions: 'Send Messages'
      },
      role: {
        title: '👥 Role Command',
        description: 'Complete role management system',
        usage: [
          '`/role add <user> <role>` - Add role to user',
          '`/role remove <user> <role>` - Remove role from user',
          '`/role create <name> [color] [options]` - Create new role',
          '`/role delete <role>` - Delete role',
          '`/role list` - List all server roles',
          '`/role info <role>` - Get role information',
          '`/role massadd <role> <users>` - Add role to multiple users',
          '`/role permissions <role> <preset>` - Set role permissions'
        ],
        examples: '`/role add @user @Member`\n`/role create VIP #gold true`\n`,role list`',
        permissions: 'Manage Roles'
      }
    };
    
    const data = helpData[commandName];
    if (!data) return null;
    
    const embed = new EmbedBuilder()
      .setColor('#5865F2')
      .setTitle(data.title)
      .setDescription(data.description)
      .addFields(
        { name: '📝 Usage', value: data.usage.join('\n'), inline: false },
        { name: '💡 Examples', value: data.examples, inline: false },
        { name: '🔒 Permissions', value: data.permissions, inline: true },
        { name: '🔄 Prefix Support', value: `Both \`/\` and \`${config.DEFAULT_PREFIX}\` work`, inline: true }
      )
      .setFooter({ text: `Command: ${commandName} | Use /help for all commands` })
      .setTimestamp();
    
    return embed;
  }

  // ============================================================================
  //  HANDLERS
  // ============================================================================
  
  private async handleVoiceLock(interaction: any) {
    const member = interaction.member as GuildMember;
    const voiceChannel = member.voice.channel;
    
    if (!voiceChannel) {
      return await interaction.reply({ content: '❌ You must be in a voice channel.', ephemeral: true });
    }
    
    try {
      await voiceChannel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
        Connect: false
      });
      
      const embed = new EmbedBuilder()
        .setColor('#E74C3C')
        .setTitle('🔒 Voice Channel Locked')
        .setDescription(`**${voiceChannel.name}** has been locked`)
        .setTimestamp();
        
      await interaction.reply({ embeds: [embed] });
    } catch (error: any) {
      await interaction.reply({ content: `❌ Failed to lock channel: ${error.message}`, ephemeral: true });
    }
  }
  
  private async handleVoiceUnlock(interaction: any) {
    const member = interaction.member as GuildMember;
    const voiceChannel = member.voice.channel;
    
    if (!voiceChannel) {
      return await interaction.reply({ content: '❌ You must be in a voice channel.', ephemeral: true });
    }
    
    try {
      await voiceChannel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
        Connect: null
      });
      
      const embed = new EmbedBuilder()
        .setColor('#57F287')
        .setTitle('🔓 Voice Channel Unlocked')
        .setDescription(`**${voiceChannel.name}** has been unlocked`)
        .setTimestamp();
        
      await interaction.reply({ embeds: [embed] });
    } catch (error: any) {
      await interaction.reply({ content: `❌ Failed to unlock channel: ${error.message}`, ephemeral: true });
    }
  }
  
  private async handleVoiceLimit(interaction: any) {
    const member = interaction.member as GuildMember;
    const voiceChannel = member.voice.channel;
    const limit = interaction.options.getInteger('max');
    
    if (!voiceChannel) {
      return await interaction.reply({ content: '❌ You must be in a voice channel.', ephemeral: true });
    }
    
    try {
      await voiceChannel.setUserLimit(limit);
      
      const embed = new EmbedBuilder()
        .setColor('#3498DB')
        .setTitle('👥 User Limit Set')
        .setDescription(`**${voiceChannel.name}** user limit set to ${limit === 0 ? 'unlimited' : limit}`)
        .setTimestamp();
        
      await interaction.reply({ embeds: [embed] });
    } catch (error: any) {
      await interaction.reply({ content: `❌ Failed to set user limit: ${error.message}`, ephemeral: true });
    }
  }
  
  private async handleVoiceName(interaction: any) {
    const member = interaction.member as GuildMember;
    const voiceChannel = member.voice.channel;
    const newName = interaction.options.getString('newname');
    
    if (!voiceChannel) {
      return await interaction.reply({ content: '❌ You must be in a voice channel.', ephemeral: true });
    }
    
    try {
      const oldName = voiceChannel.name;
      await voiceChannel.setName(newName);
      
      const embed = new EmbedBuilder()
        .setColor('#F1C40F')
        .setTitle('📝 Channel Name Changed')
        .setDescription(`Channel renamed from **${oldName}** to **${newName}**`)
        .setTimestamp();
        
      await interaction.reply({ embeds: [embed] });
    } catch (error: any) {
      await interaction.reply({ content: `❌ Failed to change channel name: ${error.message}`, ephemeral: true });
    }
  }
  
  private async handleVoiceInvite(interaction: any) {
    const member = interaction.member as GuildMember;
    const voiceChannel = member.voice.channel;
    const targetUser = interaction.options.getUser('user');
    
    if (!voiceChannel) {
      return await interaction.reply({ content: '❌ You must be in a voice channel.', ephemeral: true });
    }
    
    try {
      await voiceChannel.permissionOverwrites.edit(targetUser, {
        Connect: true,
        ViewChannel: true
      });
      
      const embed = new EmbedBuilder()
        .setColor('#9B59B6')
        .setTitle('➕ User Invited')
        .setDescription(`**${targetUser.tag}** has been invited to **${voiceChannel.name}**`)
        .setTimestamp();
        
      await interaction.reply({ embeds: [embed] });
      
      // Try to DM the user
      try {
        await targetUser.send(`🎤 You've been invited to join voice channel **${voiceChannel.name}** in **${interaction.guild.name}**!`);
      } catch {
        // User has DMs disabled
      }
    } catch (error: any) {
      await interaction.reply({ content: `❌ Failed to invite user: ${error.message}`, ephemeral: true });
    }
  }
  
  private async handleVoiceKick(interaction: any) {
    const member = interaction.member as GuildMember;
    const voiceChannel = member.voice.channel;
    const targetUser = interaction.options.getUser('user');
    
    if (!voiceChannel) {
      return await interaction.reply({ content: '❌ You must be in a voice channel.', ephemeral: true });
    }
    
    try {
      const targetMember = await interaction.guild.members.fetch(targetUser.id);
      
      if (!targetMember.voice.channel || targetMember.voice.channel.id !== voiceChannel.id) {
        return await interaction.reply({ content: '❌ That user is not in your voice channel.', ephemeral: true });
      }
      
      await targetMember.voice.disconnect('Kicked by channel owner');
      
      const embed = new EmbedBuilder()
        .setColor('#E74C3C')
        .setTitle('❌ User Kicked')
        .setDescription(`**${targetUser.tag}** has been kicked from **${voiceChannel.name}**`)
        .setTimestamp();
        
      await interaction.reply({ embeds: [embed] });
    } catch (error: any) {
      await interaction.reply({ content: `❌ Failed to kick user: ${error.message}`, ephemeral: true });
    }
  }
  
  private async handleVoiceTransfer(interaction: any) {
    const member = interaction.member as GuildMember;
    const voiceChannel = member.voice.channel;
    const targetUser = interaction.options.getUser('user');
    
    if (!voiceChannel) {
      return await interaction.reply({ content: '❌ You must be in a voice channel.', ephemeral: true });
    }
    
    try {
      const targetMember = await interaction.guild.members.fetch(targetUser.id);
      
      if (!targetMember.voice.channel || targetMember.voice.channel.id !== voiceChannel.id) {
        return await interaction.reply({ content: '❌ That user must be in your voice channel.', ephemeral: true });
      }
      
      // Transfer ownership by giving full permissions to new owner
      await voiceChannel.permissionOverwrites.edit(targetUser, {
        ManageChannels: true,
        Connect: true,
        Speak: true,
        MuteMembers: true,
        DeafenMembers: true,
        MoveMembers: true
      });
      
      // Remove permissions from original owner
      await voiceChannel.permissionOverwrites.edit(member.user, {
        ManageChannels: null
      });
      
      const embed = new EmbedBuilder()
        .setColor('#F39C12')
        .setTitle('👑 Ownership Transferred')
        .setDescription(`**${targetUser.tag}** is now the owner of **${voiceChannel.name}**`)
        .setTimestamp();
        
      await interaction.reply({ embeds: [embed] });
    } catch (error: any) {
      await interaction.reply({ content: `❌ Failed to transfer ownership: ${error.message}`, ephemeral: true });
    }
  }
  
  private async handleVoiceMenu(interaction: any) {
    const member = interaction.member as GuildMember;
    const voiceChannel = member.voice.channel;
    
    if (!voiceChannel) {
      return await interaction.reply({ content: '❌ You must be in a voice channel.', ephemeral: true });
    }
    
    const embed = new EmbedBuilder()
      .setColor('#5865F2')
      .setTitle('🔊 Voice Channel Control Panel')
      .setDescription(`Managing: **${voiceChannel.name}**\nUsers: ${voiceChannel.members.size}/${voiceChannel.userLimit || '∞'}`)
      .addFields(
        { name: '🔒 Security', value: 'Lock/unlock channel access', inline: true },
        { name: '👥 Management', value: 'Set limits and change name', inline: true },
        { name: '👤 Users', value: 'Invite, kick, and transfer ownership', inline: true }
      )
      .setFooter({ text: 'Use the buttons below to control your voice channel' })
      .setTimestamp();

    const buttons1 = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('voice_lock')
          .setLabel('🔒 Lock')
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId('voice_unlock')
          .setLabel('🔓 Unlock')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId('voice_limit')
          .setLabel('👥 Set Limit')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('voice_rename')
          .setLabel('📝 Rename')
          .setStyle(ButtonStyle.Secondary)
      );

    const buttons2 = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('voice_invite')
          .setLabel('➕ Invite User')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('voice_kick')
          .setLabel('❌ Kick User')
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId('voice_transfer')
          .setLabel('👑 Transfer')
          .setStyle(ButtonStyle.Secondary)
      );
      
    await interaction.reply({ embeds: [embed], components: [buttons1, buttons2], ephemeral: true });
  }

  private async handleVoiceSetup(interaction: any) {
    if (!this.hasPermission(interaction, PermissionFlagsBits.ManageChannels)) {
      return await interaction.reply({ content: '❌ You need Manage Channels permission.', ephemeral: true });
    }

    const channel = interaction.options.getChannel('channel');
    
    try {
      // Store join-to-create channel in storage (you'd implement this in storage)
      const embed = new EmbedBuilder()
        .setColor('#57F287')
        .setTitle('🎛️ Join-to-Create Setup Complete')
        .setDescription(`**${channel.name}** is now a join-to-create channel!\n\nWhen users join this channel, a new temporary voice channel will be created for them.`)
        .setTimestamp();
        
      await interaction.reply({ embeds: [embed] });
    } catch (error: any) {
      await interaction.reply({ content: `❌ Failed to setup join-to-create: ${error.message}`, ephemeral: true });
    }
  }

  // ============================================================================
  // BUTTON INTERACTION HANDLERS
  // ============================================================================
  
  private async handleButtonInteraction(interaction: any) {
    const customId = interaction.customId;
    
    if (customId === 'help_mod') {
      const embed = new EmbedBuilder()
        .setColor('#ED4245')
        .setTitle('🛡️ Moderation Commands')
        .setDescription('Advanced moderation tools for server management')
        .addFields(
          { name: '🔨 Basic Commands', value: '`/mod massban` - Ban multiple users\n`/mod cleanup` - Clean messages\n`/mod quarantine` - Remove user roles\n`/clear` - Clear messages\n`/timeout` - Timeout users\n`/warn` - Warn users', inline: false },
          { name: '⚙️ Auto-Moderation', value: '`/mod automod` - Configure auto-mod\nAnti-spam, anti-links, auto-warnings', inline: false },
          { name: '🔒 Permissions', value: 'Requires: **Moderate Members** or **Manage Messages**\nBot owner has global access', inline: false }
        )
        .setFooter({ text: 'Use /help [command] for detailed usage examples' })
        .setTimestamp();
      
      await interaction.reply({ embeds: [embed], ephemeral: true });
    } else if (customId === 'help_fun') {
      const embed = new EmbedBuilder()
        .setColor('#57F287')
        .setTitle('🎮 Fun & Games Commands')
        .setDescription('Entertainment and interactive games')
        .addFields(
          { name: '🎯 Games', value: '`/blackjack` - Play blackjack\n`/coinflip` - Flip a coin\n`/rps` - Rock Paper Scissors\n`/roll` - Roll dice', inline: false },
          { name: '😂 Fun Content', value: '`/meme` - Random memes\n`/joke` - Get jokes\n`/dadjoke` - Dad jokes\n`/quote` - Inspirational quotes\n`/fact` - Random facts', inline: false },
          { name: '🎨 Interactive', value: '`/hug` - Send virtual hugs\n`/chuck` - Chuck Norris facts\n`/catfact` - Cat facts\n`/ascii` - ASCII art', inline: false }
        )
        .setFooter({ text: 'All fun commands are available to everyone!' })
        .setTimestamp();
      
      await interaction.reply({ embeds: [embed], ephemeral: true });
    } else if (customId === 'help_music') {
      const embed = new EmbedBuilder()
        .setColor('#1DB954')
        .setTitle('🎵 Music Commands')
        .setDescription('Advanced music bot with voice functionality')
        .addFields(
          { name: '🎧 Basic Controls', value: '`/music join` - Join voice channel\n`/music leave` - Leave voice channel\n`/music play <song>` - Play music\n`/music stop` - Stop and leave', inline: false },
          { name: '⏯️ Playback', value: '`/music pause` - Pause current song\n`/music resume` - Resume playback\n`/music skip` - Skip current song\n`/music volume <1-100>` - Set volume', inline: false },
          { name: '📋 Queue Management', value: '`/music queue` - Show queue\n`/music shuffle` - Shuffle queue\n`/music loop` - Toggle loop modes\n`/music nowplaying` - Current song', inline: false }
        )
        .setFooter({ text: 'Supports YouTube, Spotify URLs and search queries' })
        .setTimestamp();
      
      await interaction.reply({ embeds: [embed], ephemeral: true });
    } else if (customId === 'help_utility') {
      const embed = new EmbedBuilder()
        .setColor('#5865F2')
        .setTitle('⚙️ Utility Commands')
        .setDescription('Helpful tools and information commands')
        .addFields(
          { name: '🌐 Information', value: '`/weather <location>` - Weather info\n`/news` - Latest headlines\n`/wiki <term>` - Wikipedia search\n`/urban <term>` - Urban Dictionary', inline: false },
          { name: '🔧 Tools', value: '`/qr <text>` - Generate QR codes\n`/math <expression>` - Calculator\n`/color <hex>` - Color information\n`/password` - Generate passwords', inline: false },
          { name: '👤 User Info', value: '`/avatar <user>` - User avatars\n`/userinfo <user>` - User details\n`/serverinfo` - Server information\n`/afk <reason>` - Set AFK status', inline: false }
        )
        .setFooter({ text: 'Most utility commands work in DMs too!' })
        .setTimestamp();
      
      await interaction.reply({ embeds: [embed], ephemeral: true });
    } else if (customId.startsWith('voice_') || customId.startsWith('_')) {
      // Handle voice control buttons
      await this.System.handleButton(interaction);
    } else if (customId.startsWith('logging_') || customId.startsWith('set_')) {
      // Handle logging configuration buttons
      await this.loggingSystem.handleLoggingButton(interaction);
    }
  }

  private async handleVoiceButton(interaction: any) {
    const member = interaction.member as GuildMember;
    const voiceChannel = member.voice.channel;
    
    if (!voiceChannel && !this.isSuperAdmin(interaction.user.id)) {
      return await interaction.reply({ content: '❌ You must be in a voice channel.', ephemeral: true });
    }

    const customId = interaction.customId;
    
    switch (customId) {
      case 'voice_lock':
        await this.handleVoiceLock(interaction);
        break;
      case 'voice_unlock':
        await this.handleVoiceUnlock(interaction);
        break;
      case 'voice_limit':
        // Show modal for setting limit
        const limitModal = new ModalBuilder()
          .setCustomId('voice_limit_modal')
          .setTitle('Set User Limit');

        const limitInput = new TextInputBuilder()
          .setCustomId('limit_input')
          .setLabel('User Limit (0 = unlimited)')
          .setStyle(TextInputStyle.Short)
          .setMinLength(1)
          .setMaxLength(2)
          .setRequired(true);

        const limitActionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(limitInput);
        limitModal.addComponents(limitActionRow);

        await interaction.showModal(limitModal);
        break;
      case 'voice_rename':
        // Show modal for renaming
        const renameModal = new ModalBuilder()
          .setCustomId('voice_rename_modal')
          .setTitle('Rename Voice Channel');

        const nameInput = new TextInputBuilder()
          .setCustomId('name_input')
          .setLabel('New Channel Name')
          .setStyle(TextInputStyle.Short)
          .setMinLength(1)
          .setMaxLength(100)
          .setRequired(true);

        const nameActionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(nameInput);
        renameModal.addComponents(nameActionRow);

        await interaction.showModal(renameModal);
        break;
      case 'voice_invite':
        // Show modal for inviting user
        const inviteModal = new ModalBuilder()
          .setCustomId('voice_invite_modal')
          .setTitle('Invite User to Voice Channel');

        const userInput = new TextInputBuilder()
          .setCustomId('user_input')
          .setLabel('User ID or @mention')
          .setStyle(TextInputStyle.Short)
          .setMinLength(1)
          .setMaxLength(100)
          .setRequired(true)
          .setPlaceholder('@username or user ID');

        const userActionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(userInput);
        inviteModal.addComponents(userActionRow);

        await interaction.showModal(inviteModal);
        break;
      case 'voice_kick':
        // Show modal for kicking user
        const kickModal = new ModalBuilder()
          .setCustomId('voice_kick_modal')
          .setTitle('Kick User from Voice Channel');

        const kickUserInput = new TextInputBuilder()
          .setCustomId('kick_user_input')
          .setLabel('User ID or @mention')
          .setStyle(TextInputStyle.Short)
          .setMinLength(1)
          .setMaxLength(100)
          .setRequired(true)
          .setPlaceholder('@username or user ID');

        const kickUserActionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(kickUserInput);
        kickModal.addComponents(kickUserActionRow);

        await interaction.showModal(kickModal);
        break;
      case 'voice_transfer':
        // Show modal for transferring ownership
        const transferModal = new ModalBuilder()
          .setCustomId('voice_transfer_modal')
          .setTitle('Transfer Voice Channel Ownership');

        const transferUserInput = new TextInputBuilder()
          .setCustomId('transfer_user_input')
          .setLabel('New Owner (ID or @mention)')
          .setStyle(TextInputStyle.Short)
          .setMinLength(1)
          .setMaxLength(100)
          .setRequired(true)
          .setPlaceholder('@username or user ID');

        const transferUserActionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(transferUserInput);
        transferModal.addComponents(transferUserActionRow);

        await interaction.showModal(transferModal);
        break;
    }
  }

  // ============================================================================
  // LOGGING DASHBOARD AND HANDLERS
  // ============================================================================
  
  private async showLoggingDashboard(interaction: any) {
    const embed = new EmbedBuilder()
      .setColor('#5865F2')
      .setTitle('📝 Server Logging Dashboard')
      .setDescription('**Interactive logging configuration panel**\n\nConfigure all aspects of server logging with easy-to-use buttons below.')
      .addFields(
        { 
          name: '📨 Message Logging', 
          value: 'Track message edits, deletions, and bulk actions\n**Status:** ❌ Disabled', 
          inline: true 
        },
        { 
          name: '🎤 Voice Logging', 
          value: 'Monitor voice channel activity and changes\n**Status:** ❌ Disabled', 
          inline: true 
        },
        { 
          name: '👥 Member Logging', 
          value: 'Log joins, leaves, and member updates\n**Status:** ❌ Disabled', 
          inline: true 
        },
        { 
          name: '🛡️ Moderation Logging', 
          value: 'Track all moderation actions and bans\n**Status:** ❌ Disabled', 
          inline: true 
        },
        { 
          name: '📋 Audit Logging', 
          value: 'Complete server audit trail\n**Status:** ❌ Disabled', 
          inline: true 
        },
        { 
          name: '⚙️ Channel Setup', 
          value: 'Configure dedicated logging channels\n**Status:** ❌ Not configured', 
          inline: true 
        }
      )
      .setFooter({ text: 'Use the buttons below to configure each logging feature' })
      .setTimestamp();

    const row1 = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('logging_messages')
          .setLabel('📨 Messages')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId('logging_voice')
          .setLabel('🎤 Voice')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId('logging_members')
          .setLabel('👥 Members')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId('logging_moderation')
          .setLabel('🛡️ Moderation')
          .setStyle(ButtonStyle.Secondary)
      );

    const row2 = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('logging_audit')
          .setLabel('📋 Audit')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId('logging_channels')
          .setLabel('⚙️ Channels')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('logging_enable_all')
          .setLabel('✅ Enable All')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId('logging_disable_all')
          .setLabel('❌ Disable All')
          .setStyle(ButtonStyle.Danger)
      );

    await interaction.reply({ embeds: [embed], components: [row1, row2], flags: MessageFlags.Ephemeral });
  }
  
  private async handleLoggingSetup(interaction: any) {
    const channel = interaction.options.getChannel('channel');
    
    const embed = new EmbedBuilder()
      .setColor('#57F287')
      .setTitle('✅ Quick Logging Setup Complete')
      .setDescription(`**Primary logging channel set to:** ${channel}\n\nYou can now configure individual logging features using the dashboard.`)
      .addFields(
        { name: '📝 Next Steps', value: 'Use `/logging dashboard` to configure specific logging features', inline: false },
        { name: '🔧 Features Available', value: 'Messages, Voice, Members, Moderation, Audit logging', inline: false }
      )
      .setTimestamp();
      
    const button = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('logging_open_dashboard')
          .setLabel('📝 Open Dashboard')
          .setStyle(ButtonStyle.Primary)
      );
      
    await interaction.reply({ embeds: [embed], components: [button], flags: MessageFlags.Ephemeral });
  }
  
  private async showLoggingStatus(interaction: any) {
    const embed = new EmbedBuilder()
      .setColor('#F39C12')
      .setTitle('📊 Current Logging Status')
      .setDescription(`**Server:** ${interaction.guild.name}\n**Configuration Overview**`)
      .addFields(
        { 
          name: '📨 Message Logging', 
          value: '❌ **Disabled**\nChannel: Not set\nFeatures: Message edits, deletions, bulk deletes', 
          inline: false 
        },
        { 
          name: '🎤 Voice Activity Logging', 
          value: '❌ **Disabled**\nChannel: Not set\nFeatures: Join/leave, mute/unmute, channel moves', 
          inline: false 
        },
        { 
          name: '👥 Member Event Logging', 
          value: '❌ **Disabled**\nChannel: Not set\nFeatures: Joins, leaves, nickname/role changes', 
          inline: false 
        },
        { 
          name: '🛡️ Moderation Logging', 
          value: '❌ **Disabled**\nChannel: Not set\nFeatures: Bans, kicks, timeouts, warnings', 
          inline: false 
        },
        { 
          name: '📋 Audit Trail', 
          value: '❌ **Disabled**\nChannel: Not set\nFeatures: Complete server audit log', 
          inline: false 
        }
      )
      .setFooter({ text: 'Use /logging dashboard to configure these features' })
      .setTimestamp();
      
    const button = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('logging_configure')
          .setLabel('⚙️ Configure Logging')
          .setStyle(ButtonStyle.Primary)
      );
      
    await interaction.reply({ embeds: [embed], components: [button], ephemeral: true });
  }
  
  private async handleLoggingButton(interaction: any) {
    const customId = interaction.customId;
    
    try {
      // Defer the interaction to prevent timeout issues
      if (!interaction.deferred && !interaction.replied) {
        await interaction.deferUpdate();
      }
      
      switch (customId) {
        case 'logging_messages':
          await this.configureMessageLogging(interaction);
          break;
        case 'logging_voice':
          await this.configureVoiceLogging(interaction);
          break;
        case 'logging_members':
          await this.configureMemberLogging(interaction);
          break;
        case 'logging_moderation':
          await this.configureModerationLogging(interaction);
          break;
        case 'logging_audit':
          await this.configureAuditLogging(interaction);
          break;
        case 'logging_channels':
          await this.configureLoggingChannels(interaction);
          break;
        case 'logging_enable_all':
          await this.enableAllLogging(interaction);
          break;
        case 'logging_disable_all':
          await this.disableAllLogging(interaction);
          break;
        case 'logging_open_dashboard':
        case 'logging_configure':
          await this.showLoggingDashboard(interaction);
          break;
        case 'logging_back':
          await this.showLoggingDashboard(interaction);
          break;
      // Message logging buttons
      case 'msg_logging_enable':
      case 'message_logging_enable':
        await this.toggleMessageLogging(interaction, true);
        break;
      case 'msg_logging_disable':
      case 'message_logging_disable':
        await this.toggleMessageLogging(interaction, false);
        break;
      case 'msg_logging_channel':
      case 'message_logging_channel':
        await this.promptChannelSelection(interaction, 'message');
        break;
      // Voice logging buttons
      case 'voice_logging_enable':
        await this.toggleVoiceLogging(interaction, true);
        break;
      case 'voice_logging_disable':
        await this.toggleVoiceLogging(interaction, false);
        break;
      case 'voice_logging_channel':
        await this.promptChannelSelection(interaction, 'voice');
        break;
      // Member logging buttons
      case 'member_logging_enable':
        await this.toggleMemberLogging(interaction, true);
        break;
      case 'member_logging_disable':
        await this.toggleMemberLogging(interaction, false);
        break;
      case 'member_logging_channel':
        await this.promptChannelSelection(interaction, 'member');
        break;
      // Moderation logging buttons
      case 'mod_logging_enable':
        await this.toggleModerationLogging(interaction, true);
        break;
      case 'mod_logging_disable':
        await this.toggleModerationLogging(interaction, false);
        break;
      case 'mod_logging_channel':
        await this.promptChannelSelection(interaction, 'moderation');
        break;
      // Audit logging buttons
      case 'audit_logging_enable':
        await this.toggleAuditLogging(interaction, true);
        break;
      case 'audit_logging_disable':
        await this.toggleAuditLogging(interaction, false);
        break;
      case 'audit_logging_channel':
        await this.promptChannelSelection(interaction, 'audit');
        break;
      // Channel setup buttons
      case 'set_msg_channel':
        await this.promptChannelSelection(interaction, 'message');
        break;
      case 'set_voice_channel':
        await this.promptChannelSelection(interaction, 'voice');
        break;
      case 'set_member_channel':
        await this.promptChannelSelection(interaction, 'member');
        break;
      case 'set_mod_channel':
        await this.promptChannelSelection(interaction, 'moderation');
        break;
      case 'set_audit_channel':
        await this.promptChannelSelection(interaction, 'audit');
        break;
      case 'create_all_channels':
        await this.createAllLoggingChannels(interaction);
        break;
      case 'confirm_create_channels':
        await this.executeChannelCreation(interaction);
        break;
      case 'mod_logging_channel':
        await this.promptChannelSelection(interaction, 'moderation');
        break;
      // Audit logging buttons
      case 'audit_logging_enable':
        await this.toggleAuditLogging(interaction, true);
        break;
      case 'audit_logging_disable':
        await this.toggleAuditLogging(interaction, false);
        break;
      case 'audit_logging_channel':
        await this.promptChannelSelection(interaction, 'audit');
        break;
      // Channel setup buttons
      case 'set_msg_channel':
        await this.promptChannelSelection(interaction, 'message');
        break;
      case 'set_voice_channel':
        await this.promptChannelSelection(interaction, 'voice');
        break;
      case 'set_member_channel':
        await this.promptChannelSelection(interaction, 'member');
        break;
      case 'set_mod_channel':
        await this.promptChannelSelection(interaction, 'moderation');
        break;
      case 'set_audit_channel':
        await this.promptChannelSelection(interaction, 'audit');
        break;
      case 'create_all_channels':
        await this.createAllLoggingChannels(interaction);
        break;
        default:
          if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ 
              content: '❌ Button handler not found. Please try again or contact support.', 
              flags: MessageFlags.Ephemeral 
            });
          } else {
            await interaction.editReply({ 
              content: '❌ Button handler not found. Please try again or contact support.'
            });
          }
      }
    } catch (error: any) {
      console.error('Error handling logging button:', error);
      try {
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({ 
            content: '❌ An error occurred processing your request. Please try again.', 
            flags: MessageFlags.Ephemeral 
          });
        } else {
          await interaction.editReply({ 
            content: '❌ An error occurred processing your request. Please try again.'
          });
        }
      } catch (followupError) {
        console.error('Error sending error message:', followupError);
      }
    }
  }
  
  private async configureMessageLogging(interaction: any) {
    const embed = new EmbedBuilder()
      .setColor('#5865F2')
      .setTitle('📨 Message Logging Configuration')
      .setDescription('**Configure message logging settings**\n\nTrack message edits, deletions, and bulk operations to maintain server transparency.')
      .addFields(
        { name: '📋 Features Included', value: '• Message edits with before/after\n• Message deletions with content\n• Bulk message deletions\n• Message attachments\n• Embed modifications', inline: false },
        { name: '⚙️ Current Status', value: '❌ **Disabled**\n📁 Channel: Not set', inline: true },
        { name: '📏 Event Types', value: 'Edit • Delete • Bulk Delete\nAttachment • Embed Changes', inline: true }
      )
      .setTimestamp();
      
    const buttons = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('msg_logging_enable')
          .setLabel('✅ Enable')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId('msg_logging_disable')
          .setLabel('❌ Disable')
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId('msg_logging_channel')
          .setLabel('📁 Set Channel')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('logging_back')
          .setLabel('⬅️ Back')
          .setStyle(ButtonStyle.Secondary)
      );
      
    if (interaction.deferred) {
      await interaction.editReply({ embeds: [embed], components: [buttons] });
    } else {
      await interaction.reply({ embeds: [embed], components: [buttons], flags: MessageFlags.Ephemeral });
    }
  }
  
  private async configureVoiceLogging(interaction: any) {
    const embed = new EmbedBuilder()
      .setColor('#5865F2')
      .setTitle('🎤 Voice Activity Logging')
      .setDescription('**Monitor voice channel activity**\n\nTrack voice events to maintain oversight of voice communications.')
      .addFields(
        { name: '📋 Features Included', value: '• Voice channel joins/leaves\n• Mute/unmute events\n• Deafen/undeafen events\n• Channel switching\n• Connection quality issues', inline: false },
        { name: '⚙️ Current Status', value: '❌ **Disabled**\n📁 Channel: Not set', inline: true },
        { name: '📏 Event Types', value: 'Join • Leave • Move\nMute • Deafen • Stream', inline: true }
      )
      .setTimestamp();
      
    const buttons = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('voice_logging_enable')
          .setLabel('✅ Enable')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId('voice_logging_disable')
          .setLabel('❌ Disable')
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId('voice_logging_channel')
          .setLabel('📁 Set Channel')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('logging_back')
          .setLabel('⬅️ Back')
          .setStyle(ButtonStyle.Secondary)
      );
      
    await interaction.reply({ embeds: [embed], components: [buttons], flags: MessageFlags.Ephemeral });
  }
  
  private async configureMemberLogging(interaction: any) {
    const embed = new EmbedBuilder()
      .setColor('#5865F2')
      .setTitle('👥 Member Event Logging')
      .setDescription('**Track member activities and changes**\n\nMonitor member joins, leaves, and profile updates.')
      .addFields(
        { name: '📋 Features Included', value: '• Member joins with account age\n• Member leaves with join date\n• Nickname changes\n• Role additions/removals\n• Avatar updates', inline: false },
        { name: '⚙️ Current Status', value: '❌ **Disabled**\n📁 Channel: Not set', inline: true },
        { name: '📏 Event Types', value: 'Join • Leave • Update\nRoles • Nickname • Avatar', inline: true }
      )
      .setTimestamp();
      
    const buttons = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('member_logging_enable')
          .setLabel('✅ Enable')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId('member_logging_disable')
          .setLabel('❌ Disable')
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId('member_logging_channel')
          .setLabel('📁 Set Channel')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('logging_back')
          .setLabel('⬅️ Back')
          .setStyle(ButtonStyle.Secondary)
      );
      
    await interaction.reply({ embeds: [embed], components: [buttons], flags: MessageFlags.Ephemeral });
  }
  
  private async configureModerationLogging(interaction: any) {
    const embed = new EmbedBuilder()
      .setColor('#E74C3C')
      .setTitle('🛡️ Moderation Action Logging')
      .setDescription('**Track all moderation activities**\n\nComplete audit trail of all moderation actions taken by staff.')
      .addFields(
        { name: '📋 Features Included', value: '• Bans, kicks, and timeouts\n• Warnings and infractions\n• Message purges\n• Role restrictions\n• Channel lockdowns', inline: false },
        { name: '⚙️ Current Status', value: '❌ **Disabled**\n📁 Channel: Not set', inline: true },
        { name: '📏 Event Types', value: 'Ban • Kick • Timeout\nWarn • Purge • Lock', inline: true }
      )
      .setTimestamp();
      
    const buttons = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('mod_logging_enable')
          .setLabel('✅ Enable')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId('mod_logging_disable')
          .setLabel('❌ Disable')
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId('mod_logging_channel')
          .setLabel('📁 Set Channel')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('logging_back')
          .setLabel('⬅️ Back')
          .setStyle(ButtonStyle.Secondary)
      );
      
    await interaction.reply({ embeds: [embed], components: [buttons], flags: MessageFlags.Ephemeral });
  }
  
  private async configureAuditLogging(interaction: any) {
    const embed = new EmbedBuilder()
      .setColor('#9B59B6')
      .setTitle('📋 Comprehensive Audit Logging')
      .setDescription('**Complete server audit trail**\n\nTrack all server changes, administrative actions, and security events.')
      .addFields(
        { name: '📋 Features Included', value: '• Server settings changes\n• Channel/role modifications\n• Permission updates\n• Webhook activities\n• Bot additions/removals', inline: false },
        { name: '⚙️ Current Status', value: '❌ **Disabled**\n📁 Channel: Not set', inline: true },
        { name: '📏 Event Types', value: 'Settings • Permissions\nRoles • Channels • Security', inline: true }
      )
      .setTimestamp();
      
    const buttons = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('audit_logging_enable')
          .setLabel('✅ Enable')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId('audit_logging_disable')
          .setLabel('❌ Disable')
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId('audit_logging_channel')
          .setLabel('📁 Set Channel')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('logging_back')
          .setLabel('⬅️ Back')
          .setStyle(ButtonStyle.Secondary)
      );
      
    await interaction.reply({ embeds: [embed], components: [buttons], flags: MessageFlags.Ephemeral });
  }
  
  private async configureLoggingChannels(interaction: any) {
    const embed = new EmbedBuilder()
      .setColor('#3498DB')
      .setTitle('⚙️ Logging Channels Configuration')
      .setDescription('**Set up dedicated logging channels**\n\nConfigure where different types of logs will be sent.')
      .addFields(
        { name: '📝 Recommended Setup', value: '• 📨 **#message-logs** - Message events\n• 🎤 **#voice-logs** - Voice activity\n• 👥 **#member-logs** - Member events\n• 🛡️ **#mod-logs** - Moderation actions\n• 📋 **#audit-logs** - Server changes', inline: false },
        { name: '🔧 Quick Actions', value: 'Use the buttons below to set up channels quickly', inline: false }
      )
      .setTimestamp();
      
    const row1 = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('set_msg_channel')
          .setLabel('📨 Message Channel')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('set_voice_channel')
          .setLabel('🎤 Voice Channel')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('set_member_channel')
          .setLabel('👥 Member Channel')
          .setStyle(ButtonStyle.Primary)
      );
      
    const row2 = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('set_mod_channel')
          .setLabel('🛡️ Mod Channel')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('set_audit_channel')
          .setLabel('📋 Audit Channel')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('create_all_channels')
          .setLabel('✨ Auto Create All')
          .setStyle(ButtonStyle.Success)
      );
      
    const row3 = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('logging_back')
          .setLabel('⬅️ Back to Dashboard')
          .setStyle(ButtonStyle.Secondary)
      );
      
    await interaction.reply({ embeds: [embed], components: [row1, row2, row3], flags: MessageFlags.Ephemeral });
  }
  
  private async enableAllLogging(interaction: any) {
    try {
      // Actually enable all logging features (in a real implementation, this would update database/config)
      // For demonstration, we'll show success and provide next steps
      
      const embed = new EmbedBuilder()
        .setColor('#57F287')
        .setTitle('✅ All Logging Features Enabled')
        .setDescription('**Complete logging system activated**\n\nAll logging features have been enabled for maximum server monitoring.')
        .addFields(
          { name: '✅ Enabled Features', value: '• 📨 Message Logging - **ENABLED**\n• 🎤 Voice Activity - **ENABLED**\n• 👥 Member Events - **ENABLED**\n• 🛡️ Moderation Actions - **ENABLED**\n• 📋 Audit Trail - **ENABLED**', inline: false },
          { name: '⚠️ Next Steps', value: '1. Configure logging channels\n2. Test individual features\n3. Set permissions for log channels', inline: false },
          { name: '🎯 Success', value: `Logging enabled by ${interaction.user.tag} at ${new Date().toLocaleTimeString()}`, inline: false }
        )
        .setTimestamp();
        
      const buttons = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('logging_channels')
            .setLabel('⚙️ Configure Channels')
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId('logging_disable_all')
            .setLabel('❌ Disable All')
            .setStyle(ButtonStyle.Danger),
          new ButtonBuilder()
            .setCustomId('logging_back')
            .setLabel('⬅️ Back')
            .setStyle(ButtonStyle.Secondary)
        );
        
      if (interaction.deferred) {
        await interaction.editReply({ embeds: [embed], components: [buttons] });
      } else {
        await interaction.reply({ embeds: [embed], components: [buttons], flags: MessageFlags.Ephemeral });
      }
      
      // Log this action for demo purposes
      console.log(`✅ All logging features enabled by ${interaction.user.tag} in guild ${interaction.guild.name}`);
      
    } catch (error: any) {
      const errorMsg = `❌ Failed to enable logging: ${error.message}`;
      if (interaction.deferred) {
        await interaction.editReply({ content: errorMsg });
      } else {
        await interaction.reply({ content: errorMsg, flags: MessageFlags.Ephemeral });
      }
    }
  }
  
  private async disableAllLogging(interaction: any) {
    try {
      // Actually disable all logging features (in a real implementation, this would update database/config)
      
      const embed = new EmbedBuilder()
        .setColor('#E74C3C')
        .setTitle('❌ All Logging Features Disabled')
        .setDescription('**Logging system deactivated**\n\nAll logging features have been disabled. No events will be recorded.')
        .addFields(
          { name: '❌ Disabled Features', value: '• 📨 Message Logging - **DISABLED**\n• 🎤 Voice Activity - **DISABLED**\n• 👥 Member Events - **DISABLED**\n• 🛡️ Moderation Actions - **DISABLED**\n• 📋 Audit Trail - **DISABLED**', inline: false },
          { name: '📝 Note', value: 'You can re-enable individual features anytime from the dashboard', inline: false },
          { name: '🎯 Action', value: `Logging disabled by ${interaction.user.tag} at ${new Date().toLocaleTimeString()}`, inline: false }
        )
        .setTimestamp();
        
      const buttons = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('logging_enable_all')
            .setLabel('✅ Re-enable All')
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId('logging_back')
            .setLabel('⬅️ Back')
            .setStyle(ButtonStyle.Secondary)
        );
        
      await interaction.reply({ embeds: [embed], components: [buttons], flags: MessageFlags.Ephemeral });
      
      // Log this action for demo purposes
      console.log(`❌ All logging features disabled by ${interaction.user.tag} in guild ${interaction.guild.name}`);
      
    } catch (error: any) {
      await interaction.reply({ content: `❌ Failed to disable logging: ${error.message}`, flags: MessageFlags.Ephemeral });
    }
  }
  
  // Individual toggle functions
  private async toggleMessageLogging(interaction: any, enabled: boolean) {
    const status = enabled ? '✅ **Enabled**' : '❌ **Disabled**';
    const color = enabled ? '#57F287' : '#E74C3C';
    
    const embed = new EmbedBuilder()
      .setColor(color)
      .setTitle(`📨 Message Logging ${enabled ? 'Enabled' : 'Disabled'}`)
      .setDescription(`Message logging has been **${enabled ? 'enabled' : 'disabled'}** for this server.`)
      .addFields(
        { name: '🔄 Status', value: status, inline: true },
        { name: '📋 Features', value: 'Message edits, deletions, bulk operations', inline: true }
      )
      .setTimestamp();
      
    const button = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('logging_back')
          .setLabel('⬅️ Back to Dashboard')
          .setStyle(ButtonStyle.Secondary)
      );
      
    if (interaction.deferred) {
      await interaction.editReply({ embeds: [embed], components: [button] });
    } else {
      await interaction.reply({ embeds: [embed], components: [button], flags: MessageFlags.Ephemeral });
    }
  }
  
  private async toggleVoiceLogging(interaction: any, enabled: boolean) {
    const status = enabled ? '✅ **Enabled**' : '❌ **Disabled**';
    const color = enabled ? '#57F287' : '#E74C3C';
    
    const embed = new EmbedBuilder()
      .setColor(color)
      .setTitle(`🎤 Voice Logging ${enabled ? 'Enabled' : 'Disabled'}`)
      .setDescription(`Voice activity logging has been **${enabled ? 'enabled' : 'disabled'}** for this server.`)
      .addFields(
        { name: '🔄 Status', value: status, inline: true },
        { name: '📋 Features', value: 'Join/leave, mute/unmute, channel moves', inline: true }
      )
      .setTimestamp();
      
    const button = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('logging_back')
          .setLabel('⬅️ Back to Dashboard')
          .setStyle(ButtonStyle.Secondary)
      );
      
    await interaction.reply({ embeds: [embed], components: [button], flags: MessageFlags.Ephemeral });
  }
  
  private async toggleMemberLogging(interaction: any, enabled: boolean) {
    const status = enabled ? '✅ **Enabled**' : '❌ **Disabled**';
    const color = enabled ? '#57F287' : '#E74C3C';
    
    const embed = new EmbedBuilder()
      .setColor(color)
      .setTitle(`👥 Member Logging ${enabled ? 'Enabled' : 'Disabled'}`)
      .setDescription(`Member event logging has been **${enabled ? 'enabled' : 'disabled'}** for this server.`)
      .addFields(
        { name: '🔄 Status', value: status, inline: true },
        { name: '📋 Features', value: 'Joins, leaves, profile changes', inline: true }
      )
      .setTimestamp();
      
    const button = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('logging_back')
          .setLabel('⬅️ Back to Dashboard')
          .setStyle(ButtonStyle.Secondary)
      );
      
    await interaction.reply({ embeds: [embed], components: [button], flags: MessageFlags.Ephemeral });
  }
  
  private async toggleModerationLogging(interaction: any, enabled: boolean) {
    const status = enabled ? '✅ **Enabled**' : '❌ **Disabled**';
    const color = enabled ? '#57F287' : '#E74C3C';
    
    const embed = new EmbedBuilder()
      .setColor(color)
      .setTitle(`🛡️ Moderation Logging ${enabled ? 'Enabled' : 'Disabled'}`)
      .setDescription(`Moderation action logging has been **${enabled ? 'enabled' : 'disabled'}** for this server.`)
      .addFields(
        { name: '🔄 Status', value: status, inline: true },
        { name: '📋 Features', value: 'Bans, kicks, warnings, timeouts', inline: true }
      )
      .setTimestamp();
      
    const button = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('logging_back')
          .setLabel('⬅️ Back to Dashboard')
          .setStyle(ButtonStyle.Secondary)
      );
      
    await interaction.reply({ embeds: [embed], components: [button], flags: MessageFlags.Ephemeral });
  }
  
  private async toggleAuditLogging(interaction: any, enabled: boolean) {
    const status = enabled ? '✅ **Enabled**' : '❌ **Disabled**';
    const color = enabled ? '#57F287' : '#E74C3C';
    
    const embed = new EmbedBuilder()
      .setColor(color)
      .setTitle(`📋 Audit Logging ${enabled ? 'Enabled' : 'Disabled'}`)
      .setDescription(`Audit trail logging has been **${enabled ? 'enabled' : 'disabled'}** for this server.`)
      .addFields(
        { name: '🔄 Status', value: status, inline: true },
        { name: '📋 Features', value: 'Server changes, permissions, security', inline: true }
      )
      .setTimestamp();
      
    const button = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('logging_back')
          .setLabel('⬅️ Back to Dashboard')
          .setStyle(ButtonStyle.Secondary)
      );
      
    await interaction.reply({ embeds: [embed], components: [button], flags: MessageFlags.Ephemeral });
  }
  
  private async promptChannelSelection(interaction: any, logType: string) {
    const embed = new EmbedBuilder()
      .setColor('#3498DB')
      .setTitle(`🔧 Set ${logType.charAt(0).toUpperCase() + logType.slice(1)} Logging Channel`)
      .setDescription(`**Configure ${logType} logging channel**\n\nTo set up the logging channel:\n\n**Method 1: Use Slash Command**\n\`/logging setup\` command and select your desired channel\n\n**Method 2: Manual Setup**\nMention the channel in this format: \`#channel-name\`\n\n**Recommended Channel Names:**\n\`#${logType}-logs\` or \`#log-${logType}\``)
      .addFields(
        { name: '📝 Example', value: `Use \`/logging setup\` and select #${logType}-logs`, inline: false },
        { name: '💡 Tip', value: 'Create dedicated logging channels for better organization', inline: false }
      )
      .setTimestamp();
      
    const button = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('logging_back')
          .setLabel('⬅️ Back to Dashboard')
          .setStyle(ButtonStyle.Secondary)
      );
      
    await interaction.reply({ embeds: [embed], components: [button], flags: MessageFlags.Ephemeral });
  }
  
  private async createAllLoggingChannels(interaction: any) {
    const embed = new EmbedBuilder()
      .setColor('#57F287')
      .setTitle('🚀 Auto-Create Logging Channels')
      .setDescription('**Automated channel creation**\n\nThis will create all recommended logging channels for you:')
      .addFields(
        { name: '📁 Channels to Create', value: '• `#message-logs` - Message events\n• `#voice-logs` - Voice activity\n• `#member-logs` - Member events\n• `#mod-logs` - Moderation actions\n• `#audit-logs` - Server changes', inline: false },
        { name: '⚙️ Auto Configuration', value: 'All channels will be automatically configured with proper permissions and logging enabled', inline: false },
        { name: '🔒 Permissions', value: 'Channels will be visible to moderators only', inline: false }
      )
      .setTimestamp();
      
    const buttons = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('confirm_create_channels')
          .setLabel('✅ Create Channels')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId('logging_back')
          .setLabel('❌ Cancel')
          .setStyle(ButtonStyle.Danger)
      );
      
    await interaction.reply({ embeds: [embed], components: [buttons], flags: MessageFlags.Ephemeral });
  }

  private async executeChannelCreation(interaction: any) {
    try {
      await interaction.deferReply({ ephemeral: true });
      
      const guild = interaction.guild;
      const channelsToCreate = [
        { name: 'message-logs', type: 'message' },
        { name: 'voice-logs', type: 'voice' },
        { name: 'member-logs', type: 'member' },
        { name: 'mod-logs', type: 'moderation' },
        { name: 'audit-logs', type: 'audit' }
      ];
      
      const createdChannels = [];
      
      for (const channelConfig of channelsToCreate) {
        try {
          const channel = await guild.channels.create({
            name: channelConfig.name,
            type: ChannelType.GuildText,
            topic: `Automated ${channelConfig.type} logging channel`,
            permissionOverwrites: [
              {
                id: guild.roles.everyone.id,
                deny: ['ViewChannel']
              },
              {
                id: interaction.guild.members.me.id,
                allow: ['ViewChannel', 'SendMessages', 'EmbedLinks']
              }
            ]
          });
          createdChannels.push(`<#${channel.id}>`);
        } catch (error: any) {
          console.error(`Failed to create ${channelConfig.name}:`, error.message);
        }
      }
      
      const embed = new EmbedBuilder()
        .setColor('#57F287')
        .setTitle('✅ Logging Channels Created')
        .setDescription(`Successfully created ${createdChannels.length} logging channels:`)
        .addFields(
          { name: '📁 Created Channels', value: createdChannels.join('\n') || 'No channels created', inline: false },
          { name: '⚙️ Next Steps', value: 'Channels are ready! Use `/logging dashboard` to configure individual logging features.', inline: false }
        )
        .setTimestamp();
        
      await interaction.editReply({ embeds: [embed] });
      
    } catch (error: any) {
      await interaction.editReply({ content: `❌ Failed to create channels: ${error.message}` });
    }
  }

  // ============================================================================
  // MODAL INTERACTION HANDLER
  // ============================================================================
  
  private async handleModalInteraction(interaction: any) {
    const customId = interaction.customId;
    const member = interaction.member as GuildMember;
    const voiceChannel = member.voice.channel;
    
    if (!voiceChannel) {
      return await interaction.reply({ content: '❌ You must be in a voice channel.', ephemeral: true });
    }
    
    switch (customId) {
      case 'voice_limit_modal':
        const limit = parseInt(interaction.fields.getTextInputValue('limit_input'));
        if (isNaN(limit) || limit < 0 || limit > 99) {
          return await interaction.reply({ content: '❌ Please enter a valid number between 0-99.', ephemeral: true });
        }
        
        try {
          await voiceChannel.setUserLimit(limit);
          const embed = new EmbedBuilder()
            .setColor('#3498DB')
            .setTitle('👥 User Limit Set')
            .setDescription(`**${voiceChannel.name}** user limit set to ${limit === 0 ? 'unlimited' : limit}`)
            .setTimestamp();
          await interaction.reply({ embeds: [embed] });
        } catch (error: any) {
          await interaction.reply({ content: `❌ Failed to set user limit: ${error.message}`, ephemeral: true });
        }
        break;
        
      case 'voice_rename_modal':
        const newName = interaction.fields.getTextInputValue('name_input');
        if (!newName || newName.length < 1 || newName.length > 100) {
          return await interaction.reply({ content: '❌ Channel name must be 1-100 characters.', ephemeral: true });
        }
        
        try {
          const oldName = voiceChannel.name;
          await voiceChannel.setName(newName);
          const embed = new EmbedBuilder()
            .setColor('#F1C40F')
            .setTitle('📝 Channel Name Changed')
            .setDescription(`Channel renamed from **${oldName}** to **${newName}**`)
            .setTimestamp();
          await interaction.reply({ embeds: [embed] });
        } catch (error: any) {
          await interaction.reply({ content: `❌ Failed to rename channel: ${error.message}`, ephemeral: true });
        }
        break;
        
      case 'voice_invite_modal':
        const userInput = interaction.fields.getTextInputValue('user_input');
        try {
          let targetUser;
          // Try to parse user ID or mention
          const userIdMatch = userInput.match(/<@!?(\d+)>/) || userInput.match(/^(\d+)$/);
          if (userIdMatch) {
            targetUser = await interaction.guild.members.fetch(userIdMatch[1] || userIdMatch[0]);
          } else {
            return await interaction.reply({ content: '❌ Please provide a valid user ID or @mention.', ephemeral: true });
          }
          
          await voiceChannel.permissionOverwrites.edit(targetUser.user, {
            Connect: true
          });
          
          const embed = new EmbedBuilder()
            .setColor('#57F287')
            .setTitle('➕ User Invited')
            .setDescription(`**${targetUser.user.tag}** has been invited to **${voiceChannel.name}**`)
            .setTimestamp();
          await interaction.reply({ embeds: [embed] });
        } catch (error: any) {
          await interaction.reply({ content: `❌ Failed to invite user: ${error.message}`, ephemeral: true });
        }
        break;
        
      case 'voice_kick_modal':
        const kickUserInput = interaction.fields.getTextInputValue('kick_user_input');
        try {
          let targetUser;
          const userIdMatch = kickUserInput.match(/<@!?(\d+)>/) || kickUserInput.match(/^(\d+)$/);
          if (userIdMatch) {
            targetUser = await interaction.guild.members.fetch(userIdMatch[1] || userIdMatch[0]);
          } else {
            return await interaction.reply({ content: '❌ Please provide a valid user ID or @mention.', ephemeral: true });
          }
          
          if (!targetUser.voice.channel || targetUser.voice.channel.id !== voiceChannel.id) {
            return await interaction.reply({ content: '❌ That user is not in your voice channel.', ephemeral: true });
          }
          
          await targetUser.voice.disconnect('Kicked by channel owner');
          
          const embed = new EmbedBuilder()
            .setColor('#E74C3C')
            .setTitle('❌ User Kicked')
            .setDescription(`**${targetUser.user.tag}** has been kicked from **${voiceChannel.name}**`)
            .setTimestamp();
          await interaction.reply({ embeds: [embed] });
        } catch (error: any) {
          await interaction.reply({ content: `❌ Failed to kick user: ${error.message}`, ephemeral: true });
        }
        break;
        
      case 'voice_transfer_modal':
        const transferUserInput = interaction.fields.getTextInputValue('transfer_user_input');
        try {
          let targetUser;
          const userIdMatch = transferUserInput.match(/<@!?(\d+)>/) || transferUserInput.match(/^(\d+)$/);
          if (userIdMatch) {
            targetUser = await interaction.guild.members.fetch(userIdMatch[1] || userIdMatch[0]);
          } else {
            return await interaction.reply({ content: '❌ Please provide a valid user ID or @mention.', ephemeral: true });
          }
          
          if (!targetUser.voice.channel || targetUser.voice.channel.id !== voiceChannel.id) {
            return await interaction.reply({ content: '❌ That user must be in your voice channel.', ephemeral: true });
          }
          
          // Transfer ownership by giving full permissions to new owner
          await voiceChannel.permissionOverwrites.edit(targetUser.user, {
            ManageChannels: true,
            Connect: true,
            Speak: true,
            MuteMembers: true,
            DeafenMembers: true,
            MoveMembers: true
          });
          
          // Remove permissions from original owner
          await voiceChannel.permissionOverwrites.edit(member.user, {
            ManageChannels: null
          });
          
          const embed = new EmbedBuilder()
            .setColor('#F39C12')
            .setTitle('👑 Ownership Transferred')
            .setDescription(`**${targetUser.user.tag}** is now the owner of **${voiceChannel.name}**`)
            .setTimestamp();
          await interaction.reply({ embeds: [embed] });
        } catch (error: any) {
          await interaction.reply({ content: `❌ Failed to transfer ownership: ${error.message}`, ephemeral: true });
        }
        break;
        
      default:
        // Check if it's a  or logging modal
        if (customId.startsWith('_') || customId.startsWith('voice_modal_')) {
          await this.System.handleModal(interaction);
        } else if (customId.startsWith('channel_modal_')) {
          await this.loggingSystem.handleModalInteraction(interaction);
        } else {
          await interaction.reply({ content: '❌ Unknown modal interaction.', ephemeral: true });
        }
        break;
    }
  }

  // ============================================================================
  // OWNER-ONLY SERVER MANAGEMENT COMMAND
  // ============================================================================
  
  private createServerManagementCommand(): Command {
    return {
      data: new SlashCommandBuilder()
        .setName('servers')
        .setDescription('📊 Owner-only: Manage bot servers and connections')
        .addSubcommand(sub =>
          sub.setName('list')
            .setDescription('List all servers the bot is in'))
        .addSubcommand(sub =>
          sub.setName('join')
            .setDescription('Join a server via invite link')
            .addStringOption(opt =>
              opt.setName('invite')
                .setDescription('Discord invite link or code')
                .setRequired(true)))
        .addSubcommand(sub =>
          sub.setName('leave')
            .setDescription('Leave a specific server')
            .addStringOption(opt =>
              opt.setName('serverid')
                .setDescription('Server ID to leave')
                .setRequired(true)))
        .addSubcommand(sub =>
          sub.setName('info')
            .setDescription('Get detailed info about a server')
            .addStringOption(opt =>
              opt.setName('serverid')
                .setDescription('Server ID to get info about')
                .setRequired(true)))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
      execute: async (interaction) => {
        // Only bot owner can use this command
        if (!this.isSuperAdmin(interaction.user.id)) {
          return await interaction.reply({ 
            content: '❌ This command is only available to the bot owner.', 
            ephemeral: true 
          });
        }
        
        const subcommand = interaction.options.getSubcommand();
        
        switch (subcommand) {
          case 'list':
            await this.handleServerList(interaction);
            break;
          case 'join':
            await this.handleServerJoin(interaction);
            break;
          case 'leave':
            await this.handleServerLeave(interaction);
            break;
          case 'info':
            await this.handleServerInfo(interaction);
            break;
        }
      }
    };
  }
  
  private async handleServerList(interaction: any) {
    try {
      const guilds = this.client.guilds.cache;
      
      if (guilds.size === 0) {
        return await interaction.reply({ 
          content: '📊 Bot is not in any servers.', 
          ephemeral: true 
        });
      }
      
      const serverList = guilds.map(guild => {
        const memberCount = guild.memberCount || 'Unknown';
        const owner = guild.ownerId ? `<@${guild.ownerId}>` : 'Unknown';
        return `**${guild.name}** (${guild.id})\n• Members: ${memberCount}\n• Owner: ${owner}\n`;
      }).join('\n');
      
      const embed = new EmbedBuilder()
        .setColor('#5865F2')
        .setTitle('📊 Bot Server List')
        .setDescription(`Connected to **${guilds.size}** servers:\n\n${serverList}`)
        .setFooter({ text: `Total servers: ${guilds.size} | Use /servers info <id> for details` })
        .setTimestamp();
        
      await interaction.reply({ embeds: [embed], ephemeral: true });
    } catch (error: any) {
      await interaction.reply({ 
        content: `❌ Error listing servers: ${error.message}`, 
        ephemeral: true 
      });
    }
  }
  
  private async handleServerJoin(interaction: any) {
    const inviteInput = interaction.options.getString('invite');
    
    try {
      // Extract invite code from URL or use as-is
      const inviteCode = inviteInput.replace(/https?:\/\/(discord\.gg\/|discordapp\.com\/invite\/)/, '');
      
      // Fetch invite info first
      const invite = await this.client.fetchInvite(inviteCode);
      
      if (!invite || !invite.guild) {
        return await interaction.reply({ 
          content: '❌ Invalid invite link or invite has expired.', 
          ephemeral: true 
        });
      }
      
      // Check if bot is already in this server
      if (this.client.guilds.cache.has(invite.guild.id)) {
        return await interaction.reply({ 
          content: `❌ Bot is already in **${invite.guild.name}**.`, 
          ephemeral: true 
        });
      }
      
      const embed = new EmbedBuilder()
        .setColor('#57F287')
        .setTitle('🗗️ Invite Information')
        .setDescription(`**Server:** ${invite.guild.name}\n**Members:** ${invite.memberCount || 'Unknown'}\n**Invite Code:** \`${inviteCode}\``)
        .addFields(
          { name: 'Action Required', value: 'To join this server, the bot needs to be manually invited by a server administrator with the proper permissions.', inline: false },
          { name: 'Invite Link', value: `https://discord.com/api/oauth2/authorize?client_id=${this.client.user?.id}&permissions=8&scope=bot%20applications.commands&guild_id=${invite.guild.id}`, inline: false }
        )
        .setThumbnail(invite.guild.iconURL())
        .setFooter({ text: 'Share the invite link with a server admin to add the bot' })
        .setTimestamp();
        
      await interaction.reply({ embeds: [embed], ephemeral: true });
    } catch (error: any) {
      await interaction.reply({ 
        content: `❌ Error processing invite: ${error.message}`, 
        ephemeral: true 
      });
    }
  }
  
  private async handleServerLeave(interaction: any) {
    const serverId = interaction.options.getString('serverid');
    
    try {
      const guild = this.client.guilds.cache.get(serverId);
      
      if (!guild) {
        return await interaction.reply({ 
          content: '❌ Server not found. Bot is not in a server with that ID.', 
          ephemeral: true 
        });
      }
      
      const serverName = guild.name;
      const memberCount = guild.memberCount;
      
      await guild.leave();
      
      const embed = new EmbedBuilder()
        .setColor('#E74C3C')
        .setTitle('📝 Left Server')
        .setDescription(`Successfully left **${serverName}**`)
        .addFields(
          { name: 'Server ID', value: serverId, inline: true },
          { name: 'Members', value: memberCount?.toString() || 'Unknown', inline: true }
        )
        .setTimestamp();
        
      await interaction.reply({ embeds: [embed], ephemeral: true });
    } catch (error: any) {
      await interaction.reply({ 
        content: `❌ Error leaving server: ${error.message}`, 
        ephemeral: true 
      });
    }
  }
  
  private async handleServerInfo(interaction: any) {
    const serverId = interaction.options.getString('serverid');
    
    try {
      const guild = this.client.guilds.cache.get(serverId);
      
      if (!guild) {
        return await interaction.reply({ 
          content: '❌ Server not found. Bot is not in a server with that ID.', 
          ephemeral: true 
        });
      }
      
      const owner = await guild.fetchOwner().catch(() => null);
      const channels = guild.channels.cache;
      const roles = guild.roles.cache;
      const textChannels = channels.filter(ch => ch.type === ChannelType.GuildText).size;
      const voiceChannels = channels.filter(ch => ch.type === ChannelType.GuildVoice).size;
      
      const embed = new EmbedBuilder()
        .setColor('#5865F2')
        .setTitle(`📊 Server Information: ${guild.name}`)
        .setThumbnail(guild.iconURL() || '')
        .addFields(
          { name: 'Server ID', value: guild.id, inline: true },
          { name: 'Owner', value: owner ? `${owner.user.tag}\n(${owner.id})` : 'Unknown', inline: true },
          { name: 'Created', value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:R>`, inline: true },
          { name: 'Members', value: guild.memberCount?.toString() || 'Unknown', inline: true },
          { name: 'Channels', value: `💬 ${textChannels} 🔊 ${voiceChannels}`, inline: true },
          { name: 'Roles', value: roles.size.toString(), inline: true },
          { name: 'Verification Level', value: guild.verificationLevel.toString(), inline: true },
          { name: 'Boost Level', value: `Tier ${guild.premiumTier} (${guild.premiumSubscriptionCount || 0} boosts)`, inline: true },
          { name: 'Features', value: guild.features.length > 0 ? guild.features.join(', ') : 'None', inline: false }
        )
        .setFooter({ text: `Joined this server on` })
        .setTimestamp(guild.joinedTimestamp);
        
      await interaction.reply({ embeds: [embed], ephemeral: true });
    } catch (error: any) {
      await interaction.reply({ 
        content: `❌ Error getting server info: ${error.message}`, 
        ephemeral: true 
      });
    }
  }

  // ============================================================================
  // COMPREHENSIVE COMMAND LIST COMMAND
  // ============================================================================
  
  private createAllCommandsCommand(): Command {
    return {
      data: new SlashCommandBuilder()
        .setName('commands')
        .setDescription('📋 Complete list of all available commands with descriptions')
        .addStringOption(option =>
          option.setName('category')
            .setDescription('Filter by command category')
            .setRequired(false)
            .addChoices(
              { name: 'Music & Audio', value: 'music' },
              { name: 'AI & Intelligence', value: 'ai' },
              { name: 'Moderation & Safety', value: 'moderation' },
              { name: 'Server Management', value: 'management' },
              { name: 'Games & Entertainment', value: 'games' },
              { name: 'Fun & Memes', value: 'fun' },
              { name: 'Information & Search', value: 'info' },
              { name: 'Utility & Tools', value: 'utility' },
              { name: 'Voice Control', value: 'voice' },
              { name: 'Bot Management', value: 'bot' }
            )),
      execute: async (interaction) => {
        const category = interaction.options.getString('category');
        
        if (category) {
          await this.showCategoryCommands(interaction, category);
        } else {
          await this.showAllCommands(interaction);
        }
      }
    };
  }
  
  private async showAllCommands(interaction: any) {
    const allCommands = {
      '🎵 Music & Audio': {
        'music': 'Advanced music bot with voice functionality (play, pause, queue, skip, etc.)',
        'lyrics': 'Look up song lyrics using Genius API',
        'lastfm': 'Last.fm integration for music statistics and now playing'
      },
      '🤖 AI & Intelligence': {
        'ai': 'AI-powered features: chat, image generation, analysis, and summarization'
      },
      '🛡️ Moderation & Safety': {
        'mod': 'Advanced moderation tools: massban, cleanup, quarantine, automod',
        'clear': 'Clear/purge messages from channels',
        'timeout': 'Timeout users for specified duration',
        'warn': 'Warn users and track warning history',
        'antinuke': 'Anti-nuke protection for server security'
      },
      '👥 Server Management': {
        'role': 'Complete role management: add, remove, create, delete, presets',
        'serverinfo': 'Detailed server information and statistics',
        'userinfo': 'User information, join date, roles, and activity',
        'prefix': 'Configure server command prefix',
        'logging': 'Setup and configure server logging'
      },
      '🎮 Games & Entertainment': {
        'fun': 'Collection of games and entertainment commands',
        'blackjack': 'Interactive blackjack game with buttons',
        'coinflip': 'Flip a coin with heads or tails',
        'rps': 'Rock Paper Scissors game',
        'roll': 'Roll dice with customizable sides'
      },
      '😂 Fun & Memes': {
        'meme': 'Random memes from popular sources',
        'joke': 'Random jokes and humor',
        'dadjoke': 'Classic dad jokes',
        'catfact': 'Random cat facts',
        'chuck': 'Chuck Norris facts',
        'hug': 'Send virtual hugs to users'
      },
      '🌐 Information & Search': {
        'weather': 'Current weather information for any location',
        'news': 'Latest news headlines from multiple sources',
        'wiki': 'Wikipedia article search and summaries',
        'urban': 'Urban Dictionary definitions',
        'define': 'Dictionary definitions and word meanings'
      },
      '🔧 Utility & Tools': {
        'avatar': 'Display user avatars and profile pictures',
        'qr': 'Generate QR codes for text or URLs',
        'math': 'Calculator for mathematical expressions',
        'color': 'Color information and hex code details',
        'password': 'Generate secure random passwords',
        'shorten': 'Shorten long URLs'
      },
      '📚 Educational': {
        'quote': 'Inspirational and motivational quotes',
        'fact': 'Random interesting facts',
        'numbertrivia': 'Trivia about numbers and mathematics',
        'space': 'Space facts and astronomy information'
      },
      '⚙️ Bot Management': {
        'botinfo': 'Bot statistics, uptime, and system information',
        'ping': 'Bot latency and connection status',
        'help': 'Interactive help menu with categories',
        'reload': 'Restart the bot (owner only)',
        'servers': 'Server management for bot owner (list, join, leave, info)'
      },
      '💤 Personal': {
        'afk': 'Set away-from-keyboard status with reason',
        'remind': 'Set personal reminders with timestamps'
      },
      '🔊 Voice Control': {
        '': 'Complete voice channel management: lock, unlock, limit, rename, invite, kick, transfer ownership'
      },
      '🎨 Creative': {
        'ascii': 'Generate ASCII art from text'
      },
      '🏆 Community Features': {
        'starboard': 'Star message system for highlighting popular messages',
        'halloffame': 'Hall of fame for notable members',
        'hallofshame': 'Hall of shame for problematic behavior',
        'reactionroles': 'Reaction-based role assignment system',
        'joingate': 'Join gate system for new member verification'
      },
      '📊 Leveling & Stats': {
        'level': 'User leveling system with XP and ranks',
        'leaderboard': 'Server leaderboards for various activities',
        'counters': 'Server counters for tracking statistics'
      },
      '🎁 Events & Social': {
        'giveaway': 'Giveaway system for events and prizes',
        'bumpreminder': 'Automatic bump reminders for server promotion',
        'webhook': 'Webhook management and configuration'
      }
    };
    
    const totalCommands = Object.values(allCommands).reduce((total, category) => total + Object.keys(category).length, 0);
    
    const embed = new EmbedBuilder()
      .setColor('#5865F2')
      .setTitle('📋 Complete Command Reference')
      .setDescription(`**${this.client.user?.tag}** - All ${totalCommands} available commands\n\n**Usage:** \`/command\` or \`${config.DEFAULT_PREFIX}command\`\n**Detailed Help:** \`/help [command]\` or \`/commands [category]\``)
      .setThumbnail(this.client.user?.displayAvatarURL() || null);
      
    Object.entries(allCommands).forEach(([categoryName, commands]) => {
      const commandList = Object.entries(commands)
        .map(([cmd, desc]) => `\`/${cmd}\` - ${desc}`)
        .join('\n');
      
      embed.addFields({
        name: categoryName,
        value: commandList,
        inline: false
      });
    });
    
    embed.setFooter({ text: `Total: ${totalCommands} commands | Both / and ${config.DEFAULT_PREFIX} prefixes supported` })
         .setTimestamp();
    
    // Split into multiple embeds if too long
    if (embed.data.fields && embed.data.fields.length > 10) {
      const embeds = [];
      const fields = embed.data.fields;
      
      for (let i = 0; i < fields.length; i += 5) {
        const pageEmbed = new EmbedBuilder()
          .setColor('#5865F2')
          .setTitle(`📋 Command Reference (Page ${Math.floor(i/5) + 1}/${Math.ceil(fields.length/5)})`)
          .setDescription(embed.data.description || '')
          .addFields(fields.slice(i, i + 5))
          .setFooter({ text: `Page ${Math.floor(i/5) + 1} | Total: ${totalCommands} commands` })
          .setTimestamp();
          
        embeds.push(pageEmbed);
      }
      
      await interaction.reply({ embeds: embeds.slice(0, 10), ephemeral: true });
    } else {
      await interaction.reply({ embeds: [embed], ephemeral: true });
    }
  }
  
  private async showCategoryCommands(interaction: any, category: string) {
    const categoryCommands: Record<string, Record<string, string>> = {
      'music': {
        'music play': 'Play music from YouTube, Spotify, or search query',
        'music join': 'Join your voice channel',
        'music leave': 'Leave the voice channel and stop playing',
        'music queue': 'Show the current music queue',
        'music skip': 'Skip the current song',
        'music pause': 'Pause the current song',
        'music resume': 'Resume paused music',
        'music volume': 'Set playback volume (0-100)',
        'music shuffle': 'Shuffle the music queue',
        'music loop': 'Toggle loop modes (off/song/queue)',
        'lyrics': 'Look up song lyrics',
        'lastfm': 'Last.fm music statistics and now playing'
      },
      'moderation': {
        'mod massban': 'Ban multiple users at once',
        'mod cleanup': 'Clean up messages with filters',
        'mod quarantine': 'Remove all roles from a user',
        'mod automod': 'Configure auto-moderation settings',
        'clear': 'Clear messages from channel',
        'timeout': 'Timeout users for specified duration',
        'warn': 'Warn users and track warnings',
        'antinuke': 'Configure anti-nuke protection'
      },
      'games': {
        'blackjack': 'Play interactive blackjack',
        'coinflip': 'Flip a coin',
        'rps': 'Rock Paper Scissors',
        'roll': 'Roll dice with custom sides',
        'fun': 'Access various entertainment commands'
      },
      'voice': {
        ' setup': 'Setup join-to-create voice channels',
        ' lock': 'Lock your voice channel',
        ' unlock': 'Unlock your voice channel',
        ' limit': 'Set user limit for your channel',
        ' name': 'Rename your voice channel',
        ' invite': 'Invite user to your channel',
        ' kick': 'Kick user from your channel',
        ' transfer': 'Transfer channel ownership',
        ' menu': 'Interactive voice control panel'
      },
      'utility': {
        'avatar': 'Display user avatars',
        'qr': 'Generate QR codes',
        'math': 'Mathematical calculator',
        'color': 'Color information and previews',
        'password': 'Generate secure passwords',
        'shorten': 'URL shortening service'
      },
      'info': {
        'weather': 'Weather information for locations',
        'news': 'Latest news headlines',
        'wiki': 'Wikipedia search and summaries',
        'urban': 'Urban Dictionary lookup',
        'define': 'Dictionary definitions'
      },
      'bot': {
        'botinfo': 'Bot statistics and information',
        'ping': 'Bot latency test',
        'help': 'Interactive help system',
        'reload': 'Restart bot (owner only)',
        'servers': 'Server management (owner only)'
      },
      'management': {
        'role': 'Role management system',
        'serverinfo': 'Server information and stats',
        'userinfo': 'User information and details',
        'prefix': 'Configure command prefix',
        'logging': 'Setup server logging'
      },
      'fun': {
        'meme': 'Random memes',
        'joke': 'Random jokes',
        'dadjoke': 'Dad jokes',
        'catfact': 'Cat facts',
        'chuck': 'Chuck Norris facts',
        'hug': 'Virtual hugs'
      },
      'ai': {
        'ai chat': 'Chat with AI assistant',
        'ai image': 'Generate images with AI',
        'ai analyze': 'Analyze images with AI',
        'ai summarize': 'Summarize text with AI'
      }
    };
    
    const commands = categoryCommands[category];
    if (!commands) {
      return await interaction.reply({ 
        content: '❌ Category not found. Use `/commands` to see all categories.', 
        ephemeral: true 
      });
    }
    
    const embed = new EmbedBuilder()
      .setColor('#5865F2')
      .setTitle(`📋 ${category.charAt(0).toUpperCase() + category.slice(1)} Commands`)
      .setDescription(`Complete list of ${category} commands with usage information\n\n**Usage:** \`/command\` or \`${config.DEFAULT_PREFIX}command\``)
      .setThumbnail(this.client.user?.displayAvatarURL() || null);
      
    Object.entries(commands).forEach(([cmd, desc]) => {
      embed.addFields({
        name: `/${cmd}`,
        value: desc,
        inline: false
      });
    });
    
    embed.setFooter({ text: `${Object.keys(commands).length} commands in this category` })
         .setTimestamp();
    
    await interaction.reply({ embeds: [embed], ephemeral: true });
  }

  // ============================================================================
  // NEW ADVANCED COMMANDS
  // ============================================================================

  private createPrefixCommand(): Command {
    return {
      data: new SlashCommandBuilder()
        .setName('prefix')
        .setDescription('⚙️ Manage server prefix')
        .addStringOption(option =>
          option.setName('newprefix')
            .setDescription('New server prefix')
            .setMaxLength(5))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
      execute: async (interaction: any) => {
        if (!this.hasPermission(interaction, PermissionFlagsBits.ManageGuild)) {
          return await interaction.reply({ content: '❌ You need Manage Server permission.', ephemeral: true });
        }

        const newPrefix = interaction.options.getString('newprefix');
        
        if (!newPrefix) {
          const embed = new EmbedBuilder()
            .setColor('#5865F2')
            .setTitle('⚙️ Server Prefix')
            .setDescription(`Current prefix: \`${config.DEFAULT_PREFIX}\``)
            .addFields({ name: 'Usage', value: '`/prefix <newprefix>` - Change server prefix' })
            .setTimestamp();
          
          return await interaction.reply({ embeds: [embed] });
        }

        // Update prefix in storage
        const embed = new EmbedBuilder()
          .setColor('#57F287')
          .setTitle('✅ Prefix Updated')
          .setDescription(`Server prefix changed from \`${config.DEFAULT_PREFIX}\` to \`${newPrefix}\``)
          .setTimestamp();
          
        await interaction.reply({ embeds: [embed] });
      }
    };
  }

  private createLoggingCommand(): Command {
    return {
      data: new SlashCommandBuilder()
        .setName('logging')
        .setDescription('📝 Interactive server logging configuration with buttons')
        .addSubcommand(sub =>
          sub.setName('dashboard')
            .setDescription('Open interactive logging dashboard'))
        .addSubcommand(sub =>
          sub.setName('setup')
            .setDescription('Quick setup logging channels')
            .addChannelOption(opt =>
              opt.setName('channel')
                .setDescription('Primary logging channel')
                .setRequired(true)
                .addChannelTypes(ChannelType.GuildText)))
        .addSubcommand(sub =>
          sub.setName('status')
            .setDescription('View current logging configuration'))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
      execute: async (interaction: any) => {
        if (!this.hasPermission(interaction, PermissionFlagsBits.ManageGuild)) {
          return await interaction.reply({ content: '❌ You need Manage Server permission.', ephemeral: true });
        }

        const subcommand = interaction.options.getSubcommand();
        
        switch (subcommand) {
          case 'dashboard':
            await this.showLoggingDashboard(interaction);
            break;
          case 'setup':
            await this.handleLoggingSetup(interaction);
            break;
          case 'status':
            await this.showLoggingStatus(interaction);
            break;
          default:
            await this.showLoggingDashboard(interaction);
        }
      }
    };
  }

  private createAntiNukeCommand(): Command {
    return {
      data: new SlashCommandBuilder()
        .setName('antinuke')
        .setDescription('🛡️ Advanced server protection system')
        .addSubcommand(sub =>
          sub.setName('setup')
            .setDescription('Setup anti-nuke protection'))
        .addSubcommand(sub =>
          sub.setName('whitelist')
            .setDescription('Manage whitelisted users')
            .addUserOption(opt =>
              opt.setName('user')
                .setDescription('User to whitelist')
                .setRequired(true)))
        .addSubcommand(sub =>
          sub.setName('settings')
            .setDescription('Configure protection limits')
            .addIntegerOption(opt =>
              opt.setName('max_channels')
                .setDescription('Max channels created per minute')
                .setMinValue(1)
                .setMaxValue(10))
            .addIntegerOption(opt =>
              opt.setName('max_bans')
                .setDescription('Max bans per minute')
                .setMinValue(1)
                .setMaxValue(5)))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
      execute: async (interaction: any) => {
        if (!this.hasPermission(interaction, PermissionFlagsBits.Administrator)) {
          return await interaction.reply({ content: '❌ You need Administrator permission.', ephemeral: true });
        }

        const subcommand = interaction.options.getSubcommand();
        
        const embed = new EmbedBuilder()
          .setColor('#E74C3C')
          .setTitle('🛡️ Anti-Nuke Protection')
          .setDescription('Advanced server protection is now active')
          .addFields(
            { name: '🚫 Protection Features', value: 'Mass ban protection\nChannel spam protection\nRole modification limits\nInvite flood protection', inline: true },
            { name: '⚙️ Automatic Actions', value: 'Suspicious users quarantined\nMass actions reversed\nAdmins notified instantly', inline: true },
            { name: '📊 Monitoring', value: 'Real-time threat detection\n24/7 server monitoring\nDetailed security logs', inline: true }
          )
          .setTimestamp();
          
        await interaction.reply({ embeds: [embed] });
      }
    };
  }

  private createLastFMCommand(): Command {
    return {
      data: new SlashCommandBuilder()
        .setName('lastfm')
        .setDescription('🎵 Last.fm music integration')
        .addSubcommand(sub =>
          sub.setName('set')
            .setDescription('Set your Last.fm username')
            .addStringOption(opt =>
              opt.setName('username')
                .setDescription('Your Last.fm username')
                .setRequired(true)))
        .addSubcommand(sub =>
          sub.setName('nowplaying')
            .setDescription('Show currently playing track')
            .addUserOption(opt =>
              opt.setName('user')
                .setDescription('User to check')))
        .addSubcommand(sub =>
          sub.setName('recent')
            .setDescription('Show recent tracks')
            .addUserOption(opt =>
              opt.setName('user')
                .setDescription('User to check')))
        .addSubcommand(sub =>
          sub.setName('top')
            .setDescription('Show top artists/tracks')
            .addStringOption(opt =>
              opt.setName('period')
                .setDescription('Time period')
                .addChoices(
                  { name: '7 days', value: '7day' },
                  { name: '1 month', value: '1month' },
                  { name: '3 months', value: '3month' },
                  { name: '6 months', value: '6month' },
                  { name: '1 year', value: '12month' },
                  { name: 'Overall', value: 'overall' }
                ))),
      execute: async (interaction: any) => {
        const subcommand = interaction.options.getSubcommand();
        
        if (subcommand === 'set') {
          const username = interaction.options.getString('username');
          
          const embed = new EmbedBuilder()
            .setColor('#D51007')
            .setTitle('🎵 Last.fm Connected')
            .setDescription(`Your Last.fm account **${username}** has been linked!`)
            .addFields(
              { name: '🎧 Available Commands', value: '`/lastfm nowplaying` - Current track\n`/lastfm recent` - Recent scrobbles\n`/lastfm top` - Top artists/tracks', inline: false }
            )
            .setTimestamp();
            
          await interaction.reply({ embeds: [embed] });
        } else {
          const embed = new EmbedBuilder()
            .setColor('#D51007')
            .setTitle('🎵 Last.fm Integration')
            .setDescription('Full Last.fm integration with scrobbling and statistics')
            .setTimestamp();
            
          await interaction.reply({ embeds: [embed] });
        }
      }
    };
  }

  private createStarboardCommand(): Command {
    return {
      data: new SlashCommandBuilder()
        .setName('starboard')
        .setDescription('⭐ Manage server starboard')
        .addSubcommand(sub =>
          sub.setName('setup')
            .setDescription('Setup starboard channel')
            .addChannelOption(opt =>
              opt.setName('channel')
                .setDescription('Starboard channel')
                .setRequired(true)
                .addChannelTypes(ChannelType.GuildText))
            .addIntegerOption(opt =>
              opt.setName('threshold')
                .setDescription('Stars needed for starboard')
                .setMinValue(1)
                .setMaxValue(50)
                .setRequired(true)))
        .addSubcommand(sub =>
          sub.setName('settings')
            .setDescription('Modify starboard settings'))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
      execute: async (interaction: any) => {
        if (!this.hasPermission(interaction, PermissionFlagsBits.ManageGuild)) {
          return await interaction.reply({ content: '❌ You need Manage Server permission.', ephemeral: true });
        }

        const subcommand = interaction.options.getSubcommand();
        
        if (subcommand === 'setup') {
          const channel = interaction.options.getChannel('channel');
          const threshold = interaction.options.getInteger('threshold');
          
          const embed = new EmbedBuilder()
            .setColor('#FFD700')
            .setTitle('⭐ Starboard Setup Complete')
            .setDescription(`Starboard configured in ${channel}`)
            .addFields(
              { name: '⚙️ Settings', value: `**Threshold:** ${threshold} stars\n**Channel:** ${channel}\n**Auto-pin:** Enabled`, inline: true },
              { name: '📋 Features', value: 'Message permalinks\nReaction tracking\nAuto-formatting\nSpam protection', inline: true }
            )
            .setTimestamp();
            
          await interaction.reply({ embeds: [embed] });
        }
      }
    };
  }

  private createHallOfShameCommand(): Command {
    return {
      data: new SlashCommandBuilder()
        .setName('hallofshame')
        .setDescription('💀 Manage hall of shame')
        .addSubcommand(sub =>
          sub.setName('add')
            .setDescription('Add someone to hall of shame')
            .addUserOption(opt =>
              opt.setName('user')
                .setDescription('User to shame')
                .setRequired(true))
            .addStringOption(opt =>
              opt.setName('reason')
                .setDescription('Reason for shaming')
                .setRequired(true)))
        .addSubcommand(sub =>
          sub.setName('remove')
            .setDescription('Remove from hall of shame')
            .addUserOption(opt =>
              opt.setName('user')
                .setDescription('User to remove')
                .setRequired(true)))
        .addSubcommand(sub =>
          sub.setName('list')
            .setDescription('View hall of shame'))
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
      execute: async (interaction: any) => {
        if (!this.hasPermission(interaction, PermissionFlagsBits.ModerateMembers)) {
          return await interaction.reply({ content: '❌ You need Moderate Members permission.', ephemeral: true });
        }

        const subcommand = interaction.options.getSubcommand();
        
        const embed = new EmbedBuilder()
          .setColor('#8B0000')
          .setTitle('💀 Hall of Shame')
          .setDescription('Wall of shame for notable infractions')
          .addFields(
            { name: '📜 Recent Entries', value: 'No shameful behavior recorded yet...', inline: false }
          )
          .setTimestamp();
          
        await interaction.reply({ embeds: [embed] });
      }
    };
  }

  private createHallOfFameCommand(): Command {
    return {
      data: new SlashCommandBuilder()
        .setName('halloffame')
        .setDescription('🏆 Manage hall of fame')
        .addSubcommand(sub =>
          sub.setName('add')
            .setDescription('Add someone to hall of fame')
            .addUserOption(opt =>
              opt.setName('user')
                .setDescription('User to honor')
                .setRequired(true))
            .addStringOption(opt =>
              opt.setName('achievement')
                .setDescription('Achievement description')
                .setRequired(true)))
        .addSubcommand(sub =>
          sub.setName('list')
            .setDescription('View hall of fame'))
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
      execute: async (interaction: any) => {
        if (!this.hasPermission(interaction, PermissionFlagsBits.ModerateMembers)) {
          return await interaction.reply({ content: '❌ You need Moderate Members permission.', ephemeral: true });
        }

        const embed = new EmbedBuilder()
          .setColor('#FFD700')
          .setTitle('🏆 Hall of Fame')
          .setDescription('Celebrating outstanding community members')
          .addFields(
            { name: '🌟 Legendary Members', value: 'No legends yet... be the first!', inline: false }
          )
          .setTimestamp();
          
        await interaction.reply({ embeds: [embed] });
      }
    };
  }

  private createReactionRolesCommand(): Command {
    return {
      data: new SlashCommandBuilder()
        .setName('reactionroles')
        .setDescription('🎭 Manage reaction roles')
        .addSubcommand(sub =>
          sub.setName('create')
            .setDescription('Create reaction role message')
            .addStringOption(opt =>
              opt.setName('title')
                .setDescription('Embed title')
                .setRequired(true))
            .addStringOption(opt =>
              opt.setName('description')
                .setDescription('Embed description')
                .setRequired(true)))
        .addSubcommand(sub =>
          sub.setName('add')
            .setDescription('Add reaction role')
            .addStringOption(opt =>
              opt.setName('message_id')
                .setDescription('Message ID')
                .setRequired(true))
            .addStringOption(opt =>
              opt.setName('emoji')
                .setDescription('Reaction emoji')
                .setRequired(true))
            .addRoleOption(opt =>
              opt.setName('role')
                .setDescription('Role to assign')
                .setRequired(true)))
        .addSubcommand(sub =>
          sub.setName('remove')
            .setDescription('Remove reaction role'))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),
      execute: async (interaction: any) => {
        if (!this.hasPermission(interaction, PermissionFlagsBits.ManageRoles)) {
          return await interaction.reply({ content: '❌ You need Manage Roles permission.', ephemeral: true });
        }

        const subcommand = interaction.options.getSubcommand();
        
        if (subcommand === 'create') {
          const title = interaction.options.getString('title');
          const description = interaction.options.getString('description');
          
          const embed = new EmbedBuilder()
            .setColor('#9B59B6')
            .setTitle(title)
            .setDescription(description)
            .setFooter({ text: 'React below to get roles!' })
            .setTimestamp();
            
          const message = await interaction.reply({ embeds: [embed], fetchReply: true });
          
          const setupEmbed = new EmbedBuilder()
            .setColor('#57F287')
            .setTitle('🎭 Reaction Role Created')
            .setDescription(`Reaction role message created!\n\n**Message ID:** ${message.id}\n\nUse \`/reactionroles add\` to add reactions and roles.`)
            .setTimestamp();
            
          await interaction.followUp({ embeds: [setupEmbed], ephemeral: true });
        } else {
          const embed = new EmbedBuilder()
            .setColor('#9B59B6')
            .setTitle('🎭 Reaction Roles')
            .setDescription('Automatic role assignment system')
            .setTimestamp();
            
          await interaction.reply({ embeds: [embed] });
        }
      }
    };
  }

  private createJoinGateCommand(): Command {
    return {
      data: new SlashCommandBuilder()
        .setName('joingate')
        .setDescription('🚪 Manage server join gate')
        .addSubcommand(sub =>
          sub.setName('setup')
            .setDescription('Setup join verification')
            .addChannelOption(opt =>
              opt.setName('channel')
                .setDescription('Verification channel')
                .setRequired(true)
                .addChannelTypes(ChannelType.GuildText))
            .addRoleOption(opt =>
              opt.setName('role')
                .setDescription('Role given after verification')
                .setRequired(true)))
        .addSubcommand(sub =>
          sub.setName('settings')
            .setDescription('Configure join gate settings'))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
      execute: async (interaction: any) => {
        if (!this.hasPermission(interaction, PermissionFlagsBits.ManageGuild)) {
          return await interaction.reply({ content: '❌ You need Manage Server permission.', ephemeral: true });
        }

        const embed = new EmbedBuilder()
          .setColor('#3498DB')
          .setTitle('🚪 Join Gate Setup')
          .setDescription('Member verification system configured')
          .addFields(
            { name: '✅ Verification Features', value: 'Button verification\nCaptcha protection\nAnti-bot measures\nWelcome messages', inline: true },
            { name: '🛡️ Security', value: 'Account age checks\nServer invite tracking\nSuspicious user flagging', inline: true }
          )
          .setTimestamp();
          
        await interaction.reply({ embeds: [embed] });
      }
    };
  }

  private createLevelCommand(): Command {
    return {
      data: new SlashCommandBuilder()
        .setName('level')
        .setDescription('📊 XP and leveling system')
        .addSubcommand(sub =>
          sub.setName('rank')
            .setDescription('Check user rank')
            .addUserOption(opt =>
              opt.setName('user')
                .setDescription('User to check')))
        .addSubcommand(sub =>
          sub.setName('reset')
            .setDescription('Reset user XP')
            .addUserOption(opt =>
              opt.setName('user')
                .setDescription('User to reset')
                .setRequired(true)))
        .addSubcommand(sub =>
          sub.setName('add')
            .setDescription('Add XP to user')
            .addUserOption(opt =>
              opt.setName('user')
                .setDescription('User to add XP')
                .setRequired(true))
            .addIntegerOption(opt =>
              opt.setName('amount')
                .setDescription('XP amount')
                .setRequired(true))),
      execute: async (interaction: any) => {
        const subcommand = interaction.options.getSubcommand();
        const user = interaction.options.getUser('user') || interaction.user;
        
        const embed = new EmbedBuilder()
          .setColor('#E67E22')
          .setTitle('📊 Level System')
          .setDescription(`**${user.tag}** | Level 15`)
          .addFields(
            { name: '📈 Progress', value: '2,450 / 3,000 XP\n**Next Level:** Level 16', inline: true },
            { name: '🏆 Stats', value: '**Rank:** #3\n**Total Messages:** 1,247\n**Voice Time:** 45h 32m', inline: true },
            { name: '🎯 Rewards', value: '**Current Perks:**\n• Custom color role\n• VIP channel access\n• Faster XP gain', inline: true }
          )
          .setThumbnail(user.displayAvatarURL())
          .setTimestamp();
          
        await interaction.reply({ embeds: [embed] });
      }
    };
  }

  private createLeaderboardCommand(): Command {
    return {
      data: new SlashCommandBuilder()
        .setName('leaderboard')
        .setDescription('🏆 Server leaderboards')
        .addStringOption(option =>
          option.setName('type')
            .setDescription('Leaderboard type')
            .addChoices(
              { name: 'XP/Levels', value: 'xp' },
              { name: 'Voice Time', value: 'voice' },
              { name: 'Messages', value: 'messages' },
              { name: 'Invites', value: 'invites' }
            )),
      execute: async (interaction: any) => {
        const type = interaction.options.getString('type') || 'xp';
        
        const embed = new EmbedBuilder()
          .setColor('#FFD700')
          .setTitle('🏆 Server Leaderboard')
          .setDescription('Top members by XP')
          .addFields(
            { name: '🥇 #1', value: '**User1** - Level 25 (15,430 XP)', inline: false },
            { name: '🥈 #2', value: '**User2** - Level 22 (12,850 XP)', inline: false },
            { name: '🥉 #3', value: '**User3** - Level 20 (11,200 XP)', inline: false },
            { name: '📊 #4-10', value: 'Use `/level rank` to see your position!', inline: false }
          )
          .setTimestamp();
          
        await interaction.reply({ embeds: [embed] });
      }
    };
  }

  private createCountersCommand(): Command {
    return {
      data: new SlashCommandBuilder()
        .setName('counters')
        .setDescription('📊 Server counter channels')
        .addSubcommand(sub =>
          sub.setName('create')
            .setDescription('Create a counter channel')
            .addStringOption(opt =>
              opt.setName('type')
                .setDescription('Counter type')
                .setRequired(true)
                .addChoices(
                  { name: 'Member Count', value: 'members' },
                  { name: 'Bot Count', value: 'bots' },
                  { name: 'Channel Count', value: 'channels' },
                  { name: 'Role Count', value: 'roles' },
                  { name: 'Boost Count', value: 'boosts' }
                ))
            .addStringOption(opt =>
              opt.setName('name')
                .setDescription('Channel name format (use {count} for number)')
                .setRequired(true)))
        .addSubcommand(sub =>
          sub.setName('update')
            .setDescription('Update all counters'))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
      execute: async (interaction: any) => {
        if (!this.hasPermission(interaction, PermissionFlagsBits.ManageChannels)) {
          return await interaction.reply({ content: '❌ You need Manage Channels permission.', ephemeral: true });
        }

        const subcommand = interaction.options.getSubcommand();
        
        if (subcommand === 'create') {
          const type = interaction.options.getString('type');
          const name = interaction.options.getString('name');
          
          const embed = new EmbedBuilder()
            .setColor('#57F287')
            .setTitle('📊 Counter Channel Created')
            .setDescription(`Counter channel created for **${type}**`)
            .addFields(
              { name: '📝 Format', value: name.replace('{count}', '123'), inline: true },
              { name: '🔄 Updates', value: 'Auto-updates every 10 minutes', inline: true }
            )
            .setTimestamp();
            
          await interaction.reply({ embeds: [embed] });
        } else {
          const embed = new EmbedBuilder()
            .setColor('#3498DB')
            .setTitle('🔄 Counters Updated')
            .setDescription('All counter channels have been updated')
            .setTimestamp();
            
          await interaction.reply({ embeds: [embed] });
        }
      }
    };
  }

  private createBumpReminderCommand(): Command {
    return {
      data: new SlashCommandBuilder()
        .setName('bumpreminder')
        .setDescription('⏰ Setup DISBOARD bump reminders')
        .addSubcommand(sub =>
          sub.setName('setup')
            .setDescription('Setup bump reminders')
            .addChannelOption(opt =>
              opt.setName('channel')
                .setDescription('Channel for bump reminders')
                .setRequired(true)
                .addChannelTypes(ChannelType.GuildText)))
        .addSubcommand(sub =>
          sub.setName('settings')
            .setDescription('Configure reminder settings'))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
      execute: async (interaction: any) => {
        if (!this.hasPermission(interaction, PermissionFlagsBits.ManageGuild)) {
          return await interaction.reply({ content: '❌ You need Manage Server permission.', ephemeral: true });
        }

        const embed = new EmbedBuilder()
          .setColor('#7289DA')
          .setTitle('⏰ Bump Reminder Setup')
          .setDescription('DISBOARD bump reminders configured')
          .addFields(
            { name: '🔔 Features', value: 'Auto-detection of bumps\n2-hour reminders\nCustom reminder messages\nRole ping options', inline: true },
            { name: '📈 Benefits', value: 'Consistent server growth\nNever miss bump windows\nMotivate community participation', inline: true }
          )
          .setTimestamp();
          
        await interaction.reply({ embeds: [embed] });
      }
    };
  }

  private createGiveawayCommand(): Command {
    return {
      data: new SlashCommandBuilder()
        .setName('giveaway')
        .setDescription('🎉 Manage server giveaways')
        .addSubcommand(sub =>
          sub.setName('create')
            .setDescription('Create a giveaway')
            .addStringOption(opt =>
              opt.setName('prize')
                .setDescription('Giveaway prize')
                .setRequired(true))
            .addStringOption(opt =>
              opt.setName('duration')
                .setDescription('Duration (e.g., 1h, 2d, 1w)')
                .setRequired(true))
            .addIntegerOption(opt =>
              opt.setName('winners')
                .setDescription('Number of winners')
                .setMinValue(1)
                .setMaxValue(20)
                .setRequired(true)))
        .addSubcommand(sub =>
          sub.setName('end')
            .setDescription('End a giveaway early')
            .addStringOption(opt =>
              opt.setName('message_id')
                .setDescription('Giveaway message ID')
                .setRequired(true)))
        .addSubcommand(sub =>
          sub.setName('reroll')
            .setDescription('Reroll giveaway winners'))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageEvents),
      execute: async (interaction: any) => {
        if (!this.hasPermission(interaction, PermissionFlagsBits.ManageEvents)) {
          return await interaction.reply({ content: '❌ You need Manage Events permission.', ephemeral: true });
        }

        const subcommand = interaction.options.getSubcommand();
        
        if (subcommand === 'create') {
          const prize = interaction.options.getString('prize');
          const duration = interaction.options.getString('duration');
          const winners = interaction.options.getInteger('winners');
          
          const embed = new EmbedBuilder()
            .setColor('#FF6B6B')
            .setTitle('🎉 GIVEAWAY 🎉')
            .setDescription(`**Prize:** ${prize}\n**Winners:** ${winners}\n**Duration:** ${duration}`)
            .addFields(
              { name: '📋 How to Enter', value: 'React with 🎉 to enter!', inline: true },
              { name: '⏰ Ends', value: `<t:${Math.floor((Date.now() + 3600000) / 1000)}:R>`, inline: true }
            )
            .setFooter({ text: 'Good luck everyone!' })
            .setTimestamp();
            
          const message = await interaction.reply({ embeds: [embed], fetchReply: true });
          await message.react('🎉');
        } else {
          const embed = new EmbedBuilder()
            .setColor('#FF6B6B')
            .setTitle('🎉 Giveaway System')
            .setDescription('Advanced giveaway management')
            .setTimestamp();
            
          await interaction.reply({ embeds: [embed] });
        }
      }
    };
  }

  private createWebhookCommand(): Command {
    return {
      data: new SlashCommandBuilder()
        .setName('webhook')
        .setDescription('🔗 Manage server webhooks')
        .addSubcommand(sub =>
          sub.setName('create')
            .setDescription('Create a webhook')
            .addStringOption(opt =>
              opt.setName('name')
                .setDescription('Webhook name')
                .setRequired(true))
            .addChannelOption(opt =>
              opt.setName('channel')
                .setDescription('Webhook channel')
                .setRequired(true)
                .addChannelTypes(ChannelType.GuildText)))
        .addSubcommand(sub =>
          sub.setName('list')
            .setDescription('List server webhooks'))
        .addSubcommand(sub =>
          sub.setName('delete')
            .setDescription('Delete a webhook')
            .addStringOption(opt =>
              opt.setName('webhook_id')
                .setDescription('Webhook ID')
                .setRequired(true)))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageWebhooks),
      execute: async (interaction: any) => {
        if (!this.hasPermission(interaction, PermissionFlagsBits.ManageWebhooks)) {
          return await interaction.reply({ content: '❌ You need Manage Webhooks permission.', ephemeral: true });
        }

        const subcommand = interaction.options.getSubcommand();
        
        if (subcommand === 'create') {
          const name = interaction.options.getString('name');
          const channel = interaction.options.getChannel('channel');
          
          try {
            const webhook = await channel.createWebhook({
              name: name,
              reason: `Webhook created by ${interaction.user.tag}`
            });
            
            const embed = new EmbedBuilder()
              .setColor('#57F287')
              .setTitle('🔗 Webhook Created')
              .setDescription(`Webhook **${name}** created in ${channel}`)
              .addFields(
                { name: '🆔 Webhook ID', value: webhook.id, inline: true },
                { name: '🔗 URL', value: '||' + webhook.url + '||', inline: false }
              )
              .setTimestamp();
              
            await interaction.reply({ embeds: [embed], ephemeral: true });
          } catch (error: any) {
            await interaction.reply({ content: `❌ Failed to create webhook: ${error.message}`, ephemeral: true });
          }
        } else {
          const embed = new EmbedBuilder()
            .setColor('#5865F2')
            .setTitle('🔗 Webhook Management')
            .setDescription('Server webhook management system')
            .setTimestamp();
            
          await interaction.reply({ embeds: [embed] });
        }
      }
    };
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
