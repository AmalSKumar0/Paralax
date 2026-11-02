import React, { createContext, useContext, useState, useEffect } from 'react';
import { api } from '../services/api';
import { SERVICE_DISABLED_EVENT } from '../services/apiClient';

interface ServiceStatusContextType {
  isServiceEnabled: boolean;
  toggleService: (enabled: boolean) => Promise<void>;
  dismissBanner: () => void;
  showBanner: boolean;
}

const ServiceStatusContext = createContext<ServiceStatusContextType | undefined>(undefined);

export const ServiceStatusProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isServiceEnabled, setIsServiceEnabled] = useState<boolean>(true);
  const [showBanner, setShowBanner] = useState<boolean>(false);

  useEffect(() => {
    // Initial fetch of settings
    api.getSettings()
      .then((settings) => {
        setIsServiceEnabled(settings.service_enabled);
        if (!settings.service_enabled) {
          setShowBanner(true);
        }
      })
      .catch(() => {
        // Fallback
      });

    const handleServiceDisabledEvent = () => {
      setIsServiceEnabled(false);
      setShowBanner(true);
    };

    window.addEventListener(SERVICE_DISABLED_EVENT, handleServiceDisabledEvent);
    return () => {
      window.removeEventListener(SERVICE_DISABLED_EVENT, handleServiceDisabledEvent);
    };
  }, []);

  const toggleService = async (enabled: boolean) => {
    await api.updateSettings({ service_enabled: enabled });
    setIsServiceEnabled(enabled);
    if (!enabled) {
      setShowBanner(true);
    } else {
      setShowBanner(false);
    }
  };

  const dismissBanner = () => {
    setShowBanner(false);
  };

  return (
    <ServiceStatusContext.Provider
      value={{
        isServiceEnabled,
        toggleService,
        dismissBanner,
        showBanner,
      }}
    >
      {children}
    </ServiceStatusContext.Provider>
  );
};

export const useServiceStatus = () => {
  const context = useContext(ServiceStatusContext);
  if (!context) throw new Error('useServiceStatus must be used within ServiceStatusProvider');
  return context;
};
