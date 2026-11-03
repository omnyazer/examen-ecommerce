import { render, screen } from '@testing-library/react';
import axios from 'axios';
import { CartProvider } from './context/CartContext';
import App from './App';

vi.mock('axios', () => ({ default: { get: vi.fn(), post: vi.fn() } }));

test('l’accueil public reste accessible sans connexion', async () => {
  axios.get.mockImplementation((url) =>
    url.endsWith('/me')
      ? Promise.reject({ response: { status: 401 } })
      : Promise.resolve({ data: [] })
  );
  render(
    <CartProvider>
      <App />
    </CartProvider>
  );
  expect(await screen.findByRole('link', { name: 'Connexion' })).toBeInTheDocument();
  expect(screen.getByText('Liste des Produits')).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Administration' })).not.toBeInTheDocument();
});
