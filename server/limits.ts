import { ApiError } from './auth';
const running = new Map<string, number>();
const usage = new Map<string, number[]>();
export function acquire(owner: string) {
  const now = Date.now();
  const recent = (usage.get(owner) || []).filter(time => now - time < 60000);
  if (recent.length >= 12 || (running.get(owner) || 0) >= 2)
    throw new ApiError(429, 'Há solicitações em andamento. Aguarde antes de tentar novamente.');
  if (usage.size >= 2000) for (const [key, times] of usage) {
    if (!times.some(time => now - time < 60000)) usage.delete(key);
  }
  recent.push(now); usage.set(owner, recent);
  running.set(owner, (running.get(owner) || 0) + 1);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const count = (running.get(owner) || 1) - 1;
    if (count) running.set(owner, count); else running.delete(owner);
  };
}
