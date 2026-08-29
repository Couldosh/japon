/**
 * Un lieu du carnet de tampons "eki stamp" (gares/lieux touristiques, voir
 * docs/architecture-et-pieges.md) — données statiques générées une fois depuis
 * EKI_STAMPS_itineraire_FR.kmz par scripts/generer-eki-stamps.mjs dans
 * public/eki-stamps.json, distinctes des lieux du Google Sheet (LieuAffichable).
 */
export interface EkiStampModel {
  id: string;
  nom: string;
  nomJaponais: string;
  nomAnglais: string;
  adresse: string;
  url: string;
  sansPersonnelDepuis: string;
  dateFermeture: string;
  tamponDisponible: boolean;
  categorie: string;
  zone: string;
  latitude: number;
  longitude: number;
}
