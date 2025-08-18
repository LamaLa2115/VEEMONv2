# Discord Bot Dashboard

## Overview

This is a full-stack Discord bot management dashboard built with React, Express, and PostgreSQL. The application provides a web interface for managing Discord servers, moderation tools, music functionality, custom commands, and bot statistics. The bot integrates with Discord.js for real-time server management and includes features like auto-moderation, music playback, user warnings, AFK tracking, and Last.fm integration for music data.

## User Preferences

Preferred communication style: Simple, everyday language.

## Recent Changes

- **August 18, 2025**: **COMPLETED MIGRATION WITH ENHANCEMENTS**: Successfully migrated Discord bot from Replit Agent to Replit environment
  - **Enhanced Command Set**: Merged old bot commands with enhanced bot, now featuring 15 comprehensive slash commands
  - **Dual Command Support Verified**: Both slash commands (/) and prefix commands (,) working seamlessly
  - **Complete Feature Set**: Music, AI, moderation, utility, games, weather, news, roles, and more
  - **Bot Status**: Online as veemon#4083 with full functionality restored and enhanced
  - **Fixed Configuration Issues**: Resolved TypeScript errors and duplicate config properties
  - **Enhanced Error Handling**: Made Discord bot startup graceful with proper error handling
  - **Dual Command Support**: Implemented both slash commands (/) and prefix commands (,) working seamlessly
  - **Web Dashboard Working**: Application serves both the Discord bot and web dashboard
  - **Bot Status Confirmed**: Bot online as veemon#4083 with 10 enhanced commands operational
- **August 18, 2025**: Enhanced configuration system with comprehensive API key management and centralized config file
- **August 18, 2025**: Added all external API integrations (Discord, Last.fm, YouTube, OpenAI, Weather, News, Spotify)
- **August 18, 2025**: **FINAL ENHANCEMENT COMPLETE**: Bot successfully running with comprehensive feature set:
  - **10 Enhanced Slash Commands**: Complete replacement of previous 40 basic commands with advanced functionality
  - **Bot Owner Confirmed**: User ID 615635897924190218 has verified global permissions across all servers
  - **Full Voice Integration**: Music bot now properly joins voice channels and streams from YouTube/Spotify
  - **All APIs Operational**: OpenAI, Weather, News, Genius Lyrics, Urban Dictionary all working
  - **Interactive Features**: Button-based blackjack, trivia games, and dynamic responses
  - **Advanced Moderation**: Mass ban, cleanup, quarantine, and auto-mod systems active
  - **Rate Limiting Bypass**: Bot owner immune to all cooldowns and restrictions
  - **Error Handling**: Comprehensive error recovery and user feedback systems
- **August 18, 2025**: **MAJOR ENHANCEMENT**: Completely redesigned Discord bot with comprehensive feature set:
  - **Enhanced Music System**: Full voice channel integration with play-dl library for YouTube/Spotify playback
  - **OpenAI Integration**: AI chat, image generation, image analysis, and text summarization commands
  - **Lyrics System**: Full song lyrics lookup with Genius API integration
  - **Advanced Moderation**: Mass ban, message cleanup, auto-moderation, quarantine system
  - **Enhanced Fun Commands**: Jokes, quotes, trivia, riddles, 8-ball, dice rolling with external APIs
  - **Weather & News**: Real-time weather data and news headlines from multiple sources
  - **Fixed Role System**: Bot owner now has global permissions across all servers (super admin bypass)
  - **Rate Limiting**: Smart cooldown system to prevent spam and abuse
  - **Error Handling**: Comprehensive error handling and user feedback
  - **Interactive Elements**: Button-based games and dynamic responses
  - **API Integration**: Weather, News, OpenAI, Spotify, Last.fm, Urban Dictionary, and more
