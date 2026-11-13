import express, { type Request, type Response, type NextFunction } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { authorize, ApiError } from './auth';
import { acquire } from './limits';
import { validatedProject } from './validation';
import { importDocument } from './import';
import { aiStatus } from './ai';
import { generateDocument,reviewDocument } from './generation/pipeline';
import { streamGeneration } from './generation/stream';
import { proofWord,wordRendererStatus } from './export/word-proof';
import { publicError } from './http-errors';
import { exportPdf, exportDocx } from './export';
import { auditProject } from '../shared/integrity';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024, files: 1, fields: 0 } });
export function createApi() {
  const router = express.Router();
  router.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    next();
  });
  router.get('/status', asyncHandler(async (_req,res) => res.json({data:{...aiStatus(),version:2,
    defaultStyle:'cra-sp-aprovado',wordRenderer:await wordRendererStatus()}})));
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
    const controller=abortOnDisconnect(res);
    const source = await importDocument(req.file.buffer,req.file.originalname,controller.signal);
    res.json({ data: source });
  }));
  router.use(express.json({ limit: '33mb' }));
  router.post('/generate', asyncHandler(async (req, res) => {
    const input = z.object({ project: z.unknown(), instructions: z.string().max(6000).default('') }).strict().parse(req.body);
    const project = validatedProject(input.project);
    const controller = abortOnDisconnect(res);
    const generated = await generateDocument(project,input.instructions,{signal:controller.signal});
    res.json({data:generated.project,report:generated.report});
  }));
  router.post('/generate/stream',asyncHandler(async(req,res)=>{
    const input=z.object({project:z.unknown(),instructions:z.string().max(6000).default('')}).strict().parse(req.body);
    await streamGeneration(res,validatedProject(input.project),input.instructions);
  }));
  router.post('/review',asyncHandler(async(req,res)=>{
    const input=z.object({project:z.unknown(),visual:z.boolean().default(false)}).strict().parse(req.body);
    const project=validatedProject(input.project);
    if(!input.visual){res.json({data:{issues:auditProject(project),visual:false}});return;}
    const controller=abortOnDisconnect(res);
    const result=await reviewDocument(project,{signal:controller.signal});
    res.json({data:{issues:result.report.issues,report:result.report,visual:true}});
  }));
  router.post('/export/:format', asyncHandler(async (req, res) => {
    if (!['pdf', 'docx'].includes(String(req.params.format))) throw new ApiError(404, 'Formato não encontrado.');
    const { project: value } = z.object({ project: z.unknown() }).strict().parse(req.body);
    const project = validatedProject(value);
    if (!project.blocks.length) throw new ApiError(400, 'Adicione conteúdo antes de exportar.');
    if (project.mode === 'integral' && project.source && auditProject(project).some(issue => issue.severity === 'error'))
      throw new ApiError(422, 'O modo integral contém alterações ou omissões em relação à origem. Corrija os apontamentos antes de exportar.');
    const pdf = req.params.format === 'pdf';
    const controller=abortOnDisconnect(res);
    let buffer:Buffer;
    if(pdf)buffer=await exportPdf(project);
    else {
      const proof=await proofWord(project,controller.signal);
      if(proof.available&&!proof.completed)throw new ApiError(503,
        'A conferência do Word não foi concluída. Tente novamente antes de exportar.');
      if(proof.issues.some(issue=>issue.severity==='error'))
        throw new ApiError(422,'O Word contém problemas de composição. Consulte a verificação antes de exportar.');
      if(!proof.available)res.setHeader('X-Diagrama-Warning',encodeURIComponent(
        'Word exportado sem conferência visual: LibreOffice não está disponível neste servidor.'));
      buffer=proof.document??await exportDocx(project);
    }
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
function errorHandler(error:unknown,_req:Request,res:Response,_next:NextFunction) {
  if(res.headersSent||res.destroyed)return;
  const safe=publicError(error);
  if(safe.status===500)console.error('Falha no processamento do documento:',error instanceof Error?error.name:'erro');
  res.status(safe.status).json({error:safe.message});
}
