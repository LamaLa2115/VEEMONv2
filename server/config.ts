import 'dotenv/config';

/**
 * Centralized Configuration System
 * All API keys, settings, and external service endpoints are defined here.
 * This is the ONLY file you need to update when changing API keys or configuration.
 */
interface ConfigType {
  DISCORD_BOT_TOKEN: string;
  DISCORD_CLIENT_ID: string;
  DISCORD_CLIENT_SECRET: string;
  DATABASE_URL: string;
  LASTFM_API_KEY: string;
  LASTFM_API_SECRET: string;
  YOUTUBE_API_KEY: string;
  SPOTIFY_CLIENT_ID: string;
  SPOTIFY_CLIENT_SECRET: string;
  OPENAI_API_KEY: string;
  WEATHER_API_KEY: string;
  NEWS_API_KEY: string;
  DEFAULT_PREFIX: string;
  SUPER_ADMIN_USER_ID: string;
  BOT_STATUS: {
    type: string;
    name: string;
  };
  AUTO_MOD_DEFAULTS: {
    enabled: boolean;
    antiSpam: boolean;
    antiLink: boolean;
    antiInvite: boolean;
    maxWarnings: number;
  };
  MUSIC_SETTINGS: {
    defaultVolume: number;
    maxQueueSize: number;
    maxSongDuration: number;
    leaveTimeout: number;
  };
  PORT: number;
  NODE_ENV: string;
  SESSION_SECRET: string;
  EXTERNAL_APIS: Record<string, string>;
  LASTFM_ENDPOINTS: Record<string, string>;
  FEATURES: Record<string, boolean>;
  RATE_LIMITS: Record<string, number>;
  LOGGING: Record<string, boolean | string>;
  validateRequired(): void;
  getApiEndpoints(service: 'lastfm' | 'external'): Record<string, string>;
  isFeatureEnabled(feature: string): boolean;
  getRateLimit(type: string): number;
}

