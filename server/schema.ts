import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, integer, boolean, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const discordServers = pgTable("discord_servers", {
  id: varchar("id").primaryKey(), // Discord guild ID
  name: text("name").notNull(),
  prefix: text("prefix").default("!"),
  autoModEnabled: boolean("auto_mod_enabled").default(false),
  musicVolume: integer("music_volume").default(50),
  lastfmUsername: text("lastfm_username"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const customCommands = pgTable("custom_commands", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  serverId: varchar("server_id").notNull().references(() => discordServers.id),
  name: text("name").notNull(),
  response: text("response").notNull(),
  createdBy: text("created_by").notNull(), // Discord user ID
  createdAt: timestamp("created_at").defaultNow(),
});

export const moderationLogs = pgTable("moderation_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  serverId: varchar("server_id").notNull().references(() => discordServers.id),
  action: text("action").notNull(), // kick, ban, mute, warn
  targetUserId: text("target_user_id").notNull(),
  targetUsername: text("target_username").notNull(),
  moderatorId: text("moderator_id").notNull(),
  moderatorUsername: text("moderator_username").notNull(),
  reason: text("reason"),
  timestamp: timestamp("timestamp").defaultNow(),
});

export const userWarnings = pgTable("user_warnings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  serverId: varchar("server_id").notNull().references(() => discordServers.id),
  userId: text("user_id").notNull(),
  username: text("username").notNull(),
  reason: text("reason").notNull(),
  moderatorId: text("moderator_id").notNull(),
  moderatorUsername: text("moderator_username").notNull(),
  timestamp: timestamp("timestamp").defaultNow(),
});

export const afkUsers = pgTable("afk_users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  serverId: varchar("server_id").notNull().references(() => discordServers.id),
  userId: text("user_id").notNull(),
  username: text("username").notNull(),
  reason: text("reason"),
  timestamp: timestamp("timestamp").defaultNow(),
});

export const musicQueue = pgTable("music_queue", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  serverId: varchar("server_id").notNull().references(() => discordServers.id),
  title: text("title").notNull(),
  artist: text("artist"),
  url: text("url"),
  requestedBy: text("requested_by").notNull(),
  requestedByUsername: text("requested_by_username").notNull(),
  position: integer("position").notNull(),
  duration: text("duration"),
  timestamp: timestamp("timestamp").defaultNow(),
});

// Voicemaster System Tables
export const voicemasterChannels = pgTable("voicemaster_channels", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  serverId: varchar("server_id").notNull().references(() => discordServers.id),
  channelId: text("channel_id").notNull().unique(), // Discord channel ID
  ownerId: text("owner_id").notNull(), // Discord user ID
  ownerUsername: text("owner_username").notNull(),
  channelName: text("channel_name").notNull(),
  userLimit: integer("user_limit").default(0), // 0 = no limit
  isLocked: boolean("is_locked").default(false),
  allowedUsers: jsonb("allowed_users").default('[]'), // Array of user IDs
  bannedUsers: jsonb("banned_users").default('[]'), // Array of user IDs
  createdAt: timestamp("created_at").defaultNow(),
});

export const voicemasterConfig = pgTable("voicemaster_config", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  serverId: varchar("server_id").notNull().references(() => discordServers.id).unique(),
  joinToCreateChannelId: text("join_to_create_channel_id"), // Channel to join to create temp channel
  categoryId: text("category_id"), // Category for temp channels
  defaultChannelName: text("default_channel_name").default("{username}'s Channel"),
  defaultUserLimit: integer("default_user_limit").default(0),
  isEnabled: boolean("is_enabled").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

// Comprehensive Logging System Tables
export const messageLog = pgTable("message_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  serverId: varchar("server_id").notNull().references(() => discordServers.id),
  messageId: text("message_id").notNull(),
  authorId: text("author_id").notNull(),
  authorUsername: text("author_username").notNull(),
  channelId: text("channel_id").notNull(),
  channelName: text("channel_name").notNull(),
  content: text("content"),
  attachments: jsonb("attachments").default('[]'), // Array of attachment URLs
  action: text("action").notNull(), // 'sent', 'edited', 'deleted'
  oldContent: text("old_content"), // For edits
  timestamp: timestamp("timestamp").defaultNow(),
});

