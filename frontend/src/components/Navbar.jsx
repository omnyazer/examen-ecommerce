// src/components/Navbar.js
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';

const Navbar = () => {
  const navigate = useNavigate();
  const { cart } = useCart();

  const { user, loading, error, logout } = useAuth();
  const [logoutError, setLogoutError] = useState('');
  const isAuthenticated = Boolean(user);
  const username = user?.username;
  const role = user?.role;

  const handleLogout = async () => {
    try {
      await logout();
      setLogoutError('');
      navigate('/login');
    } catch {
      setLogoutError('La déconnexion a échoué. Réessayez.');
    }
  };

  return (
    <nav className="bg-blue-500 text-white p-4 flex justify-between items-center">
      <div className="flex items-center space-x-4">
        {(error || logoutError) && <span role="alert">{logoutError || error}</span>}
        <Link to="/" className="text-xl font-bold">
          Mon Application
        </Link>
      </div>

      <div className="flex items-center space-x-4">
        {/* Afficher le nom de l'utilisateur s'il est connecté */}
        {isAuthenticated && <span className="font-semibold">Bonjour, {username}</span>}

        {/* Lien vers le Panier avec le nombre d'articles */}
        {isAuthenticated && role === 'admin' && <Link to="/admin">Administration</Link>}
        <Link to="/cart" className="relative">
          <span>Panier</span>
          {cart.length > 0 && (
            <span className="absolute top-0 right-0 bg-red-500 text-white rounded-full text-xs px-2">
              {cart.length}
            </span>
          )}
        </Link>

        {/* Lien Connexion / Déconnexion */}
        {loading ? (
          <span>Vérification de la connexion…</span>
        ) : !isAuthenticated ? (
          <>
            <Link to="/login">Connexion</Link>
            <Link to="/register">Inscription</Link>
          </>
        ) : (
          <button onClick={handleLogout} className="bg-red-500 px-4 py-2 rounded">
            Déconnexion
          </button>
        )}
      </div>
    </nav>
  );
};

export default Navbar;
