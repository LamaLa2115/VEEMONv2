import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  Settings, 
  Shield, 
  Volume2, 
  MessageSquare, 
  Users, 
  Zap,
  RefreshCw 
} from "lucide-react";
import { useState } from "react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface QuickActionsProps {
  serverId: string;
}

export function QuickActions({ serverId }: QuickActionsProps) {
  const [announcement, setAnnouncement] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const { toast } = useToast();

  const quickActions = [
    {
      title: "Server Settings",
      icon: Settings,
      action: () => console.log("Open server settings"),
      color: "bg-discord-blurple hover:bg-blue-600"
    },
    {
      title: "Moderation",
      icon: Shield,
      action: () => console.log("Open moderation panel"),
      color: "bg-red-600 hover:bg-red-700"
    },
    {
      title: "Music Controls",
      icon: Volume2,
      action: () => console.log("Open music controls"),
      color: "bg-green-600 hover:bg-green-700"
    },
    {
      title: "Member Management",
      icon: Users,
      action: () => console.log("Open member management"),
      color: "bg-purple-600 hover:bg-purple-700"
    }
  ];

  const handleAnnouncement = () => {
    if (announcement.trim()) {
      console.log("Sending announcement:", announcement);
      setAnnouncement("");
    }
  };

  const refreshSlashCommands = async () => {
    setIsRefreshing(true);
    try {
      const response = await fetch('/api/bot/refresh-commands', {
        method: 'POST'
      });
      const data = await response.json();
      
      if (response.ok) {
        toast({
          title: "Commands Refreshed",
          description: `Successfully refreshed ${data.commandCount} commands`,
        });
      } else {
        throw new Error(data.message || 'Failed to refresh commands');
      }
    } catch (error) {
      toast({
        title: "Refresh Failed",
        description: "Failed to refresh slash commands. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <Card className="bg-discord-secondary border discord-border">
      <CardHeader className="border-b discord-border">
        <CardTitle className="text-lg font-semibold discord-text-white flex items-center">
          <Zap className="mr-3 h-5 w-5" />
          Quick Actions
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 space-y-4">
        {/* Quick Action Buttons */}
        <div className="grid grid-cols-2 gap-3">
          {quickActions.map((action, index) => (
            <Button
              key={index}
              onClick={action.action}
              className={`${action.color} text-white text-xs p-3 h-auto flex flex-col items-center space-y-1`}
            >
              <action.icon className="h-4 w-4" />
              <span className="text-center leading-tight">{action.title}</span>
            </Button>
          ))}
        </div>

        {/* Slash Commands Refresh */}
        <div className="border-t discord-border pt-4">
          <Button
            onClick={refreshSlashCommands}
            disabled={isRefreshing}
            className="w-full bg-orange-600 hover:bg-orange-700 text-white text-sm"
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            {isRefreshing ? 'Refreshing...' : 'Refresh Slash Commands'}
          </Button>
          <p className="text-xs discord-text-muted mt-2 text-center">
            Use this if slash commands aren't showing up in Discord
          </p>
        </div>

        {/* Quick Announcement */}
        <div className="border-t discord-border pt-4">
          <Label htmlFor="announcement" className="text-sm discord-text-white">
            Quick Announcement
          </Label>
          <div className="flex mt-2 space-x-2">
            <Input
              id="announcement"
              placeholder="Type your message..."
              value={announcement}
              onChange={(e) => setAnnouncement(e.target.value)}
              className="flex-1 discord-input"
              onKeyPress={(e) => e.key === 'Enter' && handleAnnouncement()}
            />
            <Button 
              onClick={handleAnnouncement}
              disabled={!announcement.trim()}
              className="bg-discord-blurple hover:bg-blue-600 text-white"
            >
              <MessageSquare className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* System Status */}
        <div className="pt-2 border-t discord-border">
          <div className="flex items-center justify-between text-xs">
            <span className="discord-text-muted">System Status</span>
            <span className="text-green-400 flex items-center">
              <div className="w-2 h-2 bg-green-400 rounded-full mr-1"></div>
              Online
            </span>
          </div>
          <div className="flex items-center justify-between text-xs mt-1">
            <span className="discord-text-muted">Last Updated</span>
            <span className="discord-text-muted">Just now</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}