export const voiceLog = pgTable("voice_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  serverId: varchar("server_id").notNull().references(() => discordServers.id),
  userId: text("user_id").notNull(),
  username: text("username").notNull(),
  channelId: text("channel_id"),
  channelName: text("channel_name"),
  action: text("action").notNull(), // 'join', 'leave', 'move', 'mute', 'unmute', 'deafen', 'undeafen'
  oldChannelId: text("old_channel_id"), // For moves
  oldChannelName: text("old_channel_name"),
  timestamp: timestamp("timestamp").defaultNow(),
});

export const memberLog = pgTable("member_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  serverId: varchar("server_id").notNull().references(() => discordServers.id),
  userId: text("user_id").notNull(),
  username: text("username").notNull(),
  discriminator: text("discriminator"),
  action: text("action").notNull(), // 'join', 'leave', 'update', 'role_add', 'role_remove', 'nickname_change'
  oldValue: text("old_value"), // Old nickname, role name, etc.
  newValue: text("new_value"), // New nickname, role name, etc.
  details: jsonb("details").default('{}'), // Additional data
  timestamp: timestamp("timestamp").defaultNow(),
});

export const auditLog = pgTable("audit_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  serverId: varchar("server_id").notNull().references(() => discordServers.id),
  executorId: text("executor_id"), // Who performed the action
  executorUsername: text("executor_username"),
  targetId: text("target_id"), // Target of the action (user, channel, role, etc.)
  targetType: text("target_type").notNull(), // 'user', 'channel', 'role', 'message', etc.
  action: text("action").notNull(), // Discord audit log action type
  reason: text("reason"),
  changes: jsonb("changes").default('[]'), // Array of changes
  timestamp: timestamp("timestamp").defaultNow(),
});

export const serverLog = pgTable("server_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  serverId: varchar("server_id").notNull().references(() => discordServers.id),
  action: text("action").notNull(), // 'channel_create', 'channel_delete', 'role_create', 'role_delete', 'emoji_add', etc.
  targetId: text("target_id"),
  targetName: text("target_name"),
  executorId: text("executor_id"),
  executorUsername: text("executor_username"),
  details: jsonb("details").default('{}'),
  timestamp: timestamp("timestamp").defaultNow(),
});

export const loggingConfig = pgTable("logging_config", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  serverId: varchar("server_id").notNull().references(() => discordServers.id).unique(),
  messageLogChannelId: text("message_log_channel_id"),
  voiceLogChannelId: text("voice_log_channel_id"),
  memberLogChannelId: text("member_log_channel_id"),
  moderationLogChannelId: text("moderation_log_channel_id"),
  auditLogChannelId: text("audit_log_channel_id"),
  serverLogChannelId: text("server_log_channel_id"),
  isMessageLogEnabled: boolean("is_message_log_enabled").default(false),
  isVoiceLogEnabled: boolean("is_voice_log_enabled").default(false),
  isMemberLogEnabled: boolean("is_member_log_enabled").default(false),
  isModerationLogEnabled: boolean("is_moderation_log_enabled").default(false),
  isAuditLogEnabled: boolean("is_audit_log_enabled").default(false),
  isServerLogEnabled: boolean("is_server_log_enabled").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const botStats = pgTable("bot_stats", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  serverId: varchar("server_id").notNull().references(() => discordServers.id),
  commandsUsed: integer("commands_used").default(0),
  moderationActions: integer("moderation_actions").default(0),
  songsPlayed: integer("songs_played").default(0),
  activeMembers: integer("active_members").default(0),
  lastUpdated: timestamp("last_updated").defaultNow(),
});

