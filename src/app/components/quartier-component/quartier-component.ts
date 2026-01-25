import {ChangeDetectorRef, Component, OnInit} from '@angular/core';
import {Button} from 'primeng/button';
import {Card} from 'primeng/card';
import {Dialog} from 'primeng/dialog';
import {FloatLabel} from 'primeng/floatlabel';
import {Select} from 'primeng/select';
import {Tag} from 'primeng/tag';
import {RestaurantService} from '../../service/restaurant/restaurant.service';
import {Plat} from '../plat/plat.component';
import {PlatService} from '../../service/plat/plat.service';
import {FormsModule} from '@angular/forms';
import {QuartierService} from '../../service/quartier/quartier.service';
import {QuartierModel} from '../../models/quartier.model';
import {forkJoin} from 'rxjs';
import {TableModule} from 'primeng/table';
import {RestaurantModel} from '../../models/restaurant.model';
import {ActiviteModel} from '../../models/activite.model';
import {MagasinModel} from '../../models/magasin.model';


enum Mode {
  Restaurant = 'Restaurant',
  Activite = 'Activite',
  Magasin = 'Magasin'
}

@Component({
  selector: 'app-quartier.component',
  imports: [
    Button,
    Card,
    Dialog,
    FloatLabel,
    Select,
    Tag,
    FormsModule,
    TableModule,
  ],
  templateUrl: './quartier-component.html',
  styleUrl: './quartier-component.scss',
})
export class QuartierComponent implements OnInit {
  restaurants: RestaurantModel[] = [];
  plats: Plat[] = [];
  quartiers: QuartierModel[] = [];
  groupedQuartiers: any[] = [];
  activites: ActiviteModel[] = [];
  magasins: MagasinModel[] = [];
  villes: string[] = [];
  selectedMode: Mode = Mode.Restaurant;
  selectedQuartier: QuartierModel | null = null;


  filteredRestaurants: RestaurantModel[] = [];
  filteredMagasins: MagasinModel[] = [];
  filteredActivites: ActiviteModel[] = [];

  displayPlatDetails: boolean = false;
  platToShow: Plat | null = null;

  constructor(
    private restaurantService: RestaurantService,
    private quartierService: QuartierService,
    protected platService: PlatService,
    private cdr: ChangeDetectorRef
  ) {
  }

  ngOnInit() {
    // Utilisation de forkJoin pour attendre les deux réponses
    forkJoin({
      quartiers: this.quartierService.getQuartiers(),
      restaurants: this.restaurantService.getRestaurants(),
      plats: this.platService.getPlats()
    }).subscribe(({ quartiers, restaurants, plats }) => {
      this.restaurants = restaurants.filter(restaurant => {return restaurant.Nom.length !== 0});
      this.plats = plats.sort((one, two) => (one.Nom < two.Nom ? -1 : 1));
      this.quartiers = quartiers;
      this.applyFilters();
      this.groupQuartiersByVille()
    })

  }

  applyFilters() {
    if (this.selectedQuartier != null) {
      this.filteredRestaurants = this.restaurants.filter(restaurant => restaurant.Quartier.map(quartier => quartier.Nom).includes(this.selectedQuartier!.Nom));
      this.filteredActivites = this.activites.filter(activite => activite.Quartier === (this.selectedQuartier!));
      this.filteredMagasins = this.magasins.filter(magasin => magasin.Quartier.includes(this.selectedQuartier!));
    } else {
      this.filteredRestaurants = [...this.restaurants];
      this.filteredActivites = [...this.activites];
      this.filteredMagasins = [...this.magasins];
    }
    this.cdr.detectChanges();
  }

  groupQuartiersByVille() {
    const groups: { [key: string]: any } = {};

    this.quartiers.forEach((quartier) => {
      const nomVille = (typeof quartier.Ville === 'object' && quartier.Ville !== null) ? (quartier.Ville as any).Nom : quartier.Ville;

      if (!groups[nomVille]) {
        groups[nomVille] = {
          label: nomVille,
          value: nomVille,
          items: []
        };
      }

      groups[nomVille].items.push({
        label: quartier.Nom,
        value: quartier
      });
    });

    this.groupedQuartiers = Object.values(groups);
  }


  findPlat(plat: Plat) {
    return this.plats.find((bla) => bla.Nom === plat.Nom)
  }

  getPlatSeverity(plat : Plat) {
    return this.platService.getSeverity(this.findPlat(plat)!.Categorie);
  }

  showPlatDetails(plat: Plat) {
    this.platToShow = this.findPlat(plat)!;
    this.displayPlatDetails = true;
  }

  protected readonly Object = Object;
  protected readonly Mode = Mode;
}
