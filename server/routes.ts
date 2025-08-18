import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { discordBot } from "./discord-bot";
import { 
  insertDiscordServerSchema, 
  insertCustomCommandSchema,
  insertModerationLogSchema,
  insertUserWarningSchema,
} from "@shared/schema";
import { z } from "zod";

export async function registerRoutes(app: Express): Promise<Server> {
  // Start Discord bot
  discordBot.start();

  // Get bot status
  app.get("/api/bot/status", async (req, res) => {
    const client = discordBot.getClient();
    res.json({
      status: client.isReady() ? 'online' : 'offline',
      uptime: client.uptime,
      guilds: client.guilds.cache.size,
      users: client.users.cache.size,
    });
  });

  // Server management
  app.get("/api/servers/:serverId", async (req, res) => {
    try {
      const server = await storage.getServer(req.params.serverId);
      if (!server) {
        return res.status(404).json({ message: "Server not found" });
      }
      res.json(server);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch server" });
    }
  });

  app.post("/api/servers", async (req, res) => {
    try {
      const serverData = insertDiscordServerSchema.parse(req.body);
      const server = await storage.createServer(serverData);
      res.json(server);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid server data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create server" });
    }
  });

  app.patch("/api/servers/:serverId", async (req, res) => {
    try {
      const updates = req.body;
      const server = await storage.updateServer(req.params.serverId, updates);
      if (!server) {
        return res.status(404).json({ message: "Server not found" });
      }
      res.json(server);
    } catch (error) {
      res.status(500).json({ message: "Failed to update server" });
    }
  });

  // Custom commands
  app.get("/api/servers/:serverId/commands", async (req, res) => {
    try {
      const commands = await storage.getCustomCommands(req.params.serverId);
      res.json(commands);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch commands" });
    }
  });

  app.post("/api/servers/:serverId/commands", async (req, res) => {
    try {
      const commandData = insertCustomCommandSchema.parse({
        ...req.body,
        serverId: req.params.serverId,
      });
      const command = await storage.createCustomCommand(commandData);
      res.json(command);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid command data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create command" });
    }
  });

  app.delete("/api/commands/:commandId", async (req, res) => {
    try {
      const success = await storage.deleteCustomCommand(req.params.commandId);
      if (!success) {
        return res.status(404).json({ message: "Command not found" });
      }
      res.json({ message: "Command deleted successfully" });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete command" });
    }
  });

  // Moderation logs
  app.get("/api/servers/:serverId/moderation-logs", async (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
      const logs = await storage.getModerationLogs(req.params.serverId, limit);
      res.json(logs);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch moderation logs" });
    }
  });

  // User warnings
  app.get("/api/servers/:serverId/users/:userId/warnings", async (req, res) => {
    try {
      const warnings = await storage.getUserWarnings(req.params.serverId, req.params.userId);
      res.json(warnings);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch warnings" });
    }
  });

  // Music queue
  app.get("/api/servers/:serverId/music/queue", async (req, res) => {
    try {
      const queue = await storage.getMusicQueue(req.params.serverId);
      res.json(queue);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch music queue" });
    }
  });

  app.delete("/api/servers/:serverId/music/queue", async (req, res) => {
    try {
      await storage.clearMusicQueue(req.params.serverId);
      res.json({ message: "Music queue cleared successfully" });
    } catch (error) {
      res.status(500).json({ message: "Failed to clear music queue" });
    }
  });

  // Bot stats
  app.get("/api/servers/:serverId/stats", async (req, res) => {
    try {
      const stats = await storage.getBotStats(req.params.serverId);
      if (!stats) {
        // Initialize stats if they don't exist
        const newStats = await storage.updateBotStats(req.params.serverId, {
          commandsUsed: 0,
          moderationActions: 0,
          songsPlayed: 0,
          activeMembers: 0,
        });
        return res.json(newStats);
      }
      res.json(stats);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch bot stats" });
    }
  });

  // Recent activity (combines moderation logs and other events)
  app.get("/api/servers/:serverId/activity", async (req, res) => {
    try {
      const moderationLogs = await storage.getModerationLogs(req.params.serverId, 10);
      
      // Transform logs into activity format
      const activities = moderationLogs.map(log => ({
        id: log.id,
        type: log.action,
        description: `${log.moderatorUsername} ${log.action}ed ${log.targetUsername}`,
        reason: log.reason,
        timestamp: log.timestamp,
        icon: log.action === 'kick' ? 'user-times' : 
              log.action === 'ban' ? 'ban' :
              log.action === 'warn' ? 'exclamation-triangle' : 'shield-alt',
        color: log.action === 'warn' ? '#FEE75C' : '#ED4245',
      }));

      res.json(activities);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch recent activity" });
    }
  });

  // Guild info from Discord API
  app.get("/api/discord/guilds/:guildId", async (req, res) => {
    try {
      const client = discordBot.getClient();
      const guild = client.guilds.cache.get(req.params.guildId);
      
      if (!guild) {
        return res.status(404).json({ message: "Guild not found or bot not in guild" });
      }

      res.json({
        id: guild.id,
        name: guild.name,
        memberCount: guild.memberCount,
        iconURL: guild.iconURL(),
        ownerID: guild.ownerId,
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch guild info" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
