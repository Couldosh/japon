#!/usr/bin/env node
/**
 * Ajoute au Sheet une sélection d'adresses de restaurants/magasins à Chichibu
 * et Nagatoro (excursions à la journée depuis Tokyo, région de Saitama).
 * DONNEES vient de deux sources ajoutées en deux temps : un premier lot par
 * recherche Tabelog autour des spécialités culinaires locales de chaque
 * ville, puis un second lot extrait de 4 articles du blog Ichiban Japan
 * (chichibu-tourisme, chichibu-itineraire, chichibu-la-campagne-japonaise,
 * chichibu-la-campagne-a-tokyo) cités par l'utilisateur, recoupés avec
 * Tabelog/Retty pour confirmer l'identité de chaque enseigne.
 *
 * Ces deux villes n'existent dans aucune donnée de référence du Sheet à ce
 * jour : le script crée d'abord les lignes Ville ("Chichibu"/"Nagatoro", gid
 * VILLES) puis Quartier (un seul quartier par ville, même nom que la ville,
 * gid QUARTIERS — décision explicite : pas de sous-découpage par zone) avant
 * d'ajouter les lieux eux-mêmes dans l'onglet Restaurants (gid RESTAURANTS).
 * Tous les lieux de DONNEES sont volontairement traités comme des
 * restaurants (y compris les échoppes de kakigori/senbei) : ce sont des
 * endroits où l'on mange sur place, pas des boutiques au sens de MagasinModel.
 *
 * Comme les autres scripts de maintenance, aperçu par défaut (rien n'est
 * écrit) : affiche toutes les lignes qui seraient ajoutées, avec leurs
 * colonnes complètes, pour relecture avant écriture réelle dans le Sheet
 * partagé par le groupe. Passer --appliquer pour écrire.
 *
 * Idempotent : les villes/quartiers/restaurants déjà présents dans le Sheet
 * (comparaison par Nom, insensible casse, + Quartier pour les restaurants)
 * sont ignorés, pour permettre de relancer le script sans créer de doublons.
 *
 * La Localisation de chaque restaurant est recherchée via Google Places API
 * (New), même pattern que fetch-localisation.mjs — résultat mis en cache
 * (scripts/.cache/chichibu-nagatoro.json) par (nom, ville) pour ne pas
 * rappeler l'API à chaque relance. Passer --rafraichir pour l'ignorer.
 *
 * Le script crée aussi les plats référencés par DONNEES (`plats`, quand un
 * restaurant a une spécialité identifiable, voir PLATS) dans l'onglet de
 * référence Plats (gid PLATS) s'ils n'existent pas déjà, puis renseigne la
 * colonne "Plats" de chaque restaurant concerné — même mécanisme que le champ
 * "Plats" du formulaire "Ajouter un lieu" (AjoutLieuComponent), pour que ces
 * plats apparaissent en chips dans la popup de détail de l'app. Une colonne
 * "Plats" déjà renseignée manuellement n'est jamais écrasée.
 *
 * Usage :
 *   node --env-file=.env scripts/ajouter-chichibu-nagatoro.mjs               (aperçu)
 *   node --env-file=.env scripts/ajouter-chichibu-nagatoro.mjs --appliquer   (écrit dans le Sheet)
 *   node --env-file=.env scripts/ajouter-chichibu-nagatoro.mjs --rafraichir  (ignore le cache Places)
 */

import {
  requireEnv, attendre, construireLienLocalisation,
  connexionSheets, trouverTitreOnglet, lireFeuille,
  indexColonne, lettreColonne,
} from './lib/google-sheets.mjs';
import { cheminCache, chargerCache, sauvegarderCache, cleCache } from './lib/cache.mjs';

const SPREADSHEET_ID = requireEnv('SPREADSHEET_ID');
const PLACES_API_KEY = requireEnv('PLACES_API_KEY');
const APPLIQUER = process.argv.includes('--appliquer');
const RAFRAICHIR = process.argv.includes('--rafraichir');

const GID_VILLES = 357846773;
const GID_QUARTIERS = 1855356526;
const GID_RESTAURANTS = 892590698;
const GID_PLATS = 2053739160;

