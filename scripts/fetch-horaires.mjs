#!/usr/bin/env node
/**
 * Récupère les horaires d'ouverture (Google Places API - New) pour chaque
 * établissement d'un Google Sheet, à partir de son nom et de son lien Google
 * Maps (colonne "Localisation"), et les écrit dans une colonne "Horaires".
 *
 * Les horaires sont stockés sous forme compacte structurée (JSON), pas en
 * texte libre (les libellés "weekdayDescriptions" de Google dépendent de la
 * langue et sont peu fiables à re-parser côté app pour calculer "ouvert
 * maintenant"). Voir src/app/utils/horaires.ts côté app pour la lecture.
 *
 * Ce script est indépendant de l'app Angular : il s'exécute une fois (ou de
 * temps en temps) pour compléter le Sheet, jamais depuis le navigateur.
 *
 * Cache local (scripts/.cache/horaires.json) : chaque résultat de recherche
 * Places est mémorisé par (feuille, nom, quartier) et réutilisé tel quel lors
 * des exécutions suivantes, sans rappeler l'API. Relancer le script (ex: après
 * une interruption, ou avec --force sur d'autres lignes) ne recoûte donc aucun
 * appel API pour les établissements déjà cherchés. Passer --rafraichir pour
 * ignorer le cache et relancer une recherche fraîche partout.
 *
 * Voir scripts/lib/google-sheets.mjs pour les prérequis d'authentification.
 * Variables d'environnement (via un fichier .env non commité) :
 *   SPREADSHEET_ID  - ID du Google Sheet (dans l'URL d'édition, entre "/d/" et "/edit")
 *   PLACES_API_KEY  - clé API restreinte à "Places API (New)"
 *
 * Usage :
 *   node --env-file=.env scripts/fetch-horaires.mjs
 *   node --env-file=.env scripts/fetch-horaires.mjs --force       (réécrit aussi
 *   les lignes où la colonne "Horaires" est déjà remplie)
 *   node --env-file=.env scripts/fetch-horaires.mjs --rafraichir  (ignore le cache)
 */

import {
  requireEnv, attendre, extraireCoordonnees,
  connexionSheets, trouverTitreOnglet, lireFeuille,
  indexColonne, lettreColonne,
} from './lib/google-sheets.mjs';
import { cheminCache, chargerCache, sauvegarderCache, cleCache } from './lib/cache.mjs';

const SPREADSHEET_ID = requireEnv('SPREADSHEET_ID');
const PLACES_API_KEY = requireEnv('PLACES_API_KEY');
const FORCER = process.argv.includes('--force');
const RAFRAICHIR = process.argv.includes('--rafraichir');

// gid des onglets, repris de src/app/service/*/*.service.ts
const GIDS_FEUILLES = [892590698, 0, 346756517]; // Restaurants, Activités, Magasins

const COLONNE_HORAIRES = 'Horaires';
const DELAI_ENTRE_APPELS_MS = 300; // reste sous les limites de quota par défaut de Places API
const CACHE_PATH = cheminCache('horaires.json');

function formaterHeureMinute({ hour, minute }) {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

// Sérialise les "periods" de Places API en JSON compact :
// [{ j: jourOuverture(0=dim..6=sam, comme Date.getDay()), h: "HH:mm",
//    jf?: jourFermeture, hf?: "HH:mm" }]
// jf/hf absents = établissement ouvert en continu à partir de ce point (24h/24).
function serialiserPeriodes(periods) {
  if (!periods?.length) return null;
  return JSON.stringify(periods.map(p => ({
    j: p.open.day,
    h: formaterHeureMinute(p.open),
    ...(p.close && { jf: p.close.day, hf: formaterHeureMinute(p.close) }),
  })));
}

async function chercherEtablissement(nomEtablissement, quartier, coordonnees) {
  // Inclure le quartier dans la requête aide beaucoup à désambiguïser les
  // enseignes qui ont de nombreuses succursales (Daiso, Uniqlo, Starbucks...).
  const textQuery = quartier ? `${nomEtablissement} ${quartier}` : nomEtablissement;

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
      'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.regularOpeningHours.periods',
    },
    body: JSON.stringify(corps),
  });

  if (!reponse.ok) {
    throw new Error(`Places API a répondu ${reponse.status} : ${await reponse.text()}`);
  }

  const { places } = await reponse.json();
  return places?.[0] ?? null;
}

