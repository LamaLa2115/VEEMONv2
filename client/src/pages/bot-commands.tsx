import { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Music, Shield, Gamepad2, Brain, Cloud, Newspaper, 
  User, Settings, Coffee, Dice6, Search, Zap,
  Volume2, SkipForward, Pause, Play, VolumeX,
  Ban, AlertTriangle, MessageCircle, Users,
  Plus, Minus, Crown, Info, UserPlus, UserMinus
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface CommandButtonProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  category: string;
  requiresInput?: boolean;
  inputs?: { name: string; placeholder: string; required?: boolean }[];
  onExecute: (inputs?: Record<string, string>) => void;
}

function CommandButton({ icon, title, description, category, requiresInput, inputs, onExecute }: CommandButtonProps) {
  const [showInputs, setShowInputs] = useState(false);
  const [inputValues, setInputValues] = useState<Record<string, string>>({});

  const handleExecute = () => {
    if (requiresInput && inputs) {
      if (!showInputs) {
        setShowInputs(true);
        return;
      }
      onExecute(inputValues);
      setShowInputs(false);
      setInputValues({});
    } else {
      onExecute();
    }
  };

  return (
    <Card className="h-full transition-all hover:shadow-lg hover:scale-105" data-testid={`command-${title.toLowerCase().replace(/\s+/g, '-')}`}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          {icon}
          {title}
          <Badge variant="outline" className="ml-auto text-xs">
            {category}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">{description}</p>
        
        {showInputs && inputs && (
          <div className="space-y-2">
            {inputs.map((input) => (
              <div key={input.name} className="space-y-1">
                <Label htmlFor={input.name} className="text-xs">
                  {input.name} {input.required && <span className="text-red-500">*</span>}
                </Label>
                <Input
                  id={input.name}
                  placeholder={input.placeholder}
                  value={inputValues[input.name] || ''}
                  onChange={(e) => setInputValues(prev => ({...prev, [input.name]: e.target.value}))}
                  className="h-8"
                  data-testid={`input-${input.name.toLowerCase().replace(/\s+/g, '-')}`}
                />
              </div>
            ))}
          </div>
        )}
        
        <Button 
          onClick={handleExecute}
          className="w-full"
          size="sm"
          data-testid={`button-execute-${title.toLowerCase().replace(/\s+/g, '-')}`}
        >
          {showInputs ? 'Execute' : 'Run Command'}
        </Button>
      </CardContent>
    </Card>
  );
}

