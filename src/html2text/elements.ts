// elements.ts

export class AnchorElement {
    public attrs: { [key: string]: string | null };
    public count: number;
    public outcount: number;
  
    constructor(attrs: { [key: string]: string | null }, count: number, outcount: number) {
      this.attrs = attrs;
      this.count = count;
      this.outcount = outcount;
    }
  }
  
  export class ListElement {
    public name: string;
    public num: number;
  
    constructor(name: string, num: number) {
      this.name = name;
      this.num = num;
    }
  }