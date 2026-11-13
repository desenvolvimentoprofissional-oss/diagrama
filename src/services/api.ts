import { authorizeProcessing } from './storage';
import { projectSchema, sourceSchema, type DocumentProject, type ReviewIssue } from '../../shared/document';
export class ProcessingError extends Error {}
async function send(path: string, body: unknown, signal?: AbortSignal) {
  const { token } = await authorizeProcessing();
  const form = body instanceof FormData;
  const response = await fetch(`/api/${path}`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, ...(!form ? {'Content-Type':'application/json'} : {}) },
    body: form ? body : JSON.stringify(body), signal,
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new ProcessingError(typeof error.error === 'string' ? error.error : 'Não foi possível concluir a operação.');
  }
  return response;
}
export async function fetchAiStatus() {
  const response = await fetch('/api/status', { cache:'no-store' });
  if (!response.ok) throw new ProcessingError('Não foi possível consultar o servidor.');
  const { data } = await response.json();
  return { configured: data.configured === true, model: typeof data.model === 'string' ? data.model : '' };
}
export async function uploadDocument(file: File, signal?: AbortSignal) {
  const form = new FormData(); form.append('file', file);
  const response = await send('import', form, signal);
  return sourceSchema.parse((await response.json()).data);
}
export async function generateProject(project: DocumentProject, instructions: string, signal?: AbortSignal) {
  const response = await send('generate', { project, instructions }, signal);
  return projectSchema.parse((await response.json()).data);
}
export async function reviewProject(project: DocumentProject, signal?: AbortSignal): Promise<ReviewIssue[]> {
  const response = await send('review', { project, visual:true }, signal);
  return (await response.json()).data.issues;
}
export async function downloadDocument(project: DocumentProject, format: 'pdf'|'docx', signal?: AbortSignal) {
  const response = await send(`export/${format}`, { project }, signal);
  const url = URL.createObjectURL(await response.blob());
  const anchor = document.createElement('a'); anchor.href=url;
  anchor.download = `${project.title.replace(/[<>:"/\\|?*\x00-\x1f]/g,'').slice(0,120)||'Documento'}.${format}`;
  document.body.append(anchor); anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