export const config: ConfigType = {
  // ============================================================================
  // DISCORD BOT CONFIGURATION
  // ============================================================================
  DISCORD_BOT_TOKEN: process.env.DISCORD_BOT_TOKEN || '',
  DISCORD_CLIENT_ID: process.env.DISCORD_CLIENT_ID || '',
  DISCORD_CLIENT_SECRET: process.env.DISCORD_CLIENT_SECRET || '',
  
  // ============================================================================
  // DATABASE CONFIGURATION
  // ============================================================================
  DATABASE_URL: process.env.DATABASE_URL || '',
  
  // ============================================================================
  // EXTERNAL API KEYS
  // ============================================================================
  
  // Last.fm API for music data and user statistics
  LASTFM_API_KEY: process.env.LASTFM_API_KEY || '',
  LASTFM_API_SECRET: process.env.LASTFM_API_SECRET || '',
  
  // YouTube API for music search and metadata
  YOUTUBE_API_KEY: process.env.YOUTUBE_API_KEY || '',
  
  // Spotify API for music integration (optional)
  SPOTIFY_CLIENT_ID: process.env.SPOTIFY_CLIENT_ID || '',
  SPOTIFY_CLIENT_SECRET: process.env.SPOTIFY_CLIENT_SECRET || '',
  
  // OpenAI API for advanced bot features (optional)
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',
  
  // Weather API for weather commands (optional)
  WEATHER_API_KEY: process.env.WEATHER_API_KEY || '',
  
  // News API for news commands (optional)
  NEWS_API_KEY: process.env.NEWS_API_KEY || '',
  
  // ============================================================================
  // BOT BEHAVIOR SETTINGS
  // ============================================================================
  
  // Default command prefix for all servers (can be changed per server)
  DEFAULT_PREFIX: ',',
  
  // Super admin user ID (has global permissions on all servers)
  SUPER_ADMIN_USER_ID: '615635897924190218',
  
  // Bot activity status settings
  BOT_STATUS: {
    type: 'WATCHING', // PLAYING, STREAMING, LISTENING, WATCHING, COMPETING
    name: 'Discord servers | ,help',
  },
  
  // Auto-moderation default settings
  AUTO_MOD_DEFAULTS: {
    enabled: false,
    antiSpam: true,
    antiLink: false,
    antiInvite: true,
    maxWarnings: 3,
  },
  
  // Music bot settings
  MUSIC_SETTINGS: {
    defaultVolume: 50,
    maxQueueSize: 100,
    maxSongDuration: 600, // 10 minutes in seconds
    leaveTimeout: 300, // 5 minutes in seconds
  },
  
  // ============================================================================
  // SERVER CONFIGURATION
  // ============================================================================
  
  // Web server port (automatically set by Replit)
  PORT: parseInt(process.env.PORT || '5000', 10),
  
  // Environment (development, production)
  NODE_ENV: process.env.NODE_ENV || 'development',
  
  // Session configuration
  SESSION_SECRET: process.env.SESSION_SECRET || 'your-super-secret-session-key-change-this',
  
  // ============================================================================
  // EXTERNAL API ENDPOINTS
  // ============================================================================
  
  // External service URLs (no API keys needed)
  EXTERNAL_APIS: {
    URBAN_DICTIONARY: 'https://api.urbandictionary.com/v0/define',
    CAT_FACTS: 'https://catfact.ninja/fact',
    DOG_FACTS: 'https://dogapi.dog/api/v2/facts',
    JOKES: 'https://official-joke-api.appspot.com/random_joke',
    QUOTES: 'https://api.quotable.io/random',
    WEATHER: 'https://api.openweathermap.org/data/2.5/weather',
    NEWS: 'https://newsapi.org/v2/top-headlines',
  },
  
  // Last.fm API endpoints
  LASTFM_ENDPOINTS: {
    BASE: 'https://ws.audioscrobbler.com/2.0/',
    USER_INFO: 'user.getInfo',
    USER_RECENT_TRACKS: 'user.getRecentTracks',
    USER_TOP_ARTISTS: 'user.getTopArtists',
    USER_TOP_TRACKS: 'user.getTopTracks',
    TRACK_INFO: 'track.getInfo',
    ARTIST_INFO: 'artist.getInfo',
  },
  
  // ============================================================================
  // FEATURE FLAGS
  // ============================================================================
  
  // Enable/disable bot features
  FEATURES: {
    MUSIC_BOT: true,
    MODERATION: true,
    CUSTOM_COMMANDS: true,
    LASTFM_INTEGRATION: true,
    GAMES: true,
    UTILITY_COMMANDS: true,
    ADMIN_COMMANDS: true,
    AUTO_MODERATION: true,
    VOICE_LOGGING: true,
    MESSAGE_LOGGING: false, // Disabled by default for privacy
  },
  
  // ============================================================================
  // RATE LIMITING
  // ============================================================================
  
  // Command rate limits (per user, per minute)
  RATE_LIMITS: {
    DEFAULT: 10, // Most commands
    MUSIC: 5, // Music commands
    MODERATION: 3, // Moderation commands
    GAMES: 3, // Game commands
    API_HEAVY: 2, // Commands that use external APIs
  },
  
  // ============================================================================
  // LOGGING CONFIGURATION
  // ============================================================================
  
  LOGGING: {
    LEVEL: process.env.LOG_LEVEL || 'info', // debug, info, warn, error
    DISCORD_EVENTS: true,
    API_REQUESTS: true,
    COMMAND_USAGE: true,
    ERROR_TRACKING: true,
  },
  
  // ============================================================================
  // VALIDATION & HELPER METHODS
  // ============================================================================
  
  /**
   * Validates that all required environment variables are present
   */
  validateRequired() {
    const required = ['DISCORD_BOT_TOKEN'];
    const missing = required.filter(key => !this[key as keyof typeof this]);
    
    if (missing.length > 0) {
      throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }
  },
  
  /**
   * Gets all configured API endpoints for a service
   */
  getApiEndpoints(service: 'lastfm' | 'external') {
    switch (service) {
      case 'lastfm':
        return this.LASTFM_ENDPOINTS;
      case 'external':
        return this.EXTERNAL_APIS;
      default:
        return {};
    }
  },
  
  /**
   * Checks if a feature is enabled
   */
  isFeatureEnabled(feature: keyof typeof config.FEATURES) {
    return this.FEATURES[feature];
  },
  
  /**
   * Gets rate limit for a command type
   */
  getRateLimit(type: keyof typeof config.RATE_LIMITS) {
    return this.RATE_LIMITS[type] || this.RATE_LIMITS.DEFAULT;
  }
};

// ============================================================================
// STARTUP VALIDATION
// ============================================================================

// Only validate required variables in production
if (config.NODE_ENV === 'production') {
  config.validateRequired();
}

// Log configuration summary (without sensitive data)
if (config.NODE_ENV === 'development') {
  console.log('🔧 Configuration loaded:');
  console.log(`   • Environment: ${config.NODE_ENV}`);
  console.log(`   • Port: ${config.PORT}`);
  console.log(`   • Bot prefix: ${config.DEFAULT_PREFIX}`);
  console.log(`   • Features enabled: ${Object.entries(config.FEATURES).filter(([,enabled]) => enabled).map(([name]) => name).join(', ')}`);
  console.log(`   • Discord token: ${config.DISCORD_BOT_TOKEN ? '✓ Set' : '✗ Missing'}`);
  console.log(`   • Database URL: ${config.DATABASE_URL ? '✓ Set' : '✗ Using in-memory storage'}`);
  console.log(`   • Last.fm API: ${config.LASTFM_API_KEY ? '✓ Set' : '✗ Missing'}`);
}