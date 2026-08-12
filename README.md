# FootPredict CI

Site de pronostics football avec espace public, espace administrateur et paiement Wave prévu via Checkout API.

## Identifiants admin
Nom d'utilisateur: `admin`
Mot de passe: `FPC-Mkn_R1oFc2A`

Changez ces identifiants avant la mise en production.

## Lancer
1. Installer Node.js 20+.
2. Copier `.env.example` vers `.env`.
3. `npm install`
4. `npm start`
5. Site: http://localhost:3000
6. Admin: http://localhost:3000/admin

## Wave
Le site utilise l'architecture Wave Checkout API. Vous devez avoir un compte Wave Business et renseigner `WAVE_API_KEY` côté serveur. La clé ne doit jamais être mise dans le navigateur.
La documentation officielle: https://docs.wave.com/checkout

Le paiement de 500 XOF est paramétré par défaut. Après configuration Wave, le bouton de paiement redirige vers la session Checkout.

## Important
La version fournie est une base fonctionnelle de production à déployer sur un hébergeur Node.js. Pour une vraie mise en ligne, utilisez HTTPS, une vraie base de données, un domaine, et configurez le webhook Wave pour confirmer les paiements côté serveur avant d'accorder l'accès premium.
