// Cache disque partagé par les scripts de maintenance du Sheet qui appellent
// Places API (fetch-horaires.mjs, dupliquer-quartiers.mjs, fetch-localisation.mjs).
//
// Sert deux objectifs :
//  - économiser des appels API en ne recherchant pas deux fois le même
//    établissement d'une exécution à l'autre ;
//  - garantir, pour les scripts avec un mode aperçu/--appliquer, que ce qui
//    est écrit dans le Sheet est exactement ce qui a été vu à l'aperçu (pas de
//    nouvel appel entre les deux qui pourrait renvoyer un résultat différent).
//
// Chaque script utilise son propre fichier de cache (un par nom de recherche :
// horaires, quartiers, localisation), tous sous scripts/.cache/ (gitignoré).

import fs from 'fs/promises';
import path from 'path';

export function cheminCache(nomFichier) {
  return path.join(process.cwd(), 'scripts', '.cache', nomFichier);
}

export async function chargerCache(chemin) {
  try {
    return JSON.parse(await fs.readFile(chemin, 'utf8'));
  } catch {
    return {};
  }
}

export async function sauvegarderCache(chemin, cache) {
  await fs.mkdir(path.dirname(chemin), { recursive: true });
  await fs.writeFile(chemin, JSON.stringify(cache, null, 2));
}

/** Clé de cache stable pour une recherche Places : feuille + nom + quartier. */
export function cleCache(...parties) {
  return parties.map(p => p ?? '').join('::');
}
