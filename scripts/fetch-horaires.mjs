#!/usr/bin/env node
/**
 * Récupère les horaires d'ouverture (Google Places API - New) pour chaque
 * établissement d'un Google Sheet, à partir de son nom et de son lien Google
 * Maps (colonne "Localisation"), et les écrit dans une colonne "Horaires".
 *
 * Ce script est indépendant de l'app Angular : il s'exécute une fois (ou de
 * temps en temps) pour compléter le Sheet, jamais depuis le navigateur.
 *
 * Authentification Sheets : OAuth "Desktop app" (pas de compte de service,
 * bloqué par la règle d'organisation iam.disableServiceAccountKeyCreation).
 * Au premier lancement, une fenêtre de navigateur s'ouvre pour te connecter
 * avec ton compte Google ; le jeton obtenu est ensuite mis en cache dans
 * token.json pour les lancements suivants (pas de fichier -> nouvelle connexion).
 *
 * Prérequis :
 *   - credentials.json à la racine du projet : client OAuth "Desktop app"
 *     téléchargé depuis Google Cloud Console (API et services > Identifiants).
 *   - Variables d'environnement, via un fichier .env non commité :
 *       SPREADSHEET_ID  - ID du Google Sheet (dans l'URL d'édition,
 *                          entre "/d/" et "/edit")
 *       PLACES_API_KEY  - clé API restreinte à "Places API (New)"
 *
 * Usage :
 *   node --env-file=.env scripts/fetch-horaires.mjs
 *   node --env-file=.env scripts/fetch-horaires.mjs --force   (réécrit aussi
 *   les lignes où la colonne "Horaires" est déjà remplie)
 */

import fs from 'fs/promises';
import path from 'path';
import { authenticate } from '@google-cloud/local-auth';
import { google } from 'googleapis';

const SPREADSHEET_ID = requireEnv('SPREADSHEET_ID');
const PLACES_API_KEY = requireEnv('PLACES_API_KEY');
const FORCER = process.argv.includes('--force');

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];
const CREDENTIALS_PATH = path.join(process.cwd(), 'credentials.json');
const TOKEN_PATH = path.join(process.cwd(), 'token.json');

// gid des onglets, repris de src/app/service/*/*.service.ts
const GIDS_FEUILLES = [892590698, 0, 346756517]; // Restaurants, Activités, Magasins

const COLONNE_HORAIRES = 'Horaires';
const DELAI_ENTRE_APPELS_MS = 300; // reste sous les limites de quota par défaut de Places API

function requireEnv(nom) {
  const valeur = process.env[nom];
  if (!valeur) {
    console.error(`Variable d'environnement manquante : ${nom}`);
    process.exit(1);
  }
  return valeur;
}

