import {Component, OnInit} from '@angular/core';
import {ActiviteService} from '../../service/activite/activite.service';
import {Card} from 'primeng/card';
import {TableModule} from 'primeng/table';
import {ActiviteModel} from '../../models/activite.model';

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
  activites: ActiviteModel[] = [];
  constructor(private activiteService: ActiviteService) { }
  ngOnInit(): void {
    this.activiteService.getActivites().subscribe(activites => {
      this.activites = activites
    })
  }

}
