import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Music, Play, Pause, SkipBack, SkipForward, Volume2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

interface MusicPlayerProps {
  serverId: string;
}

export function MusicPlayer({ serverId }: MusicPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const queryClient = useQueryClient();

  const { data: musicQueue } = useQuery<any[]>({
    queryKey: ['/api/servers', serverId, 'music/queue'],
  });

  const clearQueueMutation = useMutation({
    mutationFn: () => apiRequest('DELETE', `/api/servers/${serverId}/music/queue`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/servers', serverId, 'music/queue'] });
    },
  });

  const currentTrack = musicQueue && musicQueue.length > 0 ? musicQueue[0] : null;

  const handlePlayPause = () => {
    setIsPlaying(!isPlaying);
    // In a real implementation, this would control actual playback
  };

  const handleClearQueue = () => {
    clearQueueMutation.mutate();
  };

  return (
    <Card className="bg-discord-secondary border discord-border">
      <CardHeader className="border-b discord-border">
        <CardTitle className="text-lg font-semibold discord-text-white flex items-center">
          <Music className="mr-3" />
          Music Player
        </CardTitle>
      </CardHeader>
      <CardContent className="p-6">
        {currentTrack ? (
          <>
            <div className="text-center mb-4">
              {/* Album artwork placeholder */}
              <div className="w-20 h-20 bg-discord-tertiary rounded-lg mx-auto mb-3 flex items-center justify-center">
                <Music className="text-2xl discord-text-muted" />
              </div>
              <h4 className="discord-text-white font-medium text-sm mb-1">
                {currentTrack.title}
              </h4>
              <p className="discord-text-muted text-xs">
                {currentTrack.artist || 'Unknown Artist'}
              </p>
              <p className="discord-text-muted text-xs mt-1">
                Requested by {currentTrack.requestedByUsername}
              </p>
            </div>
            
            {/* Progress Bar */}
            <div className="mb-4">
              <div className="w-full bg-discord-tertiary rounded-full h-2">
                <div className="bg-discord-blurple h-2 rounded-full" style={{ width: '35%' }}></div>
              </div>
              <div className="flex justify-between text-xs discord-text-muted mt-1">
                <span>1:24</span>
                <span>{currentTrack.duration || '0:00'}</span>
              </div>
            </div>

            {/* Controls */}
            <div className="flex justify-center space-x-4 mb-4">
              <Button size="sm" variant="outline" className="w-8 h-8 p-0 bg-discord-tertiary hover:bg-discord-blurple border-discord-tertiary">
                <SkipBack className="h-4 w-4" />
              </Button>
              <Button 
                size="sm" 
                onClick={handlePlayPause}
                className="w-10 h-10 p-0 bg-discord-blurple hover:bg-blue-500"
              >
                {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              </Button>
              <Button size="sm" variant="outline" className="w-8 h-8 p-0 bg-discord-tertiary hover:bg-discord-blurple border-discord-tertiary">
                <SkipForward className="h-4 w-4" />
              </Button>
            </div>

            {/* Queue Info */}
            {musicQueue && musicQueue.length > 1 && (
              <div className="text-center mb-4">
                <p className="discord-text-muted text-xs">
                  {musicQueue.length - 1} more song{musicQueue.length > 2 ? 's' : ''} in queue
                </p>
              </div>
            )}

            {/* Clear Queue Button */}
            <Button 
              onClick={handleClearQueue}
              disabled={clearQueueMutation.isPending}
              variant="destructive" 
              size="sm" 
              className="w-full"
            >
              {clearQueueMutation.isPending ? 'Clearing...' : 'Clear Queue'}
            </Button>
          </>
        ) : (
          <div className="text-center py-8">
            <Music className="mx-auto h-12 w-12 discord-text-muted mb-4" />
            <p className="discord-text-muted mb-2">No music playing</p>
            <p className="discord-text-muted text-xs">
              Use music commands in Discord to start playing
            </p>
          </div>
        )}

        {/* Last.fm Integration Status */}
        <div className="mt-4 p-3 bg-discord-dark rounded-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className="w-4 h-4 bg-red-600 rounded-sm"></div>
              <span className="text-xs discord-text-muted">Last.fm Connected</span>
            </div>
            <div className="w-2 h-2 bg-discord-green rounded-full"></div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
