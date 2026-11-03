import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { CartProvider, useCart } from '../context/CartContext';
import { createOrder } from '../services/api';
import ShippingPayment from './ShippingPayment';
import Order from './Order';

vi.mock('../services/api', () => ({
  createOrder: vi.fn(),
  getPendingOrder: vi.fn(),
  hasPendingOrder: vi.fn(() => false),
}));

function TestCart() {
  const { dispatch } = useCart();
  const prepare = () => {
    dispatch({
      type: 'ADD_TO_CART',
      payload: {
        id: '507f1f77bcf86cd799439011',
        name: 'Clavier',
        price: 120,
      },
    });
    dispatch({
      type: 'SET_SHIPPING_ADDRESS',
      payload: {
        street: '10 rue des Tests',
        city: 'Ville Test',
        postalCode: '75000',
        country: 'France',
      },
    });
  };
  return <button onClick={prepare}>Préparer le panier</button>;
}

function renderCheckout() {
  render(
    <CartProvider>
      <MemoryRouter initialEntries={['/shipping']}>
        <TestCart />
        <Routes>
          <Route path="/shipping" element={<ShippingPayment />} />
          <Route path="/shippig_payment" element={<ShippingPayment />} />
          <Route path="/order" element={<Order />} />
        </Routes>
      </MemoryRouter>
    </CartProvider>
  );
  fireEvent.click(screen.getByRole('button', { name: 'Préparer le panier' }));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(window, 'alert').mockImplementation(() => {});
  createOrder.mockResolvedValue({ data: { notificationStatus: 'disabled' } });
});
afterEach(() => vi.restoreAllMocks());

test('les choix par défaut sont conservés et transmis sans toucher aux menus', async () => {
  renderCheckout();
  expect(screen.getByLabelText('Méthode de livraison:')).toHaveValue('chronopost');
  expect(screen.getByLabelText('Mode de paiement:')).toHaveValue('Carte bancaire');
  fireEvent.click(screen.getByRole('button', { name: 'Passer une commande' }));
  expect(screen.getByText('chronopost')).toBeInTheDocument();
  expect(screen.getByText('Carte bancaire')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Confirmer la commande' }));
  await waitFor(() => expect(screen.getByText('Votre panier est vide.')).toBeInTheDocument());
  expect(createOrder).toHaveBeenCalledWith(
    expect.objectContaining({
      shippingMethod: 'chronopost',
      paymentMethod: 'Carte bancaire',
    })
  );
});

test('les choix modifiés sont conservés lors du retour au formulaire', () => {
  renderCheckout();
  fireEvent.change(screen.getByLabelText('Méthode de livraison:'), {
    target: { value: 'colissimo' },
  });
  fireEvent.change(screen.getByLabelText('Mode de paiement:'), { target: { value: 'PayPal' } });
  fireEvent.click(screen.getByRole('button', { name: 'Passer une commande' }));
  expect(screen.getByText('colissimo')).toBeInTheDocument();
  expect(screen.getByText('PayPal')).toBeInTheDocument();
  fireEvent.click(screen.getAllByRole('button', { name: 'Modifier' })[0]);
  expect(screen.getByLabelText('Méthode de livraison:')).toHaveValue('colissimo');
  expect(screen.getByLabelText('Mode de paiement:')).toHaveValue('PayPal');
  expect(createOrder).not.toHaveBeenCalled();
});
