// "Ansehen" (the agent full-window on its colour, name set big across it) and "Teilen" (a card plus share
// targets). The public link goes to the website's share page, which carries the link preview.
import { useEffect, useState, type ReactNode } from 'react';
import { t } from '../i18n';
import logoUrl from '../assets/logo.svg';
import meckyUrl from '../assets/mecky-welcome.png';
import { openExternal } from '../persona/common';
import { IconCheck, IconClose, IconCopy, IconDownload, IconLinkedin, IconShare, IconWhatsapp, IconX } from '../ui/shell/line-icons';
import { botInitial } from '../workspace/BotAvatar';
import { MECKY_COLOR, PICTURE_COLOR, shareUrl, type AgentPicture, type Character } from './characters';

export interface ShowcaseAgent {
  name: string;
  /** By the picture rule (agentPicture). */
  picture: AgentPicture;
}

const characterOf = (a: ShowcaseAgent): Character | null => (a.picture.kind === 'character' ? a.picture.character : null);
const colorOf = (a: ShowcaseAgent) => characterOf(a)?.color ?? (a.picture.kind === 'mecky' ? MECKY_COLOR : PICTURE_COLOR);
const ORTIS_URL = 'https://www.roebel.app/studio';
const linkOf = (a: ShowcaseAgent) => {
  const c = characterOf(a);
  return c ? shareUrl(c, a.name) : ORTIS_URL;
};

/** The public share page exists for characters; Mecky shares the Ortis page. Own pictures are not shared. */
export const canShare = (a: ShowcaseAgent) => a.picture.kind === 'character' || a.picture.kind === 'mecky';

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
      <span>{t('Erstellt mit Ortis')}</span>
    </span>
  );
}

/**
 * Large picture: a character's 1600 px figure from the website (the bundled one until it has loaded, or when
 * offline), Mecky's figure, an own picture large and rounded, or the initial on a tile.
 */
function Figure({ agent, className }: { agent: ShowcaseAgent; className: string }) {
  const character = characterOf(agent);
  const small = character?.figure ?? meckyUrl;
  const [src, setSrc] = useState(small);
  const [broken, setBroken] = useState(false);
  useEffect(() => {
    setSrc(small);
    if (!character) return;
    const img = new Image();
    img.onload = () => setSrc(character.large);
    img.src = character.large;
  }, [character, small]);
  useEffect(() => setBroken(false), [agent.picture]);
  if (agent.picture.kind === 'image' && !broken) return <img className={`${className} photo`} src={agent.picture.url} alt="" draggable={false} onError={() => setBroken(true)} />;
  if (agent.picture.kind === 'initial' || agent.picture.kind === 'image')
    return (
      <span className={`${className} initial`} aria-hidden="true">
        {botInitial(agent.name)}
      </span>
    );
  return <img className={className} src={src} alt="" draggable={false} />;
}

export function AgentView({ agent, onClose, onShare }: { agent: ShowcaseAgent; onClose: () => void; onShare?: () => void }) {
  useEscape(onClose);
  return (
    <div className="sc-view" role="dialog" aria-label={agent.name} style={{ background: colorOf(agent) }}>
      <Stamp />
      <div className="sc-view-stage">
        <Figure agent={agent} className="sc-view-figure" />
        <h1 className="sc-view-name">{agent.name}</h1>
      </div>
      <div className="sc-view-actions">
        {onShare && (
          <button className="sc-pill" onClick={onShare}>
            <IconShare size={17} /> {t('Teilen')}
          </button>
        )}
        <button className="sc-round" aria-label={t('Schließen')} onClick={onClose}>
          <IconClose size={18} />
        </button>
      </div>
    </div>
  );
}

/** Draws the share card (1200×1500) for "Herunterladen"; uses the bundled figure so the canvas stays clean. */
async function cardPng(agent: ShowcaseAgent): Promise<Blob | null> {
  const img = new Image();
  img.src = characterOf(agent)?.figure ?? meckyUrl;
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
  ctx.fillText(t('Erstellt mit Ortis'), W / 2, 1440);
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/png'));
}

export function ShareDialog({ agent, onClose }: { agent: ShowcaseAgent; onClose: () => void }) {
  useEscape(onClose);
  const [copied, setCopied] = useState(false);
  const link = linkOf(agent);
  const text = t('Das ist {name}, mein Agent in Ortis.', { name: agent.name });
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
      key: 'copy', label: copied ? t('Kopiert') : t('Link kopieren'), icon: copied ? <IconCheck size={18} /> : <IconCopy size={18} />,
      run: () => void navigator.clipboard.writeText(link).then(() => (setCopied(true), setTimeout(() => setCopied(false), 1800))).catch(() => {}),
    },
    { key: 'download', label: t('Herunterladen'), icon: <IconDownload size={18} />, run: () => void download() },
    ...(canShare ? [{ key: 'share', label: t('Teilen'), icon: <IconShare size={18} />, run: () => void navigator.share({ title: agent.name, text, url: link }).catch(() => {}) }] : []),
    { key: 'x', label: 'X', icon: <IconX size={18} />, run: () => openExternal(`https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(link)}`) },
    { key: 'linkedin', label: 'LinkedIn', icon: <IconLinkedin size={18} />, run: () => openExternal(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(link)}`) },
    { key: 'whatsapp', label: 'WhatsApp', icon: <IconWhatsapp size={18} />, run: () => openExternal(`https://wa.me/?text=${encodeURIComponent(`${text} ${link}`)}`) },
  ];
  return (
    <div className="dlg-backdrop sc-share-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sc-share" role="dialog" aria-label={t('{name} teilen', { name: agent.name })} style={{ ['--sc-color' as string]: colorOf(agent) }}>
        <header className="sc-share-head">
          <strong>{t('{name} teilen', { name: agent.name })}</strong>
          <button className="sc-x" aria-label={t('Schließen')} onClick={onClose}>
            <IconClose size={18} />
          </button>
        </header>
        <div className="sc-share-card">
          <Stamp />
          <Figure agent={agent} className="sc-share-figure" />
          <span className="sc-share-name">{agent.name}</span>
        </div>
        <div className="sc-share-targets">
          {targets.map((target) => (
            <button key={target.key} className="sc-target" onClick={target.run}>
              <span className="sc-target-icon">{target.icon}</span>
              <span className="sc-target-label">{target.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
