# Exploitation de l'application

## Préproduction et production

Les quatre services d'un environnement doivent partager la même région. La production utilise un autre projet Atlas, d'autres services Render et d'autres secrets. Les bases ne sont pas partagées entre environnements.

| Service | Root Directory | Dockerfile Path | Docker Build Context | Health Check |
| --- | --- | --- | --- | --- |
| Application et frontend | vide | `./Dockerfile` | `.` | `/health` |
| Gateway | `gateway` | `./Dockerfile` | `.` | `/health` |
| Stock | `microservices/stock-management` | `./Dockerfile` | `.` | `/health` |
| Notifications | `microservices/notifications` | `./Dockerfile` | `.` | `/health` |

Les chemins sont relatifs à Root Directory. Les images contiennent les dépendances de production et excluent les fichiers `.env`. Render termine HTTPS et fournit `PORT` au processus.

Configurer les variables suivantes dans Render, sans les inscrire dans Git :

| Service | Variables |
| --- | --- |
| Application | `MONGO_URI`, `JWT_SECRET`, `INTERNAL_SERVICE_TOKEN`, `FRONTEND_ORIGIN`, `GATEWAY_URL`, `NOTIFICATIONS_ENABLED`, `ORDER_NOTIFICATION_EMAIL`, `APP_ENV` |
| Gateway | `STOCK_SERVICE_URL`, `NOTIFI_SERVICE_URL`, `APP_ENV` |
| Stock | `MONGO_URI`, `INTERNAL_SERVICE_TOKEN`, `APP_ENV` |
| Notifications | `INTERNAL_SERVICE_TOKEN`, `NOTIFICATIONS_ENABLED`, `EMAIL_PROVIDER`, `EMAIL_FROM`, `BREVO_API_KEY`, `APP_ENV` |

- `APP_ENV` vaut `preproduction` ou `production` ; `NODE_ENV` reste `production` dans les conteneurs pour activer les cookies Secure.
- Les secrets JWT et internes sont aléatoires, d'au moins 32 caractères ; un token interne commun par environnement, mais distinct entre environnements.
- `FRONTEND_ORIGIN` est l'origine HTTPS exacte de l'application, sans slash final. Elle doit être renseignée avant le démarrage en production.
- `GATEWAY_URL` pointe vers la gateway du même environnement ; les deux URL de la gateway pointent vers le stock et les notifications du même environnement.
- Dans Atlas, créer un utilisateur dédié par environnement avec seulement `readWrite` sur `exam1Db`. Ajouter les plages IP sortantes Render et l'IP de maintenance à la liste d'accès du bon projet.
- Les offres gratuites sont destinées à la démonstration : quota horaire partagé, mise en veille et temps de démarrage. Une supervision fréquente peut consommer le quota en empêchant la mise en veille. Ne pas présenter cet environnement comme une production à haute disponibilité.

## Initialiser les données et l'administration

Depuis la racine du dépôt, dans PowerShell :

```powershell
.\scripts\initialize-atlas.ps1 -Action catalogue
```

Coller l'adresse Atlas cible dans la saisie masquée. Elle n'est pas écrite dans un fichier ni dans l'historique de commande. L'outil ajoute les cinq produits absents, sans effacer les produits ni réinitialiser les stocks existants. Vérifier le projet Atlas cible avant d'exécuter l'opération.

Créer ensuite un compte distinct depuis le formulaire d'inscription de l'application cible. Pour lui attribuer le rôle administrateur :

```powershell
.\scripts\initialize-atlas.ps1 -Action admin
```

Saisir l'adresse Atlas cible et l'email exact de ce compte. Seul ce compte existant est promu ; aucun mot de passe administrateur par défaut n'est créé.

## Notifications via HTTPS

