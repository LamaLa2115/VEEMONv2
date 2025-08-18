import { Card, CardContent } from "@/components/ui/card";
import { Users, Terminal, Shield, Music } from "lucide-react";
import type { BotStats } from "@shared/schema";

interface StatusCardsProps {
  serverId: string;
  stats?: BotStats;
}

export function StatusCards({ serverId, stats }: StatusCardsProps) {
  const cards = [
    {
      title: "Active Members",
      value: stats?.activeMembers || 0,
      change: "+12%",
      changeType: "positive",
      icon: Users,
      color: "discord-blurple"
    },
    {
      title: "Commands Used",
      value: stats?.commandsUsed || 0,
      change: "+8%",
      changeType: "positive",
      icon: Terminal,
      color: "discord-green"
    },
    {
      title: "Moderation Actions",
      value: stats?.moderationActions || 0,
      change: "-3%",
      changeType: "negative",
      icon: Shield,
      color: "discord-pink"
    },
    {
      title: "Songs Played",
      value: stats?.songsPlayed || 0,
      change: "+15%",
      changeType: "positive",
      icon: Music,
      color: "discord-yellow"
    }
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <Card key={card.title} className="bg-discord-secondary border discord-border">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className={`p-3 rounded-lg ${
                  card.color === 'discord-blurple' ? 'bg-discord-blurple' :
                  card.color === 'discord-green' ? 'bg-discord-green' :
                  card.color === 'discord-pink' ? 'bg-discord-pink' :
                  'bg-discord-yellow'
                }`}>
                  <Icon className={`text-xl ${
                    card.color === 'discord-green' || card.color === 'discord-yellow' 
                      ? 'text-discord-dark' 
                      : 'text-discord-white'
                  }`} />
                </div>
                <span className={`text-sm font-medium ${
                  card.changeType === 'positive' 
                    ? 'discord-text-green' 
                    : 'discord-text-red'
                }`}>
                  {card.change}
                </span>
              </div>
              <h3 className="text-2xl font-bold discord-text-white mb-1">
                {card.value.toLocaleString()}
              </h3>
              <p className="discord-text-muted text-sm">{card.title}</p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
