# Discord Bot Dashboard

## Overview

This is a full-stack Discord bot management dashboard built with React, Express, and PostgreSQL. The application provides a web interface for managing Discord servers, moderation tools, music functionality, custom commands, and bot statistics. The bot integrates with Discord.js for real-time server management and includes features like auto-moderation, music playback, user warnings, AFK tracking, and Last.fm integration for music data.

## User Preferences

Preferred communication style: Simple, everyday language.

## Recent Changes

- **August 18, 2025**: Successfully completed migration from Replit Agent to Replit environment
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