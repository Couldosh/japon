import { Component, DestroyRef, OnInit, computed, inject, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { switchMap } from 'rxjs';
import {
  IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonIcon, IonContent,
  IonChip, IonItem, IonInput, IonTextarea, IonModal, IonSpinner, IonToggle, AlertController
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { closeOutline, checkmarkOutline, funnelOutline, chevronDownOutline, alertCircleOutline, searchOutline } from 'ionicons/icons';
import { GoogleAuthService } from '../../service/google/google-auth.service';
import { SheetsWriteService } from '../../service/google/sheets-write.service';
import { QuartierService } from '../../service/quartier/quartier.service';
import { QuartierModel } from '../../models/quartier.model';
import { VilleService } from '../../service/ville/ville.service';
import { VilleModel } from '../../models/ville.model';
import { PlatService } from '../../service/plat/plat.service';
import { Plat, PlatCategory } from '../../models/plat.model';
import { PlacesSearchService } from '../../service/google/places-search.service';

type TypeAjout = 'restaurant' | 'activite' | 'magasin' | 'plat' | 'quartier';

/** Normalise un nom pour un matching insensible à la casse/aux accents (ex: "Ramen" ~ "râmen"). */
function normaliser(texte: string): string {
  return texte.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

interface VilleQuartiers {
  ville: string;
  quartiers: string[];
}

/** gid de l'onglet Sheet correspondant à chaque type, voir README.md. "quartier" pointe vers
 * l'onglet de référence "Quartiers" (même gid que QuartierService). */
const GID_PAR_TYPE: Record<TypeAjout, string> = {
  restaurant: '892590698',
  activite: '0',
  magasin: '346756517',
  plat: '2053739160',
  quartier: '1855356526',
};

/** gid de l'onglet de référence "Villes" (même gid que VilleService), pour y ajouter une ville
 * saisie manuellement lors de la création d'un quartier — voir soumettreQuartier(). */
const GID_VILLES = '357846773';

/** "Plat" et "Quartier" ne sont pas des lieux (pas de Quartier/Localisation) : traités à part dans le formulaire. */
const TYPES_LIEU: TypeAjout[] = ['restaurant', 'activite', 'magasin'];

/**
 * Formulaire d'ajout d'un lieu (restaurant/activité/magasin), qui écrit
 * directement dans le Google Sheet via SheetsWriteService — voir
 * docs/architecture-et-pieges.md pour le détail du canal d'écriture.
 */
@Component({
  selector: 'app-ajout-lieu',
  standalone: true,
  imports: [
    IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonIcon, IonContent,
    IonChip, IonItem, IonInput, IonTextarea, IonModal, IonSpinner, IonToggle
  ],
  templateUrl: './ajout-lieu.component.html',
  styleUrl: './ajout-lieu.component.scss'
})
export class AjoutLieuComponent implements OnInit {
  protected readonly googleAuth = inject(GoogleAuthService);
  private readonly sheetsWrite = inject(SheetsWriteService);
  private readonly quartierService = inject(QuartierService);
  private readonly villeService = inject(VilleService);
  private readonly platService = inject(PlatService);
  private readonly placesSearch = inject(PlacesSearchService);
  private readonly alertController = inject(AlertController);
  private readonly destroyRef = inject(DestroyRef);

  readonly ferme = output<void>();
  readonly ajoute = output<string>();

  readonly type = signal<TypeAjout>('restaurant');
  readonly nom = signal('');
  readonly quartier = signal<string | null>(null);
  readonly liens = signal('');
  readonly localisation = signal('');
  readonly description = signal('');
  readonly prix = signal('');
  readonly platsSelectionnes = signal<string[]>([]);
  readonly video = signal('');
  readonly menu = signal('');
  readonly temps = signal('');
  readonly typeMagasin = signal('');
  readonly commentaires = signal('');
  readonly categoriePlat = signal<PlatCategory>(PlatCategory.Plat);
  readonly wiki = signal('');

  readonly PlatCategory = PlatCategory;
  readonly estUnLieu = computed(() => TYPES_LIEU.includes(this.type()));

  readonly pickerQuartierOuvert = signal(false);

  /** Champs du type "Quartier" : ville choisie parmi les villes connues, ou saisie manuellement. */
  readonly villeQuartier = signal<string | null>(null);
  readonly nouvelleVilleQuartier = signal('');

  readonly enCours = signal(false);
  readonly erreur = signal<string | null>(null);
  readonly rechercheEnCours = signal(false);
  readonly rechercheMessage = signal<string | null>(null);
  /** Champs ('liens'/'localisation') dont la valeur actuelle vient de la dernière recherche
   * Google Places, pour afficher un badge "auto" — effacé dès que l'utilisateur retouche le champ. */
  readonly champsAutoRemplis = signal<Set<'liens' | 'localisation'>>(new Set());

  private readonly quartiers = signal<QuartierModel[]>([]);
  private readonly villes = signal<VilleModel[]>([]);
  private readonly platsBruts = signal<Plat[]>([]);

  /** Noms de plats connus (feuille "Plats"), pour le sélecteur du formulaire Restaurant. */
  readonly platsDisponibles = computed(() =>
    [...new Set(this.platsBruts().map(p => p.Nom).filter(Boolean))].sort((a, b) => a.localeCompare(b))
  );

  private readonly platsParNom = computed(() => new Map(this.platsBruts().map(p => [p.Nom, p.Categorie])));

  /** Liste exhaustive des quartiers connus (contrairement au picker de filtre de la Liste,
   * qui ne connaît que les quartiers déjà présents dans les lieux chargés). */
  readonly quartiersParVille = computed((): VilleQuartiers[] => {
    const parVille = new Map<string, Set<string>>();

    for (const q of this.quartiers()) {
      const nom = q.Nom?.trim();
      if (!nom) continue;
      const ville = q.Ville?.Nom?.trim() || 'Ville inconnue';
      if (!parVille.has(ville)) {
        parVille.set(ville, new Set());
      }
      parVille.get(ville)!.add(nom);
    }

    return [...parVille.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([ville, quartiers]) => ({ ville, quartiers: [...quartiers].sort((a, b) => a.localeCompare(b)) }));
  });

  /** Villes déjà connues dans la feuille de référence "Villes" (VilleService), pour choisir
   * plutôt que ressaisir une ville existante — et détecter si une saisie manuelle correspond
   * à une nouvelle ville à ajouter au Sheet (voir soumettreQuartier()). */
  readonly villesConnues = computed(() =>
    [...new Set(this.villes().map(v => v.Nom?.trim()).filter((n): n is string => !!n))]
      .sort((a, b) => a.localeCompare(b))
  );

  /** Ville qui sera écrite pour le type "Quartier" : la nouvelle ville tapée à la main
   * a priorité sur une ville existante sélectionnée (les deux champs se désélectionnent
   * mutuellement au clic/à la saisie, voir choisirVilleQuartier()/majNouvelleVilleQuartier()). */
  private readonly villeAAppliquer = computed(() =>
    this.nouvelleVilleQuartier().trim() || this.villeQuartier()
  );

  readonly formValide = computed(() => {
    if (!this.nom().trim()) return false;
    if (this.type() === 'quartier') return !!this.villeAAppliquer();
    return this.estUnLieu() ? !!this.quartier() : true;
  });

  /** Explique pourquoi le formulaire n'est pas valide, affiché sous le bouton "Ajouter au Sheet". */
  readonly raisonInvalide = computed(() => {
    if (!this.nom().trim()) {
      if (this.type() === 'plat') return 'Le nom du plat est requis.';
      if (this.type() === 'quartier') return 'Le nom du quartier est requis.';
      return 'Le nom est requis.';
    }
    if (this.type() === 'quartier' && !this.villeAAppliquer()) {
      return 'Choisis ou saisis une ville.';
    }
    if (this.estUnLieu() && !this.quartier()) {
      return 'Choisis un quartier.';
    }
    return null;
  });

  /** Vrai si l'utilisateur a commencé à saisir quelque chose — sert à confirmer avant
   * d'abandonner la saisie (fermeture accidentelle de la modale). */
  readonly formulaireRempli = computed(() =>
    [
      this.nom(), this.liens(), this.localisation(), this.description(), this.prix(),
      this.video(), this.menu(), this.temps(), this.typeMagasin(), this.commentaires(), this.wiki(),
      this.nouvelleVilleQuartier()
    ].some(valeur => valeur.trim().length > 0)
    || this.quartier() !== null
    || this.villeQuartier() !== null
    || this.platsSelectionnes().length > 0
  );

  constructor() {
    addIcons({ closeOutline, checkmarkOutline, funnelOutline, chevronDownOutline, alertCircleOutline, searchOutline });
  }

  ngOnInit(): void {
    // La reconnexion silencieuse est déclenchée par HomeComponent.ouvrirModaleAjout(),
    // depuis le clic sur le bouton "+" — pas ici : au moment où ce composant se
    // monte, on est déjà hors du geste utilisateur synchrone, et le popup GIS
    // (même en mode silencieux) est alors bloqué par le navigateur.
    this.rafraichirListesReference(false);
  }

  /**
   * Recharge les listes de référence utilisées par le formulaire (quartiers pour
   * le picker, villes pour le type "Quartier", plats pour le multi-select du
   * Restaurant). Appelé au montage, puis après chaque ajout réussi avec
   * forceRefresh=true : SheetsWriteService a déjà vidé le cache SheetsApi du gid
   * concerné, mais les signals locaux de ce composant (indépendants de ceux de
   * HomeComponent) ne se rafraîchissent pas tout seuls — sans ce rappel, un plat
   * tout juste créé n'apparaîtrait pas dans le multi-select tant que la modale
   * n'est pas fermée puis rouverte.
   */
  private rafraichirListesReference(forceRefresh: boolean): void {
    this.quartierService.getQuartiers(forceRefresh)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(quartiers => this.quartiers.set(quartiers));

    this.villeService.getVilles(forceRefresh)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(villes => this.villes.set(villes));

    this.platService.getPlats(forceRefresh)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(plats => this.platsBruts.set(plats));
  }

  changerType(type: TypeAjout): void {
    this.type.set(type);
    this.rechercheMessage.set(null);
  }

  choisirQuartier(nom: string): void {
    this.quartier.set(nom);
    this.pickerQuartierOuvert.set(false);
  }

  choisirVilleQuartier(ville: string): void {
    this.villeQuartier.set(ville);
    this.nouvelleVilleQuartier.set('');
  }

  majNouvelleVilleQuartier(valeur: string): void {
    this.nouvelleVilleQuartier.set(valeur);
    if (valeur.trim()) {
      this.villeQuartier.set(null);
    }
  }

  majLiens(valeur: string): void {
    this.liens.set(valeur);
    this.retirerBadgeAuto('liens');
  }

  majLocalisation(valeur: string): void {
    this.localisation.set(valeur);
    this.retirerBadgeAuto('localisation');
  }

  private retirerBadgeAuto(champ: 'liens' | 'localisation'): void {
    if (!this.champsAutoRemplis().has(champ)) return;
    const restants = new Set(this.champsAutoRemplis());
    restants.delete(champ);
    this.champsAutoRemplis.set(restants);
  }

  estPlatSelectionne(nom: string): boolean {
    return this.platsSelectionnes().includes(nom);
  }

  basculerPlat(nom: string): void {
    const actuel = this.platsSelectionnes();
    this.platsSelectionnes.set(actuel.includes(nom) ? actuel.filter(p => p !== nom) : [...actuel, nom]);
  }

  /** Couleur Ionic (success/danger/medium) d'un plat, même code que le badge du détail resto (PlatService.getSeverity). */
  couleurPlat(nom: string): string {
    const categorie = this.platsParNom().get(nom);
    return categorie ? this.platService.getSeverity(categorie) : 'medium';
  }

  /** Fond plein (couleur de catégorie) pour une chip plat sélectionnée. */
  fondPlatSelectionne(nom: string): string {
    return `var(--ion-color-${this.couleurPlat(nom)})`;
  }

  /** Texte clair (nuance "contrast" de la couleur de catégorie) pour une chip plat sélectionnée. */
  textePlatSelectionne(nom: string): string {
    return `var(--ion-color-${this.couleurPlat(nom)}-contrast)`;
  }

  /**
   * Demande confirmation avant d'abandonner une saisie non vide. Appelé par
   * HomeComponent (via ViewChild) comme callback [canDismiss] de la modale
   * englobante, pour bloquer une fermeture accidentelle (swipe, tap sur le
   * fond) tant que l'utilisateur n'a pas explicitement confirmé.
   */
  async confirmerAbandon(): Promise<boolean> {
    if (!this.formulaireRempli()) {
      return true;
    }

    const alert = await this.alertController.create({
      header: 'Abandonner cette saisie ?',
      message: 'Les informations déjà saisies pour ce lieu seront perdues.',
      buttons: [
        { text: 'Continuer la saisie', role: 'cancel' },
        { text: 'Abandonner', role: 'destructive' },
      ],
    });
    await alert.present();
    const { role } = await alert.onDidDismiss();
    return role === 'destructive';
  }

  /**
   * Recherche l'établissement sur Google Places (New) à partir du Nom + Quartier
   * saisis, et préremplit Lien/Localisation (et, pour un restaurant, tente de
   * repérer des plats déjà connus dans le résumé Google — Places ne fournit pas
   * de vraie liste de plats, donc ce préremplissage reste approximatif et à
   * vérifier). Si Lien et/ou Localisation contiennent déjà une valeur, demande
   * confirmation avant de l'écraser (confirmerEcrasement) plutôt que de le
   * faire silencieusement.
   */
  rechercherPlaces(): void {
    const nom = this.nom().trim();
    if (!nom || !this.quartier() || this.rechercheEnCours()) {
      return;
    }

    this.rechercheEnCours.set(true);
    this.rechercheMessage.set(null);

    this.placesSearch.rechercher(nom, this.quartier())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: async resultat => {
          this.rechercheEnCours.set(false);

          if (!resultat) {
            this.rechercheMessage.set('Aucun établissement trouvé sur Google Places pour ce nom.');
            return;
          }

          const ecraseraitLiens = !!resultat.siteWeb && this.liens().trim().length > 0;
          const ecraseraitLocalisation = this.localisation().trim().length > 0;

          if ((ecraseraitLiens || ecraseraitLocalisation) && !(await this.confirmerEcrasement())) {
            if (this.type() === 'restaurant' && resultat.resume) {
              this.preselectionnerPlats(resultat.resume);
            }
            this.rechercheMessage.set(
              `Trouvé : ${resultat.nom}${resultat.adresse ? ' — ' + resultat.adresse : ''}. Lien/Localisation existants conservés.`
            );
            return;
          }

          this.localisation.set(resultat.lienLocalisation);
          const champsRemplis = new Set<'liens' | 'localisation'>(['localisation']);
          if (resultat.siteWeb) {
            this.liens.set(resultat.siteWeb);
            champsRemplis.add('liens');
          }
          this.champsAutoRemplis.set(champsRemplis);

          if (this.type() === 'restaurant' && resultat.resume) {
            this.preselectionnerPlats(resultat.resume);
          }

          this.rechercheMessage.set(
            `Trouvé : ${resultat.nom}${resultat.adresse ? ' — ' + resultat.adresse : ''}. Vérifie que c'est la bonne enseigne avant d'ajouter.`
          );
        },
        error: (err: Error) => {
          this.rechercheEnCours.set(false);
          this.rechercheMessage.set(err.message);
        }
      });
  }

  /** Confirmation avant de remplacer un Lien/Localisation déjà renseigné manuellement par le résultat Places. */
  private async confirmerEcrasement(): Promise<boolean> {
    const alert = await this.alertController.create({
      header: 'Remplacer les champs déjà remplis ?',
      message: 'Le lien et/ou la localisation contiennent déjà une valeur. Le résultat trouvé sur Google Places va la remplacer.',
      buttons: [
        { text: 'Garder mes valeurs', role: 'cancel' },
        { text: 'Remplacer', role: 'destructive' },
      ],
    });
    await alert.present();
    const { role } = await alert.onDidDismiss();
    return role === 'destructive';
  }

  /** Best-effort : ajoute à la sélection les plats déjà connus (feuille "Plats")
   * dont le nom apparaît dans le résumé Google Places de l'établissement. */
  private preselectionnerPlats(resume: string): void {
    const resumeNormalise = normaliser(resume);
    const trouves = this.platsDisponibles().filter(nomPlat => resumeNormalise.includes(normaliser(nomPlat)));
    if (trouves.length === 0) {
      return;
    }
    this.platsSelectionnes.set([...new Set([...this.platsSelectionnes(), ...trouves])]);
  }

  soumettre(): void {
    if (!this.formValide() || this.enCours()) {
      return;
    }

    if (this.type() === 'quartier') {
      this.soumettreQuartier();
      return;
    }

    this.ecrire(this.type());
  }

  /**
   * Cas "Quartier" : si la ville saisie manuellement ne correspond à aucune ville déjà
   * connue (comparaison insensible casse/accents via normaliser()), demande confirmation
   * avant de la créer dans le Sheet — une faute de frappe sur une ville existante créerait
   * sinon un doublon silencieux, pénible à nettoyer sur un Sheet partagé. Annuler laisse le
   * formulaire intact pour corriger la saisie.
   */
  private async soumettreQuartier(): Promise<void> {
    const nouvelleVille = this.nouvelleVilleQuartier().trim();
    const villeACreer = !!nouvelleVille && !this.villesConnues().some(v => normaliser(v) === normaliser(nouvelleVille));

    if (villeACreer && !(await this.confirmerNouvelleVille(nouvelleVille))) {
      return;
    }

    this.ecrire('quartier', villeACreer ? nouvelleVille : null);
  }

  private async confirmerNouvelleVille(nom: string): Promise<boolean> {
    const alert = await this.alertController.create({
      header: 'Nouvelle ville ?',
      message: `"${nom}" n'existe pas encore dans la liste des villes — elle sera ajoutée au Sheet.`,
      buttons: [
        { text: 'Annuler', role: 'cancel' },
        { text: 'Créer la ville', role: 'confirm' },
      ],
    });
    await alert.present();
    const { role } = await alert.onDidDismiss();
    return role === 'confirm';
  }

  /** Écrit la ligne du type courant, en écrivant d'abord `nouvelleVille` dans la feuille
   * "Villes" si fourni (cas "Quartier" avec une ville inédite déjà confirmée). */
  private ecrire(type: TypeAjout, nouvelleVille: string | null = null): void {
    this.enCours.set(true);
    this.erreur.set(null);

    const ecritureQuartier$ = this.sheetsWrite.ajouterLigne(GID_PAR_TYPE[type], this.construireValeurs(type));
    const ecriture$ = nouvelleVille
      ? this.sheetsWrite.ajouterLigne(GID_VILLES, { Nom: nouvelleVille }).pipe(switchMap(() => ecritureQuartier$))
      : ecritureQuartier$;

    ecriture$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.enCours.set(false);
          this.reinitialiser();
          this.rafraichirListesReference(true);
          this.ajoute.emit(type);
        },
        error: (err: Error) => {
          this.enCours.set(false);
          this.erreur.set(err.message);
        }
      });
  }

  private construireValeurs(type: TypeAjout): Record<string, string> {
    if (type === 'plat') {
      return {
        Nom: this.nom().trim(),
        Categorie: this.categoriePlat(),
        Description: this.description().trim(),
        Commentaires: this.commentaires().trim(),
        Wiki: this.wiki().trim(),
      };
    }

    if (type === 'quartier') {
      return {
        Nom: this.nom().trim(),
        Ville: this.villeAAppliquer() ?? '',
        Mood: '',
      };
    }

    const commun: Record<string, string> = {
      Nom: this.nom().trim(),
      Quartier: this.quartier() ?? '',
      Liens: this.liens().trim(),
      Localisation: this.localisation().trim(),
      Commentaires: this.commentaires().trim(),
    };

    if (type === 'restaurant') {
      return {
        ...commun,
        Description: this.description().trim(),
        Prix: this.prix().trim(),
        Plats: this.platsSelectionnes().join(', '),
        Video: this.video().trim(),
        Menu: this.menu().trim(),
      };
    }

    if (type === 'activite') {
      return {
        ...commun,
        Description: this.description().trim(),
        Prix: this.prix().trim(),
        Temps: this.temps().trim(),
      };
    }

    return {
      ...commun,
      Type: this.typeMagasin().trim(),
    };
  }

  private reinitialiser(): void {
    this.nom.set('');
    this.quartier.set(null);
    this.liens.set('');
    this.localisation.set('');
    this.description.set('');
    this.prix.set('');
    this.platsSelectionnes.set([]);
    this.video.set('');
    this.menu.set('');
    this.temps.set('');
    this.typeMagasin.set('');
    this.commentaires.set('');
    this.categoriePlat.set(PlatCategory.Plat);
    this.wiki.set('');
    this.villeQuartier.set(null);
    this.nouvelleVilleQuartier.set('');
    this.rechercheMessage.set(null);
    this.champsAutoRemplis.set(new Set());
  }
}