// Plats de référence (onglet "Plats", PlatService) associés aux spécialités de
// DONNEES ci-dessous — `categorie` reprend les seules valeurs acceptées par
// PlatCategory ('Plat'/'Snack', voir plat.model.ts) ; les desserts/snacks
// (Miso Potato, Kakigori, Taiyaki, Satsumaimo, Nougat Glacé) sont classés
// 'Snack' comme le reste du référentiel, les plats servis en repas en 'Plat'.
const PLATS = [
  { nom: 'Waraji Katsudon', categorie: 'Plat', description: 'Escalope de porc géante façon "sandale de paille", frite puis servie sur riz avec une sauce sucrée-salée — spécialité de Chichibu.' },
  { nom: 'Miso Potato', categorie: 'Snack', description: 'Pommes de terre frites (parfois avec la peau) nappées d\'une sauce miso sucrée — spécialité "B-kyu gourmet" de Chichibu et Nagatoro.' },
  { nom: 'Buta Miso Don', categorie: 'Plat', description: 'Porc mariné au miso puis grillé, servi sur riz — spécialité de Chichibu.' },
  { nom: 'Kurumi Soba', categorie: 'Plat', description: 'Soba trempée dans une sauce à base de noix pilées — spécialité de Chichibu.' },
  { nom: 'Ayu', categorie: 'Plat', description: 'Poisson de rivière pêché dans l\'Arakawa, grillé au sel, frit ou cuisiné en riz (ayu-meshi) — spécialité de Nagatoro.' },
  { nom: 'Tennen Kakigori', categorie: 'Snack', description: 'Glace pilée à partir de glace naturelle récoltée l\'hiver — spécialité de Nagatoro.' },
  { nom: 'Teuchi Soba', categorie: 'Plat', description: 'Soba faite maison, à partir de farine moulue à la meule de pierre.' },
  { nom: 'Tonkatsu', categorie: 'Plat', description: 'Escalope de porc panée et frite, servie avec riz et chou émincé.' },
  { nom: 'Taiyaki', categorie: 'Snack', description: 'Pâtisserie en forme de poisson, fourrée le plus souvent à la pâte de haricot rouge.' },
  { nom: 'Nagashi Somen', categorie: 'Plat', description: 'Nouilles froides servies glissant dans un tube de bambou fendu, spécialité estivale (mai à septembre).' },
  { nom: 'Satsumaimo', categorie: 'Snack', description: 'Pâtisseries et douceurs à base de patate douce locale.' },
  { nom: 'Nougat Glacé', categorie: 'Snack', description: 'Dessert glacé aux fruits secs et noix, servi froid.' },
];

const DELAI_ENTRE_APPELS_MS = 300;
const CACHE_PATH = cheminCache('chichibu-nagatoro.json');

// Une ville = un seul quartier (même nom), voir l'en-tête du fichier.
const VILLES = ['Chichibu', 'Nagatoro'];

