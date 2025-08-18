# Discord Bot Commands

## Enhanced Bot Commands (10 Slash Commands)

### 🎵 Music Commands
**`/music`** - Advanced music bot with voice functionality
- `/music play <query>` - Play music from YouTube, Spotify, or SoundCloud
- `/music queue` - Show the music queue
- `/music skip` - Skip the current song
- `/music stop` - Stop playing and leave voice channel
- `/music pause` - Pause the current song
- `/music resume` - Resume the current song
- `/music volume <level>` - Set playback volume (0-100)
- `/music nowplaying` - Show currently playing song

### 🤖 AI Commands (OpenAI Integration)
**`/ai`** - AI-powered commands using OpenAI
- `/ai chat <message>` - Chat with AI assistant
- `/ai image <prompt>` - Generate images with DALL-E
- `/ai analyze <image>` - Analyze uploaded images
- `/ai summary <text>` - Summarize long text content

### 🎵 Lyrics Commands
**`/lyrics <song>` - Look up song lyrics using Genius API

### 🎮 Fun Commands
**`/fun`** - Entertainment and games
- `/fun joke` - Get a random joke
- `/fun quote` - Get an inspirational quote
- `/fun trivia` - Get a trivia question
- `/fun riddle` - Get a riddle to solve
- `/fun 8ball <question>` - Magic 8-ball predictions
- `/fun dice [sides]` - Roll dice (default 6-sided)

### 🛡️ Moderation Commands
**`/mod`** - Advanced moderation tools
- `/mod kick <user> [reason]` - Kick a user
- `/mod ban <user> [reason]` - Ban a user
- `/mod massban <users>` - Mass ban multiple users
- `/mod cleanup <amount>` - Delete recent messages
- `/mod quarantine <user>` - Quarantine troublesome users
- `/mod automod <setting>` - Configure auto-moderation

### 🌤️ Weather Commands
**`/weather <location>` - Get real-time weather information

### 📰 News Commands  
**`/news [category]` - Get latest news headlines

### 👥 Role Commands
**`/role`** - Comprehensive role management
- `/role list` - List all server roles
- `/role add <user> <role>` - Add role to user
- `/role remove <user> <role>` - Remove role from user
- `/role create <name> [permissions]` - Create new role
- `/role delete <role>` - Delete role
- `/role preset <type>` - Create preset roles (Moderator, Helper, VIP, DJ)
- `/role info <role>` - Show role information

### 📚 Urban Dictionary
**`/urban <term> [safe]` - Look up definitions from Urban Dictionary
- Safe mode filters NSFW content (default: enabled)

### 🎰 Blackjack Game
**`/blackjack` - Play interactive blackjack against the dealer
- Use buttons to hit or stand
- Automatic game state management

## Bot Owner Privileges

**User ID: 615635897924190218** has global permissions:
- ✅ Bypass all cooldowns and rate limits
- ✅ Access to all moderation commands on any server
- ✅ Global permissions regardless of server roles
- ✅ Can use all commands without permission restrictions

## API Integrations

- **Discord.js** - Core bot functionality
- **OpenAI** - AI chat, image generation, analysis
- **Genius** - Song lyrics lookup
- **play-dl** - Music streaming from YouTube/Spotify
- **Weather API** - Real-time weather data
- **News API** - Latest news headlines
- **Urban Dictionary** - Word definitions
- **Last.fm** - Music metadata and statistics

## Bot Features

- **Voice Channel Integration** - Bot joins channels to play music
- **Rate Limiting** - Smart cooldowns prevent spam
- **Auto-Moderation** - Configurable spam/invite protection
- **Interactive Games** - Button-based blackjack and trivia
- **Error Handling** - Comprehensive error messages and recovery
- **Database Integration** - PostgreSQL for persistent data
- **Real-time Updates** - Live status and statistics

## Bot Status
- **Name**: veemon#4083
- **Status**: ✅ Online and operational
- **Commands**: 10 enhanced slash commands registered
- **Prefix Support**: `,` for legacy prefix commands (if implemented)