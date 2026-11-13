import express, { type Request, type Response, type NextFunction } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { authorize, ApiError } from './auth';
import { acquire } from './limits';
import { validatedProject } from './validation';
import { importDocument } from './import';
import { generateDocument, aiStatus, reviewPageImages } from './ai';
import { exportPdf, exportDocx, exportPageImages } from './export';
import { auditProject } from '../shared/integrity';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024, files: 1, fields: 0 } });
export function createApi() {
  const router = express.Router();
  router.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    next();
  });
  router.get('/status', (_req, res) => res.json({ data: aiStatus() }));
  router.use(async (req, res, next) => {
    try {
      const claims = await authorize(req);
      const release = acquire(claims.sub);
      res.once('finish', release); res.once('close', release);
      next();
    } catch (error) { next(error); }
  });
  router.post('/import', upload.single('file'), asyncHandler(async (req, res) => {
    if (!req.file) throw new ApiError(400, 'Selecione um arquivo Word ou PDF.');
    const source = await importDocument(req.file.buffer, req.file.originalname);
    res.json({ data: source });
  }));
  router.use(express.json({ limit: '33mb' }));
  router.post('/generate', asyncHandler(async (req, res) => {
    const input = z.object({ project: z.unknown(), instructions: z.string().max(6000).default('') }).strict().parse(req.body);
    const project = validatedProject(input.project);
    const controller = abortOnDisconnect(res);
    const generated = await generateDocument(project, input.instructions, controller.signal);
    res.json({ data: validatedProject(generated) });
  }));
  router.post('/review', asyncHandler(async (req, res) => {
    const input = z.object({ project: z.unknown(), visual: z.boolean().default(false) }).strict().parse(req.body);
    const project = validatedProject(input.project);
    const issues = auditProject(project);
    if (input.visual) {
      const controller = abortOnDisconnect(res);
      const pages = await exportPageImages(project);
      for (let offset = 0; offset < pages.length; offset += 6) {
        const batch = pages.slice(offset, offset + 6);
        const findings = await reviewPageImages(project, batch.map(page => page.image), controller.signal);
        issues.push(...findings.map(issue => ({ ...issue,
          page: issue.page ? batch[issue.page - 1]?.page : undefined })));
      }
      issues.push({ severity:'info', message:`Conferência visual realizada nas ${pages.length} páginas renderizadas.` });
    }
    res.json({ data: { issues, visual: input.visual } });
  }));
  router.post('/export/:format', asyncHandler(async (req, res) => {
    if (!['pdf', 'docx'].includes(String(req.params.format))) throw new ApiError(404, 'Formato não encontrado.');
    const { project: value } = z.object({ project: z.unknown() }).strict().parse(req.body);
    const project = validatedProject(value);
    if (!project.blocks.length) throw new ApiError(400, 'Adicione conteúdo antes de exportar.');
    if (project.mode === 'integral' && project.source && auditProject(project).some(issue => issue.severity === 'error'))
      throw new ApiError(422, 'O modo integral contém alterações ou omissões em relação à origem. Corrija os apontamentos antes de exportar.');
    const pdf = req.params.format === 'pdf';
    const buffer = pdf ? await exportPdf(project) : await exportDocx(project);
    res.setHeader('Content-Type', pdf ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="documento.${pdf ? 'pdf' : 'docx'}"`);
    res.send(buffer);
  }));
  router.use((_req, _res, next) => next(new ApiError(404, 'Operação não encontrada.')));
  router.use(errorHandler);
  return router;
}
function abortOnDisconnect(res: Response) {
  const controller = new AbortController();
  res.once('close', () => { if (!res.writableEnded) controller.abort(); });
  return controller;
}
function asyncHandler(handler: (req: Request, res: Response) => Promise<unknown>) {
  return (req: Request, res: Response, next: NextFunction) => { handler(req, res).catch(next); };
}
function errorHandler(error: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (res.headersSent) return;
  if (error instanceof z.ZodError) { res.status(400).json({ error: 'Verifique os dados enviados.' }); return; }
  if (error instanceof multer.MulterError) { res.status(413).json({ error: 'Envie um único arquivo de até 20 MB.' }); return; }
  if (typeof error === 'object' && error && 'status' in error && 'message' in error) {
    const status = Number(error.status);
    if (status >= 400 && status <= 599) { res.status(status).json({ error: String(error.message) }); return; }
  }
  console.error('Falha no processamento do documento:', error instanceof Error ? error.name : 'erro');
  res.status(500).json({ error: 'Não foi possível concluir a operação. O documento aberto foi preservado.' });
}
