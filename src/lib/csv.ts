export function downloadCsv(filename: string, headers: string[], rows: Array<Array<string | number | null>>): void {
  const esc = (v: string | number | null) => `"${String(v ?? '').split('"').join('""')}"`;
  const csv = [headers, ...rows].map((r) => r.map(esc).join(';')).join('\r\n');
  const url = URL.createObjectURL(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
