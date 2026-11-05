// A 1×1 invisible container in the DOM. Chromium may pause decoding of videos
// that are detached from the document; parking them here keeps them live
// without showing anything.

let host: HTMLDivElement | null = null;

export function hiddenHost(): HTMLDivElement {
  if (host && host.isConnected) return host;
  host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  host.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;pointer-events:none;overflow:hidden;';
  document.body.appendChild(host);
  return host;
}
