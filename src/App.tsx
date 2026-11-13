import { useCallback, useEffect, useRef, useState } from 'react';
import { createProject, type DocumentProject, type ReviewIssue } from '../shared/document';
import { auditProject } from '../shared/integrity';
import Editor from './editor/Editor';
import { fetchAiStatus, uploadDocument, generateProject, reviewProject, downloadDocument } from './services/api';
import { storageStatus, listProjects, getProject, publishProjectState, clearActiveProject, type SavedMetadata } from './services/storage';
import { ProjectSession } from './services/projectSession';
import { ProjectLibrary } from './library/ProjectLibrary';

type Action = { message:string; controller:AbortController } | null;
export default function App() {
  const [project, setProject] = useState<DocumentProject>(createProject);
  const session = useRef<ProjectSession | null>(null);
  if (!session.current) { session.current = new ProjectSession(); session.current.reset(project); }
  const [connection, setConnection] = useState({ connected:false, canWrite:false });
  const [ai, setAi] = useState(false);
  const [action, setAction] = useState<Action>(null);
  const [saving, setSaving] = useState(false);
  const [loadingSession, setLoadingSession] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [issues, setIssues] = useState<ReviewIssue[]>([]);
  const [library, setLibrary] = useState(false);
  const [records, setRecords] = useState<SavedMetadata[]>([]);
  const [cursor, setCursor] = useState<string | undefined>();
  const [loadingLibrary, setLoadingLibrary] = useState(false);
  const [revision, setRevision] = useState(0);
  const [conflict, setConflict] = useState(false);
  const busy = !!action || saving || loadingSession;
  const dirty = session.current.isDirty(project);
  const reportError = useCallback((value: unknown) => {
    if (value instanceof DOMException && value.name === 'AbortError') { setMessage('Operação cancelada.'); return; }
    setError(value instanceof Error ? value.message : 'Não foi possível concluir a operação.');
  }, []);
  const load = useCallback(async (id:string) => {
    const record = await getProject(id);
    session.current!.attach(record.document, record);
    setProject(record.document); setIssues(auditProject(record.document)); setRevision(record.revision);
    setConflict(false); setMessage('Documento carregado do Work.'); setLibrary(false);
  }, []);
  useEffect(() => {
    fetchAiStatus().then(status => setAi(status.configured)).catch(reportError);
    storageStatus().then(async status => {
      setConnection({ connected:true, canWrite:status.canWrite });
      const id = new URLSearchParams(location.search).get('document');
      if (id) await load(id);
    }).catch(value => setMessage(value instanceof Error ? value.message : 'Abra pelo Work para salvar seus documentos.'))
      .finally(() => setLoadingSession(false));
  }, [load, reportError]);
  useEffect(() => {
    publishProjectState({ dirty, saving });
    const beforeUnload = (event:BeforeUnloadEvent) => {
      if (!dirty && !saving) return;
      event.preventDefault(); event.returnValue='';
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [dirty, saving, revision]);
  const change = (next:DocumentProject) => {
    const changed = {...next,updatedAt:new Date().toISOString()};
    setProject(changed); setIssues(auditProject(changed)); setMessage('');
  };
  async function run(label:string, operation:(signal:AbortSignal)=>Promise<void>) {
    if (busy) return;
    const controller = new AbortController();
    setError(''); setMessage(''); setAction({ message:label, controller });
    try { await operation(controller.signal); }
    catch (value) { reportError(value); }
    finally { setAction(null); }
  }
  const importFile = (file:File) => {
    if (dirty && !window.confirm('Substituir o conteúdo atual? Salve as alterações no Work antes de continuar.')) return;
    void run('Lendo a estrutura e o conteúdo do documento…', async signal => {
      const source = await uploadDocument(file, signal);
      const next = { ...createProject(), source, blocks:structuredClone(source.blocks),
        title:source.blocks.find(block => block.kind==='heading')?.text.slice(0,300)||source.name.replace(/\.[^.]+$/,'') };
      session.current!.reset(next); clearActiveProject(); change(next);
      setMessage(source.ocr ? 'Conteúdo reconhecido por OCR. Confira a transcrição antes de exportar.' : 'Documento importado. O texto de origem foi preservado.');
    });
  };
  const generate = (instructions:string) => void run('A OpenAI está organizando o conteúdo e os elementos visuais…', async signal => {
    const next = await generateProject(project, instructions, signal);
    change(next); setMessage('Diagramação gerada. Confira as páginas e os apontamentos antes de exportar.');
  });
  const review = () => void run('Renderizando e conferindo as páginas com a OpenAI…', async signal => {
    const result = await reviewProject(project, signal);
    setIssues(result); setMessage('Conferência concluída. Consulte os apontamentos do documento.');
  });
  async function save() {
    if (busy || !connection.canWrite) return;
    setSaving(true); setError('');
    try {
      const record = await session.current!.save(project);
      setRevision(record.revision); setConflict(false); setMessage('Documento salvo no idp-work.');
    } catch (value) {
      setConflict(!!value && typeof value === 'object' && 'status' in value && value.status === 409);
      reportError(value);
    } finally { setSaving(false); }
  }
  async function saveCopy() {
    if (busy || !connection.canWrite) return;
    const next = { ...project, id:crypto.randomUUID(), title:`${project.title.slice(0,290)} (cópia)`,
      createdAt:new Date().toISOString(), updatedAt:new Date().toISOString() };
    session.current!.reset(next); setProject(next); setSaving(true); setError('');
    try {
      const record = await session.current!.save(next);
      setRevision(record.revision); setConflict(false); setMessage('Cópia salva no idp-work.');
    } catch (value) { reportError(value); }
    finally { setSaving(false); }
  }
  async function showLibrary(more = false) {
    if (busy || loadingLibrary) return;
    setLibrary(true); setLoadingLibrary(true); setError('');
    try {
      const response = await listProjects(more ? cursor : undefined);
      setRecords(previous => more ? [...previous, ...response.items] : response.items); setCursor(response.cursor);
    } catch (value) { reportError(value); }
    finally { setLoadingLibrary(false); }
  }
  const openRecord = (id:string) => {
    if (dirty && !window.confirm('Abrir outro documento e descartar as alterações ainda não salvas?')) return;
    void run('Abrindo o documento…', async () => load(id));
  };
  const startNew = () => {
    if (busy || (dirty && !window.confirm('Criar outro documento e descartar as alterações ainda não salvas?'))) return;
    const next=createProject(); session.current!.reset(next); clearActiveProject(); setProject(next); setIssues([]); setRevision(0); setConflict(false); setError(''); setMessage('');
  };
  const status = saving ? 'Salvando no Work…' : !connection.connected ? 'Abra pelo Work para salvar' :
    dirty ? 'Alterações ainda não salvas' : revision ? `Salvo no Work · versão ${revision}` : 'Novo documento';
  return <>
    <Editor project={project} onChange={change} busy={busy} onImport={importFile}
      onGenerate={generate} onExport={format => void run(`Preparando o ${format.toUpperCase()}…`,
        async signal => { await downloadDocument(project,format,signal); setMessage(`${format.toUpperCase()} exportado.`); })}
      onReview={review} onSaveCopy={() => void saveCopy()} saveCopyEnabled={conflict} onSave={() => void save()} onLibrary={() => void showLibrary()} onNew={startNew}
      storageStatus={status} canSave={connection.canWrite} issues={issues}
      aiConfigured={ai} onCancel={action ? () => action.controller.abort() : undefined} message={loadingSession ? 'Conectando à biblioteca do Work…' : action?.message || message} error={error}/>
    {library && <ProjectLibrary records={records} loading={loadingLibrary} hasMore={!!cursor} error={error}
      onClose={() => setLibrary(false)} onOpen={openRecord} onMore={() => void showLibrary(true)}/>}
  </>;
}
