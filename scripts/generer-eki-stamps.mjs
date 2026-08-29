#!/usr/bin/env node
/**
 * Régénère `public/eki-stamps.json` à partir de `EKI_STAMPS_itineraire_FR.kmz`
 * (carnet de tampons de gares/lieux touristiques, voir docs/architecture-et-pieges.md) —
 * fichier statique consommé par `EkiStampService`/`CarteComponent` (couche "Eki stamps"
 * de la Carte), pour ne pas avoir à décompresser/parser un KMZ dans le navigateur.
 *
 * À relancer à chaque fois que le KMZ est régénéré (nouvelle zone ajoutée, etc.).
 *
 * Usage :
 *   node scripts/generer-eki-stamps.mjs
 */

import fs from 'fs';
import path from 'path';
import AdmZip from 'adm-zip';

const CHEMIN_KMZ = path.join(process.cwd(), 'EKI_STAMPS_itineraire_FR.kmz');
const CHEMIN_SORTIE = path.join(process.cwd(), 'public', 'eki-stamps.json');

function champ(bloc, nom) {
  const re = new RegExp(`<Data name="${nom}"><value>([\\s\\S]*?)</value></Data>`);
  const m = bloc.match(re);
  return m ? m[1].trim() : '';
}

function decoderXml(texte) {
  return texte
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function main() {
  if (!fs.existsSync(CHEMIN_KMZ)) {
    console.error(`Fichier introuvable : ${CHEMIN_KMZ}`);
    process.exit(1);
  }

  const zip = new AdmZip(CHEMIN_KMZ);
  const entreeKml = zip.getEntry('doc.kml');
  if (!entreeKml) {
    console.error('doc.kml introuvable dans le KMZ');
    process.exit(1);
  }
  const xml = entreeKml.getData().toString('utf8');

  const placemarks = xml.match(/<Placemark>[\s\S]*?<\/Placemark>/g) ?? [];
  const resultat = [];

  for (const bloc of placemarks) {
    const nomMatch = bloc.match(/<name>([^<]*)<\/name>/);
    const coordMatch = bloc.match(/<coordinates>\s*([\s\S]*?)\s*<\/coordinates>/);
    if (!nomMatch || !coordMatch) continue;

    const [longitude, latitude] = coordMatch[1].split(',').map(Number);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;

    resultat.push({
      id: champ(bloc, 'ID'),
      nom: decoderXml(nomMatch[1]),
      nomJaponais: decoderXml(champ(bloc, 'Nom japonais')),
      nomAnglais: decoderXml(champ(bloc, 'Nom anglais')),
      adresse: decoderXml(champ(bloc, 'Adresse')),
      url: champ(bloc, 'URL'),
      sansPersonnelDepuis: decoderXml(champ(bloc, 'Sans personnel depuis')),
      dateFermeture: decoderXml(champ(bloc, 'Date de fermeture')),
      tamponDisponible: champ(bloc, 'Tampon disponible') === 'Oui',
      categorie: decoderXml(champ(bloc, 'Catégorie')),
      zone: decoderXml(champ(bloc, 'Zone')),
      latitude,
      longitude,
    });
  }

  fs.mkdirSync(path.dirname(CHEMIN_SORTIE), { recursive: true });
  fs.writeFileSync(CHEMIN_SORTIE, JSON.stringify(resultat));
  console.log(`${resultat.length} eki stamps écrits dans ${path.relative(process.cwd(), CHEMIN_SORTIE)}`);
}

main();
