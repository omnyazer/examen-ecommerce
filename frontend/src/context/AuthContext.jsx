import { createContext, useContext, useEffect, useState } from 'react';
import axios from 'axios';

const AuthContext = createContext();
const AUTH_URL = 'http://localhost:5000/api/auth';

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    for (const key of ['token', 'username', 'role']) localStorage.removeItem(key);
    axios
      .get(`${AUTH_URL}/me`, { withCredentials: true })
      .then((response) => {
        if (active) setUser(response.data);
      })
      .catch((error) => {
        if (active && error.response?.status !== 401)
          setError('Impossible de vérifier la connexion. Actualisez la page.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const login = async (credentials) => {
    const response = await axios.post(`${AUTH_URL}/login`, credentials, { withCredentials: true });
    setUser(response.data);
    setError('');
  };

  const logout = async () => {
    await axios.post(`${AUTH_URL}/logout`, {}, { withCredentials: true });
    setUser(null);
    setError('');
  };

  return (
    <AuthContext.Provider value={{ user, loading, error, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
