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
  Zap 
} from "lucide-react";
import { useState } from "react";

interface QuickActionsProps {
  serverId: string;
}

export function QuickActions({ serverId }: QuickActionsProps) {
  const [announcement, setAnnouncement] = useState("");

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

        {/* Quick Announcement */}
        <div className="space-y-2">
          <Label className="text-sm discord-text-white">Send Announcement</Label>
          <div className="flex space-x-2">
            <Input
              type="text"
              placeholder="Type announcement..."
              value={announcement}
              onChange={(e) => setAnnouncement(e.target.value)}
              className="bg-discord-tertiary text-discord-white border discord-border text-sm"
              onKeyPress={(e) => e.key === 'Enter' && handleAnnouncement()}
            />
            <Button
              onClick={handleAnnouncement}
              size="sm"
              className="bg-discord-green hover:bg-green-500 text-discord-dark"
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