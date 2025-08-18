import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Activity, Shield, Music, User } from "lucide-react";
import type { ModerationLog } from "@shared/schema";

interface ActivityFeedProps {
  serverId: string;
}

export function ActivityFeed({ serverId }: ActivityFeedProps) {
  const { data: moderationLogs, isLoading } = useQuery<ModerationLog[]>({
    queryKey: ['/api/servers', serverId, 'moderation-logs'],
  });

  const getActionIcon = (action: string) => {
    switch (action) {
      case 'ban':
      case 'kick':
      case 'mute':
        return <Shield className="h-4 w-4 text-red-400" />;
      case 'warn':
        return <User className="h-4 w-4 text-yellow-400" />;
      default:
        return <Activity className="h-4 w-4 text-blue-400" />;
    }
  };

  const getActionColor = (action: string) => {
    switch (action) {
      case 'ban':
        return 'bg-red-600/20 text-red-400 border-red-600/30';
      case 'kick':
        return 'bg-orange-600/20 text-orange-400 border-orange-600/30';
      case 'mute':
        return 'bg-yellow-600/20 text-yellow-400 border-yellow-600/30';
      case 'warn':
        return 'bg-blue-600/20 text-blue-400 border-blue-600/30';
      default:
        return 'bg-gray-600/20 text-gray-400 border-gray-600/30';
    }
  };

  if (isLoading) {
    return (
      <Card className="bg-discord-secondary border discord-border">
        <CardHeader>
          <CardTitle className="text-lg font-semibold discord-text-white flex items-center">
            <Activity className="mr-3 h-5 w-5" />
            Recent Activity
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm discord-text-muted">Loading activity...</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-discord-secondary border discord-border">
      <CardHeader className="border-b discord-border">
        <CardTitle className="text-lg font-semibold discord-text-white flex items-center">
          <Activity className="mr-3 h-5 w-5" />
          Recent Activity
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="h-80">
          {moderationLogs && moderationLogs.length > 0 ? (
            <div className="p-4 space-y-4">
              {moderationLogs.slice(0, 10).map((log, index) => (
                <div key={log.id || index} className="flex items-start space-x-3 p-3 rounded-lg bg-discord-tertiary">
                  {getActionIcon(log.action)}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge className={getActionColor(log.action)}>
                        {log.action.toUpperCase()}
                      </Badge>
                      <span className="text-xs discord-text-muted">
                        {log.timestamp ? new Date(log.timestamp).toLocaleString() : 'Recently'}
                      </span>
                    </div>
                    <p className="text-sm discord-text-white">
                      <span className="font-medium">{log.moderatorUsername}</span> {log.action}ed{' '}
                      <span className="font-medium">{log.targetUsername}</span>
                    </p>
                    {log.reason && (
                      <p className="text-xs discord-text-muted mt-1">
                        Reason: {log.reason}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-4 text-sm discord-text-muted text-center">
              No recent activity to display
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}