/** Prévision météo d'un jour, pour une ville donnée (voir MeteoService). */
export interface MeteoJour {
  /** Code météo WMO (Open-Meteo), voir utils/emoji-meteo.ts pour la correspondance. */
  code: number;
  tempMax: number;
  tempMin: number;
}