Pour Resend, créer un compte avec l'adresse de réception du test, puis créer une clé API avec le droit d'envoi. Dans le service notifications Render, utiliser `EMAIL_PROVIDER=resend`, `EMAIL_FROM=onboarding@resend.dev`, `RESEND_API_KEY` et `NOTIFICATIONS_ENABLED=true`. Dans le service application, définir `NOTIFICATIONS_ENABLED=true` et `ORDER_NOTIFICATION_EMAIL` sur l'adresse du compte Resend. Sans domaine validé, l'expéditeur de test Resend ne permet l'envoi qu'à cette adresse. Pour d'autres destinataires, valider un domaine et adapter `EMAIL_FROM`. Redéployer les deux services avec le code à jour, puis passer une nouvelle commande ; les anciennes notifications désactivées ne sont pas renvoyées.

L'intégration Brevo reste disponible comme autre transport HTTPS :

Dans Brevo, valider un expéditeur et créer une clé API (pas une clé SMTP). Dans le service notifications Render :

```text
EMAIL_PROVIDER=brevo
EMAIL_FROM=adresse-expediteur-validee
BREVO_API_KEY=valeur-privee
NOTIFICATIONS_ENABLED=true
```

Dans l'application du même environnement, définir `NOTIFICATIONS_ENABLED=true` et `ORDER_NOTIFICATION_EMAIL` sur la boîte autorisée pour le test. Redéployer les deux services et vérifier la réception d'une commande de test. Une acceptation par le fournisseur ne garantit pas la livraison dans la boîte ; vérifier aussi les indésirables et les événements Brevo. La configuration locale continue à utiliser Gmail SMTP si `EMAIL_PROVIDER` est absent ou vaut `smtp`.

## CI/CD

### Activation directe avec Render

Pour la préproduction actuellement reliée à `main`, ouvrir chacun des quatre services Render, puis Settings > Build & Deploy > Auto-Deploy, sélectionner **After CI Checks Pass** et enregistrer. Les services concernés sont `examen-ecommerce` (stock), `examen-ecommerce-1` (notifications), `ecommerce-gateway-preprod` et `ecommerce-app-preprod`.

GitHub Actions effectue les contrôles et construit les images ; Render attend les checks réussis avant de reconstruire et déployer chaque service. Vérifier ensuite dans Render un événement automatique associé au même commit et son statut live. Un déclenchement manuel ne prouve pas le fonctionnement du déploiement automatique.

Avec cette méthode, laisser `ENABLE_RENDER_CD` absent ou à `false` pour ne pas déclencher également les hooks. Aucun secret de déploiement Render n'est requis dans GitHub. La publication GHCR reste activable séparément avec `ENABLE_IMAGE_PUBLISH=true`.

Après création de la production, associer les quatre services de préproduction à `staging`, ceux de production à `main`, et activer le même réglage sur les deux groupes. Les déploiements natifs des différents services ne sont pas coordonnés et ne constituent pas une mise à jour atomique.

### Variante pilotée par les hooks GitHub Actions

Cette variante remplace le déclenchement natif ci-dessus ; choisir une seule méthode.

1. Créer la branche `staging` à partir de `main`, puis la pousser soi-même. Associer les services Render de préproduction à `staging`, ceux de production à `main`.
2. Dans GitHub, créer les environnements `preproduction` et `production` dans Settings > Environments.
3. Dans chaque environnement GitHub, enregistrer les secrets `RENDER_API_KEY`, `RENDER_STOCK_HOOK`, `RENDER_NOTIFICATIONS_HOOK`, `RENDER_GATEWAY_HOOK` et `RENDER_APP_HOOK`. Les quatre hooks proviennent de Settings > Deploy Hook des services correspondants. Ne jamais mélanger les hooks des deux environnements.
4. Désactiver Auto-Deploy dans Render pour que seul le pipeline pilote les déploiements et éviter les doubles déclenchements.
5. Activer la variable de dépôt GitHub `ENABLE_RENDER_CD=true` une fois les deux environnements configurés. Les hooks ciblent le SHA testé et le pipeline attend le statut live de chaque service. Un échec arrête les services suivants ; les services déjà déployés ne sont pas automatiquement annulés.
6. Pour publier aussi les images Docker dans GitHub Container Registry, activer `ENABLE_IMAGE_PUBLISH=true`. Le workflow utilise le token GitHub éphémère avec le droit packages:write. Vérifier la visibilité des packages dans GitHub.
7. Si disponible pour le dépôt et l'offre GitHub, protéger `main` avec une PR et des checks obligatoires ; activer une validation de l'environnement production selon les besoins.

