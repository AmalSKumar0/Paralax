import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Cpu,
  MessagesSquare,
  Mic,
  Activity,
  Globe2,
  Settings,
  HeartPulse,
  KeyRound,
  Radio,
  LogOut,
  Zap,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { IS_MOCK_MODE } from '../../services/apiClient';

const ENABLE_STREAMING = import.meta.env.VITE_ENABLE_STREAMING === 'true';

interface NavItem {
  to: string;
  label: string;
  icon: React.ReactNode;
  badge?: string;
}

export const Sidebar: React.FC = () => {
  const { session, logout } = useAuth();

  const navItems: NavItem[] = [
    { to: '/', label: 'Overview', icon: <LayoutDashboard className="w-4 h-4" /> },
    { to: '/devices', label: 'Devices', icon: <Cpu className="w-4 h-4" /> },
    { to: '/conversations', label: 'Conversations', icon: <MessagesSquare className="w-4 h-4" /> },
    { to: '/test-console', label: 'Test Console', icon: <Mic className="w-4 h-4" />, badge: 'Live' },
    { to: '/jobs', label: 'Jobs', icon: <Activity className="w-4 h-4" /> },
    { to: '/languages', label: 'Language Matrix', icon: <Globe2 className="w-4 h-4" /> },
    { to: '/settings', label: 'Settings', icon: <Settings className="w-4 h-4" /> },
    { to: '/health', label: 'System Health', icon: <HeartPulse className="w-4 h-4" /> },
    { to: '/api-keys', label: 'API Keys', icon: <KeyRound className="w-4 h-4" /> },
  ];

  if (ENABLE_STREAMING) {
    navItems.push({
      to: '/streaming',
      label: 'Streaming',
      icon: <Radio className="w-4 h-4" />,
      badge: 'Beta',
    });
  }

  return (
    <aside className="w-64 shrink-0 bg-[#f9f6f0] border-r-[3px] border-black flex flex-col justify-between min-h-screen">
      <div>
        {/* Brand Header */}
        <div className="p-6 border-b-[3px] border-black bg-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="font-display text-4xl font-black text-[#1a1a1a] tracking-wider">
                paralax
              </span>
              <span className="w-3 h-3 rounded-full bg-[#ffc86b] border-[2px] border-black inline-block animate-pulse" />
            </div>
            {IS_MOCK_MODE && (
              <span
                title="Mock mode active with simulated IoT devices and cloud endpoints"
                className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full border border-black bg-[#ffc86b] shadow-[1px_1px_0px_#000]"
              >
                Mock Mode
              </span>
            )}
          </div>
          <p className="mt-1 text-xs font-bold text-gray-600">
            IoT Voice Translator Cloud
          </p>
        </div>

        {/* Navigation list */}
        <nav className="p-4 space-y-1.5" aria-label="Main Navigation">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `flex items-center justify-between px-4 py-2.5 rounded-full text-xs font-extrabold border-[2px] transition-all select-none ${
                  isActive
                    ? 'bg-[#ffc86b] text-[#1a1a1a] border-black shadow-[3px_3px_0px_0px_#000] translate-x-1'
                    : 'bg-transparent text-gray-700 border-transparent hover:bg-[#f0ece1] hover:text-black hover:border-black'
                }`
              }
            >
              <div className="flex items-center gap-3">
                <span className="p-1 rounded-lg border border-black/30 bg-white/50">
                  {item.icon}
                </span>
                <span>{item.label}</span>
              </div>
              {item.badge && (
                <span className="text-[10px] font-black px-1.5 py-0.2 rounded border border-black bg-white">
                  {item.badge}
                </span>
              )}
            </NavLink>
          ))}
        </nav>
      </div>

      {/* User / Session footer */}
      <div className="p-4 border-t-[3px] border-black bg-white space-y-3">
        <div className="flex items-center gap-3 p-2 rounded-xl bg-[#f9f6f0] border-[2px] border-black">
          <div className="w-8 h-8 rounded-full border-[2px] border-black bg-[#ffc86b] flex items-center justify-center font-black text-xs">
            {session?.email ? session.email[0].toUpperCase() : 'A'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-black truncate text-[#1a1a1a]">
              {session?.email || 'Admin'}
            </p>
            <p className="text-[10px] font-bold text-gray-500 uppercase">
              {session?.isMock ? 'Mock Session' : 'Cognito User'}
            </p>
          </div>
        </div>

        <button
          onClick={logout}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-full border-[2px] border-black text-xs font-black bg-[#ffecec] hover:bg-rose-200 text-rose-900 active:translate-y-[1px] transition-all cursor-pointer shadow-[2px_2px_0px_0px_#000]"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>Sign Out</span>
        </button>
      </div>
    </aside>
  );
};
