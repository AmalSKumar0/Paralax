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
    <aside className="w-64 shrink-0 bg-[#f7f5f0] border-r border-[#ded7cc] flex flex-col justify-between sticky top-0 h-screen select-none">
      <div className="flex flex-col min-h-0 flex-1">
        {/* Brand Header: Exactly h-[72px] matching Topbar */}
        <div className="h-[72px] px-6 border-b border-[#ded7cc] bg-white flex flex-col justify-center shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xl font-bold text-[#2b1d16] tracking-tight leading-none">
                paralax
              </span>
              <span className="w-2.5 h-2.5 rounded-full bg-[#e9b140] inline-block shrink-0" />
            </div>
            {IS_MOCK_MODE && (
              <span
                title="Mock mode active with simulated IoT devices and cloud endpoints"
                className="text-[10px] font-semibold px-2 py-0.5 rounded-full border border-[#e9b140]/50 bg-[#fcf8ee] text-[#855b14]"
              >
                Mock
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-[#8a776a] leading-none">
            IoT Voice Translator Cloud
          </p>
        </div>

        {/* Navigation list */}
        <nav className="flex-1 overflow-y-auto p-3 space-y-1" aria-label="Main Navigation">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-medium transition-all ${
                  isActive
                    ? 'bg-[#e9b140] text-[#2b1d16] font-semibold shadow-xs'
                    : 'text-[#5c4a3e] hover:bg-[#edeae4]/70 hover:text-[#2b1d16]'
                }`
              }
            >
              <div className="flex items-center gap-2.5">
                <span className="shrink-0">{item.icon}</span>
                <span>{item.label}</span>
              </div>
              {item.badge && (
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-white/80 text-[#2b1d16] border border-[#ded7cc]">
                  {item.badge}
                </span>
              )}
            </NavLink>
          ))}
        </nav>
      </div>

      {/* User / Session footer */}
      <div className="p-4 border-t border-[#ded7cc] bg-white space-y-2.5 shrink-0">
        <div className="flex items-center gap-2.5 p-2 rounded-xl bg-[#f7f5f0] border border-[#ded7cc]">
          <div className="w-7 h-7 rounded-full bg-[#e9b140] text-[#2b1d16] flex items-center justify-center font-bold text-xs shrink-0">
            {session?.email ? session.email[0].toUpperCase() : 'A'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold truncate text-[#2b1d16]">
              {session?.email || 'Admin'}
            </p>
            <p className="text-[10px] text-[#8a776a]">
              {session?.isMock ? 'Mock Session' : 'Admin User'}
            </p>
          </div>
        </div>

        <button
          onClick={logout}
          className="w-full flex items-center justify-center gap-2 px-3 py-1.5 rounded-xl border border-[#ded7cc] text-xs font-medium text-[#736154] hover:bg-[#edeae4] hover:text-[#2b1d16] transition-all cursor-pointer"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>Sign Out</span>
        </button>
      </div>
    </aside>
  );
};
