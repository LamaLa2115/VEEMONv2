import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, MessageSquare, Shield, Music } from "lucide-react";
import type { BotStats } from "@shared/schema";

interface StatusCardsProps {
  serverId: string;
  stats?: BotStats;
}

export function StatusCards({ serverId, stats }: StatusCardsProps) {
  const statusData = [
    {
      title: "Commands Used",
      value: stats?.commandsUsed || 0,
      icon: MessageSquare,
      color: "text-blue-400"
    },
    {
      title: "Moderation Actions",
      value: stats?.moderationActions || 0,
      icon: Shield,
      color: "text-red-400"
    },
    {
      title: "Songs Played",
      value: stats?.songsPlayed || 0,
      icon: Music,
      color: "text-green-400"
    },
    {
      title: "Active Members",
      value: stats?.activeMembers || 0,
      icon: Users,
      color: "text-purple-400"
    }
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      {statusData.map((item, index) => (
        <Card key={index} className="bg-discord-secondary border discord-border">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium discord-text-muted">
              {item.title}
            </CardTitle>
            <item.icon className={`h-4 w-4 ${item.color}`} />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold discord-text-white">
              {item.value.toLocaleString()}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}