// Shared types between server and client
// Keep in sync with server/schema.ts botStats table shape

export interface BotStats {
  id: string;
  serverId: string;
  commandsUsed: number;
  moderationActions: number;
  songsPlayed: number;
  activeMembers: number;
  lastUpdated: string | null; // ISO timestamp string or null
}