async function traiterFeuille(sheets, gid, cache) {
  const titre = await trouverTitreOnglet(sheets, SPREADSHEET_ID, gid);
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
  let idxHoraires = indexColonne(entetes, COLONNE_HORAIRES);

  if (idxNom === -1 || idxLocalisation === -1) {
    console.warn(`Colonnes "Nom" ou "Localisation" introuvables dans ${titre}, feuille ignorée.`);
    return;
  }

  if (idxHoraires === -1) {
    idxHoraires = entetes.length;
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${titre}!${lettreColonne(idxHoraires)}1`,
      valueInputOption: 'RAW',
      requestBody: { values: [[COLONNE_HORAIRES]] },
    });
  }

  for (let i = 1; i < lignes.length; i++) {
    const ligne = lignes[i];
    const nom = ligne[idxNom]?.trim();
    const quartier = idxQuartier !== -1 ? ligne[idxQuartier]?.trim() : null;
    const localisation = ligne[idxLocalisation]?.trim();
    const horairesExistants = ligne[idxHoraires]?.trim();

    if (!nom || !localisation) continue;

    if (horairesExistants && !FORCER) {
      console.log(`  ${nom} : déjà renseigné, ignoré (--force pour écraser).`);
      continue;
    }

    const cle = cleCache(titre, nom, quartier);
    const entreeCache = !RAFRAICHIR ? cache[cle] : undefined;

    try {
      const coordonnees = extraireCoordonnees(localisation);
      if (!coordonnees && !entreeCache) {
        console.warn(`  ${nom} : coordonnées introuvables dans le lien (lien raccourci ?), recherche non biaisée par la position.`);
      }

      let etablissement;
      if (entreeCache) {
        etablissement = entreeCache.etablissement;
      } else {
        etablissement = await chercherEtablissement(nom, quartier, coordonnees);
        cache[cle] = { etablissement, recherche: new Date().toISOString() };
        await attendre(DELAI_ENTRE_APPELS_MS);
      }

      if (!etablissement) {
        console.warn(`  ${nom} : aucun établissement trouvé sur Places.${entreeCache ? ' (depuis le cache)' : ''}`);
      } else {
        // Log le résultat matché pour permettre de vérifier que c'est la bonne succursale
        // (les enseignes avec beaucoup de succursales, ex: Daiso, Uniqlo, sont ambiguës).
        console.log(`  ${nom} -> ${etablissement.displayName?.text ?? '?'} (${etablissement.formattedAddress ?? 'adresse inconnue'})${entreeCache ? ' (depuis le cache)' : ''}`);

        const horaires = serialiserPeriodes(etablissement.regularOpeningHours?.periods);
        if (!horaires) {
          console.warn(`    aucun horaire renseigné sur cette fiche Google Maps.`);
        } else {
          await sheets.spreadsheets.values.update({
            spreadsheetId: SPREADSHEET_ID,
            range: `${titre}!${lettreColonne(idxHoraires)}${i + 1}`,
            valueInputOption: 'RAW',
            requestBody: { values: [[horaires]] },
          });
          console.log(`    horaires mis à jour.`);
        }
      }
    } catch (erreur) {
      console.error(`  ${nom} : échec (${erreur.message})`);
    }
  }
}

async function main() {
  const sheets = await connexionSheets();
  const cache = await chargerCache(CACHE_PATH);

  try {
    for (const gid of GIDS_FEUILLES) {
      await traiterFeuille(sheets, gid, cache);
    }
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
