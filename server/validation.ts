import { MAX_PROJECT_BYTES, projectSchema, type DocumentBlock, type DocumentProject } from '../shared/document';
import { ApiError } from './auth';
import { validateImage } from './images';
const raster = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/;

function validateDiagram(block: DocumentBlock, sourceIds: Set<string>) {
  const nodes = block.nodes ?? [];
  const edges = block.edges ?? [];
  if (block.kind !== 'diagram') {
    if (nodes.length || edges.length) throw new ApiError(400, 'Um componente contém um diagrama sob tipo incorreto.');
    return;
  }
  if (!nodes.length) throw new ApiError(400, 'O diagrama precisa conter ao menos um elemento.');
  const identifiers = new Set(nodes.map(node => node.id));
  if (identifiers.size !== nodes.length) throw new ApiError(400, 'O diagrama contém identificadores repetidos.');
  if (edges.some(edge => !identifiers.has(edge.from) || !identifiers.has(edge.to)))
    throw new ApiError(400, 'Uma conexão do diagrama aponta para elemento inexistente.');
  if (nodes.some(node => node.sourceIds.some(id => !sourceIds.has(id))))
    throw new ApiError(400, 'Um elemento do diagrama contém referência de origem inexistente.');
}

function validateNodeBudget(project: DocumentProject) {
  const pending: unknown[] = [project];
  let visited = 0;
  while (pending.length) {
    const value = pending.pop();
    if (++visited > 200000) throw new ApiError(400, 'O documento contém elementos demais para processamento.');
    if (value && typeof value === 'object') pending.push(...Object.values(value));
  }
}

export function validatedProject(value: unknown): DocumentProject {
  const result = projectSchema.safeParse(value);
  if (!result.success) throw new ApiError(400, 'A estrutura do documento não é válida.');
  const project = result.data;
  validateNodeBudget(project);
  if (Buffer.byteLength(JSON.stringify(project), 'utf8') > MAX_PROJECT_BYTES)
    throw new ApiError(413, 'O documento deve ter até 32 MB de conteúdo.');
  const images = [project.theme.logo, ...project.blocks.map(block => block.image),
    ...(project.source?.blocks.map(block => block.image) || [])].filter(Boolean);
  if (images.some(image => !raster.test(image)))
    throw new ApiError(400, 'Use imagens PNG, JPEG ou WebP enviadas pelo editor.');
  for (const image of new Set(images)) validateImage(image);
  const ids = project.blocks.map(block => block.id);
  if (new Set(ids).size !== ids.length) throw new ApiError(400, 'Existem identificadores de blocos duplicados.');
  const sourceIds = new Set(project.source?.blocks.map(block => block.id) || []);
  if (sourceIds.size !== (project.source?.blocks.length || 0))
    throw new ApiError(400, 'Existem identificadores repetidos no documento de origem.');
  for (const block of project.blocks) {
    if (block.sourceIds.some(id => !sourceIds.has(id)))
      throw new ApiError(400, 'Um componente contém referência de origem inexistente.');
  }
  for (const block of [...project.blocks, ...(project.source?.blocks ?? [])]) validateDiagram(block, sourceIds);
  return project;
}
