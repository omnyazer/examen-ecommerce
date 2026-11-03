function startupError(error) {
  if (!process.env.MONGO_URI) return 'Configuration : MONGO_URI est absent.';
  if (!process.env.INTERNAL_SERVICE_TOKEN)
    return 'Configuration : INTERNAL_SERVICE_TOKEN est absent.';
  if (
    error.code === 18 ||
    error.codeName === 'AuthenticationFailed' ||
    /bad auth|authentication failed|auth failed/i.test(error.message || '')
  )
    return 'MongoDB : authentification refusée. Vérifier utilisateur et mot de passe de la base.';
  if (error.name === 'MongoParseError' || error.name === 'MongoInvalidArgumentError')
    return 'MongoDB : adresse de connexion invalide. Vérifier la syntaxe et encoder le mot de passe.';
  if (['ENOTFOUND', 'ENODATA', 'ESERVFAIL', 'ECONNREFUSED'].includes(error.code))
    return 'MongoDB : résolution DNS ou connexion refusée. Vérifier le nom du cluster et le réseau.';
  if (error.name === 'MongooseServerSelectionError' || error.name === 'MongoServerSelectionError')
    return 'MongoDB : aucun serveur joignable. Vérifier les accès IP Atlas, le réseau et le cluster.';
  const knownTypes = [
    'MongoServerError',
    'MongoNetworkError',
    'MongoNetworkTimeoutError',
    'MongoAPIError',
    'MongooseError',
    'TypeError',
    'Error',
  ];
  const type = knownTypes.includes(error.name) ? error.name : 'non identifié';
  const code = Number.isSafeInteger(error.code) ? error.code : 'non numérique';
  return `Démarrage du stock impossible. Type : ${type}. Code : ${code}.`;
}

module.exports = { startupError };
