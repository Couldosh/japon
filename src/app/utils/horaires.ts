// Lit le format compact produit par scripts/fetch-horaires.mjs :
// [{ j: jourOuverture(0=dimanche..6=samedi, comme Date.getDay()), h: "HH:mm",
//    jf?: jourFermeture, hf?: "HH:mm" }]
// jf/hf absents = établissement ouvert en continu à partir de ce point (24h/24).

interface PeriodeHoraire {
  j: number;
  h: string;
  jf?: number;
  hf?: string;
}

export interface HoraireJour {
  jour: string;
  horaires: string;
  aujourdhui: boolean;
}

const MINUTES_PAR_JOUR = 24 * 60;
const MINUTES_PAR_SEMAINE = 7 * MINUTES_PAR_JOUR;

// Index = valeur Date.getDay() (0 = dimanche ... 6 = samedi).
const NOMS_JOURS = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];

// Ordre d'affichage habituel en France : lundi -> dimanche.
const ORDRE_AFFICHAGE_JOURS = [1, 2, 3, 4, 5, 6, 0];

function parserPeriodes(horairesJson: string | null | undefined): PeriodeHoraire[] | null {
  if (!horairesJson) {
    return null;
  }
  try {
    const periodes = JSON.parse(horairesJson);
    return Array.isArray(periodes) && periodes.length > 0 ? periodes : null;
  } catch {
    return null;
  }
}

function minutesDepuisDebutSemaine(jour: number, heureMinute: string): number {
  const [heures, minutes] = heureMinute.split(':').map(Number);
  return jour * MINUTES_PAR_JOUR + heures * 60 + minutes;
}

function formaterPeriode(periode: PeriodeHoraire): string {
  return periode.jf == null || !periode.hf ? 'Ouvert 24h/24' : `${periode.h} - ${periode.hf}`;
}

/**
 * Indique si un établissement est ouvert à l'instant donné, à partir des
 * horaires stockés dans la colonne "Horaires" du Google Sheet.
 * Retourne null si l'information est absente ou illisible (badge masqué côté UI).
 */
export function estOuvertMaintenant(horairesJson: string | null | undefined, maintenant = new Date()): boolean | null {
  const periodes = parserPeriodes(horairesJson);
  if (!periodes) {
    return null;
  }

  const maintenantMin = maintenant.getDay() * MINUTES_PAR_JOUR + maintenant.getHours() * 60 + maintenant.getMinutes();

  return periodes.some(periode => {
    if (periode.jf == null || !periode.hf) {
      return true; // pas de fermeture indiquée par Google : ouvert en continu
    }

    const debut = minutesDepuisDebutSemaine(periode.j, periode.h);
    let fin = minutesDepuisDebutSemaine(periode.jf, periode.hf);
    if (fin <= debut) {
      fin += MINUTES_PAR_SEMAINE; // la plage traverse la fin de semaine (ex: ven 22h -> sam 2h)
    }
    const duree = fin - debut;

    // On teste la plage décalée d'une semaine dans les deux sens pour couvrir
    // le cas où "maintenant" tombe juste avant/après la limite du cycle de 7 jours.
    return [debut - MINUTES_PAR_SEMAINE, debut, debut + MINUTES_PAR_SEMAINE]
      .some(d => maintenantMin >= d && maintenantMin < d + duree);
  });
}

/**
 * Horaires du jour courant, formatés pour affichage (ex: "09:00 - 18:00",
 * "11:00 - 14:00, 18:00 - 22:00", "Fermé aujourd'hui"). Null si pas d'info.
 */
export function horairesAujourdhui(horairesJson: string | null | undefined, maintenant = new Date()): string | null {
  const periodes = parserPeriodes(horairesJson);
  if (!periodes) {
    return null;
  }

  const periodesDuJour = periodes.filter(p => p.j === maintenant.getDay());
  if (periodesDuJour.length === 0) {
    return "Fermé aujourd'hui";
  }

  return periodesDuJour.map(formaterPeriode).join(', ');
}

/**
 * Horaires de la semaine complète (lundi -> dimanche), pour affichage détaillé.
 * Null si pas d'info.
 */
export function horairesSemaine(horairesJson: string | null | undefined, maintenant = new Date()): HoraireJour[] | null {
  const periodes = parserPeriodes(horairesJson);
  if (!periodes) {
    return null;
  }

  const jourCourant = maintenant.getDay();

  return ORDRE_AFFICHAGE_JOURS.map(jour => {
    const periodesDuJour = periodes.filter(p => p.j === jour);
    return {
      jour: NOMS_JOURS[jour],
      horaires: periodesDuJour.length === 0 ? 'Fermé' : periodesDuJour.map(formaterPeriode).join(', '),
      aujourdhui: jour === jourCourant,
    };
  });
}
