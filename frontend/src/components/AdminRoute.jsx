// src/components/AdminRoute.js
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const AdminRoute = ({ children }) => {
  const { user, loading, error } = useAuth();
  if (loading) return <p>Vérification de la connexion…</p>;
  if (error) return <p role="alert">{error}</p>;

  if (!user || user.role !== 'admin') {
    return <Navigate to="/" replace />;
  }

  return children;
};

export default AdminRoute;
