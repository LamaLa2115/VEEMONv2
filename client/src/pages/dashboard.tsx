import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Sidebar } from "@/components/sidebar";
import { StatusCards } from "@/components/status-cards";
import { ActivityFeed } from "@/components/activity-feed";
import { MusicPlayer } from "@/components/music-player";
import { QuickActions } from "@/components/quick-actions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Search, RefreshCw } from "lucide-react";
import { useBotStatus } from "@/hooks/use-bot-status";
import type { BotStats } from "@shared/schema";

export default function Dashboard() {
  const { data: botStatus } = useBotStatus();

  // Fetch guilds the bot is in and allow selection
  const { data: guilds } = useQuery<Array<{ id: string; name: string }>>({
    queryKey: ["/api/discord/guilds"],
  });
  const [serverId, setServerId] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!serverId && guilds && guilds.length > 0) {
      setServerId(guilds[0].id);
    }
  }, [guilds, serverId]);
  
  const { data: serverStats } = useQuery<BotStats>({
    queryKey: ['/api/servers', serverId, 'stats'],
    enabled: !!serverId,
  });

  const { data: serverInfo } = useQuery({
    queryKey: ['/api/discord/guilds', serverId],
    enabled: !!serverId,
  });

  const handleRestartBot = async () => {
    // In a real implementation, this would restart the bot
    console.log('Restarting bot...');
  };

  return (
    <div className="flex min-h-screen bg-discord-dark text-discord-white">
      <Sidebar />
      
      {/* Main Content */}
      <main className="flex-1 flex flex-col">
        {/* Top Header Bar */}
        <header className="bg-discord-secondary border-b discord-border px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold discord-text-white">Dashboard Overview</h2>
              <p className="text-sm discord-text-muted">Monitor and manage your Discord bot</p>
            </div>
            
            <div className="flex items-center space-x-4">
              {/* Guild Selector */}
              <select
                className="bg-discord-tertiary text-discord-white border discord-border rounded-lg px-3 py-2 text-sm"
                value={serverId || ''}
                onChange={(e) => setServerId(e.target.value)}
              >
                {(guilds || []).map((g) => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
                {(!guilds || guilds.length === 0) && (
                  <option value="">No guilds</option>
                )}
              </select>
              {/* Search Bar */}
              <div className="relative">
                <Input
                  type="text"
                  placeholder="Search commands..."
                  className="bg-discord-tertiary text-discord-white placeholder-discord-text pl-10 rounded-lg focus:ring-2 focus:ring-discord-blurple w-64"
                />
                <Search className="absolute left-3 top-3 h-4 w-4 discord-text-muted" />
              </div>
              
              {/* Quick Actions */}
              <Button 
                onClick={handleRestartBot}
                className="bg-discord-green hover:bg-green-500 text-discord-dark font-medium"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Restart Bot
              </Button>
            </div>
          </div>
        </header>

        {/* Dashboard Content */}
        <div className="flex-1 p-6 overflow-y-auto">
          {/* Status Cards Row */}
          {serverId ? (
            <StatusCards serverId={serverId} stats={serverStats} />
          ) : (
            <div className="text-sm discord-text-muted">Select a server to view stats.</div>
          )}

          {/* Main Content Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mt-8">
            {/* Recent Activity Panel */}
            <div className="lg:col-span-2">
              {serverId && <ActivityFeed serverId={serverId} />}
            </div>

            {/* Quick Controls Panel */}
            <div className="space-y-6">
              {/* Music Player Widget */}
              {serverId && <MusicPlayer serverId={serverId} />}
              
              {/* Quick Actions */}
              {serverId && <QuickActions serverId={serverId} />}
            </div>
          </div>

          {/* Command Usage Chart */}
          <Card className="mt-8 bg-discord-secondary border discord-border">
            <CardHeader className="border-b discord-border">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg font-semibold discord-text-white flex items-center">
                  <i className="fas fa-chart-bar mr-3"></i>
                  Command Usage Analytics
                </CardTitle>
                <select className="bg-discord-tertiary text-discord-white border discord-border rounded-lg px-3 py-1 text-sm">
                  <option>Last 7 days</option>
                  <option>Last 30 days</option>
                  <option>Last 90 days</option>
                </select>
              </div>
            </CardHeader>
            <CardContent className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="text-center">
                  <div className="text-2xl font-bold discord-text-blurple mb-2">
                    {serverStats?.moderationActions || 0}
                  </div>
                  <div className="text-sm discord-text-muted">Moderation Commands</div>
                  <div className="w-full bg-discord-tertiary rounded-full h-2 mt-2">
                    <div 
                      className="bg-discord-blurple h-2 rounded-full" 
                      style={{ width: `${Math.min((serverStats?.moderationActions || 0) / 10 * 100, 100)}%` }}
                    ></div>
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold discord-text-green mb-2">
                    {serverStats?.songsPlayed || 0}
                  </div>
                  <div className="text-sm discord-text-muted">Music Commands</div>
                  <div className="w-full bg-discord-tertiary rounded-full h-2 mt-2">
                    <div 
                      className="bg-discord-green h-2 rounded-full" 
                      style={{ width: `${Math.min((serverStats?.songsPlayed || 0) / 10 * 100, 100)}%` }}
                    ></div>
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold discord-text-yellow mb-2">
                    {serverStats?.commandsUsed || 0}
                  </div>
                  <div className="text-sm discord-text-muted">Total Commands</div>
                  <div className="w-full bg-discord-tertiary rounded-full h-2 mt-2">
                    <div 
                      className="bg-discord-yellow h-2 rounded-full" 
                      style={{ width: `${Math.min((serverStats?.commandsUsed || 0) / 50 * 100, 100)}%` }}
                    ></div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
