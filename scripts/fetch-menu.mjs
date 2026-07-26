#!/usr/bin/env node
/**
 * Recherche (Google Places API - New) le lien de menu des restaurants dont la
 * colonne "Menu" est vide, à partir de leur nom et de leur quartier, et écrit
 * dans cette colonne le site web renseigné sur leur fiche Google Maps.
 *
 * Pour beaucoup de petits restaurants au Japon sans site officiel, le champ
 * "site web" de leur fiche Google Business est en réalité un lien vers leur
 * page Tabelog — ce qui correspond exactement au lien de menu recherché ici
 * (Tabelog ou site officiel, selon ce que le restaurant a renseigné).
 *
 * Par défaut le script ne fait qu'un aperçu (aucune écriture) : les
 * correspondances trouvées via une recherche floue peuvent se tromper
 * d'enseigne, mieux vaut les relire avant d'écrire dans le Sheet. Passer
 * --appliquer pour écrire réellement les liens trouvés.
 *
 * Cache local (scripts/.cache/menu.json) : chaque résultat de recherche
 * Places est mémorisé par (feuille, nom, quartier) et réutilisé tel quel lors
 * des exécutions suivantes, sans rappeler l'API. Deux effets :
 *  - ce qui est écrit avec --appliquer est exactement ce qui a été vu à
 *    l'aperçu (pas de nouvel appel entre-temps qui pourrait renvoyer un
 *    résultat différent) ;
 *  - relancer le script (aperçu ou --appliquer) ne recoûte aucun appel API
 *    pour les lignes déjà cherchées. Passer --rafraichir pour ignorer le
 *    cache et relancer une recherche fraîche partout.
 *
 * Voir scripts/lib/google-sheets.mjs pour les prérequis d'authentification.
 * Variables d'environnement (via un fichier .env non commité) :
 *   SPREADSHEET_ID  - ID du Google Sheet (dans l'URL d'édition, entre "/d/" et "/edit")
 *   PLACES_API_KEY  - clé API restreinte à "Places API (New)"
 *
 * Usage :
 *   node --env-file=.env scripts/fetch-menu.mjs                 (aperçu)
 *   node --env-file=.env scripts/fetch-menu.mjs --appliquer     (écrit dans le Sheet)
 *   node --env-file=.env scripts/fetch-menu.mjs --rafraichir    (ignore le cache)
 */

import {
  requireEnv, attendre, extraireCoordonnees,
  connexionSheets, trouverTitreOnglet, lireFeuille,
  indexColonne, lettreColonne,
} from './lib/google-sheets.mjs';
import { cheminCache, chargerCache, sauvegarderCache, cleCache } from './lib/cache.mjs';

const SPREADSHEET_ID = requireEnv('SPREADSHEET_ID');
const PLACES_API_KEY = requireEnv('PLACES_API_KEY');
const APPLIQUER = process.argv.includes('--appliquer');
const RAFRAICHIR = process.argv.includes('--rafraichir');

const GID_RESTAURANTS = 892590698; // repris de src/app/service/restaurant/restaurant.service.ts

const DELAI_ENTRE_APPELS_MS = 300; // reste sous les limites de quota par défaut de Places API
const CACHE_PATH = cheminCache('menu.json');

async function chercherEtablissement(nom, quartier, coordonnees) {
  // Inclure le quartier dans la requête aide beaucoup à désambiguïser les
  // enseignes qui ont de nombreuses succursales.
  const textQuery = quartier ? `${nom} ${quartier}` : nom;

  const corps = {
    textQuery,
    maxResultCount: 1,
    ...(coordonnees && {
      locationBias: {
        circle: {
          center: { latitude: coordonnees.latitude, longitude: coordonnees.longitude },
          radius: 200,
        },
      },
    }),
  };

  const reponse = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': PLACES_API_KEY,
      // Adapter si Google fait évoluer le nom des champs de l'API Places (New).
      'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.websiteUri',
    },
    body: JSON.stringify(corps),
  });

  if (!reponse.ok) {
    throw new Error(`Places API a répondu ${reponse.status} : ${await reponse.text()}`);
  }

  const { places } = await reponse.json();
  return places?.[0] ?? null;
}