function attendre(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Même logique que GeolocationService.extraireCoordonnees côté app.
function extraireCoordonnees(lienGoogleMaps) {
  if (!lienGoogleMaps) return null;
  const matchArobase = lienGoogleMaps.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (matchArobase) return { latitude: parseFloat(matchArobase[1]), longitude: parseFloat(matchArobase[2]) };
  const matchQuery = lienGoogleMaps.match(/[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (matchQuery) return { latitude: parseFloat(matchQuery[1]), longitude: parseFloat(matchQuery[2]) };
  const matchPlace = lienGoogleMaps.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
  if (matchPlace) return { latitude: parseFloat(matchPlace[1]), longitude: parseFloat(matchPlace[2]) };
  return null;
}

async function chargerJetonExistant() {
  try {
    const contenu = await fs.readFile(TOKEN_PATH);
    return google.auth.fromJSON(JSON.parse(contenu));
  } catch {
    return null;
  }
}

async function sauvegarderJeton(client) {
  const contenu = await fs.readFile(CREDENTIALS_PATH);
  const cles = JSON.parse(contenu);
  const cle = cles.installed || cles.web;
  const payload = JSON.stringify({
    type: 'authorized_user',
    client_id: cle.client_id,
    client_secret: cle.client_secret,
    refresh_token: client.credentials.refresh_token,
  });
  await fs.writeFile(TOKEN_PATH, payload);
}

async function autoriser() {
  const jetonExistant = await chargerJetonExistant();
  if (jetonExistant) {
    return jetonExistant;
  }

  const client = await authenticate({ scopes: SCOPES, keyfilePath: CREDENTIALS_PATH });
  if (client.credentials) {
    await sauvegarderJeton(client);
  }
  return client;
}

async function connexionSheets() {
  const auth = await autoriser();
  return google.sheets({ version: 'v4', auth });
}

async function trouverTitreOnglet(sheets, gid) {
  const { data } = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  const feuille = data.sheets.find(s => s.properties.sheetId === gid);
  if (!feuille) throw new Error(`Aucun onglet avec gid=${gid} trouvé dans le Sheet.`);
  return feuille.properties.title;
}

async function lireFeuille(sheets, titre) {
  const { data } = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: titre,
  });
  return data.values ?? [];
}

function indexColonne(entetes, nom) {
  return entetes.findIndex(e => e?.trim().toLowerCase() === nom.toLowerCase());
}

// Conversion index de colonne (0-based) -> lettre(s) A, B, ..., Z, AA, AB, ...
function lettreColonne(index) {
  let lettre = '';
  let n = index;
  while (n >= 0) {
    lettre = String.fromCharCode((n % 26) + 65) + lettre;
    n = Math.floor(n / 26) - 1;
  }
  return lettre;
}

async function recupererHoraires(nomEtablissement, coordonnees) {
  const corps = {
    textQuery: nomEtablissement,
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
      'X-Goog-FieldMask': 'places.displayName,places.regularOpeningHours.weekdayDescriptions',
    },
    body: JSON.stringify(corps),
  });

  if (!reponse.ok) {
    throw new Error(`Places API a répondu ${reponse.status} : ${await reponse.text()}`);
  }

  const { places } = await reponse.json();
  const horaires = places?.[0]?.regularOpeningHours?.weekdayDescriptions;
  return horaires?.length ? horaires.join('\n') : null;
}

async function traiterFeuille(sheets, gid) {
  const titre = await trouverTitreOnglet(sheets, gid);
  console.log(`\n--- ${titre} ---`);

  const lignes = await lireFeuille(sheets, titre);
  if (lignes.length === 0) {
    console.log('Feuille vide, ignorée.');
    return;
  }

  const entetes = lignes[0];
  const idxNom = indexColonne(entetes, 'Nom');
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
    const localisation = ligne[idxLocalisation]?.trim();
    const horairesExistants = ligne[idxHoraires]?.trim();

    if (!nom || !localisation) continue;

    if (horairesExistants && !FORCER) {
      console.log(`  ${nom} : déjà renseigné, ignoré (--force pour écraser).`);
      continue;
    }

    try {
      const coordonnees = extraireCoordonnees(localisation);
      const horaires = await recupererHoraires(nom, coordonnees);

      if (!horaires) {
        console.warn(`  ${nom} : aucun horaire trouvé.`);
      } else {
        await sheets.spreadsheets.values.update({
          spreadsheetId: SPREADSHEET_ID,
          range: `${titre}!${lettreColonne(idxHoraires)}${i + 1}`,
          valueInputOption: 'RAW',
          requestBody: { values: [[horaires]] },
        });
        console.log(`  ${nom} : horaires mis à jour.`);
      }
    } catch (erreur) {
      console.error(`  ${nom} : échec (${erreur.message})`);
    }

    await attendre(DELAI_ENTRE_APPELS_MS);
  }
}

async function main() {
  const sheets = await connexionSheets();
  for (const gid of GIDS_FEUILLES) {
    await traiterFeuille(sheets, gid);
  }
  console.log('\nTerminé.');
}

main().catch(erreur => {
  console.error('Erreur fatale :', erreur);
  process.exit(1);
});
