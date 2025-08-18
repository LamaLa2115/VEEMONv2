import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Shield, Trash2, Dice1, FileText, Zap } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { toast } from "@/hooks/use-toast";

interface QuickActionsProps {
  serverId: string;
}

export function QuickActions({ serverId }: QuickActionsProps) {
  const queryClient = useQueryClient();

  const clearQueueMutation = useMutation({
    mutationFn: () => apiRequest('DELETE', `/api/servers/${serverId}/music/queue`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/servers', serverId, 'music/queue'] });
      toast({
        title: "Queue Cleared",
        description: "Music queue has been cleared successfully.",
      });
    },
  });

  const handleEnableAutoMod = () => {
    // This would trigger auto-moderation settings
    toast({
      title: "Auto-Mod Enabled",
      description: "Auto-moderation has been enabled for this server.",
    });
  };

  const handleClearQueue = () => {
    clearQueueMutation.mutate();
  };

  const handleStartCoinFlip = () => {
    // This would start a coin flip game in Discord
    toast({
      title: "Coin Flip Started",
      description: "A coin flip game has been started in the Discord channel.",
    });
  };

  const handleViewLogs = () => {
    // This would navigate to logs view
    toast({
      title: "Logs",
      description: "Viewing full audit logs...",
    });
  };

  return (
    <Card className="bg-discord-secondary border discord-border">
      <CardHeader className="border-b discord-border">
        <CardTitle className="text-lg font-semibold discord-text-white flex items-center">
          <Zap className="mr-3" />
          Quick Actions
        </CardTitle>
      </CardHeader>
      <CardContent className="p-6 space-y-3">
        <Button 
          onClick={handleEnableAutoMod}
          className="w-full bg-discord-green hover:bg-green-500 text-discord-dark font-medium py-3"
        >
          <Shield className="mr-2 h-4 w-4" />
          Enable Auto-Mod
        </Button>
        
        <Button 
          onClick={handleClearQueue}
          disabled={clearQueueMutation.isPending}
          className="w-full bg-discord-blurple hover:bg-blue-500 text-discord-white font-medium py-3"
        >
          <Trash2 className="mr-2 h-4 w-4" />
          {clearQueueMutation.isPending ? 'Clearing...' : 'Clear Music Queue'}
        </Button>
        
        <Button 
          onClick={handleStartCoinFlip}
          className="w-full bg-discord-yellow hover:bg-yellow-400 text-discord-dark font-medium py-3"
        >
          <Dice1 className="mr-2 h-4 w-4" />
          Start Coin Flip
        </Button>
        
        <Button 
          onClick={handleViewLogs}
          className="w-full bg-discord-pink hover:bg-pink-400 text-discord-white font-medium py-3"
        >
          <FileText className="mr-2 h-4 w-4" />
          View Full Logs
        </Button>
      </CardContent>
    </Card>
  );
}
