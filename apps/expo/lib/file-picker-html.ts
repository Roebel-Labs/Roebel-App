import { MAX_FILE_BYTES } from './forum-attachments';

export type PickedFileMessage =
  | { type: 'file'; name: string; mime: string; size: number; base64: string }
  | { type: 'cancel' }
  | { type: 'error'; message: string };

/**
 * A one-purpose page for a WebView: a file input whose choice is read with
 * FileReader and posted to the app as base64. Picking files this way needs no
 * native module, so it ships by OTA. The label stays visible in case the
 * automatic click is refused without a user gesture.
 */
export function buildFilePickerHtml(accept: readonly string[], maxBytes: number = MAX_FILE_BYTES): string {
  const maxMb = Math.round(maxBytes / 1024 / 1024);
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1">
<style>html,body{margin:0;height:100%;background:transparent;font-family:-apple-system,Roboto,sans-serif}
label{display:flex;align-items:center;justify-content:center;height:100%;color:#00498B;font-size:16px;font-weight:600}
input{display:none}</style></head><body>
<label for="f">Datei auswählen …</label><input id="f" type="file" accept="${accept.join(',')}">
<script>
var post=function(m){if(window.ReactNativeWebView){window.ReactNativeWebView.postMessage(JSON.stringify(m));}};
var i=document.getElementById('f');
i.addEventListener('change',function(){var f=i.files&&i.files[0];if(!f){post({type:'cancel'});return;}
if(f.size>${maxBytes}){post({type:'error',message:'Datei ist zu groß (max. ${maxMb} MB).'});return;}
var r=new FileReader();r.onload=function(){var s=String(r.result||'');var b=s.indexOf(',');
post({type:'file',name:f.name,mime:f.type||'application/octet-stream',size:f.size,base64:b>=0?s.slice(b+1):s});};
r.onerror=function(){post({type:'error',message:'Datei konnte nicht gelesen werden.'});};r.readAsDataURL(f);});
setTimeout(function(){try{i.click();}catch(e){}},80);
</script></body></html>`;
}

export function parsePickedFileMessage(raw: string): PickedFileMessage | null {
  try {
    const m = JSON.parse(raw) as { type?: unknown };
    if (m && (m.type === 'file' || m.type === 'cancel' || m.type === 'error')) return m as PickedFileMessage;
    return null;
  } catch {
    return null;
  }
}
