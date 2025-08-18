# Discord Bot Commands Documentation

## Command Usage

The bot supports two command formats:
- **Slash Commands**: `/command options` (recommended)
- **Prefix Commands**: `,command options` (requires Message Content Intent)

---

## 🛡️ Moderation Commands

### `/kick` or `,kick`
**Description**: Remove a user from the server
**Usage**: `/kick @user [reason]`
**Example**: `/kick @BadUser Spamming in chat`
**Permissions**: Kick Members

### `/ban` or `,ban`
**Description**: Permanently ban a user from the server
**Usage**: `/ban @user [reason]`
**Example**: `/ban @Troublemaker Repeated rule violations`
**Permissions**: Ban Members

### `/timeout` or `,timeout`
**Description**: Temporarily mute a user (timeout)
**Usage**: `/timeout @user duration [reason]`
**Example**: `/timeout @User 60 Please calm down`
**Permissions**: Moderate Members
**Note**: Duration in minutes

### `/warn` or `,warn`
**Description**: Issue a formal warning to a user
**Usage**: `/warn @user reason`
**Example**: `/warn @User Please follow server rules`
**Permissions**: Moderate Members

### `/purge` or `,purge`
**Description**: Bulk delete messages from a channel
**Usage**: `/purge amount [user]`
**Example**: `/purge 50` or `/purge 25 @User`
**Permissions**: Manage Messages
**Note**: Deletes 1-100 messages, optionally from specific user

### `/lock` or `,lock`
**Description**: Lock a channel to prevent regular users from sending messages
**Usage**: `/lock [channel] [reason]`
**Example**: `/lock #general Temporary lockdown`
**Permissions**: Manage Channels

### `/unlock` or `,unlock`
**Description**: Unlock a previously locked channel
**Usage**: `/unlock [channel] [reason]`
**Example**: `/unlock #general Issue resolved`
**Permissions**: Manage Channels

### `/clear` or `,clear`
**Description**: Clear messages from the current channel
**Usage**: `/clear amount`
**Example**: `/clear 10`
**Permissions**: Manage Messages

---

## ⚙️ Server Configuration

### `/prefix` or `,prefix`
**Description**: Manage server command prefix
**Subcommands**:
- `set`: Change the prefix - `/prefix set !`
- `show`: Display current prefix - `/prefix show`
**Permissions**: Manage Server

### `/logging` or `,logging`
**Description**: Configure moderation logging
**Subcommands**:
- `set`: Set log channel - `/logging set #mod-logs`
- `disable`: Disable logging - `/logging disable`
**Permissions**: Manage Server

### `/antinuke` or `,antinuke`
**Description**: Anti-raid protection system
**Subcommands**:
- `enable`: Enable protection - `/antinuke enable`
- `disable`: Disable protection - `/antinuke disable`
- `status`: Check current status - `/antinuke status`
**Permissions**: Administrator

---

## 🎵 Music & Entertainment

### `/music` or `,music`
**Description**: Music player controls
**Subcommands**:
- `play`: Play a song - `/music play Never Gonna Give You Up`
- `pause`: Pause playback - `/music pause`
- `resume`: Resume playback - `/music resume`
- `stop`: Stop and clear queue - `/music stop`
- `skip`: Skip current song - `/music skip`
- `queue`: Show music queue - `/music queue`
- `volume`: Set volume (1-100) - `/music volume 75`

### `/lastfm` or `,lastfm`
**Description**: Last.fm music integration
**Subcommands**:
- `set`: Connect your account - `/lastfm set yourusername`
- `nowplaying`: Show current track - `/lastfm nowplaying`
- `recent`: Show recent tracks - `/lastfm recent`
- `top`: Show top artists - `/lastfm top`

### `/nowplaying` or `,nowplaying`
**Description**: Display currently playing music on Last.fm
**Usage**: `/nowplaying`

---

## 🎮 Fun Commands

### `/coinflip` or `,coinflip`
**Description**: Flip a coin (heads or tails)
**Usage**: `/coinflip`

### `/blackjack` or `,blackjack`
**Description**: Start a blackjack game
**Usage**: `/blackjack`

### `/whitetea` or `,whitetea`
**Description**: Get a soothing white tea fortune
**Usage**: `/whitetea`

### `/blacktea` or `,blacktea`
**Description**: Get a bold black tea fortune
**Usage**: `/blacktea`

---

## ℹ️ Information Commands

### `/help` or `,help`
**Description**: Display available commands
**Usage**: `/help`

### `/serverinfo` or `,serverinfo`
**Description**: Show detailed server information
**Usage**: `/serverinfo`

### `/userinfo` or `,userinfo`
**Description**: Display user information
**Usage**: `/userinfo [@user]`
**Example**: `/userinfo @Someone` or `/userinfo` (for yourself)

---

