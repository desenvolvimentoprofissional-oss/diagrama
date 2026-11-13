import { createPublicKey, verify } from 'node:crypto';
import { z } from 'zod';
import type { Request } from 'express';

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
const claimsSchema = z.object({
  iss: z.string().regex(/^[a-zA-Z0-9._-]+@idp-work\.iam\.gserviceaccount\.com$/),
  aud: z.literal('diagrama-ai'), scope: z.literal('documents:process'),
  sub: z.string().regex(/^[a-f0-9]{64}$/),
  iat: z.number().int(), exp: z.number().int(), origin: z.string().url(),
});
const headerSchema = z.object({ alg: z.literal('RS256'), typ: z.literal('JWT') });
export type ProcessingClaims = z.infer<typeof claimsSchema>;
const certCache = new Map<string, { expires: number; certificates: string[] }>();
const pendingCertificates = new Map<string, Promise<string[]>>();
const peers = new Map<string, {start:number; count:number}>();
export function limitUnauthenticatedPeer(peer: string) {
  const now = Date.now();
  const previous = peers.get(peer);
  const state = previous && now - previous.start < 60000 ? previous : {start:now,count:0};
  if (state.count >= 120) throw new ApiError(429, 'Muitas solicitações. Aguarde um minuto.');
  state.count++;
  if (peers.size > 2000) for (const [key,value] of peers) if (now-value.start>=60000) peers.delete(key);
  peers.set(peer,state);
}

function decode(value: string) {
  try { return JSON.parse(Buffer.from(value, 'base64url').toString('utf8')); }
  catch { throw new ApiError(401, 'Autorização inválida. Abra o Diagrama pelo Work.'); }
}
export function parseCapability(token: string, origin?: string) {
  if (token.length > 8000) throw new ApiError(401, 'Autorização inválida.');
  const parts = token.split('.');
  if (parts.length !== 3) throw new ApiError(401, 'Autorização inválida.');
  const header = headerSchema.safeParse(decode(parts[0]));
  const parsed = claimsSchema.safeParse(decode(parts[1]));
  if (!header.success || !parsed.success) throw new ApiError(401, 'Autorização inválida.');
  const claims = parsed.data;
  const now = Math.floor(Date.now() / 1000);
  if (claims.exp <= now || claims.iat > now + 30 || claims.exp - claims.iat > 300 || claims.exp <= claims.iat)
    throw new ApiError(401, 'A autorização expirou. Tente novamente pelo Work.');
  if (origin && new URL(claims.origin).origin !== origin)
    throw new ApiError(403, 'Esta autorização pertence a outro endereço do Diagrama.');
  return { claims, data: `${parts[0]}.${parts[1]}`, signature: Buffer.from(parts[2], 'base64url') };
}
async function publicCertificates(email: string) {
  const cached = certCache.get(email);
  if (cached && cached.expires > Date.now()) {
    if (!cached.certificates.length) throw new ApiError(503, 'Não foi possível confirmar a autorização do Work.');
    return cached.certificates;
  }
  const pending = pendingCertificates.get(email);
  if (pending) return pending;
  if (pendingCertificates.size >= 8) throw new ApiError(503, 'O serviço de autorização está ocupado. Aguarde.');
  const request = loadCertificates(email).finally(() => pendingCertificates.delete(email));
  pendingCertificates.set(email, request);
  return request;
}
async function loadCertificates(email:string) {
  if (certCache.size >= 100) certCache.clear();
  try {
    const url = `https://www.googleapis.com/robot/v1/metadata/x509/${encodeURIComponent(email)}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(10000), redirect:'error' });
    if (!response.ok) throw new Error('certificates_unavailable');
    const certificates = z.record(z.string(), z.string().max(12000)).parse(await response.json());
    const values = Object.values(certificates);
    if (!values.length || values.length > 10) throw new Error('certificates_unavailable');
    certCache.set(email, {expires:Date.now()+300000,certificates:values});
    return values;
  } catch {
    certCache.set(email, {expires:Date.now()+30000,certificates:[]});
    throw new ApiError(503, 'Não foi possível confirmar a autorização do Work.');
  }
}
export function verifyCapabilitySignature(data: string, signature: Buffer, certificates: string[]) {
  return certificates.some(cert => {
    try { return verify('RSA-SHA256', Buffer.from(data), createPublicKey(cert), signature); }
    catch { return false; }
  });
}
export async function authorize(request: Request): Promise<ProcessingClaims> {
  limitUnauthenticatedPeer(request.socket.remoteAddress || 'unknown');
  const authorization = request.headers.authorization || '';
  if (!authorization.startsWith('Bearer '))
    throw new ApiError(401, 'Abra o Diagrama pelo menu Ferramentas do Work para importar, gerar e exportar documentos.');
  const parsed = parseCapability(authorization.slice(7), request.headers.origin);
  const certificates = await publicCertificates(parsed.claims.iss);
  if (!verifyCapabilitySignature(parsed.data, parsed.signature, certificates))
    throw new ApiError(401, 'A autorização do Work não pôde ser validada.');
  return parsed.claims;
}
