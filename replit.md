# Discord Bot Dashboard

## Overview

This is a full-stack Discord bot management dashboard built with React, Express, and PostgreSQL. The application provides a web interface for managing Discord servers, moderation tools, music functionality, custom commands, and bot statistics. The bot integrates with Discord.js for real-time server management and includes features like auto-moderation, music playback, user warnings, AFK tracking, and Last.fm integration for music data.

## User Preferences

Preferred communication style: Simple, everyday language.

## Recent Changes

- **August 18, 2025**: Successfully migrated Discord bot dashboard from Replit Agent to Replit environment
  - Set up PostgreSQL database with full schema (users, servers, moderation logs, music queue, etc.)
  - Created comprehensive dashboard UI components (status cards, activity feed, music player, sidebar)
  - Fixed Discord bot intents issue and got bot online with slash commands
  - Bot successfully connects as "veemon#4083" and registers all commands
  - Dashboard displays real-time bot status and server statistics

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