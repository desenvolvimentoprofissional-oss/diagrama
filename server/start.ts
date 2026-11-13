import 'dotenv/config';
import express from 'express';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createApi } from './api';
const app = express();
const directory = path.dirname(fileURLToPath(import.meta.url));
app.disable('x-powered-by');
app.use('/api', createApi());
app.use('/server.mjs', (_req,res) => { res.sendStatus(404); });
app.use(express.static(directory, { index: false, setHeaders(res, filename) {
  if (filename.endsWith('.mjs')) res.setHeader('Cache-Control','no-store');
} }));
app.get('*', (_req, res) => res.sendFile(path.join(directory, 'index.html')));
const server = app.listen(Number(process.env.PORT) || 3000, '0.0.0.0', () => console.log('Diagrama.ai iniciado.'));
server.requestTimeout = 600000;
