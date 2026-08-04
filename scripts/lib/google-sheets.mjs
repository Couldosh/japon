// Utilitaires partagés par les scripts de maintenance du Google Sheet
// (fetch-horaires.mjs, dupliquer-quartiers.mjs, ...).
//
// Authentification OAuth "Desktop app" (pas de compte de service, bloqué par
// la règle d'organisation iam.disableServiceAccountKeyCreation). Au premier
// lancement d'un script, une fenêtre de navigateur s'ouvre pour se connecter ;
// le jeton obtenu est mis en cache dans token.json pour les lancements suivants.
//
// Prérequis : credentials.json à la racine du projet (client OAuth "Desktop
// app" téléchargé depuis Google Cloud Console > API et services > Identifiants).

import fs from 'fs/promises';
import path from 'path';
import { authenticate } from '@google-cloud/local-auth';
import { google } from 'googleapis';

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];
const CREDENTIALS_PATH = path.join(process.cwd(), 'credentials.json');
const TOKEN_PATH = path.join(process.cwd(), 'token.json');

export function requireEnv(nom) {
  const valeur = process.env[nom];
  if (!valeur) {
    console.error(`Variable d'environnement manquante : ${nom}`);
    process.exit(1);
  }
  return valeur;
}

export function attendre(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Même logique que GeolocationService.extraireCoordonnees côté app.
// !3d/!4d (position précise du lieu) est vérifié avant q=/query= (nos propres
// liens, voir fetch-localisation.mjs) puis @lat,lng (centre de la vue au
// moment du partage, potentiellement décalé) : voir GeolocationService.
export function extraireCoordonnees(lienGoogleMaps) {
  if (!lienGoogleMaps) return null;
  const matchPlace = lienGoogleMaps.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
  if (matchPlace) return { latitude: parseFloat(matchPlace[1]), longitude: parseFloat(matchPlace[2]) };
  const matchQuery = lienGoogleMaps.match(/[?&](?:q|query)=(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (matchQuery) return { latitude: parseFloat(matchQuery[1]), longitude: parseFloat(matchQuery[2]) };
  const matchArobase = lienGoogleMaps.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (matchArobase) return { latitude: parseFloat(matchArobase[1]), longitude: parseFloat(matchArobase[2]) };
  return null;
}

// Même logique que construireLienLocalisation() dans places-search.service.ts côté app.
// Partagée par fetch-localisation.mjs et dupliquer-quartiers.mjs plutôt que dupliquée : les
// deux scripts écrivent une colonne "Localisation" et doivent donc produire le même format.
// query_place_id fait que Google Maps affiche la fiche complète du lieu au clic (nom, avis,
// horaires, photos...) plutôt qu'un simple pin sur des coordonnées — voir
// docs/architecture-et-pieges.md ("lien Localisation sans fiche lieu au clic"). Repli sur
// l'ancien format "?q=lat,lng" (pin seul) si l'API ne renvoie pas d'id pour le résultat.
export function construireLienLocalisation({ latitude, longitude }, placeId) {
  if (placeId) {
    return `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}&query_place_id=${encodeURIComponent(placeId)}`;
  }
  return `https://www.google.com/maps?q=${latitude},${longitude}`;
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

export async function connexionSheets() {
  const auth = await autoriser();
  return google.sheets({ version: 'v4', auth });
}

export async function trouverTitreOnglet(sheets, spreadsheetId, gid) {
  const { data } = await sheets.spreadsheets.get({ spreadsheetId });
  const feuille = data.sheets.find(s => s.properties.sheetId === gid);
  if (!feuille) throw new Error(`Aucun onglet avec gid=${gid} trouvé dans le Sheet.`);
  return feuille.properties.title;
}

export async function lireFeuille(sheets, spreadsheetId, titre) {
  const { data } = await sheets.spreadsheets.values.get({ spreadsheetId, range: titre });
  return data.values ?? [];
}

export function indexColonne(entetes, nom) {
  return entetes.findIndex(e => e?.trim().toLowerCase() === nom.toLowerCase());
}

// Conversion index de colonne (0-based) -> lettre(s) A, B, ..., Z, AA, AB, ...
export function lettreColonne(index) {
  let lettre = '';
  let n = index;
  while (n >= 0) {
    lettre = String.fromCharCode((n % 26) + 65) + lettre;
    n = Math.floor(n / 26) - 1;
  }
  return lettre;
}
