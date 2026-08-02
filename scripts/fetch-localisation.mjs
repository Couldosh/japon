#!/usr/bin/env node
/**
 * Recherche (Google Places API - New) la localisation des restaurants,
 * activités, magasins et hébergements dont la colonne "Localisation" est
 * vide, à partir de leur nom et d'un champ de contexte pour désambiguïser
 * (colonne "Quartier" pour les lieux, "Adresse" pour les hébergements), et
 * écrit un lien Google Maps exploitable par l'app dans cette colonne.
 *
 * Le lien écrit est construit nous-mêmes (pas le googleMapsUri renvoyé par
 * l'API, souvent un lien par cid sans coordonnées lisibles) au format
 * "https://www.google.com/maps/search/?api=1&query=<lat>,<lng>&query_place_id=<id>"
 * : le paramètre query_place_id fait que Google Maps affiche la fiche
 * complète du lieu au clic (nom, avis, horaires, photos...) plutôt qu'un
 * simple pin. Repli sur l'ancien format "?q=<lat>,<lng>" (pin seul) si l'API
 * ne renvoie pas d'id pour le résultat. Les deux formats sont reconnus par
 * GeolocationService.extraireCoordonnees côté app.
 *
 * Par défaut le script ne fait qu'un aperçu (aucune écriture) : les
 * correspondances trouvées via une recherche floue peuvent se tromper
 * d'enseigne, mieux vaut les relire avant d'écrire dans le Sheet. Passer
 * --appliquer pour écrire réellement les liens trouvés.
 *
 * Par défaut, seules les lignes sans Localisation sont traitées. Passer
 * --reformater pour aussi retraiter les lignes déjà au format "?q=lat,lng"
 * (écrit par une version antérieure de ce script, avant query_place_id) et
 * les remplacer par le nouveau format — utile pour corriger a posteriori les
 * lignes déjà présentes dans le Sheet, sans re-rechercher/écraser les
 * Localisation renseignées manuellement par un membre du groupe.
 *
 * Cache local (scripts/.cache/localisation.json) : chaque résultat de
 * recherche Places est mémorisé par (feuille, nom, quartier) et réutilisé tel
 * quel lors des exécutions suivantes, sans rappeler l'API. Deux effets :
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
 *   node --env-file=.env scripts/fetch-localisation.mjs               (aperçu)
 *   node --env-file=.env scripts/fetch-localisation.mjs --appliquer   (écrit dans le Sheet)
 *   node --env-file=.env scripts/fetch-localisation.mjs --rafraichir  (ignore le cache)
 *   node --env-file=.env scripts/fetch-localisation.mjs --reformater  (retraite aussi l'ancien format "?q=lat,lng")
 */

import {
  requireEnv, attendre,
  connexionSheets, trouverTitreOnglet, lireFeuille,
  indexColonne, lettreColonne,
} from './lib/google-sheets.mjs';
import { cheminCache, chargerCache, sauvegarderCache, cleCache } from './lib/cache.mjs';

const SPREADSHEET_ID = requireEnv('SPREADSHEET_ID');
const PLACES_API_KEY = requireEnv('PLACES_API_KEY');
const APPLIQUER = process.argv.includes('--appliquer');
const RAFRAICHIR = process.argv.includes('--rafraichir');
const REFORMATER = process.argv.includes('--reformater');

// Format exact écrit par une version antérieure de ce script (sans query_place_id) —
// seules les lignes correspondant EXACTEMENT à ce format sont retraitées avec
// --reformater, pour ne jamais toucher un lien Google Maps saisi/collé manuellement.
const ANCIEN_FORMAT = /^https:\/\/www\.google\.com\/maps\?q=-?\d+\.\d+,-?\d+\.\d+$/;

// gid des onglets, repris de src/app/service/*/*.service.ts. `colonneContexte`
// est le champ utilisé en plus du nom pour désambiguïser la recherche Places :
// "Quartier" pour les lieux, "Adresse" pour les hébergements (pas de quartier
// dans cet onglet, voir HebergementService).
const FEUILLES = [
  { gid: 892590698, colonneContexte: 'Quartier' }, // Restaurants
  { gid: 0, colonneContexte: 'Quartier' },           // Activités
  { gid: 346756517, colonneContexte: 'Quartier' },  // Magasins
  { gid: 786595870, colonneContexte: 'Adresse' },   // Hébergement
];

const DELAI_ENTRE_APPELS_MS = 300; // reste sous les limites de quota par défaut de Places API
const CACHE_PATH = cheminCache('localisation.json');

// La colonne Quartier des magasins peut contenir plusieurs valeurs séparées
// par des virgules (avant passage éventuel de dupliquer-quartiers.mjs) : on ne
// garde que la première pour la recherche, un quartier suffit à désambiguïser.
// Ne s'applique qu'à "Quartier" : une adresse d'hébergement contient elle-même
// des virgules ("1-19-1 Kabukicho, Shinjuku, Tokyo") qu'il ne faut pas tronquer.
function premierQuartier(valeur) {
  return (valeur ?? '').split(',').map(q => q.trim()).filter(Boolean)[0] ?? null;
}

