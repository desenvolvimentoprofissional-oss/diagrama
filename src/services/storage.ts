import { z } from 'zod';
import { MAX_PROJECT_BYTES, projectSchema, type DocumentProject } from '../../shared/document';

const metadataSchema = z.object({
  id: z.string().uuid(), title: z.string().min(1).max(300), author: z.string().max(200),
  blockCount: z.number().int().min(0).max(6000), revision: z.number().int().positive(),
  createdAt: z.string().datetime(), updatedAt: z.string().datetime(),
});
export type SavedMetadata = z.infer<typeof metadataSchema>;
export type SavedProject = SavedMetadata & { document: DocumentProject };
export type SaveRequest = { id: string; revision: number; saveId: string; document: DocumentProject };
export type StorageStatus = { canWrite: boolean; projectId: 'idp-work' };
export type ProjectPage = { items: SavedMetadata[]; cursor?: string };
export class StorageError extends Error {
  constructor(message: string, readonly status = 0) { super(message); }
}
type Pending = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};
type Operation = 'status' | 'list' | 'get' | 'save' | 'authorize';

export function workParentOrigin(host: Window): string | null {
  if (host.parent === host) return null;
  try {
    const raw = new URL(host.location.href).searchParams.get('workOrigin');
    if (!raw) return null;
    const url = new URL(raw);
    const local = url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname);
    return (url.protocol === 'https:' || local) && url.origin === raw ? raw : null;
  } catch { return null; }
}

export class WorkStorage {
  private pending = new Map<string, Pending>();
  private listening = false;
  readonly origin: string | null;
  constructor(private host: Window) { this.origin = workParentOrigin(host); }
  private receive = (event: MessageEvent) => {
    if (event.source !== this.host.parent || event.origin !== this.origin) return;
    const data = event.data;
    if (!data || data.type !== 'work:documents:response' || data.version !== 1) return;
    const entry = this.pending.get(data.requestId);
    if (!entry) return;
    this.pending.delete(data.requestId);
    clearTimeout(entry.timer);
    if (data.ok === true && Object.hasOwn(data, 'data')) entry.resolve(data.data);
    else entry.reject(new StorageError(
      typeof data.error === 'string' ? data.error : 'Resposta inválida do Work.',
      Number.isInteger(data.status) ? data.status : 0,
    ));
  };
  request<T>(operation: Operation, payload: unknown, timeout = 90000): Promise<T> {
    if (!this.origin) return Promise.reject(new StorageError('Abra o Diagrama pelo Work para salvar no idp-work.'));
    if (new TextEncoder().encode(JSON.stringify(payload)).length > MAX_PROJECT_BYTES + 4096) {
      return Promise.reject(new StorageError('O documento ultrapassa 32 MB de conteúdo.', 413));
    }
    if (!this.listening) {
      this.host.addEventListener('message', this.receive);
      this.listening = true;
    }
    const requestId = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new StorageError('O Work não respondeu. Seu documento permanece no editor.'));
      }, timeout);
      this.pending.set(requestId, { resolve: value => resolve(value as T), reject, timer });
      try {
        this.host.parent.postMessage({ type: 'diagrama:storage:request', version: 1,
          requestId, operation, payload }, this.origin!);
      } catch {
        clearTimeout(timer); this.pending.delete(requestId);
        reject(new StorageError('Não foi possível enviar a operação ao Work. O documento foi preservado.'));
      }
    });
  }
  notifyState(dirty: boolean, saving: boolean): void {
    if (this.origin) this.host.parent.postMessage({ type: 'diagrama:storage:state', version: 1,
      dirty, saving }, this.origin);
  }
  clearActive(): void {
    if (this.origin) this.host.parent.postMessage({ type: 'diagrama:storage:active', version: 1,
      id: null }, this.origin);
  }
  close(): void {
    this.host.removeEventListener('message', this.receive);
    this.listening = false;
    for (const entry of this.pending.values()) {
      clearTimeout(entry.timer);
      entry.reject(new StorageError('A conexão com o Work foi encerrada.'));
    }
    this.pending.clear();
  }
}
let connection: WorkStorage | undefined;
function bridge(): WorkStorage {
  connection ??= new WorkStorage(window);
  return connection;
}
export async function storageStatus(): Promise<StorageStatus> {
  return z.object({ canWrite: z.boolean(), projectId: z.literal('idp-work') })
    .parse(await bridge().request('status', {}));
}
export async function listProjects(cursor?: string): Promise<ProjectPage> {
  return z.object({ items: z.array(metadataSchema).max(20), cursor: z.string().max(600).optional() })
    .parse(await bridge().request('list', cursor ? { cursor } : {}));
}
export async function getProject(id: string): Promise<SavedProject> {
  z.string().uuid().parse(id);
  const result = metadataSchema.extend({ document: projectSchema })
    .parse(await bridge().request('get', { id }));
  if (result.id !== id || result.document.id !== id) throw new StorageError('Documento retornado inválido.');
  return result;
}
export async function saveProject(request: SaveRequest): Promise<SavedMetadata> {
  const result = metadataSchema.parse(await bridge().request('save', request));
  if (result.id !== request.id) throw new StorageError('Não foi possível confirmar o documento salvo.');
  return result;
}
export async function authorizeProcessing(): Promise<{ token: string; expiresAt: number }> {
  return z.object({ token: z.string().min(30).max(10000), expiresAt: z.number().int().positive() })
    .parse(await bridge().request('authorize', {}, 30000));
}
export function publishProjectState(state: { dirty: boolean; saving: boolean }): void {
  bridge().notifyState(state.dirty, state.saving);
}
export function clearActiveProject(): void { bridge().clearActive(); }
export function closeStorage(): void { connection?.close(); connection = undefined; }
export function activeDocumentId(): string | undefined {
  const parsed = z.string().uuid().safeParse(new URL(window.location.href).searchParams.get('document'));
  return parsed.success ? parsed.data : undefined;
}
