import { RestaurantModel } from '../models/restaurant.model';
import { ActiviteModel } from '../models/activite.model';
import { MagasinModel } from '../models/magasin.model';

// Emoji par défaut si aucun mot-clé ne correspond.
const EMOJI_RESTAURANT_DEFAUT = '🍽️';
const EMOJI_ACTIVITE_DEFAUT = '📍';
const EMOJI_MAGASIN_DEFAUT = '🛍️';

const REGLES_RESTAURANT: [RegExp, string][] = [
  [/sushi|sashimi|maki/, '🍣'],
  [/ramen|udon|soba|nouilles/, '🍜'],
  [/yakitori|brochette/, '🍢'],
  [/tempura/, '🍤'],
  [/takoyaki/, '🐙'],
  [/okonomiyaki/, '🥞'],
  [/curry/, '🍛'],
  [/yakiniku|bbq|barbecue|grill|wagyu/, '🥩'],
  [/gyoza|dumpling|raviole/, '🥟'],
  [/pizza/, '🍕'],
  [/burger/, '🍔'],
  [/kebab/, '🌯'],
  [/pâtisserie|patisserie|gâteau|gateau|dessert/, '🍰'],
  [/boulangerie|pain\b/, '🥐'],
  [/café|coffee/, '☕'],
  [/izakaya|\bbar\b|pub/, '🍺'],
  [/glace|ice cream/, '🍦'],
  [/fruits de mer|seafood|poisson/, '🐟'],
  [/vegan|végétarien|vegetarien/, '🥗'],
];

const REGLES_ACTIVITE: [RegExp, string][] = [
  [/temple|sanctuaire|shrine/, '⛩️'],
  [/château|chateau|castle/, '🏯'],
  [/musée|musee|museum/, '🏛️'],
  [/onsen|bain|spa/, '♨️'],
  [/jardin|garden/, '🌸'],
  [/parc\b|park/, '🌳'],
  [/karaoké|karaoke/, '🎤'],
  [/shopping|boutique/, '🛍️'],
  [/randonnée|randonnee|hiking|montagne/, '⛰️'],
  [/plage|beach/, '🏖️'],
  [/aquarium/, '🐠'],
  [/zoo/, '🦁'],
  [/attraction|manège|manege/, '🎢'],
  [/arcade|jeux vidéo|jeux video/, '🎮'],
  [/cinéma|cinema/, '🎬'],
  [/concert|spectacle|théâtre|theatre/, '🎭'],
  [/vélo|velo|cyclisme/, '🚲'],
  [/bateau|croisière|croisiere/, '⛴️'],
];

const REGLES_MAGASIN: [RegExp, string][] = [
  [/vêtement|vetement|mode|fashion/, '👕'],
  [/souvenir/, '🎁'],
  [/électronique|electronique|electronic/, '📱'],
  [/cosmétique|cosmetique|beauté|beaute/, '💄'],
  [/jouet|toy/, '🧸'],
  [/librairie|livre|book/, '📚'],
  [/épicerie|epicerie|supermarché|supermarche|konbini|supérette|superette/, '🛒'],
  [/bijou|jewel/, '💍'],
  [/chaussure|shoe/, '👟'],
  [/déco|deco|maison|home/, '🏠'],
];

function trouverEmoji(texte: string, regles: [RegExp, string][]): string | undefined {
  const texteNormalise = texte.toLowerCase();
  return regles.find(([regex]) => regex.test(texteNormalise))?.[1];
}

export function emojiRestaurant(restaurant: RestaurantModel): string {
  // Le premier plat de la liste est prioritaire (ex: "Burger, Wagyu" -> emoji du burger).
  const premierPlat = restaurant.Plats[0]?.Nom ?? '';
  return trouverEmoji(premierPlat, REGLES_RESTAURANT)
    ?? trouverEmoji([restaurant.Nom, restaurant.Description].join(' '), REGLES_RESTAURANT)
    ?? EMOJI_RESTAURANT_DEFAUT;
}

export function emojiActivite(activite: ActiviteModel): string {
  const texte = [activite.Nom, activite.Description].join(' ');
  return trouverEmoji(texte, REGLES_ACTIVITE) ?? EMOJI_ACTIVITE_DEFAUT;
}

export function emojiMagasin(magasin: MagasinModel): string {
  const texte = [magasin.Type, magasin.Nom].join(' ');
  return trouverEmoji(texte, REGLES_MAGASIN) ?? EMOJI_MAGASIN_DEFAUT;
}
