import { Plus, X } from 'lucide-react';
export function TableEditor({ rows, onChange }: { rows: string[][]; onChange: (rows: string[][]) => void }) {
  const columns = Math.max(1, ...rows.map(row => row.length));
  function cell(rowIndex: number, columnIndex: number, text: string) {
    onChange(rows.map((row, index) => index === rowIndex ? Array.from({ length: columns }, (_, col) =>
      col === columnIndex ? text : row[col] || '') : row));
  }
  return <div className="dg-table-editor">
    <small className="dg-help">A primeira linha será o cabeçalho.</small>
    <div className="dg-table-scroll"><table><tbody>{rows.map((row, rowIndex) => <tr key={rowIndex}>
      {Array.from({ length: columns }, (_, columnIndex) => <td key={columnIndex}><textarea rows={2}
        aria-label={`Linha ${rowIndex + 1}, coluna ${columnIndex + 1}`} value={row[columnIndex] || ''}
        onChange={event => cell(rowIndex, columnIndex, event.target.value)} /></td>)}
      <td className="dg-table-remove"><button type="button" className="dg-icon-button"
        aria-label={`Remover linha ${rowIndex + 1}`} onClick={() => onChange(rows.filter((_, index) => index !== rowIndex))}>
        <X size={13} /></button></td>
    </tr>)}</tbody></table></div>
    <div className="dg-inline-actions"><button type="button" className="dg-text-button"
      onClick={() => onChange([...rows, Array(columns).fill('')])} disabled={rows.length >= 2000}>
      <Plus size={14} />Linha</button>
      <button type="button" className="dg-text-button" disabled={columns >= 40}
        onClick={() => onChange(rows.length ? rows.map(row => [...Array.from({length:columns}, (_, i) => row[i] || ''), '']) : [['', '']])}>
        <Plus size={14} />Coluna</button>
      {columns > 1 && <button type="button" className="dg-text-button" onClick={() => onChange(rows.map(row => row.slice(0, -1)))}>
        Remover última coluna</button>}</div>
  </div>;
}
