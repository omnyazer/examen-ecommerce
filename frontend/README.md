# Frontend e-commerce

Interface React avec React Router, Tailwind CSS et Vite. Node.js 22.22.2 ou une version LTS compatible plus récente est nécessaire.

Depuis ce dossier :

```powershell
npm.cmd ci
npm.cmd start
```

Le site démarre sur `http://localhost:3002`. Le backend doit répondre sur `http://localhost:5000` et autoriser cette origine avec les cookies. Si le port 3002 est occupé, arrêter l'ancien frontend avant de relancer.

```powershell
npm.cmd test
npm.cmd run build
```

Les tests utilisent Vitest et Testing Library. Les composants contenant du JSX portent l'extension `.jsx`. La compilation produit les fichiers statiques dans `build/`.

Pour prévisualiser la compilation :

```powershell
npm.cmd run preview
```

La connexion utilise un cookie HttpOnly émis par le backend. Les tokens ne sont pas enregistrés dans le stockage local du navigateur.
