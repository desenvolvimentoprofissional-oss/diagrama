import { projectSchema, type DocumentProject } from '../shared/document';
import { ApiError } from './auth';
import { validateImage } from './images';
const raster = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/;
export function validatedProject(value: unknown): DocumentProject {
  const result = projectSchema.safeParse(value);
  if (!result.success) throw new ApiError(400, 'A estrutura do documento não é válida.');
  const project = result.data;
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
  return project;
}
