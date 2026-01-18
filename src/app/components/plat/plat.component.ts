import {Component, OnInit} from '@angular/core';
import {Card} from "primeng/card";
import {PlatService} from '../../service/plat/plat.service';
import {TableModule} from 'primeng/table';
import {FormsModule} from '@angular/forms';
import {Tag} from 'primeng/tag';
import {MultiSelect} from 'primeng/multiselect';

export interface Plat {
  Nom: string;
  Categorie: PlatCategory;
  Description: string;
  Commentaires: string;
  Wiki: string;
}

export enum PlatCategory {
  Plat = 'Plat',
  Snack = 'Snack'
}

@Component({
  selector: 'app-plat',
  standalone: true,
  imports: [
    Card,
    TableModule,
    FormsModule,
    Tag,
    MultiSelect
  ],
  templateUrl: './plat.component.html',
  styleUrl: './plat.component.scss',
})
export class PlatComponent implements OnInit {
    plats: Plat[] = [];
    selectedCategories: PlatCategory[] = [PlatCategory.Plat, PlatCategory.Snack];
    constructor(protected platService: PlatService) { }
    ngOnInit(): void {
        this.platService.getPlats().subscribe(plats => {
          this.plats = plats
        })
    }

  protected readonly PlatCategory = PlatCategory;
  protected readonly Object = Object;


}
