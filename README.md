# Heaven Omega

Jeu de tactique au tour par tour qui se joue directement dans le navigateur : recrutez votre clan, choisissez les métiers, équipez vos unités et parcourez la carte du monde de mission en mission.

**Jouer en ligne :** https://wwwh8hv4w5-lang.github.io/heaven-omega/

Le jeu tient dans un seul fichier, `index.html`. Il n'y a rien à installer : ouvrez-le dans un navigateur récent (ordinateur, tablette ou téléphone).

## Sauvegardes

- **Sauvegarde automatique** quand vous revenez sur la carte ou dans une zone, après chaque mission, et quand l'onglet est fermé ou passe en arrière-plan.
- **Trois emplacements manuels**, depuis le menu *Sauvegardes* de la carte.
- **Continuer** reprend la sauvegarde la plus récente.
- **Exporter / Importer** une partie (fichier `.json` ou code à copier-coller) pour la transférer sur un autre appareil ou la mettre à l'abri.

Les parties sont enregistrées dans le navigateur (localStorage et IndexedDB). En navigation privée, elles peuvent disparaître à la fermeture : pensez à exporter. Une sauvegarde abîmée est ignorée avec un message, et les anciennes sauvegardes sont mises à jour automatiquement.

## Tests

Les tests automatiques (Playwright) vérifient que les parties survivent au rechargement de la page, pour chaque emplacement et pour la sauvegarde automatique.

```bash
npm install
npx playwright install chromium
npm test
```

Pour tester la version en ligne :

```bash
BASE_URL=https://wwwh8hv4w5-lang.github.io/heaven-omega/ npm test
```

## Crédits

Un jeu **Feral System Media** — F.S.M Game House.
