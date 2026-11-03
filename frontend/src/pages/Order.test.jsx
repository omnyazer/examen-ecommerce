import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import { createOrder, getPendingOrder, hasPendingOrder } from '../services/api';
import Order from './Order';

vi.mock('../context/CartContext', () => ({ useCart: vi.fn() }));
vi.mock('../services/api', () => ({
  createOrder: vi.fn(),
  getPendingOrder: vi.fn(),
  hasPendingOrder: vi.fn(() => false),
}));

const dispatch = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  hasPendingOrder.mockReturnValue(false);
  vi.spyOn(window, 'alert').mockImplementation(() => {});
  useCart.mockReturnValue({
    cart: [{ id: '507f1f77bcf86cd799439011', name: 'Clavier', price: 120, quantity: 3 }],
    shippingAddress: {
      street: '10 rue des Tests',
      city: 'Ville Test',
      postalCode: '75000',
      country: 'France',
    },
    shippingMethod: 'chronopost',
    paymentMethod: 'Carte bancaire',
    dispatch,
  });
});
afterEach(() => vi.restoreAllMocks());

function renderOrder() {
  render(
    <MemoryRouter>
      <Order />
    </MemoryRouter>
  );
  return screen.getByRole('button', { name: 'Confirmer la commande' });
}

test('la confirmation envoie les identifiants et quantités sans prix ni total client', async () => {
  createOrder.mockResolvedValueOnce({ status: 201 });
  fireEvent.click(renderOrder());
  await waitFor(() => expect(dispatch).toHaveBeenCalledWith({ type: 'CLEAR_CART' }));
  const payload = createOrder.mock.calls[0][0];
  expect(payload.items).toEqual([{ productId: '507f1f77bcf86cd799439011', quantity: 3 }]);
  expect(payload).not.toHaveProperty('total');
});

test('le bouton est désactivé pendant la confirmation', async () => {
  let finish;
  createOrder.mockReturnValueOnce(
    new Promise((resolve) => {
      finish = resolve;
    })
  );
  const button = renderOrder();
  fireEvent.click(button);
  expect(button).toBeDisabled();
  fireEvent.click(button);
  expect(createOrder).toHaveBeenCalledTimes(1);
  finish({ status: 201 });
  await waitFor(() => expect(button).not.toBeDisabled());
});

test('une erreur serveur est affichée sans vider le panier', async () => {
  createOrder.mockRejectedValueOnce({
    response: { data: { message: 'Stock insuffisant pour ce produit.' } },
  });
  const button = renderOrder();
  fireEvent.click(button);
  await waitFor(() =>
    expect(window.alert).toHaveBeenCalledWith('Stock insuffisant pour ce produit.')
  );
  expect(dispatch).not.toHaveBeenCalled();
  expect(button).not.toBeDisabled();
});

test('une notification échouée laisse la commande confirmée et informe l’utilisateur', async () => {
  createOrder.mockResolvedValueOnce({ status: 201, data: { notificationStatus: 'failed' } });
  fireEvent.click(renderOrder());
  await waitFor(() =>
    expect(window.alert).toHaveBeenCalledWith(
      'Commande confirmée. Le mail de notification n’a pas pu être envoyé.'
    )
  );
  expect(dispatch).toHaveBeenCalledWith({ type: 'CLEAR_CART' });
});

test('une confirmation en attente conserve le panier et permet de vérifier le résultat', async () => {
  createOrder.mockResolvedValueOnce({
    status: 202,
    data: { pending: true, message: 'Confirmation en cours.' },
  });
  getPendingOrder.mockResolvedValueOnce({
    status: 200,
    data: {
      order: {
        items: [{ productId: '507f1f77bcf86cd799439011', quantity: 3 }],
      },
    },
  });
  const button = renderOrder();
  fireEvent.click(button);
  await screen.findByRole('button', { name: 'Vérifier la confirmation' });
  expect(dispatch).not.toHaveBeenCalled();
  expect(button).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Vérifier la confirmation' }));
  await waitFor(() => expect(dispatch).toHaveBeenCalledWith({ type: 'CLEAR_CART' }));
  expect(createOrder).toHaveBeenCalledTimes(1);
});