## 🛠️ Utility Commands

### `/afk` or `,afk`
**Description**: Set your AFK status with a custom message
**Usage**: `/afk [reason]`
**Example**: `/afk Going to lunch, back in 30 mins`

### `/createcommand` or `,createcommand`
**Description**: Create custom server commands
**Usage**: `/createcommand name response`
**Example**: `/createcommand welcome Welcome to our awesome server!`
**Permissions**: Manage Server

### `/search` or `,search`
**Description**: Search for information online
**Usage**: `/search query`
**Example**: `/search Discord bot development`

### `/role` or `,role`
**Description**: Manage user roles
**Subcommands**:
- `add`: Add role to user - `/role add @user @RoleName`
- `remove`: Remove role from user - `/role remove @user @RoleName`
- `list`: List all server roles - `/role list`
**Permissions**: Manage Roles

---

## 🌟 Advanced Features

### `/starboard` or `,starboard`
**Description**: Configure starboard for popular messages
**Subcommands**:
- `set`: Configure starboard - `/starboard set #starboard 3`
- `disable`: Disable starboard - `/starboard disable`
**Permissions**: Manage Server

### `/reactionroles` or `,reactionroles`
**Description**: Set up reaction role system
**Usage**: `/reactionroles messageId emoji @role`
**Example**: `/reactionroles 123456789 🎮 @Gamer`
**Permissions**: Manage Roles

### `/joingate` or `,joingate`
**Description**: Configure minimum account age for new members
**Subcommands**:
- `set`: Set minimum days - `/joingate set 7`
- `disable`: Disable join gate - `/joingate disable`
**Permissions**: Manage Server

### `/voicemaster` or `,voicemaster`
**Description**: Temporary voice channels system
**Subcommands**:
- `set`: Configure hub channel - `/voicemaster set #Create-VC`
- `disable`: Disable voice master - `/voicemaster disable`
**Permissions**: Manage Channels

### `/level` or `,level`
**Description**: XP and leveling system
**Subcommands**:
- `set`: Configure XP per message - `/level set 5`
- `reward`: Set level rewards - `/level reward 100 @LevelRole`
- `check`: Check user's level - `/level check @user`

### `/counters` or `,counters`
**Description**: Automatic server counters
**Subcommands**:
- `member`: Set member counter channel - `/counters member #member-count`
- `disable`: Disable counters - `/counters disable`
**Permissions**: Manage Channels

### `/bumpreminder` or `,bumpreminder`
**Description**: Automated bump reminders for server lists
**Subcommands**:
- `set`: Setup reminders - `/bumpreminder set #bump-channel 120`
- `disable`: Disable reminders - `/bumpreminder disable`
**Permissions**: Manage Server

### `/giveaway` or `,giveaway`
**Description**: Create and manage giveaways
**Usage**: `/giveaway create prize duration winners`
**Example**: `/giveaway create "Discord Nitro" 24h 1`
**Permissions**: Manage Server

### `/webhook` or `,webhook`
**Description**: Manage server webhooks
**Subcommands**:
- `create`: Create webhook - `/webhook create #channel WebhookName`
- `delete`: Delete webhook - `/webhook delete webhookId`
**Permissions**: Manage Webhooks

---

## 🤖 Bot Management

### `/botinfo` or `,botinfo`
**Description**: Display detailed information about the bot
**Usage**: `/botinfo`
**Information Shown**:
- Bot name, ID, and creation date
- Number of servers and commands
- Current uptime and system stats
- Memory usage and latency
- Node.js version

### `/reload` or `,reload`
**Description**: Restart the entire bot (Admin only)
**Usage**: `/reload`
**Permissions**: Administrator
**Note**: This command completely restarts the bot process. Use with caution as it will temporarily disconnect the bot.

---

## 📝 Notes

- **Permissions**: Each command shows the required Discord permissions
- **Brackets**: `[optional]` parameters are optional, `<required>` are mandatory
- **Duration Formats**: Use formats like `1h`, `30m`, `24h` for time-based commands
- **Mentions**: Use `@username`, `#channel`, or `@role` for Discord mentions
- **Case Sensitivity**: Commands are not case-sensitive
- **Rate Limits**: Some commands have cooldowns to prevent spam

---

## 🔧 Setup Requirements

1. **Bot Permissions**: Ensure the bot has necessary permissions for each command
2. **Channel Permissions**: Bot needs appropriate channel permissions to execute commands
3. **Role Hierarchy**: Bot's role must be higher than roles it manages
4. **Message Content Intent**: Required for prefix commands (`,command`)
5. **Last.fm API**: Required for Last.fm integration commands

---

## 🆘 Support

If you encounter issues:
1. Check bot permissions in server settings
2. Verify the bot's role hierarchy
3. Ensure the bot has access to the target channels
4. Contact server administrators for permission-related issues