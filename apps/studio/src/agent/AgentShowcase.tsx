// "Ansehen" (the agent full-window on its colour, name set big across it) and "Teilen" (a card plus share
// targets). The public link goes to the website's share page, which carries the link preview.
import { useEffect, useState, type ReactNode } from 'react';
import logoUrl from '../assets/logo.svg';
import meckyUrl from '../assets/mecky-welcome.png';
import { openExternal } from '../persona/common';
import { IconCheck, IconClose, IconCopy, IconDownload, IconLinkedin, IconShare, IconWhatsapp, IconX } from '../ui/shell/line-icons';
import { MECKY_COLOR, shareUrl, type Character } from './characters';

export interface ShowcaseAgent {
  name: string;
  character: Character | null;
}

const colorOf = (a: ShowcaseAgent) => a.character?.color ?? MECKY_COLOR;
const ORTIS_URL = 'https://www.roebel.app/studio';
const linkOf = (a: ShowcaseAgent) => (a.character ? shareUrl(a.character, a.name) : ORTIS_URL);

function useEscape(onClose: () => void) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);
}

function Stamp() {
  return (
    <span className="sc-stamp" aria-hidden="true">
      <img src={logoUrl} alt="" />
      <span>Erstellt mit Ortis</span>
    </span>
  );
}

/** Large picture: the website's 1600 px figure, the bundled one until it has loaded (or when offline). */
function Figure({ agent, className }: { agent: ShowcaseAgent; className: string }) {
  const small = agent.character?.figure ?? meckyUrl;
  const [src, setSrc] = useState(small);
  useEffect(() => {
    setSrc(small);
    if (!agent.character) return;
    const img = new Image();
    img.onload = () => setSrc(agent.character!.large);
    img.src = agent.character.large;
  }, [agent.character, small]);
  return <img className={className} src={src} alt="" draggable={false} />;
}

export function AgentView({ agent, onClose, onShare }: { agent: ShowcaseAgent; onClose: () => void; onShare: () => void }) {
  useEscape(onClose);
  return (
    <div className="sc-view" role="dialog" aria-label={agent.name} style={{ background: colorOf(agent) }}>
      <Stamp />
      <div className="sc-view-stage">
        <Figure agent={agent} className="sc-view-figure" />
        <h1 className="sc-view-name">{agent.name}</h1>
      </div>
      <div className="sc-view-actions">
        <button className="sc-pill" onClick={onShare}>
          <IconShare size={17} /> Teilen
        </button>
        <button className="sc-round" aria-label="Schließen" onClick={onClose}>
          <IconClose size={18} />
        </button>
      </div>
    </div>
  );
}

/** Draws the share card (1200×1500) for "Herunterladen"; uses the bundled figure so the canvas stays clean. */
async function cardPng(agent: ShowcaseAgent): Promise<Blob | null> {
  const img = new Image();
  img.src = agent.character?.figure ?? meckyUrl;
  await img.decode().catch(() => {});
  const W = 1200, H = 1500;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = colorOf(agent);
  ctx.fillRect(0, 0, W, H);
  if (img.naturalWidth) {
    const h = 1080, w = (img.naturalWidth / img.naturalHeight) * h;
    ctx.drawImage(img, (W - w) / 2, 120, w, h);
  }
  ctx.fillStyle = '#1a1a16';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  let size = 260;
  ctx.font = `400 ${size}px Georgia, 'Times New Roman', serif`;
  while (ctx.measureText(agent.name).width > W - 120 && size > 80) {
    size -= 10;
    ctx.font = `400 ${size}px Georgia, 'Times New Roman', serif`;
  }
  ctx.globalAlpha = 0.92;
  ctx.fillText(agent.name, W / 2, 1330);
  ctx.globalAlpha = 0.6;
  ctx.font = `600 30px 'Mona Sans', system-ui, sans-serif`;
  ctx.fillText('Erstellt mit Ortis', W / 2, 1440);
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/png'));
}

export function ShareDialog({ agent, onClose }: { agent: ShowcaseAgent; onClose: () => void }) {
  useEscape(onClose);
  const [copied, setCopied] = useState(false);
  const link = linkOf(agent);
  const text = `Das ist ${agent.name}, mein Agent in Ortis.`;
  const download = async () => {
    const blob = await cardPng(agent);
    if (!blob) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${agent.name}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  };
  const canShare = typeof navigator.share === 'function';
  const targets: { key: string; label: string; icon: ReactNode; run: () => void }[] = [
    {
      key: 'copy', label: copied ? 'Kopiert' : 'Link kopieren', icon: copied ? <IconCheck size={18} /> : <IconCopy size={18} />,
      run: () => void navigator.clipboard.writeText(link).then(() => (setCopied(true), setTimeout(() => setCopied(false), 1800))).catch(() => {}),
    },
    { key: 'download', label: 'Herunterladen', icon: <IconDownload size={18} />, run: () => void download() },
    ...(canShare ? [{ key: 'share', label: 'Teilen', icon: <IconShare size={18} />, run: () => void navigator.share({ title: agent.name, text, url: link }).catch(() => {}) }] : []),
    { key: 'x', label: 'X', icon: <IconX size={18} />, run: () => openExternal(`https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(link)}`) },
    { key: 'linkedin', label: 'LinkedIn', icon: <IconLinkedin size={18} />, run: () => openExternal(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(link)}`) },
    { key: 'whatsapp', label: 'WhatsApp', icon: <IconWhatsapp size={18} />, run: () => openExternal(`https://wa.me/?text=${encodeURIComponent(`${text} ${link}`)}`) },
  ];
  return (
    <div className="dlg-backdrop sc-share-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sc-share" role="dialog" aria-label={`${agent.name} teilen`} style={{ ['--sc-color' as string]: colorOf(agent) }}>
        <header className="sc-share-head">
          <strong>{agent.name} teilen</strong>
          <button className="sc-x" aria-label="Schließen" onClick={onClose}>
            <IconClose size={18} />
          </button>
        </header>
        <div className="sc-share-card">
          <Stamp />
          <Figure agent={agent} className="sc-share-figure" />
          <span className="sc-share-name">{agent.name}</span>
        </div>
        <div className="sc-share-targets">
          {targets.map((t) => (
            <button key={t.key} className="sc-target" onClick={t.run}>
              <span className="sc-target-icon">{t.icon}</span>
              <span className="sc-target-label">{t.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
