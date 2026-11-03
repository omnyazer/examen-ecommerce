function notFound(req, res) {
  res.status(404).json({ message: 'Ressource introuvable.' });
}

function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);
  if (error.type === 'entity.parse.failed')
    return res.status(400).json({ message: 'Le corps JSON est invalide.' });
  if (error.type === 'entity.too.large')
    return res.status(413).json({ message: 'Les données envoyées sont trop volumineuses.' });
  if (error.code === 11000) return res.status(409).json({ message: 'Ces données existent déjà.' });
  if (['ValidationError', 'CastError'].includes(error.name)) {
    return res.status(400).json({ message: 'Les données envoyées sont invalides.' });
  }
  console.error('Une requête a échoué.');
  return res.status(500).json({ message: 'Une erreur interne est survenue.' });
}

module.exports = { notFound, errorHandler };
