import 'dotenv/config';

export const config = {
  // Discord Bot Configuration
  DISCORD_BOT_TOKEN: process.env.DISCORD_BOT_TOKEN || '',
  
  // Database Configuration
  DATABASE_URL: process.env.DATABASE_URL || '',
  
  // Last.fm API Configuration
  LASTFM_API_KEY: process.env.LASTFM_API_KEY || '',
  
  // Bot Settings
  DEFAULT_PREFIX: ',',
  SUPER_ADMIN_USER_ID: '615635897924190218',
  
  // Server Configuration
  PORT: parseInt(process.env.PORT || '5000', 10),
  NODE_ENV: process.env.NODE_ENV || 'development',
  
  // External APIs
  URBAN_DICTIONARY_API: 'https://api.urbandictionary.com/v0/define',
  
  // Music Bot Configuration
  YOUTUBE_API_KEY: process.env.YOUTUBE_API_KEY || '', // Optional for YouTube search
  
  // Validation
  validateRequired() {
    const required = ['DISCORD_BOT_TOKEN'];
    const missing = required.filter(key => !this[key as keyof typeof this]);
    
    if (missing.length > 0) {
      throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }
  }
};

// Validate configuration on startup
if (config.NODE_ENV === 'production') {
  config.validateRequired();
}