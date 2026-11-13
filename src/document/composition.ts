import type { DocumentBlock, ReviewIssue } from '../../shared/document';
export type CompositionFragment={blockId:string;kind:DocumentBlock['kind'];text:string;caption:string;image:string;rows:string[][];
  items:{title:string;text:string}[];nodes:NonNullable<DocumentBlock['nodes']>;edges:NonNullable<DocumentBlock['edges']>;
  level:number;continued:boolean;role?:'caption'|'component-title';top:number;height:number;layout?:DocumentBlock['layout']};
export type CompositionPage={number:number;kind:'cover'|'toc'|'content';tocEntries?:{blockId:string;text:string;level:number;page:number}[];fragments:CompositionFragment[]};
export type DocumentComposition={pages:CompositionPage[];toc:{blockId:string;text:string;level:number;page:number}[];issues:ReviewIssue[]};
