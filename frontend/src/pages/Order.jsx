import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import { createOrder, getPendingOrder, hasPendingOrder } from '../services/api';

const Order = () => {
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [pending, setPending] = useState(hasPendingOrder);
  const [confirmationMessage, setConfirmationMessage] = useState('');
  //recuperer le context panier
  const { cart, shippingAddress, paymentMethod, shippingMethod, dispatch } = useCart(); // Récupérer le contenu du panier à partir du contexte

  const checkConfirmation = useCallback(async () => {
    try {
      const response = await getPendingOrder();
      if (!response) {
        setPending(false);
        return;
      }
      if (response.status === 202) {
        setPending(true);
        setConfirmationMessage(response.data.message);
        return;
      }
      setPending(false);
      setConfirmationMessage('Votre commande a bien été retrouvée et confirmée.');
      const items = response.data.order?.items || [];
      if (
        cart.length === items.length &&
        cart.every((item) =>
          items.some(
            (saved) => String(saved.productId) === item.id && saved.quantity === item.quantity
          )
        )
      )
        dispatch({ type: 'CLEAR_CART' });
    } catch (error) {
      setPending(hasPendingOrder());
      setConfirmationMessage(
        error.response?.data?.message || 'Impossible de vérifier la confirmation. Réessayez.'
      );
    }
  }, [cart, dispatch]);

  useEffect(() => {
    if (hasPendingOrder()) checkConfirmation();
  }, [checkConfirmation]);
  // Naviguer vers la page de commande
  const handleShippingPage = () => {
    navigate('/shippig_payment');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting || pending) return;

    // Vérifier les champs manquants
    const missingFields = [];
    if (cart.length === 0) missingFields.push('panier');
    if (!shippingAddress) missingFields.push('adresse de livraison');
    if (!shippingMethod) missingFields.push('méthode de livraison');
    if (!paymentMethod) missingFields.push('méthode de paiement');

    if (missingFields.length > 0) {
      alert(
        `Informations manquantes pour la commande :\n${missingFields
          .map((field) => `• ${field}`)
          .join('\n')}`
      );
      return;
    }

    // Vérifier le détail de l'adresse de livraison
    const requiredAddressFields = ['street', 'postalCode', 'city', 'country'];
    const missingAddressDetails = requiredAddressFields.filter(
      (field) => typeof shippingAddress[field] !== 'string' || !shippingAddress[field].trim()
    );

    if (missingAddressDetails.length > 0) {
      alert(
        `Adresse de livraison incomplète :\n${missingAddressDetails
          .map((field) => `• ${field}`)
          .join('\n')}`
      );
      return;
    }

    try {
      setSubmitting(true);
      // Créer la commande seulement si toutes les vérifications passent
      const orderDetails = {
        items: cart.map((item) => ({
          productId: item.id,
          quantity: item.quantity,
        })),
        shippingAddress,
        paymentMethod,
        shippingMethod,
      };

      const response = await createOrder(orderDetails);
      if (response.status === 202) {
        setPending(true);
        setConfirmationMessage(response.data.message);
        return;
      }

      dispatch({ type: 'CLEAR_CART' });
      const message =
        response.data?.notificationStatus === 'failed'
          ? 'Commande confirmée. Le mail de notification n’a pas pu être envoyé.'
          : response.data?.notificationStatus === 'unknown'
            ? 'Commande confirmée. L’envoi du mail de notification n’a pas pu être confirmé.'
            : 'Commande confirmée avec succès !';
      alert(message);
    } catch (error) {
      setPending(hasPendingOrder());
      if (hasPendingOrder())
        setConfirmationMessage('La confirmation doit être vérifiée avant une nouvelle commande.');
      alert(
        error.response?.data?.message || 'Une erreur technique est survenue. Veuillez réessayer.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="p-8">
      <h2 className="text-2xl font-bold mb-4">Synthèse de la commande</h2>
      {confirmationMessage && (
        <p role="status" className="my-4">
          {confirmationMessage}
        </p>
      )}
      {pending && (
        <button
          onClick={checkConfirmation}
          className="bg-blue-500 text-white px-4 py-2 rounded mb-4"
        >
          Vérifier la confirmation
        </button>
      )}
      {cart.length === 0 ? (
        <p className="text-gray-600">Votre panier est vide.</p>
      ) : (
        <div>
          <table className="w-full border-collapse border border-gray-300">
            <thead>
              <tr>
                <th className="border border-gray-300 p-2">Produit(s)</th>
                <th className="border border-gray-300 p-2">Quantité(s)</th>
                <th className="border border-gray-300 p-2">Prix Unitaire (€)</th>
                <th className="border border-gray-300 p-2">Prix Total (€)</th>
              </tr>
            </thead>
            <tbody>
              {cart.map((item) => (
                <tr key={item.id}>
                  <td className="border border-gray-300 p-2">{item.name}</td>
                  <td className="border border-gray-300 p-2 text-center">{item.quantity}</td>
                  <td className="border border-gray-300 p-2 text-center">
                    {item.price.toFixed(2)}
                  </td>
                  <td className="border border-gray-300 p-2 text-center">
                    {(item.price * item.quantity).toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-right font-bold text-lg mt-4">
            Total : {cart.reduce((acc, item) => acc + item.price * item.quantity, 0).toFixed(2)} €
          </p>

          {/* Nouvelles informations ajoutées ici */}
          <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <h3 className="text-lg font-semibold mb-2">Adresse de livraison</h3>
              {shippingAddress ? (
                <>
                  <div className="bg-gray-50 p-4 rounded">
                    <p>{shippingAddress.street}</p>
                    <p>
                      {shippingAddress.postalCode} {shippingAddress.city}
                    </p>
                    <p>{shippingAddress.country}</p>
                  </div>
                  <div>
                    <div>
                      <button
                        onClick={handleShippingPage}
                        className="bg-blue-500 text-white px-4 py-2 rounded"
                      >
                        Modifier
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <p className="text-gray-500">Aucune adresse de livraison fournie.</p>
              )}
            </div>

            <div>
              <div className="mb-4">
                <h3 className="text-lg font-semibold mb-2">Méthode de livraison</h3>
                <div className="bg-gray-50 p-4 rounded">{shippingMethod || 'Non spécifiée'}</div>
              </div>

              <div className="mb-4">
                <h3 className="text-lg font-semibold mb-2">Méthode de paiement</h3>
                <div className="bg-gray-50 p-4 rounded">{paymentMethod || 'Non spécifiée'}</div>
              </div>
              <div>
                <div>
                  <button
                    onClick={handleShippingPage}
                    className="bg-blue-500 text-white px-4 py-2 rounded"
                  >
                    Modifier
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-end mt-4">
            <button
              onClick={handleSubmit}
              disabled={submitting || pending}
              className="bg-blue-500 text-white px-6 py-2 rounded hover:bg-blue-600 disabled:opacity-50"
            >
              {submitting ? 'Confirmation en cours…' : 'Confirmer la commande'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Order;