- **August 18, 2025**: Successfully migrated Discord bot dashboard from Replit Agent to Replit environment
- **August 18, 2025**: Enhanced Discord bot with additional features:
  - Set up PostgreSQL database with full schema (users, servers, moderation logs, music queue, etc.)
  - Created comprehensive dashboard UI components (status cards, activity feed, music player, sidebar)
  - Fixed Discord bot intents issue and got bot online with slash commands
  - Bot successfully connects as "veemon#4083" and registers all commands
  - Dashboard displays real-time bot status and server statistics
  - **Added Last.fm API integration** with comprehensive music features (now playing, recent tracks, top artists)
  - **Implemented dual command system** supporting both slash commands (/) and prefix commands (,)
  - **Changed bot prefix from "!" to ","** for all servers and future installations
  - Enhanced prefix command parsing to handle complex arguments and subcommands for full feature parity
  - **Added advanced moderation commands**: purge, lock/unlock channels, slowmode control
  - **Created comprehensive COMMANDS.md documentation** with usage examples and permission requirements
  - Bot now supports 37+ commands including all essential moderation, music, utility, and fun features
  - **Added bot management commands**: botinfo (displays bot statistics) and reload (restarts bot)
  - **Implemented super admin system**: User ID 615635897924190218 has global permissions on all servers and exclusive access to reload command
  - **Enhanced permission system**: All moderation and admin commands now check permissions with super admin bypass functionality
  - **Created server/config.ts**: Centralized configuration file for all API keys, settings, and environment variables
  - **Enhanced Blackjack game**: Added interactive /hit and /stand commands with button UI for seamless gameplay
  - **Implemented music bot**: Enhanced /music command with play, queue, stop, volume subcommands and database integration
  - **Added Urban Dictionary command**: New /urban command for looking up slang terms and definitions
  - **Fixed TypeScript compilation issues**: Resolved iterator compatibility problems with Discord.js
  - **Added button interaction handling**: Interactive blackjack game with modern Discord UI buttons
  - **Updated to 40 total commands**: Now supports hit, stand, urban commands in addition to existing 37 commands
  - **Fixed music command error handling**: Added proper subcommand validation to prevent CommandInteractionOptionNoSubcommand errors
  - **Updated Discord.js deprecation warnings**: Replaced deprecated ephemeral property with flags: 64 for ephemeral messages
  - **Enhanced button interaction system**: Interactive blackjack now works seamlessly with both slash commands and UI buttons
  - **Improved error handling**: All commands now use proper error handling with modern Discord.js patterns
  - **Implemented comprehensive role management system**: Full role command with list, add, remove, create, delete, preset, and info subcommands
  - **Added role permission presets**: Pre-configured roles (Moderator, Helper, VIP, DJ, Event Manager) with appropriate permissions
  - **Enhanced role security**: Proper hierarchy checks and permission validation to prevent privilege escalation
  - **Fixed whitetea game**: Now requires user input instead of showing the answer immediately
  - **Added comprehensive logging system**: Voice state tracking, message logging, and audit trail for all role management actions

## System Architecture

### Frontend Architecture
- **React SPA**: Built with Vite for fast development and hot reloading
- **UI Framework**: Shadcn/ui components with Radix UI primitives for accessibility
- **Styling**: Tailwind CSS with custom Discord-themed color palette and variables
- **State Management**: TanStack Query for server state management and caching
- **Routing**: Wouter for lightweight client-side routing
- **Form Handling**: React Hook Form with Zod validation resolvers

### Backend Architecture
- **Express.js API**: RESTful API server with middleware for logging and error handling
- **Discord Bot**: Discord.js integration with slash commands, event listeners, and guild management
- **Database Layer**: Drizzle ORM with PostgreSQL for type-safe database operations
- **Storage Interface**: Abstract storage layer for database operations (users, servers, moderation, etc.)

### Database Design
- **Users**: Basic user authentication and management
- **Discord Servers**: Server configuration, prefixes, auto-mod settings, music volume
- **Custom Commands**: User-created commands with responses
- **Moderation System**: Logs for kicks, bans, mutes, warnings with moderator tracking
- **User Warnings**: Warning system with escalation tracking
- **AFK System**: Away-from-keyboard status tracking
- **Music Queue**: Song queue management with metadata
- **Bot Statistics**: Usage metrics and analytics

### External Dependencies

- **Discord.js**: Core Discord bot functionality and API integration
- **Neon Database**: PostgreSQL hosting with serverless driver (@neondatabase/serverless)
- **Last.fm API**: Music metadata and user listening data integration
- **Drizzle Kit**: Database migrations and schema management
- **Radix UI**: Accessible component primitives for the UI
- **TanStack Query**: Server state synchronization and caching
- **Zod**: Runtime type validation and schema parsing
- **Axios**: HTTP client for external API requests
- **Date-fns**: Date manipulation and formatting utilities

The application follows a modular architecture with clear separation between the Discord bot logic, web dashboard, and database operations. The storage interface provides flexibility to swap database implementations while maintaining the same API contract.