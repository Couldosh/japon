#!/usr/bin/env node
/**
 * Duplique les lignes des feuilles Restaurants/Magasins ayant plusieurs
 * quartiers (valeurs séparées par des virgules dans la colonne "Quartier")
 * en une ligne par quartier. Pour chaque ligne dupliquée, tente de retrouver
 * un lien Google Maps propre à cette antenne via l'API Places (New), en
 * recherchant "<Nom> <Quartier>".
 *
 * Par défaut le script ne fait qu'un aperçu (aucune écriture) ; il faut
 * passer --appliquer pour réellement modifier le Google Sheet. C'est une
 * opération difficile à annuler (elle réécrit toute la feuille) : faites une
 * copie du Sheet ou vérifiez son historique des versions avant d'appliquer.
 *
 * Voir scripts/lib/google-sheets.mjs pour les prérequis d'authentification.
 * Variables d'environnement (via un fichier .env non commité) :
 *   SPREADSHEET_ID  - ID du Google Sheet (dans l'URL d'édition, entre "/d/" et "/edit")
 *   PLACES_API_KEY  - clé API restreinte à "Places API (New)"
 *
 * Usage :
 *   node --env-file=.env scripts/dupliquer-quartiers.mjs             (aperçu)
 *   node --env-file=.env scripts/dupliquer-quartiers.mjs --appliquer (écrit dans le Sheet)
 */

import {
  requireEnv, attendre, extraireCoordonnees,
  connexionSheets, trouverTitreOnglet, lireFeuille, indexColonne,
} from './lib/google-sheets.mjs';

const SPREADSHEET_ID = requireEnv('SPREADSHEET_ID');
const PLACES_API_KEY = requireEnv('PLACES_API_KEY');
const APPLIQUER = process.argv.includes('--appliquer');

// gid des onglets, repris de src/app/service/*/*.service.ts
const GIDS_FEUILLES = [892590698, 346756517]; // Restaurants, Magasins

const DELAI_ENTRE_APPELS_MS = 300; // reste sous les limites de quota par défaut de Places API
const RAYON_RECHERCHE_METRES = 20000; // large rayon : on cherche potentiellement une autre antenne en ville

function separerQuartiers(valeur) {
  return (valeur ?? '')
    .split(',')
    .map(q => q.trim())
    .filter(Boolean);
}

async function chercherLienMaps(nom, quartier, coordonneesApprox) {
  const corps = {
    textQuery: `${nom} ${quartier}`,
    maxResultCount: 1,
    ...(coordonneesApprox && {
      locationBias: {
        circle: { center: coordonneesApprox, radius: RAYON_RECHERCHE_METRES },
      },
    }),
  };

  const reponse = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': PLACES_API_KEY,
      // Adapter si Google fait évoluer le nom des champs de l'API Places (New).
      'X-Goog-FieldMask': 'places.googleMapsUri,places.formattedAddress',
    },
    body: JSON.stringify(corps),
  });

  if (!reponse.ok) {
    throw new Error(`Places API a répondu ${reponse.status} : ${await reponse.text()}`);
  }

  const { places } = await reponse.json();
  return places?.[0] ?? null;
}

async function traiterFeuille(sheets, gid) {
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
  const nbColonnes = entetes.length;

  if (idxNom === -1 || idxQuartier === -1) {
    console.warn(`Colonnes "Nom" ou "Quartier" introuvables dans ${titre}, feuille ignorée.`);
    return;
  }

  const nouvellesLignes = [entetes];
  let nbEtablissementsDupliques = 0;
  let nbLignesAjoutees = 0;
  let nbLiensTrouves = 0;

  for (let i = 1; i < lignes.length; i++) {
    const ligne = lignes[i];
    const quartiers = separerQuartiers(ligne[idxQuartier]);

    if (quartiers.length <= 1) {
      nouvellesLignes.push(ligne);
      continue;
    }

    const nom = ligne[idxNom]?.trim();
    const localisationOriginale = idxLocalisation !== -1 ? ligne[idxLocalisation] : null;
    const coordonneesApprox = extraireCoordonnees(localisationOriginale);

    console.log(`  ${nom || '(sans nom)'} : ${quartiers.length} quartiers -> ${quartiers.length} lignes`);
    nbEtablissementsDupliques++;
    nbLignesAjoutees += quartiers.length - 1;

    for (const quartier of quartiers) {
      const nouvelleLigne = [...ligne];
      while (nouvelleLigne.length < nbColonnes) nouvelleLigne.push('');
      nouvelleLigne[idxQuartier] = quartier;

      if (idxLocalisation !== -1 && nom) {
        try {
          const resultat = await chercherLienMaps(nom, quartier, coordonneesApprox);
          if (resultat?.googleMapsUri) {
            nouvelleLigne[idxLocalisation] = resultat.googleMapsUri;
            nbLiensTrouves++;
            console.log(`    ${quartier} -> ${resultat.formattedAddress ?? resultat.googleMapsUri}`);
          } else {
            console.warn(`    ${quartier} : aucun lien Google Maps trouvé, à compléter manuellement.`);
          }
        } catch (erreur) {
          console.error(`    ${quartier} : échec de recherche (${erreur.message})`);
        }
        await attendre(DELAI_ENTRE_APPELS_MS);
      }

      nouvellesLignes.push(nouvelleLigne);
    }
  }

  console.log(
    `  ${nbEtablissementsDupliques} établissement(s) dupliqué(s) (+${nbLignesAjoutees} ligne(s)), ` +
    `${nbLiensTrouves} lien(s) Google Maps retrouvé(s).`
  );

  if (!APPLIQUER) {
    console.log('  (aperçu uniquement, relancer avec --appliquer pour écrire dans le Sheet)');
    return;
  }

  if (nbEtablissementsDupliques === 0) {
    console.log('  Rien à modifier.');
    return;
  }

  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: titre,
    valueInputOption: 'RAW',
    requestBody: { values: nouvellesLignes },
  });
  console.log(`  Feuille "${titre}" mise à jour (${nouvellesLignes.length - 1} lignes au total).`);
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
