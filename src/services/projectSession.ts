import { projectSchema, type DocumentProject } from '../../shared/document';
import { saveProject, StorageError, type SavedMetadata, type SaveRequest } from './storage';

type SaveFunction = (request: SaveRequest) => Promise<SavedMetadata>;
type Attempt = { fingerprint: string; saveId: string; revision: number };

/** Tracks acknowledgements separately from changes made while a request is running. */
export class ProjectSession {
  id: string | undefined;
  revision = 0;
  savedFingerprint: string | null = null;
  saving = false;
  private attempt: Attempt | undefined;
  constructor(private persist: SaveFunction = saveProject) {}
  attach(project: DocumentProject, metadata?: SavedMetadata): void {
    if (this.saving) throw new StorageError('Aguarde o salvamento em andamento.', 409);
    if (metadata && metadata.id !== project.id) throw new StorageError('Documento e registro não correspondem.');
    this.id = project.id;
    this.revision = metadata?.revision ?? 0;
    this.savedFingerprint = JSON.stringify(project);
    this.attempt = undefined;
  }
  reset(project: DocumentProject): void { this.attach(project); }
  isDirty(project: DocumentProject): boolean {
    return this.id !== project.id || this.savedFingerprint !== JSON.stringify(project);
  }
  async save(project: DocumentProject): Promise<SavedMetadata> {
    if (this.saving) throw new StorageError('Aguarde o salvamento em andamento.', 409);
    if (this.id !== project.id) this.attach(project);
    const document = projectSchema.parse(JSON.parse(JSON.stringify(project)));
    const fingerprint = JSON.stringify(document);
    const attempt = this.attempt?.fingerprint === fingerprint ? this.attempt :
      { fingerprint, saveId: crypto.randomUUID(), revision: this.revision };
    this.attempt = attempt;
    this.saving = true;
    try {
      const result = await this.persist({ id: document.id, revision: attempt.revision,
        saveId: attempt.saveId, document });
      if (result.id !== document.id || result.revision !== attempt.revision + 1)
        throw new StorageError('O Work não confirmou a revisão salva. Tente novamente.', 502);
      this.revision = result.revision;
      this.savedFingerprint = fingerprint;
      this.attempt = undefined;
      return result;
    } finally { this.saving = false; }
  }
}
