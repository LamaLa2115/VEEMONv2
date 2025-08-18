# API Keys Setup Guide

This guide explains how to set up all the API keys and configuration for the Discord bot dashboard. All configuration is centralized in `server/config.ts` - this is the **ONLY** file you need to update.

## 🔧 Quick Setup

1. **Copy the environment template**:
   ```bash
   cp .env.example .env
   ```

2. **Edit the .env file** and add your API keys where needed

3. **All configuration is handled automatically** through `server/config.ts`

## 🔑 Required API Keys

### Discord Bot Token (Required)
- **Where to get**: [Discord Developer Portal](https://discord.com/developers/applications)
- **Environment variable**: `DISCORD_BOT_TOKEN`
- **Status**: ⚠️ **REQUIRED** - Bot won't work without this

## 🎵 Optional API Keys (For Enhanced Features)

### Last.fm API (Music Features)
- **Purpose**: Music statistics, now playing, user profiles
- **Where to get**: [Last.fm API](https://www.last.fm/api/account/create)
- **Environment variables**: 
  - `LASTFM_API_KEY`
  - `LASTFM_API_SECRET`
- **Status**: Optional - Music commands work without this

### YouTube API (Music Search)
- **Purpose**: Enhanced music search and metadata
- **Where to get**: [Google Cloud Console](https://console.developers.google.com/)
- **Environment variable**: `YOUTUBE_API_KEY`
- **Status**: Optional

### Spotify API (Music Integration)
- **Purpose**: Spotify playlist integration
- **Where to get**: [Spotify Developer Dashboard](https://developer.spotify.com/dashboard/applications)
- **Environment variables**:
  - `SPOTIFY_CLIENT_ID`
  - `SPOTIFY_CLIENT_SECRET`
- **Status**: Optional

### OpenAI API (AI Features)
- **Purpose**: Advanced AI-powered bot responses
- **Where to get**: [OpenAI Platform](https://platform.openai.com/api-keys)
- **Environment variable**: `OPENAI_API_KEY`
- **Status**: Optional

### Weather API (Weather Commands)
- **Purpose**: Weather information commands
- **Where to get**: [OpenWeatherMap](https://openweathermap.org/api)
- **Environment variable**: `WEATHER_API_KEY`
- **Status**: Optional

### News API (News Commands)
- **Purpose**: News and current events
- **Where to get**: [News API](https://newsapi.org/)
- **Environment variable**: `NEWS_API_KEY`
- **Status**: Optional

## 📝 Configuration Files

### Main Configuration: `server/config.ts`
This is your **central control panel**. All settings are here:

- **API Keys**: All external service keys
- **Bot Settings**: Prefix, status, permissions
- **Feature Flags**: Enable/disable features
- **Rate Limits**: Command usage limits
- **Auto-moderation**: Spam protection settings
- **Music Settings**: Volume, queue size, timeouts

### Environment Template: `.env.example`
Copy this to `.env` and add your actual API keys.

## 🎛️ Feature Configuration

You can enable/disable features in `server/config.ts`:

```typescript
FEATURES: {
  MUSIC_BOT: true,          // Music commands
  MODERATION: true,         // Moderation tools
  CUSTOM_COMMANDS: true,    // User-defined commands
  LASTFM_INTEGRATION: true, // Last.fm features
  GAMES: true,              // Fun games
  UTILITY_COMMANDS: true,   // Utility tools
  ADMIN_COMMANDS: true,     // Admin-only commands
  AUTO_MODERATION: true,    // Auto-mod system
  VOICE_LOGGING: true,      // Voice channel logging
  MESSAGE_LOGGING: false,   // Message logging (privacy)
}
```

## 🔒 Security Notes

- **Never commit API keys** to version control
- **.env files are ignored** by git automatically
- **Production environment** validates required keys
- **Development environment** works without most keys

## 📊 What Works Without API Keys

Even without external API keys, the bot provides:

- ✅ Basic moderation commands
- ✅ Server management
- ✅ Fun commands and games
- ✅ Custom commands system
- ✅ Dashboard interface
- ✅ In-memory data storage
- ✅ Slash commands
- ✅ Prefix commands

## 🚀 Getting Started

1. **Minimum setup**: Just add `DISCORD_BOT_TOKEN` to `.env`
2. **Test the bot**: Run the application and invite bot to your server
3. **Add features**: Add more API keys as needed for enhanced features
4. **Customize settings**: Modify `server/config.ts` for your preferences

## 🆘 Support

If you need help getting API keys:
1. Follow the links provided for each service
2. Most APIs offer free tiers for development
3. Discord bot token is always free

**Everything is configured to work out of the box with just the Discord bot token!**