Le workflow installe, teste, audite, génère la documentation et construit les six images. La publication et le déploiement restent désactivés tant que leurs variables d'activation ne sont pas définies. Aucun secret n'est nécessaire pour la CI des pull requests.

## Logs et contrôle de santé

Les journaux Pino sont des objets JSON sur stdout : service, environnement, niveau, identifiant de requête, méthode, code HTTP et durée. Ils ne contiennent ni corps, ni en-têtes, ni chaîne MongoDB, ni données utilisateur. `LOG_LEVEL` règle le niveau, par défaut `info`. Consulter les erreurs dans Render > Logs et les auditer avec les résultats npm audit de CI.

`/health` expose uniquement un statut. Le backend et le stock renvoient 503 si MongoDB est déconnecté ; la gateway et les notifications indiquent la disponibilité du processus. Ce contrôle ne prouve pas la livraison des mails ni le succès d'une commande complète.

## Supervision Uptime Kuma

```powershell
docker compose -p ecommerce-monitoring -f monitoring/compose.yml up -d
```

Ouvrir `http://localhost:3004`, créer son compte administrateur privé et ajouter les moniteurs HTTP de `monitoring/targets.json`. Ce JSON est une liste de référence, pas un fichier d'import Uptime Kuma. Remplacer les quatre adresses production après leur création.

Pour chaque moniteur : HTTP attendu 200, délai 120 secondes, intervalle 300 secondes, deux tentatives avant alerte. Dans Notifications, configurer une notification SMTP autorisée, utiliser le bouton de test et l'associer aux huit moniteurs. Avec Kuma local, les ports SMTP ne sont pas soumis aux limitations des services Render gratuits.

Vérifier une alerte de panne et de rétablissement avec un moniteur temporaire visant une URL `/health-inexistant`, puis remettre `/health`. Ne pas interrompre les services réels pour ce test.

Le volume conserve la configuration. La supervision locale fonctionne uniquement lorsque l'ordinateur et Docker sont allumés ; elle n'est pas une supervision permanente indépendante. Ne pas exposer son interface sur Internet sans authentification et HTTPS.

## Domaine et HTTPS

Avec l'accord du propriétaire du domaine, ajouter deux sous-domaines dédiés dans Render > Settings > Custom Domains, par exemple `preprod.boutique.domaine.tld` et `boutique.domaine.tld`. Dans la zone DNS réellement autoritaire, ajouter les CNAME demandés vers les URL Render correspondantes. Conserver les enregistrements du site existant et des mails ; aucun changement global de serveurs de noms n'est nécessaire si la zone DNS fonctionne déjà.

Attendre la validation DNS et du certificat par Render, vérifier les deux liens HTTPS et mettre à jour `FRONTEND_ORIGIN` sur chacun des services application. Les sessions devront être recréées sur le nouveau domaine. Mettre à jour les moniteurs avec ces domaines. Render gère l'émission et le renouvellement des certificats ; vérifier l'émetteur et les dates dans le navigateur sans supposer un émetteur particulier.

## Documentation et vérification finale

```powershell
npm.cmd run docs
```

La documentation HTML est générée dans `docs/api/index.html` et conservée comme artefact de CI. Le journal des évolutions est dans `CHANGELOG.md`. Ce document est un guide technique d'exploitation, pas le rapport du formulaire d'examen.

Dans chaque environnement, vérifier inscription, mauvais mot de passe, session après actualisation, panier, valeurs de livraison par défaut, commande, réception du mail, baisse exacte du stock, reprise sans doublon, accès client interdit à l'administration, validation puis expédition et modification du stock. Ne pas indiquer ces validations comme réussies avant de les avoir effectuées sur l'environnement concerné.
