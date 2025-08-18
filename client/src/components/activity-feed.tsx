import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UserPlus, Music, Ban, Gamepad2, Clock } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface ActivityFeedProps {
  serverId: string;
}

export function ActivityFeed({ serverId }: ActivityFeedProps) {
  const { data: activities } = useQuery<any[]>({
    queryKey: ['/api/servers', serverId, 'activity'],
  });

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'kick':
      case 'ban':
        return Ban;
      case 'warn':
        return Ban;
      case 'join':
        return UserPlus;
      case 'music':
        return Music;
      case 'game':
        return Gamepad2;
      default:
        return Clock;
    }
  };

  const getActivityColor = (type: string) => {
    switch (type) {
      case 'kick':
      case 'ban':
        return 'bg-discord-red';
      case 'warn':
        return 'bg-discord-yellow';
      case 'join':
        return 'bg-discord-green';
      case 'music':
        return 'bg-discord-blurple';
      case 'game':
        return 'bg-discord-yellow';
      default:
        return 'bg-discord-tertiary';
    }
  };

  return (
    <Card className="bg-discord-secondary border discord-border">
      <CardHeader className="border-b discord-border">
        <CardTitle className="text-lg font-semibold discord-text-white flex items-center">
          <Clock className="mr-3" />
          Recent Activity
        </CardTitle>
      </CardHeader>
      <CardContent className="p-6">
        <div className="space-y-4">
          {activities && activities.length > 0 ? (
            activities.map((activity: any) => {
              const Icon = getActivityIcon(activity.type);
              const colorClass = getActivityColor(activity.type);
              
              return (
                <div key={activity.id} className="flex items-start space-x-4 p-4 bg-discord-dark rounded-lg">
                  <div className={`w-8 h-8 ${colorClass} rounded-full flex items-center justify-center flex-shrink-0`}>
                    <Icon className={`text-xs ${
                      activity.type === 'warn' || activity.type === 'game' 
                        ? 'text-discord-dark' 
                        : 'text-discord-white'
                    }`} />
                  </div>
                  <div className="flex-1">
                    <p className="discord-text-white font-medium">
                      {activity.description}
                    </p>
                    {activity.reason && (
                      <p className="discord-text-muted text-sm mt-1">
                        Reason: {activity.reason}
                      </p>
                    )}
                    <p className="discord-text-muted text-sm">
                      {formatDistanceToNow(new Date(activity.timestamp), { addSuffix: true })}
                    </p>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="text-center py-8">
              <Clock className="mx-auto h-12 w-12 discord-text-muted mb-4" />
              <p className="discord-text-muted">No recent activity to display</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
