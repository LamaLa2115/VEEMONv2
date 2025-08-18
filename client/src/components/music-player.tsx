import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Play, Pause, SkipForward, Volume2, Music } from "lucide-react";
import type { MusicQueueItem } from "@shared/schema";

interface MusicPlayerProps {
  serverId: string;
}

export function MusicPlayer({ serverId }: MusicPlayerProps) {
  const { data: queue, isLoading } = useQuery<MusicQueueItem[]>({
    queryKey: ['/api/servers', serverId, 'music-queue'],
  });

  const currentSong = queue && queue.length > 0 ? queue[0] : null;

  return (
    <Card className="bg-discord-secondary border discord-border">
      <CardHeader className="border-b discord-border">
        <CardTitle className="text-lg font-semibold discord-text-white flex items-center">
          <Music className="mr-3 h-5 w-5" />
          Music Player
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4">
        {isLoading ? (
          <div className="text-sm discord-text-muted">Loading music queue...</div>
        ) : currentSong ? (
          <div className="space-y-4">
            {/* Current Song */}
            <div className="text-center">
              <h3 className="font-semibold discord-text-white truncate">
                {currentSong.title}
              </h3>
              {currentSong.artist && (
                <p className="text-sm discord-text-muted truncate">
                  {currentSong.artist}
                </p>
              )}
              <p className="text-xs discord-text-muted mt-1">
                Requested by {currentSong.requestedByUsername}
              </p>
            </div>

            {/* Progress Bar */}
            <div className="space-y-2">
              <Progress value={33} className="h-2" />
              <div className="flex justify-between text-xs discord-text-muted">
                <span>1:23</span>
                <span>{currentSong.duration || '3:45'}</span>
              </div>
            </div>

            {/* Controls */}
            <div className="flex items-center justify-center space-x-4">
              <Button
                size="sm"
                variant="ghost"
                className="discord-text-muted hover:discord-text-white"
              >
                <Pause className="h-4 w-4" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="discord-text-muted hover:discord-text-white"
              >
                <SkipForward className="h-4 w-4" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="discord-text-muted hover:discord-text-white"
              >
                <Volume2 className="h-4 w-4" />
              </Button>
            </div>

            {/* Queue */}
            {queue && queue.length > 1 && (
              <div>
                <h4 className="text-sm font-medium discord-text-white mb-2">
                  Up Next ({queue.length - 1})
                </h4>
                <ScrollArea className="h-32">
                  <div className="space-y-2">
                    {queue.slice(1, 4).map((song, index) => (
                      <div key={song.id} className="flex items-center space-x-2 text-xs">
                        <span className="discord-text-muted">{index + 2}.</span>
                        <div className="flex-1 min-w-0">
                          <p className="discord-text-white truncate">{song.title}</p>
                          {song.artist && (
                            <p className="discord-text-muted truncate">{song.artist}</p>
                          )}
                        </div>
                      </div>
                    ))}
                    {queue.length > 4 && (
                      <p className="text-xs discord-text-muted">
                        ...and {queue.length - 4} more
                      </p>
                    )}
                  </div>
                </ScrollArea>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center text-sm discord-text-muted py-8">
            <Music className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>No music currently playing</p>
            <p className="text-xs mt-1">Queue up some tracks to get started!</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}