async function traiterFeuille(sheets, cache) {
  const titre = await trouverTitreOnglet(sheets, SPREADSHEET_ID, GID_RESTAURANTS);
  console.log(`\n--- ${titre} ---`);

  const lignes = await lireFeuille(sheets, SPREADSHEET_ID, titre);
  if (lignes.length === 0) {
    console.log('Feuille vide, ignorée.');
    return;
  }

  const entetes = lignes[0];
  const idxNom = indexColonne(entetes, 'Nom');
  const idxQuartier = indexColonne(entetes, 'Quartier');
  const idxLocalisation = indexColonne(entetes, 'Localisation');
  const idxMenu = indexColonne(entetes, 'Menu');

  if (idxNom === -1 || idxMenu === -1) {
    console.warn(`Colonnes "Nom" ou "Menu" introuvables dans ${titre}, feuille ignorée.`);
    return;
  }

  let nbTrouves = 0;
  let nbIntrouvables = 0;
  let nbDepuisCache = 0;

  for (let i = 1; i < lignes.length; i++) {
    const ligne = lignes[i];
    const nom = ligne[idxNom]?.trim();
    const menuExistant = ligne[idxMenu]?.trim();

    if (!nom || menuExistant) continue; // déjà renseigné, ou ligne sans nom : rien à faire

    const quartier = idxQuartier !== -1 ? ligne[idxQuartier]?.trim() : null;
    const localisation = idxLocalisation !== -1 ? ligne[idxLocalisation]?.trim() : null;
    const cle = cleCache(titre, nom, quartier);
    const entreeCache = !RAFRAICHIR ? cache[cle] : undefined;

    try {
      const coordonnees = extraireCoordonnees(localisation);

      let etablissement;
      if (entreeCache) {
        etablissement = entreeCache.etablissement;
        nbDepuisCache++;
      } else {
        etablissement = await chercherEtablissement(nom, quartier, coordonnees);
        cache[cle] = { etablissement, recherche: new Date().toISOString() };
        await attendre(DELAI_ENTRE_APPELS_MS);
      }

      if (!etablissement?.websiteUri) {
        console.warn(`  ${nom} : aucun site web renseigné sur la fiche Google Maps trouvée.${entreeCache ? ' (depuis le cache)' : ''}`);
        nbIntrouvables++;
      } else {
        // Log le résultat matché pour permettre de vérifier que c'est la bonne
        // enseigne avant d'appliquer (les enseignes à succursales multiples
        // sont ambiguës même avec le quartier en indice).
        console.log(`  ${nom} -> ${etablissement.displayName?.text ?? '?'} (${etablissement.formattedAddress ?? 'adresse inconnue'})${entreeCache ? ' (depuis le cache)' : ''}`);
        console.log(`    ${etablissement.websiteUri}`);
        nbTrouves++;

        if (APPLIQUER) {
          await sheets.spreadsheets.values.update({
            spreadsheetId: SPREADSHEET_ID,
            range: `${titre}!${lettreColonne(idxMenu)}${i + 1}`,
            valueInputOption: 'RAW',
            requestBody: { values: [[etablissement.websiteUri]] },
          });
        }
      }
    } catch (erreur) {
      console.error(`  ${nom} : échec (${erreur.message})`);
    }
  }

  console.log(`  ${nbTrouves} menu(s) trouvé(s) (dont ${nbDepuisCache} depuis le cache), ${nbIntrouvables} introuvable(s).`);
  if (nbTrouves > 0 && !APPLIQUER) {
    console.log('  (aperçu uniquement, relancer avec --appliquer pour écrire dans le Sheet)');
  }
}

async function main() {
  const sheets = await connexionSheets();
  const cache = await chargerCache(CACHE_PATH);

  try {
    await traiterFeuille(sheets, cache);
  } finally {
    // Sauvegardé même en cas d'erreur en cours de route : les recherches déjà
    // faites avant le crash ne sont pas reperdues au prochain lancement.
    await sauvegarderCache(CACHE_PATH, cache);
  }

  console.log('\nTerminé.');
}

main().catch(erreur => {
  console.error('Erreur fatale :', erreur);
  process.exit(1);
});