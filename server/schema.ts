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
export const insertDiscordServerSchema = createInsertSchema(discordServers);
export const insertCustomCommandSchema = createInsertSchema(customCommands).omit({ id: true, createdAt: true });
export const insertModerationLogSchema = createInsertSchema(moderationLogs).omit({ id: true, timestamp: true });
export const insertUserWarningSchema = createInsertSchema(userWarnings).omit({ id: true, timestamp: true });
export const insertAfkUserSchema = createInsertSchema(afkUsers).omit({ id: true, timestamp: true });
export const insertMusicQueueSchema = createInsertSchema(musicQueue).omit({ id: true, timestamp: true });
export const insertBotStatsSchema = createInsertSchema(botStats).omit({ id: true, lastUpdated: true });

// Types
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

export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});
