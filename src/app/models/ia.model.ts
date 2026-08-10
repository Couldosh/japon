export interface DescriptionRequest {
  nom: string;
  type: string;
  quartier: string | null;
  resumeGoogle: string | null;
}

export interface DescriptionResponse {
  description: string;
}

export interface ExtractionPlatsRequest {
  nomRestaurant: string;
  resumeGoogle: string | null;
  platsConnus: string[];
}

export interface PlatSuggere {
  nom: string;
  categorie: string;
}

export interface ExtractionPlatsResponse {
  plats: PlatSuggere[];
}

export interface ResumeQuotidienRequest {
  jour: string;
  ville: string;
  activites: string[];
  meteo: string | null;
  hebergement: string | null;
}

export interface ResumeQuotidienResponse {
  resume: string;
}

export interface PlatInfoRequest {
  nom: string;
  categorie: string;
}

export interface PlatInfoResponse {
  description: string;
  wiki: string;
}

export interface RestaurantCandidat {
  nom: string;
  quartier: string;
  prix: string;
  plats: string[];
}

export interface RechercheRestaurantRequest {
  plat: string;
  quartier: string | null;
  gammePrix: string | null;
  rechercheExterne: boolean;
  restaurantsConnus: RestaurantCandidat[];
  villesConnues: string[];
}

export interface SuggestionRestaurant {
  nom: string;
  quartier: string;
  prix: string;
  raison: string;
  connu: boolean;
}

export interface RechercheRestaurantResponse {
  resultats: SuggestionRestaurant[];
}

export interface RechercheLieuRequest {
  nom: string;
  type: string;
  villesConnues: string[];
}

export interface SuggestionLieu {
  nom: string;
  quartier: string;
  ville: string;
  raison: string;
}

export interface RechercheLieuResponse {
  resultats: SuggestionLieu[];
}
