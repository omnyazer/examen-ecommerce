import { cartReducer } from './CartContext';

test('ajouter un exemplaire ne modifie pas l’ancien état du panier', () => {
  const item = Object.freeze({ id: 'product-id', quantity: 1, price: 100 });
  const state = Object.freeze({ cart: Object.freeze([item]) });
  const updated = cartReducer(state, {
    type: 'ADD_TO_CART',
    payload: { id: 'product-id', quantity: 1 },
  });
  expect(updated.cart[0].quantity).toBe(2);
  expect(state.cart[0].quantity).toBe(1);
});