function extraireContexte(valeur, colonneContexte) {
  return colonneContexte === 'Quartier' ? premierQuartier(valeur) : (valeur?.trim() || null);
}

// Même logique que construireLienLocalisation() dans places-search.service.ts côté app.
function construireLien({ latitude, longitude }, placeId) {
  if (placeId) {
    return `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}&query_place_id=${encodeURIComponent(placeId)}`;
  }
  return `https://www.google.com/maps?q=${latitude},${longitude}`;
}

async function chercherEtablissement(nom, contexte) {
  const textQuery = contexte ? `${nom} ${contexte}` : nom;

  const reponse = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': PLACES_API_KEY,
      // Adapter si Google fait évoluer le nom des champs de l'API Places (New).
      'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location',
    },
    body: JSON.stringify({ textQuery, maxResultCount: 1 }),
  });

  if (!reponse.ok) {
    throw new Error(`Places API a répondu ${reponse.status} : ${await reponse.text()}`);
  }

  const { places } = await reponse.json();
  return places?.[0] ?? null;
}

async function traiterFeuille(sheets, { gid, colonneContexte }, cache) {
  const titre = await trouverTitreOnglet(sheets, SPREADSHEET_ID, gid);
  console.log(`\n--- ${titre} ---`);

  const lignes = await lireFeuille(sheets, SPREADSHEET_ID, titre);
  if (lignes.length === 0) {
    console.log('Feuille vide, ignorée.');
    return;
  }

  const entetes = lignes[0];
  const idxNom = indexColonne(entetes, 'Nom');
  const idxContexte = indexColonne(entetes, colonneContexte);
  const idxLocalisation = indexColonne(entetes, 'Localisation');

  if (idxNom === -1 || idxLocalisation === -1) {
    console.warn(`Colonnes "Nom" ou "Localisation" introuvables dans ${titre}, feuille ignorée.`);
    return;
  }

  let nbTrouves = 0;
  let nbIntrouvables = 0;
  let nbDepuisCache = 0;

  for (let i = 1; i < lignes.length; i++) {
    const ligne = lignes[i];
    const nom = ligne[idxNom]?.trim();
    const localisation = ligne[idxLocalisation]?.trim();
    const aReformater = REFORMATER && !!localisation && ANCIEN_FORMAT.test(localisation);

    if (!nom || (localisation && !aReformater)) continue; // déjà renseigné (et pas à reformater), ou ligne sans nom

    const contexte = idxContexte !== -1 ? extraireContexte(ligne[idxContexte], colonneContexte) : null;
    const cle = cleCache(titre, nom, contexte);
    // En reformatage, on ignore systématiquement le cache : une entrée mise en cache avant
    // ce correctif ne contient pas l'id du lieu (l'ancien fieldMask ne le demandait pas), la
    // réutiliser reconstruirait le même ancien lien "?q=lat,lng" sans rien corriger.
    const entreeCache = !RAFRAICHIR && !aReformater ? cache[cle] : undefined;

    try {
      let etablissement;
      if (entreeCache) {
        etablissement = entreeCache.etablissement;
        nbDepuisCache++;
      } else {
        etablissement = await chercherEtablissement(nom, contexte);
        cache[cle] = { etablissement, recherche: new Date().toISOString() };
        await attendre(DELAI_ENTRE_APPELS_MS);
      }

      if (!etablissement?.location) {
        console.warn(`  ${nom} : aucun établissement (avec localisation) trouvé sur Places.${entreeCache ? ' (depuis le cache)' : ''}`);
        nbIntrouvables++;
      } else {
        const lien = construireLien(etablissement.location, etablissement.id);

        // Log le résultat matché pour permettre de vérifier que c'est la bonne
        // enseigne avant d'appliquer (les enseignes à succursales multiples,
        // ex: Daiso, Uniqlo, sont ambiguës même avec le quartier en indice).
        console.log(`  ${nom} -> ${etablissement.displayName?.text ?? '?'} (${etablissement.formattedAddress ?? 'adresse inconnue'})${entreeCache ? ' (depuis le cache)' : ''}${aReformater ? ' [reformatage]' : ''}`);
        console.log(`    ${lien}`);
        nbTrouves++;

        if (APPLIQUER) {
          await sheets.spreadsheets.values.update({
            spreadsheetId: SPREADSHEET_ID,
            range: `${titre}!${lettreColonne(idxLocalisation)}${i + 1}`,
            valueInputOption: 'RAW',
            requestBody: { values: [[lien]] },
          });
        }
      }
    } catch (erreur) {
      console.error(`  ${nom} : échec (${erreur.message})`);
    }
  }

  console.log(`  ${nbTrouves} localisation(s) trouvée(s) (dont ${nbDepuisCache} depuis le cache), ${nbIntrouvables} introuvable(s).`);
  if (nbTrouves > 0 && !APPLIQUER) {
    console.log('  (aperçu uniquement, relancer avec --appliquer pour écrire dans le Sheet)');
  }
}

async function main() {
  const sheets = await connexionSheets();
  const cache = await chargerCache(CACHE_PATH);

  try {
    for (const feuille of FEUILLES) {
      await traiterFeuille(sheets, feuille, cache);
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