// Résultat de la recherche Tabelog (2 à 5 adresses par spécialité et par
// ville). `nom` (romaji, écrit dans la colonne Nom — convention du reste du
// Sheet/app, voir emoji-lieu.ts qui matche des mots-clés en romaji) reprend le
// kanji entre parenthèses en fin de description pour repérer l'enseigne sur
// place. `nomJp` (nom japonais d'origine) sert de texte de recherche Places
// par défaut ; `rechercheAlt` le remplace entièrement quand nomJp+ville ne
// suffit pas à désambiguïser. `commentaires` reprend la spécialité (romaji +
// kanji) pour laquelle le lieu a été retenu ; `description` résume l'adresse.
const DONNEES = [
  // --- Chichibu — Waraji Katsudon / わらじカツ丼 (escalope de porc géante façon "sandale de paille") ---
  {
    ville: 'Chichibu', nom: 'Ashigakubo Shokudo', nomJp: 'あしがくぼ食堂',
    lien: 'https://tabelog.com/saitama/A1107/A110701/11061242/',
    description: 'Cantine de quartier près de la gare d\'Ashigakubo (あしがくぼ食堂), réputée pour sa Waraji Katsudon (escalope de porc géante façon sandale de paille) servie avec ticket de commande automatique en cuisine.',
    commentaires: 'Spécialité : Waraji Katsudon (わらじカツ丼).',
    plats: ['Waraji Katsudon'],
  },
  {
    ville: 'Chichibu', nom: 'Chichibu Warajikatsu-tei', nomJp: '秩父わらじかつ亭',
    lien: 'https://tabelog.com/saitama/A1107/A110701/11044527/',
    description: 'Stand du food court de l\'onsen "Matsuri no Yu" (祭の湯), juste devant la gare Seibu-Chichibu, spécialisé dans la Waraji Katsudon — pratique pour un repas rapide en arrivant.',
    commentaires: 'Spécialité : Waraji Katsudon (わらじカツ丼).',
    plats: ['Waraji Katsudon'],
  },
  {
    ville: 'Chichibu', nom: 'Yasudaya Hinoda-ten', nomJp: '安田屋 日野田店',
    lien: 'https://tabelog.com/saitama/A1107/A110701/11002483/',
    description: 'Antenne à Chichibu de Yasudaya (安田屋, Ogano), la maison historique considérée à l\'origine de la Waraji Katsudon depuis le début de l\'ère Shōwa — deux grandes escalopes qui débordent du bol.',
    commentaires: 'Spécialité : Waraji Katsudon (わらじカツ丼).',
    plats: ['Waraji Katsudon'],
  },

  // --- Chichibu — Miso Potato / みそポテト (pommes de terre frites, sauce miso sucrée) ---
  {
    ville: 'Chichibu', nom: 'Michi-no-Eki Kajuen Ashigakubo', nomJp: '道の駅 果樹公園あしがくぼ',
    lien: 'https://tabelog.com/saitama/A1107/A110701/11003768/',
    description: 'Relais routier (michi-no-eki, 道の駅) au milieu des vergers d\'Ashigakubo, où l\'on trouve la Miso Potato parmi les produits locaux et snacks du comptoir.',
    commentaires: 'Spécialité : Miso Potato (みそポテト).',
    plats: ['Miso Potato'],
  },
  {
    ville: 'Chichibu', nom: 'Oyasumidokoro Moheji', nomJp: 'お休み処 もへじ',
    lien: 'https://tabelog.com/saitama/A1107/A110701/11051031/',
    description: 'Seule boutique de Chichibu entièrement dédiée à la Miso Potato (お休み処 もへじ) — pommes de terre frites avec la peau, nappées d\'une sauce miso maison.',
    commentaires: 'Spécialité : Miso Potato (みそポテト).',
    plats: ['Miso Potato'],
  },

  // --- Chichibu — Buta Miso Don / 豚みそ丼 (porc mariné au miso, grillé, sur riz) ---
  {
    ville: 'Chichibu', nom: 'Nosaka', nomJp: '野さか',
    lien: 'https://tabelog.com/saitama/A1107/A110701/11005823/',
    description: 'L\'adresse n°1 pour le Buta Miso Don à Chichibu (野さか), échine et poitrine de porc grillées au miso — attendez-vous à faire la queue, ouvert seulement le midi.',
    commentaires: 'Spécialité : Buta Miso Don (豚みそ丼).',
    plats: ['Buta Miso Don'],
  },
  {
    ville: 'Chichibu', nom: 'Chinbata Chichibu Ekimae-ten', nomJp: 'ちんばた 秩父駅前店',
    lien: 'https://tabelog.com/saitama/A1107/A110701/11060740/',
    description: 'En face du sanctuaire de Chichibu (ちんばた), propose plusieurs mini-bols à composer soi-même dont le Buta Miso Don et la Waraji Katsudon.',
    commentaires: 'Spécialité : Buta Miso Don (豚みそ丼).',
    plats: ['Buta Miso Don', 'Waraji Katsudon'],
  },
  {
    ville: 'Chichibu', nom: 'Chichibu Shinsekai', nomJp: '秩父新世界',
    lien: 'https://tabelog.com/saitama/A1107/A110701/11054107/',
    description: 'Table tenue par une maison de charcuterie marinée au miso centenaire (秩父新世界, 秩父豚肉味噌漬本舗せかい), près du sanctuaire de Chichibu.',
    commentaires: 'Spécialité : Buta Miso Don (豚みそ丼).',
    plats: ['Buta Miso Don'],
  },

  // --- Chichibu — Kurumi Soba / くるみそば (soba trempée dans une sauce à base de noix pilées) ---
  {
    ville: 'Chichibu', nom: 'Soba no Mori', nomJp: 'そばの杜',
    lien: 'https://tabelog.com/saitama/A1107/A110701/11021801/',
    description: 'On y pile soi-même les noix au mortier en attendant sa commande, avant que la soba soit servie avec la sauce aux noix et le bouillon (そばの杜).',
    commentaires: 'Spécialité : Kurumi Soba (くるみそば).',
    plats: ['Kurumi Soba'],
  },
  {
    ville: 'Chichibu', nom: 'Yanagiya', nomJp: 'やなぎや',
    lien: 'https://tabelog.com/saitama/A1107/A110701/11003383/',
    description: 'Kurumi Soba signature (やなぎや) à base de noix japonaises (oni-gurumi/hime-gurumi), nouilles fines très appréciées des habitués.',
    commentaires: 'Spécialité : Kurumi Soba (くるみそば).',
    plats: ['Kurumi Soba'],
  },
  {
    ville: 'Chichibu', nom: 'Michinoya', nomJp: '三千乃家',
    lien: 'https://tabelog.com/saitama/A1107/A110701/11012795/',
    description: 'Petite adresse de quartier dans une ruelle discrète près de la gare Seibu-Chichibu (三千乃家), prisée des habitués pour sa soba.',
    commentaires: 'Spécialité : Kurumi Soba (くるみそば).',
    plats: ['Kurumi Soba'],
  },

  // --- Nagatoro — Ayu / 鮎料理 (poisson de rivière de l'Arakawa) ---
  {
    ville: 'Nagatoro', nom: 'Tan\'ichi', nomJp: '丹一',
    lien: 'https://tabelog.com/saitama/A1107/A110704/11002135/',
    description: 'À 3 minutes de la gare de Nagatoro (丹一), plusieurs préparations d\'Ayu (grillé au sel, frit, mariné) dont un ayu-meshi cuit en cocotte en fonte.',
    commentaires: 'Spécialité : Ayu (鮎).',
    plats: ['Ayu'],
  },
  {
    // Nom japonais seul + ville trouve un homonyme sans rapport (割烹 見晴亭) sur
    // Places ; le nom complet de l'enseigne ("おみやげ お食事 見晴") lève l'ambiguïté.
    ville: 'Nagatoro', nom: 'Miharashi', nomJp: 'おみやげ お食事 見晴', rechercheAlt: 'おみやげ お食事 見晴',
    lien: 'https://tabelog.com/saitama/A1107/A110704/11014618/',
    description: 'Vue sur les rochers plats (岩畳) de Nagatoro depuis la salle (見晴), ayu-meshi accompagné de petits ayu frits (wakaayu).',
    commentaires: 'Spécialité : Ayu (鮎).',
    plats: ['Ayu'],
  },
  {
    ville: 'Nagatoro', nom: 'Ayu Chaya', nomJp: '鮎茶屋',
    lien: 'https://tabelog.com/saitama/A1107/A110704/11028333/',
    description: 'Restaurant de fruits de mer/rivière spécialisé dans l\'Ayu (鮎茶屋), non loin du site des 岩畳.',
    commentaires: 'Spécialité : Ayu (鮎).',
    plats: ['Ayu'],
  },

  // --- Nagatoro — Tennen Kakigori / 天然かき氷 (glace pilée à partir de glace naturelle récoltée l'hiver) ---
  {
    ville: 'Nagatoro', nom: 'Asami Reizo Kanasaki Honten', nomJp: '阿左美冷蔵 金崎本店',
    lien: 'https://tabelog.com/saitama/A1107/A110704/11000259/',
    description: 'Glacier fondé en 1890 (阿左美冷蔵), utilise sa propre glace naturelle récoltée en hiver — élu parmi les 100 meilleures adresses sucrées de Tabelog, longue file d\'attente en saison.',
    commentaires: 'Spécialité : Tennen Kakigori (天然かき氷).',
    plats: ['Tennen Kakigori'],
  },
  {
    ville: 'Nagatoro', nom: 'Asami Reizo Hodosandō-ten', nomJp: '阿左美冷蔵 寶登山道店',
    lien: 'https://tabelog.com/saitama/A1107/A110704/11000617/',
    description: 'Antenne du glacier historique Asami Reizo, sur le chemin du mont Hōdo — même glace naturelle, sirops maison sans additif.',
    commentaires: 'Spécialité : Tennen Kakigori (天然かき氷).',
    plats: ['Tennen Kakigori'],
  },
  {
    ville: 'Nagatoro', nom: 'Marubutsu Nagatoro Raijindo', nomJp: 'まるぶつ 長瀞雷神堂',
    lien: 'https://tabelog.com/saitama/A1107/A110704/11025086/',
    description: 'À 2 minutes de la gare de Nagatoro (まるぶつ 長瀞雷神堂), senbei grillés minute et Kakigori à la glace naturelle d\'Oku-Chichibu — parfum raisin ou vin de Chichibu.',
    commentaires: 'Spécialité : Tennen Kakigori (天然かき氷).',
    plats: ['Tennen Kakigori'],
  },

  // --- Nagatoro — Miso Potato / みそポテト (spécialité régionale partagée avec Chichibu) ---
  {
    ville: 'Nagatoro', nom: 'Hodosan Ropeway Rest House', nomJp: '宝登山ロープウェイレストハウス',
    lien: 'https://tabelog.com/saitama/A1107/A110704/11042653/',
    description: 'Snack de la gare d\'arrivée du téléphérique du mont Hōdo, pause Miso Potato après la montée.',
    commentaires: 'Spécialité : Miso Potato (みそポテト).',
    plats: ['Miso Potato'],
  },
  {
    ville: 'Nagatoro', nom: 'Sakurai Honten', nomJp: 'さくらい 本店',
    lien: 'https://tabelog.com/saitama/A1107/A110704/11001701/',
    description: 'Restaurant de soba qui sert aussi la Miso Potato locale (さくらい 本店), à emporter ou sur place.',
    commentaires: 'Spécialité : Miso Potato (みそポテト).',
    plats: ['Miso Potato'],
  },
  {
    ville: 'Nagatoro', nom: 'Kikuya Shokudo', nomJp: '喜久家食堂',
    lien: 'https://tabelog.com/saitama/A1107/A110704/11015959/',
    description: 'Cantine de quartier à Nagatoro (喜久家食堂), Miso Potato également disponible à emporter.',
    commentaires: 'Spécialité : Miso Potato (みそポテト).',
    plats: ['Miso Potato'],
  },

  // --- Nagatoro — Teuchi Soba / 手打ちそば (soba faite maison) ---
  {
    ville: 'Nagatoro', nom: 'Uchida', nomJp: 'うちだ',
    lien: 'https://tabelog.com/saitama/A1107/A110704/11002959/',
    description: 'À 3 minutes de la gare de Kami-Nagatoro (うちだ), soba faite maison à partir de farine moulue à la meule de pierre, tempura de légumes de saison recommandée.',
    commentaires: 'Spécialité : Teuchi Soba (手打ちそば).',
    plats: ['Teuchi Soba'],
  },
  {
    ville: 'Nagatoro', nom: 'Soba-dokoro Tajima', nomJp: 'そば処たじま',
    lien: 'https://tabelog.com/saitama/A1107/A110704/11009602/',
    description: 'À 1 minute de la gare de Nagatoro (そば処たじま), grand assortiment de tempura de légumes servi avec la soba.',
    commentaires: 'Spécialité : Teuchi Soba (手打ちそば).',
    plats: ['Teuchi Soba'],
  },

  // === Second lot — cité dans 4 articles du blog Ichiban Japan (voir en-tête) ===

  // --- Chichibu ---
  {
    // Enseigne mère du "Chichibu Ekimae-ten" déjà ajouté ci-dessus (adresse
    // différente, bâtisse à flanc de colline, ancien bâtiment de brasserie de
    // saké déplacé ici) — nom distinct pour ne pas entrer en collision.
    ville: 'Chichibu', nom: 'Chinbata', nomJp: 'ちんばた',
    lien: 'https://tabelog.com/saitama/A1107/A110701/11029845/',
    description: 'Maison à flanc de colline à 11 min de la gare de Chichibu (ちんばた), ancien bâtiment de brasserie de saké déplacé ici — plat signature "秩父名物W丼" combinant Waraji Katsudon et Buta Miso Don dans un même bol.',
    commentaires: 'Spécialité : Waraji Katsudon / Buta Miso Don (わらじカツ丼 / 豚みそ丼).',
    plats: ['Waraji Katsudon', 'Buta Miso Don'],
  },
  {
    ville: 'Chichibu', nom: 'Irifune', nomJp: '入船',
    lien: 'https://tabelog.com/saitama/A1107/A110701/11010430/',
    description: 'Adresse soba du centre de Chichibu (入船), dont la Kurumi Soba (soba aux noix).',
    commentaires: 'Spécialité : Kurumi Soba (くるみそば).',
    plats: ['Kurumi Soba'],
  },
  {
    ville: 'Chichibu', nom: 'Tonkatsu Nishiki', nomJp: 'とんかつ錦',
    lien: 'https://tabelog.com/saitama/A1107/A110701/11023067/',
    description: 'Un des meilleurs tonkatsu de Chichibu (とんかつ錦, quartier Ohanabatake), aussi réputé pour son curry.',
    commentaires: 'Spécialité : Tonkatsu / curry.',
    plats: ['Tonkatsu'],
  },
  {
    ville: 'Chichibu', nom: 'Hahaso Taiyaki', nomJp: 'ははそたい焼き',
    lien: 'https://tabelog.com/saitama/A1107/A110701/11034491/',
    description: 'Échoppe de taiyaki (ははそたい焼き) tenue par une commerçante réputée pour son accueil, quartier Ohanabatake.',
    commentaires: 'Spécialité : Taiyaki.',
    plats: ['Taiyaki'],
  },
  {
    ville: 'Chichibu', nom: 'Ametsuchi Manimani', nomJp: 'あめつちまにまに',
    lien: 'https://tabelog.com/saitama/A1107/A110701/11045849/',
    description: 'Salon de thé sur la rue Banba-dori (あめつちまにまに), pâtisseries vegan.',
    commentaires: 'Spécialité : Café, pâtisseries vegan.',
  },
  {
    ville: 'Chichibu', nom: 'Taizando Cafe', nomJp: '泰山堂カフェ',
    lien: 'https://tabelog.com/saitama/A1107/A110701/11019304/',
    description: 'Café rétro dans un ancien commerce rénové (泰山堂カフェ), nougat glacé signature, grand choix de thés.',
    commentaires: 'Spécialité : Café rétro, nougat glacé.',
    plats: ['Nougat Glacé'],
  },
  {
    ville: 'Chichibu', nom: 'Wa Plus Coffee', nomJp: 'ワプラスコーヒー',
    lien: 'https://tabelog.com/saitama/A1107/A110701/11027662/',
    description: 'Café façon atelier bois près de la gare Seibu-Chichibu (ワプラスコーヒー), vend aussi céramiques et accessoires.',
    commentaires: 'Spécialité : Café, artisanat (céramique/accessoires).',
  },
  {
    // Pas de fiche Tabelog trouvée pour cette adresse — lien Retty en repli.
    ville: 'Chichibu', nom: 'Imo Urara', nomJp: '芋うらら', rechercheAlt: '秩父芋菓子専門店 芋うらら 秩父',
    lien: 'https://retty.me/area/PRE11/ARE487/SUB4803/100001650925/',
    description: 'Boutique spécialisée dans les pâtisseries à la patate douce locale (秩父芋菓子専門店 芋うらら), sur la rue Banba-dori (参道).',
    commentaires: 'Spécialité : Pâtisseries à la patate douce (imo).',
    plats: ['Satsumaimo'],
  },
  {
    ville: 'Chichibu', nom: 'JURIN\'s GEO', nomJp: 'JURIN\'s GEO 秩父 橋立堂',
    lien: 'https://tabelog.com/saitama/A1107/A110701/11024003/',
    description: 'Café de spécialité près du temple Hashidate-do (橋立堂), café primé (COE) et glaces/parfaits personnalisables.',
    commentaires: 'Spécialité : Café de spécialité, glace/parfait.',
  },

  // --- Nagatoro ---
  {
    ville: 'Nagatoro', nom: 'Irori-an Hanamizuki', nomJp: '囲炉里庵 花水木 長生館',
    lien: 'https://tabelog.com/saitama/A1107/A110704/11000853/',
    description: 'Restaurant du ryokan centenaire Choseikan (囲炉里庵 花水木, 長生館) — Nagashi Somen (nouilles froides servies dans un tube de bambou), de mai à septembre, réservation en ligne requise.',
    commentaires: 'Spécialité : Nagashi Somen (流しそうめん).',
    plats: ['Nagashi Somen'],
  },
  {
    ville: 'Nagatoro', nom: 'Cafe Gentille', nomJp: 'カフェ ジャンティーユ',
    lien: 'https://tabelog.com/saitama/A1107/A110704/11040891/',
    description: 'Café près de la gare de Nagatoro entièrement dédié au kakigori (カフェ ジャンティーユ) — parfums composés à la minute, glace naturelle.',
    commentaires: 'Spécialité : Tennen Kakigori (天然かき氷).',
    plats: ['Tennen Kakigori'],
  },
  {
    ville: 'Nagatoro', nom: 'Yamashita', nomJp: 'うるし工房やました',
    lien: 'https://tabelog.com/saitama/A1107/A110704/11006713/',
    description: 'Café-galerie sur le chemin du sanctuaire Hodosan (うるし工房やました) — kakigori à la glace naturelle d\'Asami Reizo et pudding maison.',
    commentaires: 'Spécialité : Tennen Kakigori (天然かき氷).',
    plats: ['Tennen Kakigori'],
  },
  {
    // Identité incertaine : une seule mention (blog Trip.com), aucune fiche
    // Tabelog/Retty/HotPepper trouvée — inclus quand même à la demande de
    // l'utilisateur, avec les informations limitées disponibles.
    ville: 'Nagatoro', nom: 'Sanso', nomJp: '山荘', rechercheAlt: '山荘 長瀞 レストラン',
    lien: 'https://jp.trip.com/moments/detail/nagatoro-60602-119809629/',
    description: 'Restaurant façon chalet de montagne à Nagatoro (山荘), déjeuners autour de 1000 yen — identité à vérifier sur place, seule une mention blog trouvée (pas de fiche Tabelog/Retty confirmée).',
    commentaires: 'Spécialité : café, cuisine de saison (à confirmer).',
  },
];

