import { useRef, useState } from 'react';
import { Upload, X } from 'lucide-react';
export function ImageUpload({ value, onChange, label, disabled = false }: {
  value: string; onChange: (data: string) => void; label: string; disabled?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');
  async function upload(file: File | undefined) {
    if (!file) return;
    if (!['image/png', 'image/jpeg'].includes(file.type)) {
      setError('Envie uma imagem PNG ou JPEG.'); return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setError('A imagem deve ter até 2 MB.'); return;
    }
    try {
      const bitmap = await createImageBitmap(file);
      if (!bitmap.width || !bitmap.height || bitmap.width * bitmap.height > 20000000) {
        bitmap.close(); throw new Error('A imagem excede 20 milhões de pixels.');
      }
      bitmap.close();
      const reader = new FileReader();
      reader.onload = () => { setError(''); onChange(String(reader.result)); };
      reader.onerror = () => setError('Não foi possível ler a imagem.');
      reader.readAsDataURL(file);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível abrir a imagem.');
    } finally { if (input.current) input.current.value = ''; }
  }
  return <div className="dg-image-upload">
    <span className="dg-field-label">{label}</span>
    <input ref={input} type="file" accept="image/png,image/jpeg" hidden
      onChange={event => void upload(event.target.files?.[0])} />
    {value && <div className="dg-image-preview"><img src={value} alt={label} />
      <button type="button" className="dg-icon-button" onClick={() => onChange('')}
        disabled={disabled} aria-label={`Remover ${label.toLowerCase()}`}><X size={15} /></button></div>}
    <button type="button" className="dg-button dg-button-secondary dg-full" disabled={disabled}
      onClick={() => input.current?.click()}><Upload size={15} />{value ? 'Substituir imagem' : 'Enviar imagem'}</button>
    <small className="dg-help">PNG ou JPEG · até 2 MB</small>
    {error && <p className="dg-field-error" role="alert">{error}</p>}
  </div>;
}
