// Utilitaires de parsing/formatage pour l'onglet Planning. Le format exact
// des colonnes Date/Heure dans le Google Sheet n'est pas garanti (dépend du
// formatage des cellules) : ces fonctions couvrent les formats les plus
// courants (français dd/mm/yyyy, ISO) avec un repli sur le parsing natif.

/** Convertit une date "26/07/2026", "14/09/26" ou "2026-07-26" en ISO "yyyy-MM-dd". Null si illisible. */
export function parserDateISO(valeur: string | null | undefined): string | null {
  const nettoye = valeur?.trim();
  if (!nettoye) {
    return null;
  }

  // Année sur 2 chiffres (ex: cellule Sheet formatée "jj/mm/aa") : on suppose
  // 20XX plutôt que 19XX, hypothèse raisonnable pour un carnet de voyage.
  const matchFr = nettoye.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (matchFr) {
    const [, jour, mois, anneeBrute] = matchFr;
    const annee = anneeBrute.length === 2 ? `20${anneeBrute}` : anneeBrute;
    return `${annee}-${mois.padStart(2, '0')}-${jour.padStart(2, '0')}`;
  }

  const matchIso = nettoye.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (matchIso) {
    const [, annee, mois, jour] = matchIso;
    return `${annee}-${mois.padStart(2, '0')}-${jour.padStart(2, '0')}`;
  }

  // Repli : laisser le navigateur tenter de comprendre le format (ex: "26 juillet 2026").
  const date = new Date(nettoye);
  if (!isNaN(date.getTime())) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  return null;
}

/** Normalise une heure ("9:5", "09:05:00", "16h", "16h30"...) en "HH:mm". Chaîne d'origine si non reconnue. */
export function parserHeure(valeur: string | null | undefined): string {
  const nettoye = valeur?.trim() ?? '';

  const matchDeuxPoints = nettoye.match(/^(\d{1,2}):(\d{2})/);
  if (matchDeuxPoints) {
    return `${matchDeuxPoints[1].padStart(2, '0')}:${matchDeuxPoints[2]}`;
  }

  // Format "16h" / "16h30" (courant en français, sans les deux-points).
  const matchH = nettoye.match(/^(\d{1,2})[hH](\d{2})?$/);
  if (matchH) {
    const minutes = matchH[2] ?? '00';
    return `${matchH[1].padStart(2, '0')}:${minutes}`;
  }

  return nettoye;
}

/** Formate une date ISO "yyyy-MM-dd" en en-tête de groupe, ex: "Samedi 26 juillet 2026". */
export function formaterDateGroupe(dateISO: string): string {
  const [annee, mois, jour] = dateISO.split('-').map(Number);
  const date = new Date(annee, mois - 1, jour);
  const texte = new Intl.DateTimeFormat('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  }).format(date);
  return texte.charAt(0).toUpperCase() + texte.slice(1);
}

/** Formate une date ISO "yyyy-MM-dd" en libellé compact pour la mini-nav des jours, ex: "Sam 26". */
export function formaterDateCourte(dateISO: string): string {
  const [annee, mois, jour] = dateISO.split('-').map(Number);
  const date = new Date(annee, mois - 1, jour);
  const jourSemaine = new Intl.DateTimeFormat('fr-FR', { weekday: 'short' }).format(date).replace('.', '');
  return `${jourSemaine.charAt(0).toUpperCase()}${jourSemaine.slice(1)} ${jour}`;
}

/** Date du jour au format ISO "yyyy-MM-dd", pour comparer aux dates du planning. */
export function dateISOAujourdhui(maintenant = new Date()): string {
  return `${maintenant.getFullYear()}-${String(maintenant.getMonth() + 1).padStart(2, '0')}-${String(maintenant.getDate()).padStart(2, '0')}`;
}

export type StatutReservation = 'a-reserver' | 'reserve' | 'info';

/**
 * Déduit un statut de réservation à partir du texte libre de la colonne
 * "Reservation", pour la mise en évidence visuelle (badge). Heuristique
 * best-effort : à ajuster si le vocabulaire réel du Sheet diffère.
 */
export function statutReservation(valeur: string | null | undefined): StatutReservation | null {
  const texte = valeur?.trim();
  if (!texte) {
    return null;
  }

  const normalise = texte.toLowerCase();
  if (normalise.includes('à réserver') || normalise.includes('a réserver') || normalise === 'réserver') {
    return 'a-reserver';
  }
  if (normalise.includes('réservé')) {
    return 'reserve';
  }
  return 'info';
}
