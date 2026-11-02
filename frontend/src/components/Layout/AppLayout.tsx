import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { ServiceBanner } from './ServiceBanner';

export const AppLayout: React.FC = () => {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[#edeae4] flex flex-col">
      <ServiceBanner />
      <div className="flex-1 flex flex-col md:flex-row w-full">
        {/* Desktop Sidebar */}
        <div className="hidden md:block">
          <Sidebar />
        </div>

        {/* Mobile Sidebar overlay */}
        {mobileNavOpen && (
          <div className="fixed inset-0 z-50 flex md:hidden">
            <div
              className="fixed inset-0 bg-black/40 backdrop-blur-sm"
              onClick={() => setMobileNavOpen(false)}
            />
            <div className="relative z-10 w-72 bg-[#f7f5f0] h-full shadow-xl flex flex-col">
              <Sidebar />
            </div>
          </div>
        )}

        {/* Main Content Area */}
        <main className="flex-1 min-w-0 flex flex-col overflow-x-hidden">
          <Outlet context={{ onToggleMobileNav: () => setMobileNavOpen(!mobileNavOpen) }} />
        </main>
      </div>
    </div>
  );
};