export default function BotCommands() {
  const { toast } = useToast();

  const executeCommand = async (commandName: string, inputs?: Record<string, string>) => {
    try {
      // This would execute the Discord command through the API
      const response = await fetch('/api/bot/execute-command', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ command: commandName, parameters: inputs })
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const result = await response.json();
      
      toast({
        title: "Command Executed",
        description: `Successfully executed /${commandName}`,
      });
    } catch (error: any) {
      toast({
        title: "Command Failed",
        description: error.message || "Failed to execute command",
        variant: "destructive",
      });
    }
  };

  const musicCommands = [
    {
      icon: <Play className="w-5 h-5" />,
      title: "Play Music",
      description: "Play music from YouTube, Spotify, or SoundCloud",
      category: "Music",
      requiresInput: true,
      inputs: [{ name: "query", placeholder: "Song name or URL", required: true }],
      onExecute: (inputs?: Record<string, string>) => executeCommand('music play', inputs)
    },
    {
      icon: <Volume2 className="w-5 h-5" />,
      title: "Volume",
      description: "Set playback volume (0-100)",
      category: "Music",
      requiresInput: true,
      inputs: [{ name: "level", placeholder: "Volume level (0-100)", required: true }],
      onExecute: (inputs?: Record<string, string>) => executeCommand('music volume', inputs)
    },
    {
      icon: <SkipForward className="w-5 h-5" />,
      title: "Skip",
      description: "Skip the current song",
      category: "Music",
      onExecute: () => executeCommand('music skip')
    },
    {
      icon: <Pause className="w-5 h-5" />,
      title: "Pause",
      description: "Pause the current song",
      category: "Music",
      onExecute: () => executeCommand('music pause')
    },
    {
      icon: <VolumeX className="w-5 h-5" />,
      title: "Stop",
      description: "Stop playing and leave voice channel",
      category: "Music",
      onExecute: () => executeCommand('music stop')
    },
    {
      icon: <Music className="w-5 h-5" />,
      title: "Now Playing",
      description: "Show currently playing song",
      category: "Music",
      onExecute: () => executeCommand('music nowplaying')
    }
  ];

  const moderationCommands = [
    {
      icon: <Ban className="w-5 h-5" />,
      title: "Ban User",
      description: "Ban a user from the server",
      category: "Moderation",
      requiresInput: true,
      inputs: [
        { name: "user", placeholder: "@username or ID", required: true },
        { name: "reason", placeholder: "Reason for ban", required: false }
      ],
      onExecute: (inputs?: Record<string, string>) => executeCommand('mod ban', inputs)
    },
    {
      icon: <AlertTriangle className="w-5 h-5" />,
      title: "Warn User",
      description: "Issue a warning to a user",
      category: "Moderation",
      requiresInput: true,
      inputs: [
        { name: "user", placeholder: "@username or ID", required: true },
        { name: "reason", placeholder: "Warning reason", required: true }
      ],
      onExecute: (inputs?: Record<string, string>) => executeCommand('warn', inputs)
    },
    {
      icon: <MessageCircle className="w-5 h-5" />,
      title: "Clear Messages",
      description: "Delete multiple messages from a channel",
      category: "Moderation",
      requiresInput: true,
      inputs: [
        { name: "amount", placeholder: "Number of messages (1-100)", required: true }
      ],
      onExecute: (inputs?: Record<string, string>) => executeCommand('clear', inputs)
    },
    {
      icon: <Shield className="w-5 h-5" />,
      title: "Timeout User",
      description: "Temporarily mute a user",
      category: "Moderation",
      requiresInput: true,
      inputs: [
        { name: "user", placeholder: "@username or ID", required: true },
        { name: "duration", placeholder: "Duration (e.g., 1h, 30m)", required: true },
        { name: "reason", placeholder: "Timeout reason", required: false }
      ],
      onExecute: (inputs?: Record<string, string>) => executeCommand('timeout', inputs)
    }
  ];

  const roleCommands = [
    {
      icon: <UserPlus className="w-5 h-5" />,
      title: "Add Role",
      description: "Add a role to a user",
      category: "Roles",
      requiresInput: true,
      inputs: [
        { name: "user", placeholder: "@username or ID", required: true },
        { name: "role", placeholder: "Role name or ID", required: true }
      ],
      onExecute: (inputs?: Record<string, string>) => executeCommand('role add', inputs)
    },
    {
      icon: <UserMinus className="w-5 h-5" />,
      title: "Remove Role",
      description: "Remove a role from a user",
      category: "Roles",
      requiresInput: true,
      inputs: [
        { name: "user", placeholder: "@username or ID", required: true },
        { name: "role", placeholder: "Role name or ID", required: true }
      ],
      onExecute: (inputs?: Record<string, string>) => executeCommand('role remove', inputs)
    },
    {
      icon: <Plus className="w-5 h-5" />,
      title: "Create Role",
      description: "Create a new role with permissions",
      category: "Roles",
      requiresInput: true,
      inputs: [
        { name: "name", placeholder: "Role name", required: true },
        { name: "color", placeholder: "Role color (hex)", required: false },
        { name: "permissions", placeholder: "Permission preset", required: false }
      ],
      onExecute: (inputs?: Record<string, string>) => executeCommand('role create', inputs)
    },
    {
      icon: <Users className="w-5 h-5" />,
      title: "List Roles",
      description: "Show all server roles",
      category: "Roles",
      onExecute: () => executeCommand('role list')
    }
  ];

  const funCommands = [
    {
      icon: <Dice6 className="w-5 h-5" />,
      title: "Blackjack",
      description: "Play a game of blackjack against the dealer",
      category: "Games",
      onExecute: () => executeCommand('blackjack')
    },
    {
      icon: <Coffee className="w-5 h-5" />,
      title: "8-Ball",
      description: "Ask the magic 8-ball a question",
      category: "Fun",
      requiresInput: true,
      inputs: [{ name: "question", placeholder: "Your question", required: true }],
      onExecute: (inputs?: Record<string, string>) => executeCommand('fun eightball', inputs)
    },
    {
      icon: <Brain className="w-5 h-5" />,
      title: "Trivia",
      description: "Answer a random trivia question",
      category: "Games",
      onExecute: () => executeCommand('fun trivia')
    },
    {
      icon: <Search className="w-5 h-5" />,
      title: "Urban Dictionary",
      description: "Look up definitions from Urban Dictionary",
      category: "Fun",
      requiresInput: true,
      inputs: [
        { name: "term", placeholder: "Term to look up", required: true },
        { name: "safe", placeholder: "Filter NSFW (true/false)", required: false }
      ],
      onExecute: (inputs?: Record<string, string>) => executeCommand('urban', inputs)
    }
  ];

  const utilityCommands = [
    {
      icon: <Cloud className="w-5 h-5" />,
      title: "Weather",
      description: "Get current weather information",
      category: "Utility",
      requiresInput: true,
      inputs: [
        { name: "location", placeholder: "City name", required: true },
        { name: "units", placeholder: "metric/imperial", required: false }
      ],
      onExecute: (inputs?: Record<string, string>) => executeCommand('weather', inputs)
    },
    {
      icon: <Newspaper className="w-5 h-5" />,
      title: "News",
      description: "Get latest news headlines",
      category: "Utility",
      requiresInput: true,
      inputs: [
        { name: "category", placeholder: "Category (optional)", required: false },
        { name: "country", placeholder: "Country code (optional)", required: false }
      ],
      onExecute: (inputs?: Record<string, string>) => executeCommand('news', inputs)
    },
    {
      icon: <User className="w-5 h-5" />,
      title: "User Info",
      description: "Display user information",
      category: "Utility",
      requiresInput: true,
      inputs: [{ name: "user", placeholder: "@username (optional)", required: false }],
      onExecute: (inputs?: Record<string, string>) => executeCommand('userinfo', inputs)
    },
    {
      icon: <Settings className="w-5 h-5" />,
      title: "Server Info",
      description: "Display server information",
      category: "Utility",
      onExecute: () => executeCommand('serverinfo')
    },
    {
      icon: <Zap className="w-5 h-5" />,
      title: "Ping",
      description: "Check bot response time",
      category: "Utility",
      onExecute: () => executeCommand('ping')
    }
  ];

  const aiCommands = [
    {
      icon: <Brain className="w-5 h-5" />,
      title: "AI Chat",
      description: "Chat with AI assistant",
      category: "AI",
      requiresInput: true,
      inputs: [{ name: "message", placeholder: "Your message", required: true }],
      onExecute: (inputs?: Record<string, string>) => executeCommand('ai chat', inputs)
    },
    {
      icon: <Music className="w-5 h-5" />,
      title: "Lyrics",
      description: "Get song lyrics",
      category: "AI",
      requiresInput: true,
      inputs: [{ name: "song", placeholder: "Song name and artist", required: true }],
      onExecute: (inputs?: Record<string, string>) => executeCommand('lyrics', inputs)
    }
  ];

  const additionalCommands = [
    {
      icon: <Zap className="w-5 h-5" />,
      title: "Meme",
      description: "Get a random meme from Reddit",
      category: "Fun",
      onExecute: () => executeCommand('meme')
    },
    {
      icon: <Dice6 className="w-5 h-5" />,
      title: "Roll Dice",
      description: "Roll dice with custom sides",
      category: "Games",
      requiresInput: true,
      inputs: [{ name: "sides", placeholder: "Number of sides (default: 6)", required: false }],
      onExecute: (inputs?: Record<string, string>) => executeCommand('roll', inputs)
    },
    {
      icon: <Search className="w-5 h-5" />,
      title: "Wikipedia",
      description: "Search Wikipedia articles",
      category: "Utility",
      requiresInput: true,
      inputs: [{ name: "query", placeholder: "Search term", required: true }],
      onExecute: (inputs?: Record<string, string>) => executeCommand('wiki', inputs)
    },
    {
      icon: <Coffee className="w-5 h-5" />,
      title: "Quote",
      description: "Get an inspirational quote",
      category: "Fun",
      onExecute: () => executeCommand('quote')
    },
    {
      icon: <Brain className="w-5 h-5" />,
      title: "Joke",
      description: "Get a random joke",
      category: "Fun",
      onExecute: () => executeCommand('joke')
    },
    {
      icon: <Dice6 className="w-5 h-5" />,
      title: "Coin Flip",
      description: "Flip a coin",
      category: "Games",
      onExecute: () => executeCommand('coinflip')
    },
    {
      icon: <User className="w-5 h-5" />,
      title: "Avatar",
      description: "Get user's avatar",
      category: "Utility",
      requiresInput: true,
      inputs: [{ name: "user", placeholder: "@username (optional)", required: false }],
      onExecute: (inputs?: Record<string, string>) => executeCommand('avatar', inputs)
    },
    {
      icon: <Cloud className="w-5 h-5" />,
      title: "Random Fact",
      description: "Get a random interesting fact",
      category: "Fun",
      onExecute: () => executeCommand('fact')
    },
    {
      icon: <Search className="w-5 h-5" />,
      title: "Color Info",
      description: "Get information about a color",
      category: "Utility",
      requiresInput: true,
      inputs: [{ name: "color", placeholder: "Color name or hex code", required: true }],
      onExecute: (inputs?: Record<string, string>) => executeCommand('color', inputs)
    },
    {
      icon: <Zap className="w-5 h-5" />,
      title: "QR Code",
      description: "Generate a QR code",
      category: "Utility",
      requiresInput: true,
      inputs: [{ name: "text", placeholder: "Text to encode", required: true }],
      onExecute: (inputs?: Record<string, string>) => executeCommand('qr', inputs)
    },
    {
      icon: <Brain className="w-5 h-5" />,
      title: "Math",
      description: "Solve math expressions",
      category: "Utility",
      requiresInput: true,
      inputs: [{ name: "expression", placeholder: "Math expression (e.g., 2+2)", required: true }],
      onExecute: (inputs?: Record<string, string>) => executeCommand('math', inputs)
    },
    {
      icon: <Coffee className="w-5 h-5" />,
      title: "Dad Joke",
      description: "Get a dad joke",
      category: "Fun",
      onExecute: () => executeCommand('dadjoke')
    },
    {
      icon: <User className="w-5 h-5" />,
      title: "AFK Status",
      description: "Set away-from-keyboard status",
      category: "Utility",
      requiresInput: true,
      inputs: [{ name: "reason", placeholder: "AFK reason (optional)", required: false }],
      onExecute: (inputs?: Record<string, string>) => executeCommand('afk', inputs)
    },
    {
      icon: <Cloud className="w-5 h-5" />,
      title: "Cat Fact",
      description: "Get a random cat fact",
      category: "Fun",
      onExecute: () => executeCommand('catfact')
    },
    {
      icon: <Dice6 className="w-5 h-5" />,
      title: "Number Trivia",
      description: "Get trivia about a number",
      category: "Fun",
      requiresInput: true,
      inputs: [{ name: "number", placeholder: "Number (optional, random if empty)", required: false }],
      onExecute: (inputs?: Record<string, string>) => executeCommand('numbertrivia', inputs)
    },
    {
      icon: <Search className="w-5 h-5" />,
      title: "Shorten URL",
      description: "Shorten a long URL",
      category: "Utility",
      requiresInput: true,
      inputs: [{ name: "url", placeholder: "URL to shorten", required: true }],
      onExecute: (inputs?: Record<string, string>) => executeCommand('shorten', inputs)
    },
    {
      icon: <Brain className="w-5 h-5" />,
      title: "Password Generate",
      description: "Generate a secure password",
      category: "Utility",
      requiresInput: true,
      inputs: [
        { name: "length", placeholder: "Password length (default: 12)", required: false },
        { name: "symbols", placeholder: "Include symbols (true/false)", required: false }
      ],
      onExecute: (inputs?: Record<string, string>) => executeCommand('password', inputs)
    },
    {
      icon: <Coffee className="w-5 h-5" />,
      title: "Chuck Norris",
      description: "Get a Chuck Norris joke",
      category: "Fun",
      onExecute: () => executeCommand('chuck')
    },
    {
      icon: <User className="w-5 h-5" />,
      title: "Hug",
      description: "Hug someone",
      category: "Social",
      requiresInput: true,
      inputs: [{ name: "user", placeholder: "@username to hug", required: true }],
      onExecute: (inputs?: Record<string, string>) => executeCommand('hug', inputs)
    },
    {
      icon: <Dice6 className="w-5 h-5" />,
      title: "Rock Paper Scissors",
      description: "Play rock paper scissors",
      category: "Games",
      requiresInput: true,
      inputs: [{ name: "choice", placeholder: "rock, paper, or scissors", required: true }],
      onExecute: (inputs?: Record<string, string>) => executeCommand('rps', inputs)
    },
    {
      icon: <Cloud className="w-5 h-5" />,
      title: "Space Info",
      description: "Get space facts and NASA info",
      category: "Education",
      onExecute: () => executeCommand('space')
    },
    {
      icon: <Search className="w-5 h-5" />,
      title: "Define",
      description: "Get dictionary definition",
      category: "Education",
      requiresInput: true,
      inputs: [{ name: "word", placeholder: "Word to define", required: true }],
      onExecute: (inputs?: Record<string, string>) => executeCommand('define', inputs)
    },
    {
      icon: <Brain className="w-5 h-5" />,
      title: "ASCII Art",
      description: "Convert text to ASCII art",
      category: "Fun",
      requiresInput: true,
      inputs: [{ name: "text", placeholder: "Text to convert", required: true }],
      onExecute: (inputs?: Record<string, string>) => executeCommand('ascii', inputs)
    },
    {
      icon: <Zap className="w-5 h-5" />,
      title: "Remind Me",
      description: "Set a reminder",
      category: "Utility",
      requiresInput: true,
      inputs: [
        { name: "time", placeholder: "Time (e.g., 5m, 1h)", required: true },
        { name: "message", placeholder: "Reminder message", required: true }
      ],
      onExecute: (inputs?: Record<string, string>) => executeCommand('remind', inputs)
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
            Discord Bot Commands
          </h1>
          <p className="text-slate-300 text-lg">
            Click any command button to execute it instantly - no typing required!
          </p>
        </div>

        <Tabs defaultValue="music" className="w-full">
          <TabsList className="grid w-full grid-cols-8 lg:grid-cols-8" data-testid="command-tabs">
            <TabsTrigger value="music" data-testid="tab-music">Music</TabsTrigger>
            <TabsTrigger value="moderation" data-testid="tab-moderation">Moderation</TabsTrigger>
            <TabsTrigger value="roles" data-testid="tab-roles">Roles</TabsTrigger>
            <TabsTrigger value="fun" data-testid="tab-fun">Fun & Games</TabsTrigger>
            <TabsTrigger value="utility" data-testid="tab-utility">Utility</TabsTrigger>
            <TabsTrigger value="ai" data-testid="tab-ai">AI</TabsTrigger>
            <TabsTrigger value="social" data-testid="tab-social">Social</TabsTrigger>
            <TabsTrigger value="additional" data-testid="tab-additional">More</TabsTrigger>
          </TabsList>

          <TabsContent value="music" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {musicCommands.map((cmd, index) => (
                <CommandButton key={index} {...cmd} />
              ))}
            </div>
          </TabsContent>

          <TabsContent value="moderation" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {moderationCommands.map((cmd, index) => (
                <CommandButton key={index} {...cmd} />
              ))}
            </div>
          </TabsContent>

          <TabsContent value="roles" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {roleCommands.map((cmd, index) => (
                <CommandButton key={index} {...cmd} />
              ))}
            </div>
          </TabsContent>

          <TabsContent value="fun" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {funCommands.map((cmd, index) => (
                <CommandButton key={index} {...cmd} />
              ))}
            </div>
          </TabsContent>

          <TabsContent value="utility" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {utilityCommands.map((cmd, index) => (
                <CommandButton key={index} {...cmd} />
              ))}
            </div>
          </TabsContent>

          <TabsContent value="ai" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {aiCommands.map((cmd, index) => (
                <CommandButton key={index} {...cmd} />
              ))}
            </div>
          </TabsContent>

          <TabsContent value="social" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {additionalCommands.filter(cmd => cmd.category === 'Social').map((cmd, index) => (
                <CommandButton key={index} {...cmd} />
              ))}
            </div>
          </TabsContent>

          <TabsContent value="additional" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {additionalCommands.filter(cmd => ['Games', 'Education', 'Fun'].includes(cmd.category)).map((cmd, index) => (
                <CommandButton key={index} {...cmd} />
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}