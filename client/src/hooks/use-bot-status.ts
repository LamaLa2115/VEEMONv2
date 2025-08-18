import { useQuery } from "@tanstack/react-query";
import { discordApi } from "@/lib/discord-api";

export function useBotStatus() {
  return useQuery({
    queryKey: ['/api/bot/status'],
    queryFn: discordApi.getBotStatus,
    refetchInterval: 30000, // Refetch every 30 seconds
  });
}
