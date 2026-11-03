import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import {
  getOrders,
  getProducts,
  updateOrderStatus,
  updateProductStock,
} from '../services/adminApi';
import Admin from './Admin';

vi.mock('../services/adminApi', () => ({
  getOrders: vi.fn(),
  getProducts: vi.fn(),
  updateOrderStatus: vi.fn(),
  updateProductStock: vi.fn(),
}));

const product = { _id: 'product-id', name: 'Clavier', stock: 15, price: 120 };
const order = { _id: 'order-id', status: 'En attente', total: 120, items: [] };

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(window, 'alert').mockImplementation(() => {});
  getOrders.mockResolvedValue({ data: [order] });
  getProducts.mockResolvedValue({ data: [product] });
});
afterEach(() => vi.restoreAllMocks());

test('un stock de zéro est envoyé comme un nombre avec le stock précédent', async () => {
  updateProductStock.mockResolvedValue({ data: { product: { ...product, stock: 0 } } });
  render(<Admin />);
  const input = await screen.findByLabelText('Nouveau stock de Clavier');
  fireEvent.change(input, { target: { value: '0' } });
  fireEvent.click(screen.getByRole('button', { name: 'Mettre à jour' }));
  await waitFor(() => expect(updateProductStock).toHaveBeenCalledWith('product-id', 0, 15));
  await waitFor(() => expect(within(input.closest('tr')).getByText('0')).toBeInTheDocument());
});

test('un stock fractionnaire est refusé sans appel réseau', async () => {
  render(<Admin />);
  fireEvent.change(await screen.findByLabelText('Nouveau stock de Clavier'), {
    target: { value: '1.5' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Mettre à jour' }));
  expect(updateProductStock).not.toHaveBeenCalled();
  expect(window.alert).toHaveBeenCalledWith('Veuillez entrer une quantité de stock valide.');
});

test('une erreur au chargement est affichée', async () => {
  getOrders.mockRejectedValueOnce({ response: { data: { message: 'Accès interdit' } } });
  render(<Admin />);
  expect(await screen.findByRole('alert')).toHaveTextContent('Accès interdit');
});

test('un conflit de stock affiche le message serveur et recharge les produits', async () => {
  updateProductStock.mockRejectedValueOnce({
    response: { status: 409, data: { message: 'Le stock a changé.' } },
  });
  render(<Admin />);
  fireEvent.change(await screen.findByLabelText('Nouveau stock de Clavier'), {
    target: { value: '3' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Mettre à jour' }));
  await waitFor(() => expect(getProducts).toHaveBeenCalledTimes(2));
  expect(window.alert).toHaveBeenCalledWith('Le stock a changé.');
});

test('la validation affiche le statut renvoyé par le serveur', async () => {
  updateOrderStatus.mockResolvedValueOnce({
    data: { order: { ...order, status: 'En cours de traitement' } },
  });
  render(<Admin />);
  const validateButton = await screen.findByRole('button', { name: 'Valider la commande' });
  expect(
    screen.queryByRole('button', { name: 'Changer état à "Expédiée"' })
  ).not.toBeInTheDocument();
  fireEvent.click(validateButton);
  await waitFor(() => expect(screen.getByText('En cours de traitement')).toBeInTheDocument());
  expect(updateOrderStatus).toHaveBeenCalledWith('order-id', 'En cours de traitement');
  expect(screen.queryByRole('button', { name: 'Valider la commande' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Changer état à "Expédiée"' })).toBeInTheDocument();
});

test('une commande expédiée ne propose plus validation ni expédition', async () => {
  getOrders.mockResolvedValueOnce({ data: [{ ...order, status: 'Expédiée' }] });
  render(<Admin />);
  await screen.findByText('Expédiée');
  expect(screen.queryByRole('button', { name: 'Valider la commande' })).not.toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Changer état à "Expédiée"' })
  ).not.toBeInTheDocument();
});
