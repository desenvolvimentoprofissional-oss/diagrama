import { themeSchema, type DocumentProject } from '../../shared/document';
import { ImageUpload } from './ImageUpload';
export function DocumentSettings({ project, onChange, disabled }: {
  project: DocumentProject; onChange: (patch: Partial<DocumentProject>) => void; disabled: boolean;
}) {
  const theme = (patch: Partial<DocumentProject['theme']>) => onChange({ theme: { ...project.theme, ...patch } });
  return <fieldset className="dg-fields" disabled={disabled}>
    <div className="dg-section-heading"><span>Informações do documento</span></div>
    <label>Título<input value={project.title} maxLength={300}
      onChange={event => onChange({ title: event.target.value })} /></label>
    <label>Subtítulo<textarea rows={3} value={project.subtitle} maxLength={1000}
      onChange={event => onChange({ subtitle: event.target.value })} /></label>
    <label>Autoria<input value={project.author} maxLength={200} placeholder="Área ou instituição responsável"
      onChange={event => onChange({ author: event.target.value })} /></label>
    <label>Instituição<input value={project.theme.organization} maxLength={200}
      onChange={event => theme({ organization: event.target.value })} /></label>
    <div className="dg-section-heading"><span>Composição das páginas</span></div>
    <label className="dg-switch"><span>Capa</span><input type="checkbox" checked={project.cover}
      onChange={event => onChange({ cover: event.target.checked })} /><span className="dg-switch-track" /></label>
    <label className="dg-switch"><span>Sumário automático</span><input type="checkbox" checked={project.toc}
      onChange={event => onChange({ toc: event.target.checked })} /><span className="dg-switch-track" /></label>
    <label>Corpo do texto<div className="dg-range-row"><input type="range" min={9} max={14} step={0.5}
      value={project.theme.fontSize} onChange={event => theme({ fontSize: Number(event.target.value) })} />
      <output>{project.theme.fontSize} pt</output></div></label>
    <small className="dg-help">A4 · fonte Libre Franklin · paginação automática</small>
    <div className="dg-section-heading"><span>Identidade visual</span></div>
    <p className="dg-help">O padrão CRA-SP já está aplicado. O logo institucional aparece automaticamente; envie outro apenas para substituí-lo.</p>
    <div className="dg-color-fields">
      <label>Cor principal<div className="dg-color-input"><input type="color" value={project.theme.primary}
        onChange={event => theme({ primary: event.target.value })} /><code>{project.theme.primary}</code></div></label>
      <label>Cor de destaque<div className="dg-color-input"><input type="color" value={project.theme.accent}
        onChange={event => theme({ accent: event.target.value })} /><code>{project.theme.accent}</code></div></label>
    </div>
    {!project.theme.logo && project.theme.organization.trim().toUpperCase()==='CRA-SP' && <div className="dg-active-logo">
      <img src="/document/logo.png" alt="Logo CRA-SP"/><div><strong>Logo CRA-SP automático</strong>
        <span>Incluído na capa e nos cabeçalhos.</span></div></div>}
    <button type="button" className="dg-text-button dg-restore-design" onClick={()=>onChange({theme:themeSchema.parse({})})}>
      Restaurar padrão CRA-SP</button>
    <ImageUpload label="Substituir logotipo (opcional)" value={project.theme.logo} onChange={logo => theme({ logo })} disabled={disabled} />
  </fieldset>;
}
