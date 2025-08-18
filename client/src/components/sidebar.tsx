import { Card } from "@/components/ui/card";
import { useBotStatus } from "@/hooks/use-bot-status";
import { useQuery } from "@tanstack/react-query";
import { 
  Home, 
  Shield, 
  AlertTriangle, 
  List, 
  Music, 
  Gamepad2, 
  Users, 
  Terminal, 
  Settings 
} from "lucide-react";

const navigationItems = [
  { id: 'dashboard', label: 'Dashboard', icon: Home, href: '#dashboard', active: true },
  { 
    id: 'moderation', 
    label: 'Moderation', 
    isSection: true,
    items: [
      { id: 'automod', label: 'Auto Moderation', icon: Shield, href: '#moderation' },
      { id: 'warnings', label: 'Warnings & Bans', icon: AlertTriangle, href: '#warnings' },
      { id: 'logs', label: 'Audit Logs', icon: List, href: '#logs' },
    ]
  },
  {
    id: 'entertainment',
    label: 'Entertainment',
    isSection: true,
    items: [
      { id: 'music', label: 'Music Queue', icon: Music, href: '#music' },
      { id: 'games', label: 'Mini Games', icon: Gamepad2, href: '#games' },
    ]
  },
  {
    id: 'management',
    label: 'Management',
    isSection: true,
    items: [
      { id: 'roles', label: 'Role Management', icon: Users, href: '#roles' },
      { id: 'commands', label: 'Custom Commands', icon: Terminal, href: '#commands' },
      { id: 'settings', label: 'Server Settings', icon: Settings, href: '#settings' },
    ]
  }
];

export function Sidebar() {
  const { data: botStatus } = useBotStatus();
  
  // Mock server data - in real app would come from context/auth
  const serverId = "123456789";
  const { data: serverInfo } = useQuery<{name?: string; memberCount?: number}>({
    queryKey: ['/api/discord/guilds', serverId],
  });

  return (
    <aside className="w-72 discord-secondary border-r discord-border flex flex-col">
      {/* Bot Header */}
      <div className="p-6 border-b discord-border">
        <div className="flex items-center space-x-3">
          {/* Bot Avatar */}
          <div className="w-12 h-12 discord-blurple rounded-full flex items-center justify-center text-lg font-bold text-white">
            B
          </div>
          <div>
            <h1 className="text-lg font-semibold discord-text-white">Discord Bot Dashboard</h1>
            <div className="flex items-center space-x-2">
              <div className={`w-2 h-2 rounded-full ${
                botStatus?.status === 'online' ? 'discord-green' : 'discord-red'
              }`}></div>
              <span className="text-sm discord-text-muted">
                {botStatus?.status === 'online' ? 'Online' : 'Offline'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation Menu */}
      <nav className="flex-1 p-4 space-y-2">
        {navigationItems.map((item) => {
          if (item.isSection) {
            return (
              <div key={item.id} className="space-y-1">
                <h3 className="text-xs font-semibold discord-text-muted uppercase tracking-wide px-3 py-2">
                  {item.label}
                </h3>
                {item.items?.map((subItem) => {
                  const Icon = subItem.icon;
                  return (
                    <a
                      key={subItem.id}
                      href={subItem.href}
                      className="flex items-center space-x-3 px-3 py-2 rounded-lg discord-text-muted hover:bg-discord-tertiary hover:text-discord-white transition-colors"
                    >
                      <Icon className="w-4 h-4" />
                      <span>{subItem.label}</span>
                    </a>
                  );
                })}
              </div>
            );
          }

          const Icon = item.icon!;
          return (
            <a
              key={item.id}
              href={item.href}
              className={`flex items-center space-x-3 px-3 py-2 rounded-lg transition-colors ${
                item.active 
                  ? 'bg-discord-blurple discord-text-white' 
                  : 'discord-text-muted hover:bg-discord-tertiary hover:text-discord-white'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{item.label}</span>
            </a>
          );
        })}
      </nav>

      {/* Server Info Footer */}
      <div className="p-4 border-t discord-border">
        <div className="text-xs discord-text-muted">
          <div className="flex justify-between mb-1">
            <span>Server:</span>
            <span>{serverInfo?.name || 'Loading...'}</span>
          </div>
          <div className="flex justify-between mb-1">
            <span>Members:</span>
            <span>{serverInfo?.memberCount || 0}</span>
          </div>
          <div className="flex justify-between">
            <span>Uptime:</span>
            <span>{botStatus?.uptime ? Math.floor(botStatus.uptime / 86400000) + 'd' : '0d'}</span>
          </div>
        </div>
      </div>
    </aside>
  );
}
