import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import axios from 'axios';
import { AuthProvider } from './AuthContext';
import { CartProvider } from './CartContext';
import Navbar from '../components/Navbar';
import AdminRoute from '../components/AdminRoute';
import ProtectedRoute from '../components/ProtectedRoute';
import Login from '../pages/Login';

vi.mock('axios', () => ({ default: { get: vi.fn(), post: vi.fn() } }));

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  axios.get.mockRejectedValue({ response: { status: 401 } });
});

function renderSession(path = '/') {
  return render(
    <CartProvider>
      <AuthProvider>
        <MemoryRouter initialEntries={[path]}>
          <Navbar />
          <Routes>
            <Route path="/" element={<p>Accueil public</p>} />
            <Route path="/login" element={<Login />} />
            <Route
              path="/admin"
              element={
                <AdminRoute>
                  <p>Espace administrateur</p>
                </AdminRoute>
              }
            />
            <Route
              path="/order"
              element={
                <ProtectedRoute>
                  <p>Commande privée</p>
                </ProtectedRoute>
              }
            />
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    </CartProvider>
  );
}

test('la session serveur restaure le nom et les droits sans stockage local', async () => {
  axios.get.mockResolvedValueOnce({ data: { username: 'admin-test', role: 'admin' } });
  renderSession('/admin');
  expect(await screen.findByText('Espace administrateur')).toBeInTheDocument();
  expect(screen.getByText('Bonjour, admin-test')).toBeInTheDocument();
  expect(axios.get).toHaveBeenCalledWith('http://localhost:5000/api/auth/me', {
    withCredentials: true,
  });
  expect(localStorage.length).toBe(0);
});

test('un ancien token ou rôle dans localStorage ne donne aucun accès', async () => {
  localStorage.setItem('token', 'old-token');
  localStorage.setItem('role', 'admin');
  localStorage.setItem('username', 'ancien-utilisateur');
  renderSession('/admin');
  await waitFor(() => expect(screen.getByRole('link', { name: 'Connexion' })).toBeInTheDocument());
  expect(screen.queryByText('Espace administrateur')).not.toBeInTheDocument();
  expect(localStorage.length).toBe(0);
});

test('un client connecté ne peut pas ouvrir l’administration', async () => {
  axios.get.mockResolvedValueOnce({ data: { username: 'client-test', role: 'user' } });
  renderSession('/admin');
  await screen.findByText('Bonjour, client-test');
  expect(await screen.findByText('Accueil public')).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Administration' })).not.toBeInTheDocument();
});

test('un visiteur est dirigé vers la connexion pour une page privée', async () => {
  renderSession('/order');
  expect(await screen.findByRole('button', { name: 'Se connecter' })).toBeInTheDocument();
  expect(screen.queryByText('Commande privée')).not.toBeInTheDocument();
});

test('connexion et déconnexion utilisent les cookies sans enregistrer de token', async () => {
  axios.post.mockResolvedValueOnce({ data: { username: 'client-test', role: 'user' } });
  renderSession('/login');
  await screen.findByRole('link', { name: 'Connexion' });
  fireEvent.change(screen.getByPlaceholderText("Nom d'utilisateur"), {
    target: { value: 'client-test' },
  });
  fireEvent.change(screen.getByPlaceholderText('Mot de passe'), {
    target: { value: 'Exemple@Test2026' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Se connecter' }));
  await screen.findByText('Bonjour, client-test');
  expect(axios.post).toHaveBeenCalledWith(
    'http://localhost:5000/api/auth/login',
    {
      username: 'client-test',
      password: 'Exemple@Test2026',
    },
    { withCredentials: true }
  );
  expect(localStorage.length).toBe(0);
  axios.post.mockResolvedValueOnce({ data: { message: 'Déconnexion effectuée.' } });
  fireEvent.click(screen.getByRole('button', { name: 'Déconnexion' }));
  await screen.findByRole('button', { name: 'Se connecter' });
  expect(axios.post).toHaveBeenCalledWith(
    'http://localhost:5000/api/auth/logout',
    {},
    { withCredentials: true }
  );
  expect(screen.queryByText('Bonjour, client-test')).not.toBeInTheDocument();
});

test('une erreur réseau de session est signalée et ne donne aucun accès privé', async () => {
  axios.get.mockRejectedValueOnce(new Error('Network unavailable'));
  renderSession('/admin');
  await waitFor(() => expect(screen.getAllByRole('alert').length).toBeGreaterThan(0));
  expect(screen.queryByText('Espace administrateur')).not.toBeInTheDocument();
});
