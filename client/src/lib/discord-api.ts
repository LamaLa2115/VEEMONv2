import { apiRequest } from "./queryClient";

export interface DiscordGuild {
  id: string;
  name: string;
  memberCount: number;
  iconURL?: string;
  ownerID: string;
}

export interface BotStatus {
  status: 'online' | 'offline';
  uptime: number;
  guilds: number;
  users: number;
}

export const discordApi = {
  getBotStatus: async (): Promise<BotStatus> => {
    const response = await apiRequest('GET', '/api/bot/status');
    return response.json();
  },

  getGuildInfo: async (guildId: string): Promise<DiscordGuild> => {
    const response = await apiRequest('GET', `/api/discord/guilds/${guildId}`);
    return response.json();
  },

  restartBot: async (): Promise<void> => {
    await apiRequest('POST', '/api/bot/restart');
  },
};