// Insert schemas
export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});
export const insertDiscordServerSchema = createInsertSchema(discordServers);
export const insertCustomCommandSchema = createInsertSchema(customCommands).omit({ id: true, createdAt: true });
export const insertModerationLogSchema = createInsertSchema(moderationLogs).omit({ id: true, timestamp: true });
export const insertUserWarningSchema = createInsertSchema(userWarnings).omit({ id: true, timestamp: true });
export const insertAfkUserSchema = createInsertSchema(afkUsers).omit({ id: true, timestamp: true });
export const insertMusicQueueSchema = createInsertSchema(musicQueue).omit({ id: true, timestamp: true });
export const insertBotStatsSchema = createInsertSchema(botStats).omit({ id: true, lastUpdated: true });
export const insertVoicemasterChannelSchema = createInsertSchema(voicemasterChannels).omit({ id: true, createdAt: true });
export const insertVoicemasterConfigSchema = createInsertSchema(voicemasterConfig).omit({ id: true, createdAt: true });
export const insertMessageLogSchema = createInsertSchema(messageLog).omit({ id: true, timestamp: true });
export const insertVoiceLogSchema = createInsertSchema(voiceLog).omit({ id: true, timestamp: true });
export const insertMemberLogSchema = createInsertSchema(memberLog).omit({ id: true, timestamp: true });
export const insertAuditLogSchema = createInsertSchema(auditLog).omit({ id: true, timestamp: true });
export const insertServerLogSchema = createInsertSchema(serverLog).omit({ id: true, timestamp: true });
export const insertLoggingConfigSchema = createInsertSchema(loggingConfig).omit({ id: true, createdAt: true });

// Types
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type DiscordServer = typeof discordServers.$inferSelect;
export type InsertDiscordServer = z.infer<typeof insertDiscordServerSchema>;
export type CustomCommand = typeof customCommands.$inferSelect;
export type InsertCustomCommand = z.infer<typeof insertCustomCommandSchema>;
export type ModerationLog = typeof moderationLogs.$inferSelect;
export type InsertModerationLog = z.infer<typeof insertModerationLogSchema>;
export type UserWarning = typeof userWarnings.$inferSelect;
export type InsertUserWarning = z.infer<typeof insertUserWarningSchema>;
export type AfkUser = typeof afkUsers.$inferSelect;
export type InsertAfkUser = z.infer<typeof insertAfkUserSchema>;
export type MusicQueueItem = typeof musicQueue.$inferSelect;
export type InsertMusicQueueItem = z.infer<typeof insertMusicQueueSchema>;
export type BotStats = typeof botStats.$inferSelect;
export type InsertBotStats = z.infer<typeof insertBotStatsSchema>;
export type VoicemasterChannel = typeof voicemasterChannels.$inferSelect;
export type InsertVoicemasterChannel = z.infer<typeof insertVoicemasterChannelSchema>;
export type VoicemasterConfig = typeof voicemasterConfig.$inferSelect;
export type InsertVoicemasterConfig = z.infer<typeof insertVoicemasterConfigSchema>;
export type MessageLog = typeof messageLog.$inferSelect;
export type InsertMessageLog = z.infer<typeof insertMessageLogSchema>;
export type VoiceLog = typeof voiceLog.$inferSelect;
export type InsertVoiceLog = z.infer<typeof insertVoiceLogSchema>;
export type MemberLog = typeof memberLog.$inferSelect;
export type InsertMemberLog = z.infer<typeof insertMemberLogSchema>;
export type AuditLog = typeof auditLog.$inferSelect;
export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;
export type ServerLog = typeof serverLog.$inferSelect;
export type InsertServerLog = z.infer<typeof insertServerLogSchema>;
export type LoggingConfig = typeof loggingConfig.$inferSelect;
export type InsertLoggingConfig = z.infer<typeof insertLoggingConfigSchema>;
