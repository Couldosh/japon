export class Avis {
  Valérian: number = 0;
  Laurie: number = 0;
  Greg: number = 0;
  Alex: number = 0;
  Mela: number = 0;
  Tiffa: number = 0;
  Tony: number = 0;
  Fabrice: number = 0;
  moyenne: number = 0;

  constructor(init?: Partial<Avis>) {
    Object.assign(this, init);
  }

  /**
   * Exemple de méthode pour calculer la moyenne automatiquement
   */
  calculerMoyenne(): number {
    const notes = [
      this.Valérian, this.Laurie, this.Greg, this.Alex,
      this.Mela, this.Tiffa, this.Tony, this.Fabrice
    ];
    const notesValides = notes.filter(n => n > 0);

    if (notesValides.length === 0) return 0;

    this.moyenne = notesValides.reduce((a, b) => a + b, 0) / notesValides.length;
    return this.moyenne;
  }

  /**
   * Compte le nombre de caractères 'X' dans une chaîne
   */
  static countX(value: string): number {
    if (!value) return 0;
    return (value.match(/X/gi) || []).length;
  }
}
