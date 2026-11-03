const Joi = require('joi');

const passwordMessage =
  'Le mot de passe doit contenir au moins 12 caractères, une majuscule, un chiffre et un caractère spécial.';
const username = Joi.string()
  .trim()
  .min(3)
  .max(50)
  .pattern(/^[\p{L}\p{N}_.-]+$/u);
const password = Joi.string()
  .custom((value, helpers) => {
    if (
      Array.from(value).length < 12 ||
      !/\p{Lu}/u.test(value) ||
      !/[0-9]/.test(value) ||
      !/[^\p{L}\p{N}\s]/u.test(value)
    ) {
      return helpers.error('password.complexity');
    }
    if (Buffer.byteLength(value, 'utf8') > 72) return helpers.error('password.length');
    return value;
  })
  .required()
  .messages({
    'password.complexity': passwordMessage,
    'string.base': passwordMessage,
    'string.empty': passwordMessage,
    'any.required': passwordMessage,
    'password.length': 'Le mot de passe ne doit pas dépasser 72 octets.',
  });

const register = Joi.object({
  username: username.required(),
  email: Joi.string()
    .trim()
    .lowercase()
    .email({ tlds: { allow: false } })
    .max(254)
    .required(),
  password,
});
const login = Joi.object({
  username: username.required(),
  password: Joi.string().max(1024).required(),
});
const addressField = (max) =>
  Joi.string()
    .trim()
    .min(1)
    .max(max)
    .pattern(/^[^\p{C}]+$/u)
    .required();
const order = Joi.object({
  items: Joi.array()
    .min(1)
    .max(100)
    .items(
      Joi.object({
        productId: Joi.string().hex().length(24).required(),
        quantity: Joi.number().integer().min(1).max(Number.MAX_SAFE_INTEGER).strict().required(),
        price: Joi.any().strip(),
      })
    )
    .required(),
  total: Joi.any().strip(),
  shippingAddress: Joi.object({
    street: addressField(200),
    city: addressField(100),
    postalCode: addressField(20),
    country: addressField(100),
  }).required(),
  paymentMethod: Joi.string().valid('Carte bancaire', 'PayPal', 'Virement').required(),
  shippingMethod: Joi.string().valid('colissimo', 'chronopost').required(),
});

function validate(schema, data) {
  const result = schema.validate(data, { abortEarly: false });
  if (!result.error) return result;
  const detail =
    result.error.details.find((item) => item.path[0] === 'password') || result.error.details[0];
  const field = detail.path[0];
  const messages = {
    username:
      'Le nom d’utilisateur doit contenir entre 3 et 50 lettres, chiffres, points, tirets ou traits de soulignement.',
    email: 'Une adresse email valide est requise.',
    items:
      'Le panier doit contenir entre 1 et 100 produits avec des identifiants valides et des quantités entières positives.',
    shippingAddress:
      'Une adresse complète est requise : rue (200 caractères maximum), ville et pays (100), code postal (20).',
    paymentMethod: 'Le mode de paiement est invalide.',
    shippingMethod: 'La méthode de livraison est invalide.',
  };
  return {
    error:
      field === 'password'
        ? detail.message
        : messages[field] || 'Les données envoyées sont invalides.',
  };
}

module.exports = { register, login, order, validate };