async function chercherEtablissement(textQuery) {
  const reponse = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': PLACES_API_KEY,
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

// Porte la logique de SheetsWriteService.ajouterLigne() côté app en Node :
// construit la ligne à partir des en-têtes réels de l'onglet (les colonnes
// absentes de `valeurs` restent vides), l'écrit à `ligne` (1-based, la
// prochaine ligne vide) via values.update plutôt que values.append.
function construireLigne(entetes, valeurs) {
  return entetes.map(entete => valeurs[entete?.trim()] ?? '');
}

// Même garde-fou que SheetsWriteService.ajouterLigne() côté app : si la ligne
// visée dépasse la grille actuelle de l'onglet ("exceeds grid limits", onglets
// de référence historiquement courts comme Plats/Villes/Quartiers), agrandit
// la grille de 200 lignes puis réessaie une fois avant d'abandonner.
async function ecrireLigne(sheets, gid, titre, entetes, valeurs, ligne) {
  const requete = {
    spreadsheetId: SPREADSHEET_ID,
    range: `${titre}!A${ligne}:${lettreColonne(entetes.length - 1)}${ligne}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [construireLigne(entetes, valeurs)] },
  };

  try {
    await sheets.spreadsheets.values.update(requete);
  } catch (erreur) {
    if (!erreur.message?.includes('exceeds grid limits')) throw erreur;
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: { requests: [{ appendDimension: { sheetId: gid, dimension: 'ROWS', length: 200 } }] },
    });
    await sheets.spreadsheets.values.update(requete);
  }
}

async function traiterVilles(sheets) {
  const titre = await trouverTitreOnglet(sheets, SPREADSHEET_ID, GID_VILLES);
  const lignes = await lireFeuille(sheets, SPREADSHEET_ID, titre);
  const entetes = lignes[0];
  const idxNom = indexColonne(entetes, 'Nom');
  const existantes = new Set(lignes.slice(1).map(l => l[idxNom]?.trim().toLowerCase()).filter(Boolean));

  console.log(`\n--- ${titre} (Villes) ---`);
  let prochaineLigne = lignes.length + 1;

  for (const ville of VILLES) {
    if (existantes.has(ville.toLowerCase())) {
      console.log(`  ${ville} : déjà présente, ignorée.`);
      continue;
    }
    console.log(`  + ${ville}`);
    if (APPLIQUER) {
      await ecrireLigne(sheets, GID_VILLES, titre, entetes, { Nom: ville }, prochaineLigne);
      prochaineLigne++;
    }
  }
}

async function traiterQuartiers(sheets) {
  const titre = await trouverTitreOnglet(sheets, SPREADSHEET_ID, GID_QUARTIERS);
  const lignes = await lireFeuille(sheets, SPREADSHEET_ID, titre);
  const entetes = lignes[0];
  const idxNom = indexColonne(entetes, 'Nom');
  const existants = new Set(lignes.slice(1).map(l => l[idxNom]?.trim().toLowerCase()).filter(Boolean));

  console.log(`\n--- ${titre} (Quartiers) ---`);
  let prochaineLigne = lignes.length + 1;

  for (const ville of VILLES) {
    if (existants.has(ville.toLowerCase())) {
      console.log(`  ${ville} : déjà présent, ignoré.`);
      continue;
    }
    console.log(`  + ${ville} (Ville : ${ville})`);
    if (APPLIQUER) {
      await ecrireLigne(sheets, GID_QUARTIERS, titre, entetes, { Nom: ville, Ville: ville, Mood: '' }, prochaineLigne);
      prochaineLigne++;
    }
  }
}

async function traiterRestaurants(sheets, cache) {
  const titre = await trouverTitreOnglet(sheets, SPREADSHEET_ID, GID_RESTAURANTS);
  const lignes = await lireFeuille(sheets, SPREADSHEET_ID, titre);
  const entetes = lignes[0];
  const idxNom = indexColonne(entetes, 'Nom');
  const idxQuartier = indexColonne(entetes, 'Quartier');
  const existants = new Set(
    lignes.slice(1).map(l => `${l[idxNom]?.trim().toLowerCase()}::${l[idxQuartier]?.trim().toLowerCase()}`)
  );

  console.log(`\n--- ${titre} (Restaurants) ---`);
  let prochaineLigne = lignes.length + 1;
  let nbAjoutes = 0;
  let nbIgnores = 0;

  for (const lieu of DONNEES) {
    const cle = `${lieu.nom.trim().toLowerCase()}::${lieu.ville.trim().toLowerCase()}`;
    if (existants.has(cle)) {
      console.log(`  ${lieu.nom} (${lieu.ville}) : déjà présent, ignoré.`);
      nbIgnores++;
      continue;
    }

    const cleCacheLieu = cleCache(titre, lieu.nomJp, lieu.ville);
    const entreeCache = !RAFRAICHIR ? cache[cleCacheLieu] : undefined;
    let etablissement;
    if (entreeCache) {
      etablissement = entreeCache.etablissement;
    } else {
      etablissement = await chercherEtablissement(lieu.rechercheAlt ?? `${lieu.nomJp} ${lieu.ville}`);
      cache[cleCacheLieu] = { etablissement, recherche: new Date().toISOString() };
      await attendre(DELAI_ENTRE_APPELS_MS);
    }

    const localisation = etablissement?.location
      ? construireLienLocalisation(etablissement.location, etablissement.id)
      : '';
    if (!localisation) {
      console.warn(`  ${lieu.nom} : aucune localisation trouvée sur Places, colonne laissée vide.`);
    }

    const valeurs = {
      Nom: lieu.nom,
      Quartier: lieu.ville,
      Liens: lieu.lien,
      Localisation: localisation,
      Description: lieu.description,
      Commentaires: lieu.commentaires,
      Plats: (lieu.plats ?? []).join(', '),
    };

    console.log(`  + ${lieu.nom} (${lieu.ville}) — ${lieu.commentaires}`);
    console.log(`    Liens: ${lieu.lien}`);
    console.log(`    Localisation: ${localisation || '(introuvable)'}`);

    if (APPLIQUER) {
      await ecrireLigne(sheets, GID_RESTAURANTS, titre, entetes, valeurs, prochaineLigne);
      prochaineLigne++;
    }
    nbAjoutes++;
  }

  console.log(`  ${nbAjoutes} restaurant(s) ${APPLIQUER ? 'ajouté(s)' : 'à ajouter'}, ${nbIgnores} déjà présent(s).`);
}

async function traiterPlats(sheets) {
  const titre = await trouverTitreOnglet(sheets, SPREADSHEET_ID, GID_PLATS);
  const lignes = await lireFeuille(sheets, SPREADSHEET_ID, titre);
  const entetes = lignes[0];
  const idxNom = indexColonne(entetes, 'Nom');
  const existants = new Set(lignes.slice(1).map(l => l[idxNom]?.trim().toLowerCase()).filter(Boolean));

  console.log(`\n--- ${titre} (Plats) ---`);
  let prochaineLigne = lignes.length + 1;

  for (const plat of PLATS) {
    if (existants.has(plat.nom.toLowerCase())) {
      console.log(`  ${plat.nom} : déjà présent, ignoré.`);
      continue;
    }
    console.log(`  + ${plat.nom} (${plat.categorie})`);
    if (APPLIQUER) {
      await ecrireLigne(sheets, GID_PLATS, titre, entetes, {
        Nom: plat.nom, Categorie: plat.categorie, Description: plat.description,
      }, prochaineLigne);
      prochaineLigne++;
    }
  }
}

// Renseigne la colonne "Plats" des restaurants de DONNEES qui ont un champ
// `plats` — même format que RestaurantModel.Plats côté app (noms séparés par
// ", "). Ne touche jamais une cellule déjà non vide (saisie manuelle ou
// écriture précédente) : la relit et compare plutôt que d'écraser, pour
// pouvoir relancer le script sans risque après une modification manuelle du
// Sheet par un membre du groupe.
async function traiterLiaisonsPlats(sheets) {
  const titre = await trouverTitreOnglet(sheets, SPREADSHEET_ID, GID_RESTAURANTS);
  const lignes = await lireFeuille(sheets, SPREADSHEET_ID, titre);
  const entetes = lignes[0];
  const idxNom = indexColonne(entetes, 'Nom');
  const idxQuartier = indexColonne(entetes, 'Quartier');
  const idxPlats = indexColonne(entetes, 'Plats');

  console.log(`\n--- ${titre} (liaison Restaurants -> Plats) ---`);
  if (idxPlats === -1) {
    console.warn('  Colonne "Plats" introuvable, étape ignorée.');
    return;
  }

  const parCle = new Map();
  for (let i = 1; i < lignes.length; i++) {
    const cle = `${lignes[i][idxNom]?.trim().toLowerCase()}::${lignes[i][idxQuartier]?.trim().toLowerCase()}`;
    parCle.set(cle, i + 1); // ligne 1-based
  }

  let nbLies = 0;
  let nbDejaRenseignes = 0;
  let nbIntrouvables = 0;

  for (const lieu of DONNEES) {
    if (!lieu.plats?.length) continue;

    const cle = `${lieu.nom.trim().toLowerCase()}::${lieu.ville.trim().toLowerCase()}`;
    const ligne = parCle.get(cle);
    if (!ligne) {
      console.warn(`  ${lieu.nom} (${lieu.ville}) : restaurant introuvable dans le Sheet, lien plats ignoré.`);
      nbIntrouvables++;
      continue;
    }

    const valeurActuelle = lignes[ligne - 1][idxPlats]?.trim() ?? '';
    const valeurVoulue = lieu.plats.join(', ');
    if (valeurActuelle === valeurVoulue) {
      continue; // déjà à jour (relance du script)
    }
    if (valeurActuelle) {
      console.log(`  ${lieu.nom} (${lieu.ville}) : Plats déjà renseigné ("${valeurActuelle}"), non écrasé.`);
      nbDejaRenseignes++;
      continue;
    }

    console.log(`  + ${lieu.nom} (${lieu.ville}) -> Plats: ${valeurVoulue}`);
    if (APPLIQUER) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `${titre}!${lettreColonne(idxPlats)}${ligne}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [[valeurVoulue]] },
      });
    }
    nbLies++;
  }

  console.log(`  ${nbLies} lien(s) ${APPLIQUER ? 'écrit(s)' : 'à écrire'}, ${nbDejaRenseignes} déjà renseigné(s) manuellement, ${nbIntrouvables} introuvable(s).`);
}

