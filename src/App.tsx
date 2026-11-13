import { useCallback, useEffect, useRef, useState } from 'react';
import { createProject, type DocumentProject, type ReviewIssue } from '../shared/document';
import { auditProject } from '../shared/integrity';
import { inferDocumentMetadata } from '../shared/structure';
import type { GenerationProgress,GenerationResult,QualityReport } from '../shared/generation';
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
  const [progress,setProgress]=useState<GenerationProgress>();
  const [report,setReport]=useState<QualityReport>();
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
    setReport(undefined);setProgress(undefined);
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
    setReport(undefined);setProgress(undefined);
    setProject(changed); setIssues(auditProject(changed)); setMessage('');
  };
  async function run(label:string, operation:(signal:AbortSignal)=>Promise<void>) {
    if (busy) return;
    const controller = new AbortController();
    setError(''); setMessage('');setProgress(undefined); setAction({ message:label, controller });
    try { await operation(controller.signal); }
    catch (value) { setProgress(undefined);reportError(value); }
    finally { setAction(null); }
  }
  function applyGenerated(result:GenerationResult) {
    setProject(result.project);setReport(result.report);setIssues(result.report.issues);
    setProgress(previous=>({...previous,stage:'complete',message:result.report.status==='reviewed'?
      'Documento gerado e conferido.':'Documento gerado. Consulte os apontamentos antes de publicar.'}));
    setMessage(result.report.status==='reviewed'?'Documento gerado no padrão CRA-SP e conferido.':
      'Documento gerado. Há apontamentos para conferência antes da publicação.');
  }
  const importFile = (file:File,instructions='') => {
    if (dirty && !window.confirm('Substituir o conteúdo atual? Salve as alterações no Work antes de continuar.')) return;
    void run('Lendo a estrutura e o conteúdo do documento…',async signal=>{
      const source=await uploadDocument(file,signal);
      const next={...createProject(),mode:project.source?'explanatory' as const:project.mode,source,blocks:structuredClone(source.blocks),...inferDocumentMetadata(source)};
      session.current!.reset(next);clearActiveProject();change(next);
      if(ai)applyGenerated(await generateProject(next,instructions,signal,setProgress));
      else setMessage('Origem importada. Configure a OpenAI para iniciar a geração automática do documento.');
    });
  };
  const generate = (instructions:string) => void run('Analisando e diagramando o documento…',async signal=>{
    applyGenerated(await generateProject(project,instructions,signal,setProgress));
  });
  const review = () => void run('Renderizando e conferindo as páginas com a OpenAI…', async signal => {
    const result = await reviewProject(project, signal);
    setReport(result);setIssues(result.issues); setMessage(result.status==='reviewed'?
      'Conferência concluída.':'Conferência concluída com apontamentos para revisão.');
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
    const next=createProject(); session.current!.reset(next); clearActiveProject(); setProject(next);setReport(undefined);setProgress(undefined); setIssues([]); setRevision(0); setConflict(false); setError(''); setMessage('');
  };
  const status = saving ? 'Salvando no Work…' : !connection.connected ? 'Abra pelo Work para salvar' :
    dirty ? 'Alterações ainda não salvas' : revision ? `Salvo no Work · versão ${revision}` : 'Novo documento';
  return <>
    <Editor project={project} onChange={change} busy={busy} onImport={importFile}
      onGenerate={generate} onExport={format => void run(`Preparando o ${format.toUpperCase()}…`,
        async signal => { const warning=await downloadDocument(project,format,signal);
          setMessage(warning||`${format.toUpperCase()} exportado.`); })}
      onReview={review} onSaveCopy={() => void saveCopy()} saveCopyEnabled={conflict} onSave={() => void save()} onLibrary={() => void showLibrary()} onNew={startNew}
      storageStatus={status} canSave={connection.canWrite} issues={issues} progress={progress} report={report}
      aiConfigured={ai} onCancel={action ? () => action.controller.abort() : undefined} message={loadingSession ? 'Conectando à biblioteca do Work…' : action?.message || message} error={error}/>
    {library && <ProjectLibrary records={records} loading={loadingLibrary} hasMore={!!cursor} error={error}
      onClose={() => setLibrary(false)} onOpen={openRecord} onMore={() => void showLibrary(true)}/>}
  </>;
}
