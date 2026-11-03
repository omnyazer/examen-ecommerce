// controllers/productController.js
const Product = require('../models/Product');
const { isObjectIdOrHexString } = require('mongoose');

exports.getProducts = async (req, res) => {
  try {
    const products = await Product.find();
    res.json(products);
  } catch {
    res.status(500).json({ message: 'Impossible de récupérer les produits.' });
  }
};

/** Modifie le stock uniquement si sa valeur précédente correspond encore à expectedStock.
 * @function updateProductStock
 * @param {object} req Requête administrateur validée.
 * @param {object} res Réponse incluant un conflit 409 en cas de modification concurrente.
 */
exports.updateProductStock = async (req, res) => {
  try {
    const { stock, expectedStock } = req.body || {};
    const { productId } = req.params;

    if (!isObjectIdOrHexString(productId)) {
      return res.status(400).json({ message: 'Identifiant de produit invalide.' });
    }
    if (
      !Number.isSafeInteger(stock) ||
      stock < 0 ||
      !Number.isSafeInteger(expectedStock) ||
      expectedStock < 0
    ) {
      return res.status(400).json({
        message: 'Le stock et le stock précédent doivent être des entiers positifs ou nuls.',
      });
    }

    const product = await Product.findOneAndUpdate(
      { _id: productId, stock: expectedStock },
      { $set: { stock } },
      { new: true, runValidators: true }
    );
    if (!product) {
      const exists = await Product.exists({ _id: productId });
      return res.status(exists ? 409 : 404).json({
        message: exists
          ? 'Le stock a changé. Rechargez les produits avant de réessayer.'
          : 'Produit non trouvé.',
      });
    }

    res.json({ message: 'Stock mis à jour avec succès.', product });
  } catch (error) {
    res.status(500).json({ message: 'Erreur serveur.' });
  }
};
