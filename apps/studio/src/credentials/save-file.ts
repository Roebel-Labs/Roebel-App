// Saves a downloaded file (the letters PDF) through a temporary <a download>. Works the same in the
// Electron renderer and in the browser build: no window.studio call.
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  // Let the download start before the URL goes away.
  setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
  }, 0);
}
