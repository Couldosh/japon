import { EkiStampModel } from '../models/eki-stamp.model';

// Categorie -> emoji, correspondance exacte (8 valeurs fixes issues du KMZ
// source, voir scripts/generer-eki-stamps.mjs) plutôt qu'une heuristique par
// mot-clé comme emoji-lieu.ts (pas de texte libre à interpréter ici).
const EMOJI_PAR_CATEGORIE: Record<string, string> = {
  'Gare ferroviaire dotée d\'installations permanentes': '🚉',
  'Gare sans installations permanentes': '🚉',
  'Station fermée': '🚫',
  'Destination touristique disparue': '🚫',
  'Site touristique sans installations permanentes': '📍',
  'Destinations touristiques dotées d\'attractions permanentes': '🎫',
  'voie express': '🛣️',
  'Aire de service routière': '⛽',
};

const EMOJI_DEFAUT = '📍';

export function emojiEkiStamp(stamp: EkiStampModel): string {
  return EMOJI_PAR_CATEGORIE[stamp.categorie] ?? EMOJI_DEFAUT;
}
