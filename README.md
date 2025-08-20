# Complete Discord Bot Commands Documentation

This Discord bot (veemon#4083) supports **61+ enhanced commands** with both slash commands (`/`) and prefix commands (`,`). All commands include comprehensive error handling, rate limiting, and permission checks.

## 📋 Command Format Legend
- **Required**: `<parameter>` 
- **Optional**: `[parameter]`
- **Choices**: `option1|option2|option3`
- **Permissions**: Listed for each command
- **Cooldown**: Per-user command cooldown time

---

## 🛡️ **MODERATION COMMANDS**

### `/kick <user> [reason]`
- **Description**: Kick a user from the server
- **Permissions**: Kick Members
- **Usage**: `/kick @user spam behavior`
- **Cooldown**: 3 seconds
- **Features**: Auto-logging, super admin bypass

### `/ban <user> [reason] [delete_days]`
- **Description**: Ban a user from the server
- **Permissions**: Ban Members  
- **Usage**: `/ban @user harassment 1`
- **Options**: delete_days (0-7 days of message history)
- **Cooldown**: 5 seconds

### `/timeout <user> <duration> [reason]`
- **Description**: Timeout a user (mute temporarily)
- **Permissions**: Moderate Members
- **Usage**: `/timeout @user 1h spamming`
- **Duration**: 60s, 5m, 10m, 1h, 1d, 1w
- **Cooldown**: 3 seconds

### `/warn <user> [reason]`
- **Description**: Warn a user (tracked in database)
- **Permissions**: Kick Members
- **Usage**: `/warn @user inappropriate language`
- **Features**: Warning escalation system
- **Cooldown**: 2 seconds

### `/clear <amount> [user]`
- **Description**: Bulk delete messages
- **Permissions**: Manage Messages
- **Usage**: `/clear 50` or `/clear 20 @user`
- **Range**: 1-100 messages
- **Cooldown**: 3 seconds

### `/purge <subcommand>`
- **Description**: Advanced message purging
- **Subcommands**:
  - `all <amount>` - Delete recent messages
  - `user <user> <amount>` - Delete user's messages
  - `contains <text> <amount>` - Delete messages with text
  - `images <amount>` - Delete messages with attachments
- **Permissions**: Manage Messages
- **Cooldown**: 5 seconds

### `/lock [channel]`
- **Description**: Lock a channel (prevent @everyone from sending)
- **Permissions**: Manage Channels
- **Usage**: `/lock` (current channel) or `/lock #channel`

### `/unlock [channel]`
- **Description**: Unlock a previously locked channel
- **Permissions**: Manage Channels
- **Usage**: `/unlock #general`

### `/slowmode <duration>`
- **Description**: Set channel slowmode
- **Permissions**: Manage Channels
- **Duration**: off, 5s, 10s, 15s, 30s, 1m, 2m, 5m, 10m, 15m, 30m, 1h, 2h, 6h
- **Usage**: `/slowmode 30s`

---

## 🎵 **MUSIC COMMANDS**

### `/music <subcommand>`
- **Description**: Full-featured music bot with voice integration
- **Voice Required**: Must be in a voice channel

#### Music Subcommands:
- **`play <query>`**: Play a song from YouTube/Spotify
- **`queue`**: Show current music queue
- **`skip`**: Skip current song
- **`stop`**: Stop music and clear queue
- **`pause`**: Pause current song
- **`resume`**: Resume paused song
- **`volume <1-100>`**: Adjust volume
- **`nowplaying`**: Show current song info
- **`shuffle`**: Shuffle the queue
- **`loop <mode>`**: Set loop mode (off/track/queue)

**Usage Examples**:
- `/music play despacito`
- `/music play https://youtube.com/watch?v=xyz`
- `/music volume 50`
- `/music loop track`

**Features**:
- Supports YouTube, Spotify, SoundCloud URLs
- Intelligent search with fallback methods  
- Real-time volume control
- Queue management with shuffle/loop
- High-quality audio streaming

---

## 🤖 **AI & UTILITY COMMANDS**

### `/ai <subcommand>`
- **Description**: OpenAI integration for various AI tasks
- **Cooldown**: 10 seconds (reduced for bot owner)

#### AI Subcommands:
- **`chat <message>`**: Chat with ChatGPT
- **`image <prompt>`**: Generate images with DALL-E
- **`analyze <image_url>`**: Analyze uploaded images
- **`summarize <text>`**: Summarize long text
- **`translate <text> <language>`**: Translate text

**Usage Examples**:
- `/ai chat explain quantum physics`
- `/ai image a cat wearing a space suit`
- `/ai summarize [long article text]`

### `/lyrics <song>`
- **Description**: Get song lyrics from Genius API
- **Usage**: `/lyrics imagine dragons believer`
- **Features**: Fuzzy search, artist/song matching
- **Cooldown**: 5 seconds

### `/weather <location>`
- **Description**: Get current weather information
- **Usage**: `/weather New York` or `/weather Tokyo`
- **Features**: Temperature, conditions, humidity, wind
- **Cooldown**: 3 seconds

### `/news [category]`
- **Description**: Latest news headlines
- **Categories**: general, business, entertainment, health, science, sports, technology
- **Usage**: `/news technology`
- **Cooldown**: 10 seconds

---

## 🎮 **FUN & GAMES COMMANDS**

### `/blackjack`
- **Description**: Interactive blackjack game with buttons
- **Usage**: `/blackjack`
- **Features**: Hit/Stand buttons, realistic gameplay
- **Cooldown**: 5 seconds

### `/fun <subcommand>`
- **Description**: Collection of fun interactive commands

#### Fun Subcommands:
- **`8ball <question>`**: Magic 8-ball responses
- **`dice [sides]`**: Roll dice (default 6 sides)
- **`trivia [category]`**: Trivia questions with buttons
- **`riddle`**: Random riddles to solve
- **`joke`**: Random jokes
- **`quote`**: Inspirational quotes

### `/coinflip`
- **Description**: Flip a coin (heads/tails)
- **Usage**: `/coinflip`
- **Features**: Animated embed response

### `/rps <choice>`
- **Description**: Rock Paper Scissors game
- **Choices**: rock, paper, scissors
- **Usage**: `/rps rock`

### `/roll <dice>`
- **Description**: Advanced dice rolling
- **Usage**: `/roll 2d6+3` or `/roll 1d20`
- **Features**: Supports complex dice notation

---

## ℹ️ **INFORMATION COMMANDS**

### `/help [command]`
- **Description**: Comprehensive help system with interactive buttons
- **Usage**: `/help` or `/help music`
- **Features**: Category buttons, detailed command info

### `/ping`
- **Description**: Check bot latency and performance
- **Features**: API latency, websocket ping, uptime, TPS metrics

### `/serverinfo`
- **Description**: Detailed server information
- **Features**: Member count, roles, channels, creation date, server stats

### `/userinfo [user]`
- **Description**: User account information
- **Usage**: `/userinfo @user` or `/userinfo` (yourself)
- **Features**: Join date, roles, account age, permissions

### `/avatar [user]`
- **Description**: Display user's avatar in high resolution
- **Usage**: `/avatar @user`
- **Features**: Links to different sizes

### `/botinfo`
- **Description**: Bot statistics and information
- **Features**: Uptime, servers, users, command usage, memory, CPU

---

## ⚙️ **SERVER CONFIGURATION**

### `/prefix <new_prefix>`
- **Description**: Change server command prefix
- **Permissions**: Manage Guild
- **Usage**: `/prefix !` (changes from default `,` to `!`)
- **Length**: 1-5 characters

### `/logging <subcommand>`
- **Description**: Comprehensive logging system configuration
- **Permissions**: Manage Guild

#### Logging Subcommands:
- **`setup <channel>`**: Quick setup with primary channel
- **`dashboard`**: Interactive logging configuration
- **`status`**: View current logging status
- **`channels`**: Auto-create logging channels

**Logging Features**:
- Message logging (edits, deletes, bulk deletes)
- Voice activity logging (join/leave, mute/unmute)
- Member events (joins, leaves, nickname changes)
- Moderation actions (bans, kicks, warnings)
- Audit trail (complete server audit log)

### `/voicemaster <subcommand>`
- **Description**: Advanced voice channel management system
- **Permissions**: Manage Channels

#### Voicemaster Subcommands:
- **`setup <category>`**: Set up join-to-create system
- **`config <setting> <value>`**: Configure default settings

**Voicemaster Features**:
- Join-to-create voice channels
- Channel ownership system
- Lock/unlock channels
- Set user limits (0-99)
- Rename channels
- Invite/kick specific users
- Transfer ownership
- Auto-cleanup when empty

**Voice Controls** (available in created channels):
- 🔒 Lock/🔓 Unlock buttons
- 👥 Set user limit
- 📝 Rename channel
- ➕ Invite users
- 🚫 Kick users  
- 👑 Transfer ownership
- ℹ️ Channel info

---

## 🎭 **ROLE MANAGEMENT**

### `/role <subcommand>`
- **Description**: Comprehensive role management system
- **Permissions**: Manage Roles

#### Role Subcommands:
- **`add <user> <role>`**: Add role to user
- **`remove <user> <role>`**: Remove role from user
- **`create <name> [color] [permissions]`**: Create new role
- **`delete <role>`**: Delete role
- **`list`**: List all server roles
- **`info <role>`**: Role information
- **`preset <type>`**: Create preset roles

**Preset Role Types**:
- **Moderator**: Kick, ban, manage messages permissions
- **Helper**: Limited moderation permissions
- **VIP**: Special member role
- **DJ**: Music bot permissions
- **Event Manager**: Event management permissions

**Safety Features**:
- Hierarchy checks prevent privilege escalation
- Audit logging for all role changes
- Permission validation

---

## 🌟 **ADVANCED FEATURES**

### `/starboard <subcommand>`
- **Description**: Star-based message highlighting system
- **Permissions**: Manage Guild

#### Starboard Subcommands:
- **`set <channel> <threshold>`**: Configure starboard
- **`status`**: View starboard configuration

**Features**: Messages with enough ⭐ reactions get posted to starboard

### `/reactionroles <subcommand>`
- **Description**: Self-assignable roles via reactions
- **Permissions**: Manage Roles

#### Reaction Role Subcommands:
- **`add <message_id> <emoji> <role>`**: Add reaction role
- **`list`**: View all reaction roles

### `/joingate <min_days>`
- **Description**: Minimum account age for new members
- **Permissions**: Administrator
- **Usage**: `/joingate 7` (7 days minimum account age)

### `/counters <member_count_channel>`
- **Description**: Live member count in voice/text channels
- **Permissions**: Manage Guild
- **Features**: Auto-updating member count display

### `/bumpreminder <channel> <interval>`
- **Description**: Automated server bump reminders
- **Permissions**: Manage Guild
- **Usage**: `/bumpreminder #general 120` (every 2 hours)
- **Minimum**: 15 minutes

---

## 🎯 **ADDITIONAL UTILITY**

### `/afk [reason]`
- **Description**: Set AFK status with auto-return detection
- **Usage**: `/afk going to sleep`
- **Features**: Auto-welcome back when typing

### `/urban <term>`
- **Description**: Urban Dictionary definitions
- **Usage**: `/urban yeet`
- **Cooldown**: 3 seconds

### `/meme`
- **Description**: Random memes from popular subreddits
- **Cooldown**: 5 seconds

### `/wiki <query>`
- **Description**: Wikipedia article summaries
- **Usage**: `/wiki artificial intelligence`

### `/quote`
- **Description**: Inspirational quotes
- **Features**: Random quotes with authors

### `/joke`
- **Description**: Random clean jokes
- **Categories**: Programming, dad jokes, general

### `/fact`
- **Description**: Interesting random facts
- **Sources**: Multiple fact APIs

### `/catfact`
- **Description**: Random cat facts
- **Features**: Cute cat trivia

### `/dadjoke`  
- **Description**: Dad jokes specifically
- **Features**: Classic dad humor

### `/color <hex>`
- **Description**: Display color information
- **Usage**: `/color #FF5733`
- **Features**: Color preview, RGB values

### `/qr <text>`
- **Description**: Generate QR codes
- **Usage**: `/qr https://discord.com`

### `/math <expression>`
- **Description**: Calculate mathematical expressions
- **Usage**: `/math 2+2*5`
- **Features**: Advanced math operations

### `/password [length]`
- **Description**: Generate secure passwords
- **Length**: 8-64 characters (default 12)

### `/hug <user>`
- **Description**: Send virtual hugs
- **Usage**: `/hug @friend`

### `/space`
- **Description**: Random space facts and images
- **Features**: NASA API integration

### `/define <word>`
- **Description**: Dictionary definitions
- **Usage**: `/define serendipity`

### `/ascii <text>`
- **Description**: Convert text to ASCII art
- **Usage**: `/ascii HELLO`

### `/remind <time> <message>`
- **Description**: Set reminders
- **Usage**: `/remind 1h check server`
- **Time formats**: 5m, 1h, 2d, etc.

---

## 👨‍💼 **BOT OWNER COMMANDS**

### `/reload`
- **Description**: Restart the entire bot
- **Permissions**: Bot Owner Only (User ID: 615635897924190218)
- **Usage**: `/reload`
- **Features**: Graceful restart with status update

### `/servers <subcommand>`
- **Description**: Bot server management
- **Permissions**: Bot Owner Only

#### Server Management Subcommands:
- **`list`**: List all servers bot is in
- **`join <invite>`**: Join server via invite
- **`leave <server_id>`**: Leave specific server

---

## 🔧 **SPECIAL FEATURES**

### **Super Admin System**
- **User ID 615635897924190218** has global permissions
- Bypasses all permission checks and cooldowns
- Access to all commands regardless of server permissions

### **Dual Command Support**
- **Slash Commands**: `/command` (recommended)
- **Prefix Commands**: `,command` (configurable per server)

### **Rate Limiting**
- Individual cooldowns per command
- Smart cooldown bypass for bot owner
- Prevents spam and abuse

### **Error Handling**
- Comprehensive error messages
- Graceful failure recovery
- User-friendly error responses

### **Database Integration**
- PostgreSQL with Drizzle ORM
- User warnings and moderation logs
- Server configurations
- Music queue persistence
- AFK status tracking

### **External API Integrations**
- **OpenAI**: Chat, image generation, analysis
- **Genius**: Song lyrics
- **Weather API**: Current weather data
- **News API**: Latest headlines
- **Last.fm**: Music data and statistics
- **Urban Dictionary**: Slang definitions
- **Various fun APIs**: Memes, facts, jokes

---

## 📝 **USAGE TIPS**

1. **Command Help**: Use `/help [command]` for detailed usage
2. **Permissions**: Some commands require specific server permissions
3. **Rate Limits**: Wait for cooldowns to prevent spam
4. **Voice Commands**: Music and voicemaster require voice channel
5. **Interactive Features**: Many commands include buttons and menus
6. **Error Messages**: Bot provides clear error explanations
7. **Logging**: Enable logging to track all bot activities

---

## 🆘 **SUPPORT**

- **Total Commands**: 61+ enhanced commands
- **Command Format**: Both `/` and `,` prefixes supported
- **Interactive Help**: Use button-based help system
- **Bot Status**: Check with `/ping` and `/botinfo`
- **GitHub**: LamaLa2115/VEEMONv2

**Bot Version**: Enhanced Discord Bot v2.0
**Last Updated**: August 19, 2025
**Status**: Fully operational with advanced features
