import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  Shield, 
  Settings, 
  Link2, 
  Code, 
  Search,
  Home,
  Crown,
  User,
  Calendar,
  Ban,
  Users,
  Star,
  Volume2,
  Zap,
  Music,
  Webhook,
  Gift,
  BarChart3,
  ChevronRight,
  Bot
} from "lucide-react";
import { useBotStatus } from "@/hooks/use-bot-status";
import type { BotStats } from "@shared/schema";

export default function Documentation() {
  const { data: botStatus } = useBotStatus();
  const serverId = "123456789";
  
  const { data: serverStats } = useQuery<BotStats>({
    queryKey: ['/api/servers', serverId, 'stats'],
  });

  const navigationSections = [
    {
      title: "Overview",
      items: [
        { icon: Home, label: "Introduction", href: "#", active: true },
        { icon: Crown, label: "Donator Perks", href: "#" }
      ]
    },
    {
      title: "Security Setup",
      items: [
        { icon: Shield, label: "Antinuke", href: "#" },
        { icon: Calendar, label: "Join Gate", href: "#" },
        { icon: Ban, label: "Moderation", href: "#" },
        { icon: Shield, label: "Fake Permissions", href: "#" }
      ]
    },
    {
      title: "Server Configuration",
      items: [
        { icon: Users, label: "Roles", href: "#" },
        { icon: User, label: "Messages", href: "#" },
        { icon: Star, label: "Starboard", href: "#" },
        { icon: Volume2, label: "VoiceMaster", href: "#" },
        { icon: Zap, label: "Level Rewards", href: "#" },
        { icon: Gift, label: "Bump Reminder", href: "#" },
        { icon: Users, label: "Reaction Triggers", href: "#" },
        { icon: Settings, label: "Command Aliases", href: "#" },
        { icon: BarChart3, label: "Logging", href: "#" }
      ]
    },
    {
      title: "Miscellaneous",
      items: [
        { icon: Music, label: "Music", href: "#" },
        { icon: Webhook, label: "Webhook", href: "#" },
        { icon: Gift, label: "Giveaway", href: "#" },
        { icon: BarChart3, label: "Counters", href: "#" }
      ]
    },
    {
      title: "Integrations",
      items: []
    }
  ];

  const guideCards = [
    {
      icon: Shield,
      title: "Security Setup",
      description: "Quickly configure your server to use bleed's advanced moderation system.",
      href: "#security"
    },
    {
      icon: Settings,
      title: "Server Configuration", 
      description: "Set up welcome & goodbye messages, reaction roles, and more for your server.",
      href: "#configuration"
    },
    {
      icon: Link2,
      title: "Integrations",
      description: "Seamlessly integrate your favorite platforms directly into your server through bleed.",
      href: "#integrations"
    },
    {
      icon: Code,
      title: "Embed Scripting",
      description: "Learn how to build embeds and use variables for your server's configurations",
      href: "#scripting"
    }
  ];

  return (
    <div className="min-h-screen bg-background text-foreground flex">
      {/* Sidebar */}
      <aside className="w-64 bg-card border-r border-border flex flex-col">
        {/* Logo/Header */}
        <div className="p-4 border-b border-border">
          <div className="flex items-center space-x-2">
            <Bot className="w-8 h-8 text-primary" />
            <div>
              <h1 className="text-lg font-semibold text-foreground">bleed</h1>
              <div className="flex items-center space-x-2">
                <div className={`w-2 h-2 rounded-full ${
                  botStatus?.status === 'online' ? 'bg-green-500' : 'bg-red-500'
                }`}></div>
                <span className="text-xs text-muted-foreground">
                  {botStatus?.status === 'online' ? 'Online' : 'Offline'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 overflow-y-auto">
          {navigationSections.map((section) => (
            <div key={section.title} className="mb-6">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                {section.title}
              </h3>
              <div className="space-y-1">
                {section.items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <a
                      key={item.label}
                      href={item.href}
                      className={`flex items-center space-x-3 px-3 py-2 rounded-md text-sm transition-colors ${
                        item.active
                          ? 'bg-accent text-accent-foreground'
                          : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      <span>{item.label}</span>
                    </a>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Footer */}
        <div className="p-4 border-t border-border">
          <div className="text-xs text-muted-foreground space-y-1">
            <div className="flex justify-between">
              <span>Guilds:</span>
              <span>{botStatus?.guilds || 0}</span>
            </div>
            <div className="flex justify-between">
              <span>Users:</span>
              <span>{botStatus?.users || 0}</span>
            </div>
            <div className="flex justify-between">
              <span>Uptime:</span>
              <span>{botStatus?.uptime ? Math.floor(botStatus.uptime / 86400000) + 'd' : '0d'}</span>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col">
        {/* Header */}
        <header className="bg-card border-b border-border px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-foreground">Introduction</h1>
              <p className="text-muted-foreground">
                Learn how to set up bleed in your server or enhance your everyday use with commands & more.
              </p>
            </div>
            
            <div className="flex items-center space-x-4">
              {/* Search Bar */}
              <div className="relative">
                <Input
                  type="text"
                  placeholder="Search..."
                  className="bg-input text-foreground placeholder-muted-foreground pl-10 w-64"
                />
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <span className="absolute right-3 top-3 text-xs text-muted-foreground">Ctrl K</span>
              </div>
              
              <Button variant="outline" size="sm">
                Support Server
              </Button>
              
              <Button size="sm" className="bg-primary text-primary-foreground">
                Home
              </Button>
            </div>
          </div>
        </header>

        {/* Content Area */}
        <div className="flex-1 p-6">
          <div className="max-w-4xl">
            {/* Guides Section */}
            <div className="mb-8">
              <h2 className="text-xl font-semibold text-foreground mb-4">Guides</h2>
              
              {/* Prefix Info */}
              <div className="mb-6 p-4 bg-accent rounded-lg border border-border">
                <p className="text-sm text-muted-foreground">
                  Server prefix is set to <code className="bg-muted text-muted-foreground px-1 py-0.5 rounded text-xs">,</code> by default. 
                  Use <code className="bg-muted text-muted-foreground px-1 py-0.5 rounded text-xs">,prefix set (symbol)</code> to change it for your server.
                </p>
              </div>

              {/* Guide Cards Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
                {guideCards.map((card) => {
                  const Icon = card.icon;
                  return (
                    <Card 
                      key={card.title}
                      className="bg-card border-border hover:bg-accent transition-colors cursor-pointer group"
                    >
                      <CardContent className="p-6">
                        <div className="flex items-start space-x-4">
                          <div className="p-2 bg-primary/10 rounded-md">
                            <Icon className="w-5 h-5 text-primary" />
                          </div>
                          <div className="flex-1">
                            <h3 className="font-semibold text-foreground mb-2 group-hover:text-primary transition-colors">
                              {card.title}
                            </h3>
                            <p className="text-sm text-muted-foreground">
                              {card.description}
                            </p>
                          </div>
                          <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>

              {/* Donator Perks Link */}
              <div className="flex justify-end">
                <Button variant="ghost" className="text-primary hover:text-primary/80">
                  Donator Perks
                  <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
            </div>

            {/* Table of Contents */}
            <div className="border-t border-border pt-8">
              <div className="flex justify-between items-start">
                <div className="text-xs text-muted-foreground">
                  On this page
                  <ul className="mt-2 space-y-1">
                    <li>
                      <a href="#guides" className="hover:text-foreground transition-colors">
                        Guides
                      </a>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <footer className="bg-card border-t border-border p-6">
          <div className="max-w-4xl text-center">
            <p className="text-xs text-muted-foreground">
              Powered by Mintify
            </p>
          </div>
        </footer>
      </main>
    </div>
  );
}