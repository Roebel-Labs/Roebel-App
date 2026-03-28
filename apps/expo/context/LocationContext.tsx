import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import * as Location from 'expo-location';

export type LocationContextValue = {
  location: Location.LocationObject | null;
  permissionStatus: Location.PermissionStatus | null;
  isLoading: boolean;
  error: string | null;
  requestLocation: () => Promise<boolean>;
  hasLocationPermission: boolean;
};

const LocationContext = createContext<LocationContextValue | undefined>(undefined);

export function LocationProvider({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [permissionStatus, setPermissionStatus] = useState<Location.PermissionStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    checkPermissionStatus();
  }, []);

  const checkPermissionStatus = async () => {
    try {
      const { status } = await Location.getForegroundPermissionsAsync();
      setPermissionStatus(status);
      
      if (status === Location.PermissionStatus.GRANTED) {
        getCurrentLocation();
      }
    } catch (err) {
      setError('Fehler beim Überprüfen der Standortberechtigung');
      console.error('Permission check error:', err);
    }
  };

  const getCurrentLocation = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      const currentLocation = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      
      setLocation(currentLocation);
    } catch (err) {
      setError('Standort konnte nicht ermittelt werden');
      console.error('Location error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const requestLocation = useCallback(async (): Promise<boolean> => {
    try {
      setIsLoading(true);
      setError(null);

      // Check if location services are enabled
      const servicesEnabled = await Location.hasServicesEnabledAsync();
      if (!servicesEnabled) {
        setError('Standortdienste sind deaktiviert');
        return false;
      }

      // Request permission
      const { status } = await Location.requestForegroundPermissionsAsync();
      setPermissionStatus(status);

      if (status !== Location.PermissionStatus.GRANTED) {
        setError('Standortberechtigung wurde verweigert');
        return false;
      }

      // Get current location
      await getCurrentLocation();
      return true;
    } catch (err) {
      setError('Fehler beim Anfordern des Standorts');
      console.error('Request location error:', err);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const hasLocationPermission = useMemo(
    () => permissionStatus === Location.PermissionStatus.GRANTED,
    [permissionStatus]
  );

  const value = useMemo(
    () => ({
      location,
      permissionStatus,
      isLoading,
      error,
      requestLocation,
      hasLocationPermission,
    }),
    [location, permissionStatus, isLoading, error, requestLocation, hasLocationPermission]
  );

  return <LocationContext.Provider value={value}>{children}</LocationContext.Provider>;
}

export function useLocation(): LocationContextValue {
  const context = useContext(LocationContext);
  if (!context) {
    throw new Error('useLocation must be used within LocationProvider');
  }
  return context;
}