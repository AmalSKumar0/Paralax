import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { ServiceStatusProvider } from './context/ServiceStatusContext';
import { AppLayout } from './components/Layout/AppLayout';

import { Login } from './pages/Login';
import { Overview } from './pages/Overview';
import { DevicesList } from './pages/Devices/DevicesList';
import { DeviceDetail } from './pages/Devices/DeviceDetail';
import { ConversationsList } from './pages/Conversations/ConversationsList';
import { ConversationDetail } from './pages/Conversations/ConversationDetail';
import { TestConsole } from './pages/TestConsole';
import { JobsList } from './pages/Jobs/JobsList';
import { JobDetail } from './pages/Jobs/JobDetail';
import { LanguageSupport } from './pages/LanguageSupport';
import { Settings } from './pages/Settings';
import { SystemHealth } from './pages/SystemHealth';
import { ApiKeys } from './pages/ApiKeys';
import { StreamingSessions } from './pages/StreamingSessions';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10000,
      refetchOnWindowFocus: false,
    },
  },
});

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#edeae4] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#ded7cc] border-t-[#e9b140] rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
};

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ToastProvider>
          <ServiceStatusProvider>
            <BrowserRouter>
              <Routes>
                {/* Public Route */}
                <Route path="/login" element={<Login />} />

                {/* Protected Admin Routes */}
                <Route
                  path="/"
                  element={
                    <ProtectedRoute>
                      <AppLayout />
                    </ProtectedRoute>
                  }
                >
                  <Route index element={<Overview />} />
                  <Route path="devices" element={<DevicesList />} />
                  <Route path="devices/:id" element={<DeviceDetail />} />
                  <Route path="conversations" element={<ConversationsList />} />
                  <Route path="conversations/:id" element={<ConversationDetail />} />
                  <Route path="test-console" element={<TestConsole />} />
                  <Route path="jobs" element={<JobsList />} />
                  <Route path="jobs/:id" element={<JobDetail />} />
                  <Route path="languages" element={<LanguageSupport />} />
                  <Route path="settings" element={<Settings />} />
                  <Route path="health" element={<SystemHealth />} />
                  <Route path="api-keys" element={<ApiKeys />} />
                  <Route path="streaming" element={<StreamingSessions />} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Route>
              </Routes>
            </BrowserRouter>
          </ServiceStatusProvider>
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
