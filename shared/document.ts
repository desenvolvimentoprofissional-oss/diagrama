import { z } from 'zod';

export const blockKinds = ['heading', 'paragraph', 'list', 'table', 'image', 'callout', 'cards', 'steps', 'diagram'] as const;
export const blockSchema = z.object({
  id: z.string().min(1).max(120),
  kind: z.enum(blockKinds),
  sourceIds: z.array(z.string().max(120)).max(4000),
  text: z.string().max(400000).default(''),
  level: z.number().int().min(1).max(6).default(1),
  rows: z.array(z.array(z.string().max(200000)).max(40)).max(2000).default([]),
  items: z.array(z.object({ title: z.string().max(20000), text: z.string().max(100000) })).max(100).default([]),
  image: z.string().max(16000000).default(''),
  caption: z.string().max(10000).default(''),
  sourcePage: z.number().int().nonnegative().optional(),
  breakBefore: z.boolean().default(false),
  layout: z.enum(['auto', 'grid', 'comparison', 'process', 'timeline', 'decision', 'hierarchy']).optional(),
  nodes: z.array(z.object({ id:z.string().min(1).max(80), label:z.string().max(160),
    detail:z.string().max(700), sourceIds:z.array(z.string().max(120)).max(100) }).strict()).max(18).optional(),
  edges: z.array(z.object({ from:z.string().max(80), to:z.string().max(80), label:z.string().max(100) })
    .strict()).max(40).optional(),
}).strict();
export type DocumentBlock = z.infer<typeof blockSchema>;
export const sourceSchema = z.object({
  name: z.string().max(300), format: z.enum(['docx','pdf','text']),
  sha256: z.string().max(64), blocks: z.array(blockSchema).max(6000),
  warnings: z.array(z.string().max(2000)).max(500),
  pageCount: z.number().int().nonnegative(), ocr: z.boolean(),
  metadata: z.object({title:z.string().max(1000).optional(),subject:z.string().max(2000).optional(),
    author:z.string().max(500).optional()}).strict().optional(),
}).strict();
export type SourceDocument = z.infer<typeof sourceSchema>;
export const themeSchema = z.object({
  primary: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#183364'),
  accent: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#d9ad4c'),
  fontSize: z.number().min(9).max(14).default(11),
  logo: z.string().max(3000000).default(''),
  organization: z.string().max(200).default('CRA-SP'),
}).strict();
export const projectSchema = z.object({
  schemaVersion: z.literal(1), id: z.string().uuid(), title: z.string().min(1).max(300),
  subtitle: z.string().max(1000), author: z.string().max(200),
  mode: z.enum(['integral','explanatory']),
  source: sourceSchema.nullable(), blocks: z.array(blockSchema).max(6000),
  theme: themeSchema, cover: z.boolean(), toc: z.boolean(),
  createdAt: z.string().datetime(), updatedAt: z.string().datetime(),
}).strict();
export type DocumentProject = z.infer<typeof projectSchema>;
export type DocumentTheme = z.infer<typeof themeSchema>;
export type ReviewIssue = { severity:'error'|'warning'|'info'; message:string; blockId?:string; page?:number };
export const MAX_PROJECT_BYTES = 32 * 1024 * 1024;
export function makeBlock(kind: DocumentBlock['kind'], text = ''): DocumentBlock {
  return blockSchema.parse({id:crypto.randomUUID(),kind,text,sourceIds:[]});
}
export function createProject(): DocumentProject {
  const now = new Date().toISOString();
  return projectSchema.parse({schemaVersion:1,id:crypto.randomUUID(),title:'Documento sem título',
    subtitle:'',author:'',mode:'explanatory',source:null,blocks:[],theme:{},cover:true,toc:true,createdAt:now,updatedAt:now});
}
