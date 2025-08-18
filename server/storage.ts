import { 
  type DiscordServer, 
  type InsertDiscordServer,
  type CustomCommand,
  type InsertCustomCommand,
  type ModerationLog,
  type InsertModerationLog,
  type UserWarning,
  type InsertUserWarning,
  type AfkUser,
  type InsertAfkUser,
  type MusicQueueItem,
  type InsertMusicQueueItem,
  type BotStats,
  type InsertBotStats,
  type User, 
  type InsertUser 
} from "server/schema";
import { randomUUID } from "crypto";

export interface IStorage {
  // User methods
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  // Discord server methods
  getServer(serverId: string): Promise<DiscordServer | undefined>;
  createServer(server: InsertDiscordServer): Promise<DiscordServer>;
  updateServer(serverId: string, updates: Partial<DiscordServer>): Promise<DiscordServer | undefined>;
  
  // Custom commands
  getCustomCommands(serverId: string): Promise<CustomCommand[]>;
  createCustomCommand(command: InsertCustomCommand): Promise<CustomCommand>;
  deleteCustomCommand(commandId: string): Promise<boolean>;
  
  // Moderation
  createModerationLog(log: InsertModerationLog): Promise<ModerationLog>;
  getModerationLogs(serverId: string, limit?: number): Promise<ModerationLog[]>;
  
  // Warnings
  createWarning(warning: InsertUserWarning): Promise<UserWarning>;
  getUserWarnings(serverId: string, userId: string): Promise<UserWarning[]>;
  getWarningsCount(serverId: string, userId: string): Promise<number>;
  
  // AFK system
  setAfkUser(afkUser: InsertAfkUser): Promise<AfkUser>;
  removeAfkUser(serverId: string, userId: string): Promise<boolean>;
  getAfkUser(serverId: string, userId: string): Promise<AfkUser | undefined>;
  
  // Music queue
  addToMusicQueue(item: InsertMusicQueueItem): Promise<MusicQueueItem>;
  getMusicQueue(serverId: string): Promise<MusicQueueItem[]>;
  clearMusicQueue(serverId: string): Promise<boolean>;
  removeFromQueue(itemId: string): Promise<boolean>;
  
  // Bot stats
  getBotStats(serverId: string): Promise<BotStats | undefined>;
  updateBotStats(serverId: string, updates: Partial<BotStats>): Promise<BotStats>;
  incrementCommandUsed(serverId: string): Promise<void>;
  incrementModerationAction(serverId: string): Promise<void>;
  incrementSongPlayed(serverId: string): Promise<void>;
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private servers: Map<string, DiscordServer>;
  private customCommands: Map<string, CustomCommand>;
  private moderationLogs: Map<string, ModerationLog>;
  private warnings: Map<string, UserWarning>;
  private afkUsers: Map<string, AfkUser>;
  private musicQueue: Map<string, MusicQueueItem>;
  private botStats: Map<string, BotStats>;

  constructor() {
    this.users = new Map();
    this.servers = new Map();
    this.customCommands = new Map();
    this.moderationLogs = new Map();
    this.warnings = new Map();
    this.afkUsers = new Map();
    this.musicQueue = new Map();
    this.botStats = new Map();
  }

