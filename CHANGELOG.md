# Changelog

## Non publié

### Ajouts

- Journaux JSON Pino pour le backend, la gateway, le stock et les notifications.
- Contrôles `/health` pour les quatre services ; le backend et le stock vérifient MongoDB.
- Transport de mails HTTPS Brevo, configurable sans modifier le mode SMTP local.
- Initialisation du catalogue sans suppression des données existantes et outil de promotion d'un compte administrateur existant.
- Génération de documentation JSDoc et publication comme artefact de CI.
- Construction des images Docker en CI, publication GHCR et déploiement Render activables par configuration GitHub.
- Configuration locale persistante Uptime Kuma et liste des contrôles à activer dans les deux environnements.

### Corrections

- Conservation des valeurs par défaut de livraison et de paiement et mise à jour du panier sans mutation de son état.
- Validation des transitions de statut des commandes et contrôle des modifications concurrentes de stock.
- Calcul des prix côté serveur et validation des quantités et des adresses.
- Confirmation des commandes avec clé d'idempotence, réservation du stock et reprise après interruption.
- Navigation vers le frontend depuis un lien externe autorisée sans ouvrir les appels API aux origines étrangères.
- Diagnostic de démarrage du stock sans divulgation de l'adresse MongoDB ni des identifiants.
- Dépendances natives Linux du frontend dans le lockfile et exécution MongoDB de CI sur Ubuntu 22.04.

### Sécurité

- Mot de passe d'au moins 12 caractères avec majuscule, chiffre et caractère spécial ; limite compatible bcrypt.
- Session dans un cookie HttpOnly, Secure en production, SameSite=Lax, et rôle relu en base.
- Routes administrateur protégées et authentification des appels internes par token.
- Suppression des journaux contenant des mots de passe, tokens et données personnelles.
- Secrets exclus de Git et des contextes Docker ; audits npm exécutés en CI.

Les fonctionnalités nécessitant des comptes externes restent à activer et à vérifier après déploiement. La configuration fournie ne constitue pas une preuve de leur mise en service.
