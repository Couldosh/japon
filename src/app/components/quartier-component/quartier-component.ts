import {ChangeDetectorRef, Component, OnInit} from '@angular/core';
import {Button} from 'primeng/button';
import {Card} from 'primeng/card';
import {Dialog} from 'primeng/dialog';
import {FloatLabel} from 'primeng/floatlabel';
import {Select} from 'primeng/select';
import {Tag} from 'primeng/tag';
import {TreeTableModule} from 'primeng/treetable';
import {Restaurant, RestaurantService} from '../../service/restaurant/restaurant.service';
import {Plat} from '../plat/plat.component';
import {TreeNode} from 'primeng/api';
import {PlatService} from '../../service/plat/plat.service';
import {FormsModule} from '@angular/forms';
import {MultiSelect} from 'primeng/multiselect';
import {Checkbox} from 'primeng/checkbox';
import {QuartierService} from '../../service/quartier/quartier.service';
import {QuartierModel} from '../../models/quartier.model';
import {forkJoin} from 'rxjs';

@Component({
  selector: 'app-quartier.component',
  imports: [
    Button,
    Card,
    Dialog,
    FloatLabel,
    Select,
    Tag,
    TreeTableModule,
    FormsModule,
  ],
  templateUrl: './quartier-component.html',
  styleUrl: './quartier-component.scss',
})
export class QuartierComponent implements OnInit {
  restaurants: Restaurant[] = [];
  plats: Plat[] = [];
  villes: string[] = [];
  treeRestaurants: TreeNode[] = [];
  selectedPlat: Plat | null = null;
  selectedVille: string | null = null;
  filteredTreeRestaurants: any[] = [];

  displayPlatDetails: boolean = false;
  platToShow: Plat | null = null;

  constructor(
    private restaurantService: RestaurantService,
    protected platService: PlatService,
    private cdr: ChangeDetectorRef
  ) {
  }

  ngOnInit() {
    this.restaurantService.getRestaurants().subscribe(restaurants => {
      this.restaurants = restaurants.filter(restaurant => {return restaurant.Nom.length !== 0});
      this.villes = [...new Set(this.restaurants.map((restaurant: Restaurant) => restaurant.Ville).sort((one, two) => (one < two ? -1 : 1)))];
      this.treeRestaurants = this.transformToTreeData(this.restaurants);
      this.applyFilters()
      this.cdr.detectChanges();
    });

    this.platService.getPlats().subscribe(plats => {this.plats = plats.sort((one, two) => (one.Nom < two.Nom ? -1 : 1));});
  }


  transformToTreeData(restaurants: Restaurant[]): any[] {
    const villesMap = new Map<string, any>();

    restaurants.forEach(restaurant => {
      const villeKey = restaurant.Ville;
      const quartiersList = restaurant.Quartier;

      if (!villesMap.has(villeKey)) {
        villesMap.set(villeKey, {
          data: {Nom: villeKey, type: 'Ville'},
          quartiers: new Map<string, any>(),
          restaurantsSansQuartier: []
        });
      }

      const ville = villesMap.get(villeKey);

      /* ======================
         RESTAURANT SANS QUARTIER
      ====================== */
      if (!quartiersList || quartiersList.length === 0) {
        ville.restaurantsSansQuartier.push({
          data: {...restaurant, type: 'Restaurant'}
        });
        return;
      }

      /* ======================
         QUARTIERS (LISTE)
      ====================== */
      quartiersList.forEach(q => {
        const quartierKey = q.Nom.trim();
        if (!quartierKey) return;

        if (!ville.quartiers.has(quartierKey)) {
          ville.quartiers.set(quartierKey, {
            data: {Nom: quartierKey, type: 'Quartier'},
            children: []
          });
        }

        ville.quartiers.get(quartierKey).children.push({
          data: {...restaurant, type: 'Restaurant'}
        });
      });
    });

    /* ======================
       CONSTRUCTION FINALE
    ====================== */

    return Array.from(villesMap.values()).map(ville => {
      const quartiersTries = Array.from(ville.quartiers.values()).sort((a: any, b: any) => (a.data.Nom < b.data.Nom ? -1 : 1));
      return {
        data: ville.data,
        children: [...quartiersTries, ...ville.restaurantsSansQuartier]
      };
    });
  }


  applyFilters() {
    if (!this.selectedVille && !this.selectedPlat) {
      this.filteredTreeRestaurants = [...this.treeRestaurants];
      return;
    }

    this.filteredTreeRestaurants = this.treeRestaurants
      .map(villeNode => {
        // Filtre sur le nom de la ville
        if (this.selectedVille &&
          !villeNode.data.Nom.toLowerCase().includes(this.selectedVille.toLowerCase())) {
          return null;
        }

        // Filtre les quartiers et restaurants de cette ville
        // @ts-ignore
        const filteredChildren = villeNode.children
          .map(quartierOrRestaurantNode => {
            // Cas d'un quartier
            if (quartierOrRestaurantNode.data.type === 'Quartier') {
              // @ts-ignore
              const filteredRestaurants = quartierOrRestaurantNode.children
                .filter((restaurantNode: any) => {
                  // Filtre sur les plats du restaurant
                  if (this.selectedPlat) {
                    const platMatch = restaurantNode.data.Plats.some((plat: any) =>
                      plat.Nom.toLowerCase().includes(this.selectedPlat?.Nom.toLowerCase())
                    );
                    if (!platMatch) return false;
                  }
                  return true;
                });
              if (filteredRestaurants.length > 0) {
                return {
                  ...quartierOrRestaurantNode,
                  children: filteredRestaurants
                };
              } else {
                return null;
              }
            }
            // Cas d'un restaurant directement sous la ville
            else if (quartierOrRestaurantNode.data.type === 'Restaurant') {
              if (this.selectedPlat) {
                const platMatch = quartierOrRestaurantNode.data.Plats.some((plat: any) =>
                  plat.Nom.toLowerCase().includes(this.selectedPlat?.Nom.toLowerCase())
                );
                if (!platMatch) return null;
              }
              return quartierOrRestaurantNode;
            }
            return quartierOrRestaurantNode;
          })
          .filter(Boolean); // Enlève les null

        if (filteredChildren.length > 0) {
          return {
            ...villeNode,
            children: filteredChildren
          };
        } else {
          return null;
        }
      })
      .filter(Boolean); // Enlève les null
    this.checkAutoExpand();
  }

  onNodeExpand(event: any) {
    const node = event.node;

    // On vérifie que c’est une ville
    if (node?.data?.type !== 'Ville') {
      return;
    }

    if (!node.children || node.children.length !== 1) {
      return;
    }

    const uniqueChild = node.children[0];

    // Vérifie que l’enfant est bien un quartier
    if (uniqueChild.data?.type === 'Quartier') {
      uniqueChild.expanded = true;
    }
  }

  /**
   * Vérifie si un seul élément est présent à la racine ou dans les sous-niveaux
   * pour l'étendre automatiquement.
   */
  private checkAutoExpand() {
    if (this.filteredTreeRestaurants && this.filteredTreeRestaurants.length === 1) {
      const villeNode = this.filteredTreeRestaurants[0];
      villeNode.expanded = true;

      // Optionnel : si cette ville n'a qu'un seul quartier, on l'étend aussi
      if (villeNode.children && villeNode.children.length === 1) {
        if (villeNode.children[0].data?.type === 'Quartier') {
          villeNode.children[0].expanded = true;
        }
      }
    }
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

}
