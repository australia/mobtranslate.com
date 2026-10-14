export interface APISite { file: string; line: number }
export interface APIProperty {
  name: string; optional: boolean; type: string; declarations: APISite[];
  locallyDeclared: boolean; documentation: string; tags: {name:string;text:string}[];
}
export interface APIEntry {
  revision: string; name: string; kind: string; runtime: boolean;
  sites: APISite[]; signatures: string[]; definition: string; documentation: string; props: APIProperty[];
  topics: {href:string;label:string}[];
}
export interface APIIndex {
  revision: string; source: string;
  exports: {name:string;kind:string;runtime:boolean;props:number;localProps:number}[];
}