  // User methods
  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const user: User = { ...insertUser, id };
    this.users.set(id, user);
    return user;
  }

  // Discord server methods
  async getServer(serverId: string): Promise<DiscordServer | undefined> {
    return this.servers.get(serverId);
  }

  async createServer(server: InsertDiscordServer): Promise<DiscordServer> {
    const newServer: DiscordServer = {
      ...server,
      prefix: server.prefix ?? "!",
      autoModEnabled: server.autoModEnabled ?? false,
      musicVolume: server.musicVolume ?? 50,
      lastfmUsername: server.lastfmUsername ?? null,
      createdAt: new Date(),
    };
    this.servers.set(server.id, newServer);
    return newServer;
  }

  async updateServer(serverId: string, updates: Partial<DiscordServer>): Promise<DiscordServer | undefined> {
    const server = this.servers.get(serverId);
    if (!server) return undefined;
    
    const updatedServer = { ...server, ...updates };
    this.servers.set(serverId, updatedServer);
    return updatedServer;
  }

  // Custom commands
  async getCustomCommands(serverId: string): Promise<CustomCommand[]> {
    return Array.from(this.customCommands.values()).filter(cmd => cmd.serverId === serverId);
  }

  async createCustomCommand(command: InsertCustomCommand): Promise<CustomCommand> {
    const id = randomUUID();
    const newCommand: CustomCommand = {
      ...command,
      id,
      createdAt: new Date(),
    };
    this.customCommands.set(id, newCommand);
    return newCommand;
  }

  async deleteCustomCommand(commandId: string): Promise<boolean> {
    return this.customCommands.delete(commandId);
  }

  // Moderation
  async createModerationLog(log: InsertModerationLog): Promise<ModerationLog> {
    const id = randomUUID();
    const newLog: ModerationLog = {
      ...log,
      id,
      reason: log.reason ?? null,
      timestamp: new Date(),
    };
    this.moderationLogs.set(id, newLog);
    return newLog;
  }

  async getModerationLogs(serverId: string, limit = 50): Promise<ModerationLog[]> {
    const logs = Array.from(this.moderationLogs.values())
      .filter(log => log.serverId === serverId)
      .sort((a, b) => b.timestamp!.getTime() - a.timestamp!.getTime())
      .slice(0, limit);
    return logs;
  }

  // Warnings
  async createWarning(warning: InsertUserWarning): Promise<UserWarning> {
    const id = randomUUID();
    const newWarning: UserWarning = {
      ...warning,
      id,
      timestamp: new Date(),
    };
    this.warnings.set(id, newWarning);
    return newWarning;
  }

  async getUserWarnings(serverId: string, userId: string): Promise<UserWarning[]> {
    return Array.from(this.warnings.values())
      .filter(warning => warning.serverId === serverId && warning.userId === userId)
      .sort((a, b) => b.timestamp!.getTime() - a.timestamp!.getTime());
  }

  async getWarningsCount(serverId: string, userId: string): Promise<number> {
    return Array.from(this.warnings.values())
      .filter(warning => warning.serverId === serverId && warning.userId === userId).length;
  }

  // AFK system
  async setAfkUser(afkUser: InsertAfkUser): Promise<AfkUser> {
    const id = randomUUID();
    const newAfkUser: AfkUser = {
      ...afkUser,
      id,
      reason: afkUser.reason ?? null,
      timestamp: new Date(),
    };
    // Remove existing AFK status for this user
    const existingKey = Array.from(this.afkUsers.entries())
      .find(([_, user]) => user.serverId === afkUser.serverId && user.userId === afkUser.userId)?.[0];
    if (existingKey) {
      this.afkUsers.delete(existingKey);
    }
    this.afkUsers.set(id, newAfkUser);
    return newAfkUser;
  }

  async removeAfkUser(serverId: string, userId: string): Promise<boolean> {
    const existingEntry = Array.from(this.afkUsers.entries())
      .find(([_, user]) => user.serverId === serverId && user.userId === userId);
    if (existingEntry) {
      return this.afkUsers.delete(existingEntry[0]);
    }
    return false;
  }

  async getAfkUser(serverId: string, userId: string): Promise<AfkUser | undefined> {
    return Array.from(this.afkUsers.values())
      .find(user => user.serverId === serverId && user.userId === userId);
  }

  // Music queue
  async addToMusicQueue(item: InsertMusicQueueItem): Promise<MusicQueueItem> {
    const id = randomUUID();
    const newItem: MusicQueueItem = {
      ...item,
      id,
      artist: item.artist ?? null,
      url: item.url ?? null,
      duration: item.duration ?? null,
      timestamp: new Date(),
    };
    this.musicQueue.set(id, newItem);
    return newItem;
  }

  async getMusicQueue(serverId: string): Promise<MusicQueueItem[]> {
    return Array.from(this.musicQueue.values())
      .filter(item => item.serverId === serverId)
      .sort((a, b) => a.position - b.position);
  }

  async clearMusicQueue(serverId: string): Promise<boolean> {
    const items = Array.from(this.musicQueue.entries())
      .filter(([_, item]) => item.serverId === serverId);
    items.forEach(([id]) => this.musicQueue.delete(id));
    return true;
  }

  async removeFromQueue(itemId: string): Promise<boolean> {
    return this.musicQueue.delete(itemId);
  }

  // Bot stats
  async getBotStats(serverId: string): Promise<BotStats | undefined> {
    return this.botStats.get(serverId);
  }

  async updateBotStats(serverId: string, updates: Partial<BotStats>): Promise<BotStats> {
    const existing = this.botStats.get(serverId);
    const stats: BotStats = {
      id: existing?.id || randomUUID(),
      serverId,
      commandsUsed: 0,
      moderationActions: 0,
      songsPlayed: 0,
      activeMembers: 0,
      lastUpdated: new Date(),
      ...existing,
      ...updates,
    };
    this.botStats.set(serverId, stats);
    return stats;
  }

  async incrementCommandUsed(serverId: string): Promise<void> {
    const stats = await this.getBotStats(serverId);
    await this.updateBotStats(serverId, {
      commandsUsed: (stats?.commandsUsed || 0) + 1,
      lastUpdated: new Date(),
    });
  }

  async incrementModerationAction(serverId: string): Promise<void> {
    const stats = await this.getBotStats(serverId);
    await this.updateBotStats(serverId, {
      moderationActions: (stats?.moderationActions || 0) + 1,
      lastUpdated: new Date(),
    });
  }

  async incrementSongPlayed(serverId: string): Promise<void> {
    const stats = await this.getBotStats(serverId);
    await this.updateBotStats(serverId, {
      songsPlayed: (stats?.songsPlayed || 0) + 1,
      lastUpdated: new Date(),
    });
  }
}

export const storage = new MemStorage();
