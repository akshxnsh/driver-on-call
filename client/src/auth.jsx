import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, getToken, setToken } from './api.js';

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [config, setConfig] = useState({ googleClientId: null, demoMode: false });
  const [ready, setReady] = useState(false);

  const refresh = useCallback(async () => {
    if (!getToken()) return setUser(null);
    try {
      setUser(await api('/me'));
    } catch {
      setToken(null);
      setUser(null);
    }
  }, []);

  useEffect(() => {
    Promise.all([api('/config').then(setConfig).catch(() => {}), refresh()]).finally(() => setReady(true));
  }, [refresh]);

  // Stable identity: the sign-in page sets up the Google button once, keyed on this function.
  const login = useCallback(({ token, user }) => {
    setToken(token);
    setUser(user);
  }, []);
  const logout = () => {
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, setUser, config, ready, login, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}
