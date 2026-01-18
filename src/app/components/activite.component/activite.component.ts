import {Component, OnInit} from '@angular/core';
import {PlatService} from '../../service/plat/plat.service';
import {ActiviteService} from '../../service/activite/activite.service';
import {Card} from 'primeng/card';
import {TableModule} from 'primeng/table';

export interface Activite {
  Ville: string;
  Lieu: string;
  Activite: string;
  Prix: string;
  Temps: string;
  Commentaires: string;
}

@Component({
  selector: 'app-activite.component',
  imports: [
    Card,
    TableModule
  ],
  templateUrl: './activite.component.html',
  styleUrl: './activite.component.scss',
})

export class ActiviteComponent implements OnInit {
  activites: Activite[] = [];
  constructor(private activiteService: ActiviteService) { }
  ngOnInit(): void {
    this.activiteService.getActivites().subscribe(activites => {
      this.activites = activites
    })
  }

}
