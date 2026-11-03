import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Cpu,
  Mic,
  Globe2,
  Settings,
  HeartPulse,
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
    { to: '/test-console', label: 'Test Console', icon: <Mic className="w-4 h-4" />, badge: 'Live' },
    { to: '/languages', label: 'Language Matrix', icon: <Globe2 className="w-4 h-4" /> },
    { to: '/settings', label: 'Settings', icon: <Settings className="w-4 h-4" /> },
    { to: '/health', label: 'System Health', icon: <HeartPulse className="w-4 h-4" /> },
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
    <aside className="w-64 shrink-0 bg-[#fbf9f4] border-r-2 border-[#121212] flex flex-col justify-between sticky top-0 h-screen select-none">
      <div className="flex flex-col min-h-0 flex-1">
        {/* Brand Header: Exactly h-[72px] matching Topbar */}
        <div className="h-[72px] px-6 border-b-2 border-[#121212] bg-white flex flex-col justify-center shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xl font-extrabold text-[#121212] tracking-tight leading-none">
                paralax
              </span>
              <span className="w-2.5 h-2.5 rounded-full bg-[#ffc86b] border border-[#121212] inline-block shrink-0" />
            </div>
            {IS_MOCK_MODE && (
              <span
                title="Mock mode active with simulated IoT devices and cloud endpoints"
                className="text-[10px] font-bold px-2 py-0.5 rounded-md border-2 border-[#121212] bg-[#ffc86b] text-[#121212] shadow-[1.5px_1.5px_0px_#121212]"
              >
                Mock
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-[#555555] leading-none font-medium">
            IoT Voice Translator Cloud
          </p>
        </div>

        {/* Navigation list */}
        <nav className="flex-1 overflow-y-auto p-3 space-y-1.5" aria-label="Main Navigation">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs transition-all duration-120 ${
                  isActive
                    ? 'bg-[#ffc86b] text-[#121212] font-bold border-2 border-[#121212] shadow-[2.5px_2.5px_0px_#121212]'
                    : 'text-[#333333] font-semibold border-2 border-transparent hover:border-[#121212] hover:bg-white hover:shadow-[2px_2px_0px_#121212]'
                }`
              }
            >
              <div className="flex items-center gap-2.5">
                <span className="shrink-0">{item.icon}</span>
                <span>{item.label}</span>
              </div>
              {item.badge && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-white text-[#121212] border-2 border-[#121212] shadow-[1px_1px_0px_#121212]">
                  {item.badge}
                </span>
              )}
            </NavLink>
          ))}
        </nav>
      </div>

      {/* User / Session footer */}
      <div className="p-4 border-t-2 border-[#121212] bg-white space-y-2.5 shrink-0">
        <div className="flex items-center gap-2.5 p-2 rounded-xl bg-[#fbf9f4] border-2 border-[#121212] shadow-[2px_2px_0px_#121212]">
          <div className="w-7 h-7 rounded-lg bg-[#ffc86b] text-[#121212] border-2 border-[#121212] flex items-center justify-center font-bold text-xs shrink-0">
            {session?.email ? session.email[0].toUpperCase() : 'A'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold truncate text-[#121212]">
              {session?.email || 'Admin'}
            </p>
            <p className="text-[10px] text-[#666666]">
              {session?.isMock ? 'Mock Session' : 'Admin User'}
            </p>
          </div>
        </div>

        <button
          onClick={logout}
          className="w-full flex items-center justify-center gap-2 px-3 py-1.5 rounded-xl border-2 border-[#121212] text-xs font-bold text-[#121212] bg-white hover:bg-[#fecdd3] shadow-[2px_2px_0px_#121212] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all cursor-pointer"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>Sign Out</span>
        </button>
      </div>
    </aside>
  );
};