// Sous-page "menu" d'une fiche Tabelog — même base que `lien` (qui pointe sur
// la fiche principale), avec "dtlmenu/" en plus (convention d'URL Tabelog,
// cf. les sous-pages dtlrvwlst/dtlphotolst observées pendant la recherche).
// Ne s'applique qu'aux `lien` qui sont effectivement des fiches Tabelog : Imo
// Urara (Retty) et Sanso (Trip.com) n'en ont pas et restent donc sans Menu.
function lienMenuTabelog(lien) {
  return lien.startsWith('https://tabelog.com/') ? `${lien}dtlmenu/` : null;
}

// Renseigne la colonne "Menu" de chaque restaurant de DONNEES avec sa
// sous-page menu Tabelog — même prudence que traiterLiaisonsPlats : ne touche
// jamais une cellule déjà non vide.
async function traiterMenuTabelog(sheets) {
  const titre = await trouverTitreOnglet(sheets, SPREADSHEET_ID, GID_RESTAURANTS);
  const lignes = await lireFeuille(sheets, SPREADSHEET_ID, titre);
  const entetes = lignes[0];
  const idxNom = indexColonne(entetes, 'Nom');
  const idxQuartier = indexColonne(entetes, 'Quartier');
  const idxMenu = indexColonne(entetes, 'Menu');

  console.log(`\n--- ${titre} (Menu Tabelog) ---`);
  if (idxMenu === -1) {
    console.warn('  Colonne "Menu" introuvable, étape ignorée.');
    return;
  }

  const parCle = new Map();
  for (let i = 1; i < lignes.length; i++) {
    const cle = `${lignes[i][idxNom]?.trim().toLowerCase()}::${lignes[i][idxQuartier]?.trim().toLowerCase()}`;
    parCle.set(cle, i + 1);
  }

  let nbEcrits = 0;
  let nbDejaRenseignes = 0;
  let nbSansTabelog = 0;
  let nbIntrouvables = 0;

  for (const lieu of DONNEES) {
    const menuUrl = lienMenuTabelog(lieu.lien);
    if (!menuUrl) {
      nbSansTabelog++;
      continue;
    }

    const cle = `${lieu.nom.trim().toLowerCase()}::${lieu.ville.trim().toLowerCase()}`;
    const ligne = parCle.get(cle);
    if (!ligne) {
      console.warn(`  ${lieu.nom} (${lieu.ville}) : restaurant introuvable dans le Sheet, lien menu ignoré.`);
      nbIntrouvables++;
      continue;
    }

    const valeurActuelle = lignes[ligne - 1][idxMenu]?.trim() ?? '';
    if (valeurActuelle === menuUrl) continue; // déjà à jour (relance du script)
    if (valeurActuelle) {
      console.log(`  ${lieu.nom} (${lieu.ville}) : Menu déjà renseigné ("${valeurActuelle}"), non écrasé.`);
      nbDejaRenseignes++;
      continue;
    }

    console.log(`  + ${lieu.nom} (${lieu.ville}) -> Menu: ${menuUrl}`);
    if (APPLIQUER) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `${titre}!${lettreColonne(idxMenu)}${ligne}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [[menuUrl]] },
      });
    }
    nbEcrits++;
  }

  console.log(`  ${nbEcrits} lien(s) menu ${APPLIQUER ? 'écrit(s)' : 'à écrire'}, ${nbDejaRenseignes} déjà renseigné(s) manuellement, ${nbSansTabelog} sans fiche Tabelog, ${nbIntrouvables} introuvable(s).`);
}

async function main() {
  const sheets = await connexionSheets();
  const cache = await chargerCache(CACHE_PATH);

  try {
    await traiterVilles(sheets);
    await traiterQuartiers(sheets);
    await traiterRestaurants(sheets, cache);
    await traiterPlats(sheets);
    await traiterLiaisonsPlats(sheets);
    await traiterMenuTabelog(sheets);
  } finally {
    await sauvegarderCache(CACHE_PATH, cache);
  }

  if (!APPLIQUER) {
    console.log('\n(aperçu uniquement, relancer avec --appliquer pour écrire dans le Sheet)');
  }
  console.log('\nTerminé.');
}

main().catch(erreur => {
  console.error('Erreur fatale :', erreur);
  process.exit(1);
});
