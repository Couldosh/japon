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
