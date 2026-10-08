// Prépare la version web exportée (dist-web) pour Vercel.
//
// Expo range les polices et icônes dans dist-web/assets/node_modules/… ; or
// Vercel n'envoie jamais un dossier nommé node_modules — l'app se retrouvait
// en ligne sans ses polices ni ses icônes. On déplace donc ce dossier vers
// assets/vendor et on corrige les chemins dans le code exporté.
//
// Usage : node scripts/prepare-web.js (lancé par `npm run build:web`).

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', 'dist-web');
const from = path.join(root, 'assets', 'node_modules');
const to = path.join(root, 'assets', 'vendor');

if (fs.existsSync(from)) {
  fs.renameSync(from, to);
}

let patched = 0;
function patch(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) patch(file);
    else if (/\.(js|html|css|json)$/.test(entry.name)) {
      const text = fs.readFileSync(file, 'utf8');
      if (text.includes('/assets/node_modules/')) {
        fs.writeFileSync(file, text.split('/assets/node_modules/').join('/assets/vendor/'));
        patched++;
      }
    }
  }
}
patch(root);

fs.copyFileSync(path.join(__dirname, '..', 'web', 'vercel.json'), path.join(root, 'vercel.json'));
console.log(`dist-web prêt pour Vercel (${patched} fichier(s) corrigé(s)).`);
