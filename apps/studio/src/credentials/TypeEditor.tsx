// Create or edit a credential type. Submitting prepares a type action that the phone confirms.
import { useRef, useState } from 'react';
import { t } from '../i18n';
import { Confirm } from '../persona/common';
import { uploadImage } from '../workspace/api';
import { prepareType } from './api';
import { KIND_LABELS, emptyForm, formFromTemplate, typeFormToPayload, validateType, type TemplateId, type TypeForm } from './templates';
import type { TabContext } from './tabs';
import type { Kind, TypeRow } from './types';

function formFromType(x: TypeRow): TypeForm {
  return {
    template: (x.template as TemplateId | null) ?? 'eigener',
    name: x.name,
    description: x.description ?? '',
    imageUrl: x.imageUrl,
    benefits: x.benefits,
    kind: x.kind ?? 'membership',
    supplyCap: x.supplyCap ? String(x.supplyCap) : '',
    claimStart: x.claimStart?.slice(0, 10) ?? '',
    claimEnd: x.claimEnd?.slice(0, 10) ?? '',
  };
}

export function TypeEditor({
  ctx, type, template, onPrepared, onCancel,
}: {
  ctx: TabContext;
  /** Set when editing an existing type. */
  type?: TypeRow;
  template?: TemplateId | 'eigener';
  onPrepared: (actionId: string, title: string) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<TypeForm>(() => (type ? formFromType(type) : template && template !== 'eigener' ? formFromTemplate(template) : emptyForm()));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [retire, setRetire] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const set = (patch: Partial<TypeForm>) => setForm((f) => ({ ...f, ...patch }));

  const submit = async () => {
    const e = validateType(form);
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    try {
      const r = await prepareType(ctx.token, typeFormToPayload(form, ctx.org.accountId, type ? 'update' : 'create', type?.typeId));
      onPrepared(r.actionId, type ? t('Ausweis-Typ ändern: {name}', { name: form.name.trim() }) : t('Ausweis-Typ anlegen: {name}', { name: form.name.trim() }));
    } catch (err) {
      ctx.onError(err);
    } finally {
      setBusy(false);
    }
  };

  const doRetire = async () => {
    if (!type) return;
    setBusy(true);
    try {
      const r = await prepareType(ctx.token, { accountId: ctx.org.accountId, op: 'retire', typeId: type.typeId });
      onPrepared(r.actionId, t('Ausweis-Typ dauerhaft stilllegen: {name}', { name: type.name }));
    } catch (err) {
      ctx.onError(err);
    } finally {
      setBusy(false);
      setRetire(false);
    }
  };

  const upload = async (f: File | undefined) => {
    if (!f) return;
    setBusy(true);
    try {
      const r = await uploadImage(ctx.token, f, f.name);
      set({ imageUrl: r.url });
    } catch (err) {
      ctx.onError(err);
    } finally {
      setBusy(false);
    }
  };

  const err = (k: string) => errors[k] && <span className="cr-field-error">{errors[k]}</span>;

  return (
    <div className="cr-form">
      <h2 className="pz-h3">{type ? t('Ausweis-Typ bearbeiten') : t('Neuer Ausweis-Typ')}</h2>
      <label>
        {t('Name')}
        <input value={form.name} maxLength={80} onChange={(e) => set({ name: e.target.value })} />
        {err('name')}
      </label>
      <label>
        {t('Art')}
        {type ? (
          <span className="pz-meta">{t(KIND_LABELS[form.kind])}</span>
        ) : (
          <select className="pz-select" value={form.kind} onChange={(e) => set({ kind: e.target.value as Kind })}>
            {(Object.keys(KIND_LABELS) as Kind[]).map((k) => (
              <option key={k} value={k}>
                {t(KIND_LABELS[k])}
              </option>
            ))}
          </select>
        )}
      </label>
      {form.template === 'stadtvertreter' && <p className="pz-meta">{t('Als offizielles Amt erkennt die Stadtgemeinschaft diesen Typ gesondert an.')}</p>}
      <label>
        {t('Beschreibung')}
        <textarea value={form.description} onChange={(e) => set({ description: e.target.value })} />
        {err('description')}
      </label>
      <label>
        {t('Bild (Adresse)')}
        <input value={form.imageUrl ?? ''} placeholder="https://" onChange={(e) => set({ imageUrl: e.target.value.trim() || null })} />
      </label>
      <div className="cr-actions">
        {form.imageUrl && <img className="cr-thumb" src={form.imageUrl} alt="" />}
        <button type="button" className="w-btn" disabled={busy} onClick={() => file.current?.click()}>
          {t('Bild hochladen')}
        </button>
        <input ref={file} type="file" accept="image/*" hidden onChange={(e) => void upload(e.target.files?.[0])} />
      </div>
      <label>
        {t('Vorteile (eine Zeile je Vorteil)')}
        <textarea value={form.benefits.join('\n')} onChange={(e) => set({ benefits: e.target.value.split('\n') })} />
        {err('benefits')}
      </label>
      <label>
        {t('Höchstzahl (leer = ohne Grenze)')}
        <input inputMode="numeric" value={form.supplyCap} onChange={(e) => set({ supplyCap: e.target.value })} />
        {err('supplyCap')}
      </label>
      <div className="pz-field-row">
        <label>
          {t('Abholen ab')}
          <input type="date" value={form.claimStart} onChange={(e) => set({ claimStart: e.target.value })} />
        </label>
        <label>
          {t('Abholen bis')}
          <input type="date" value={form.claimEnd} onChange={(e) => set({ claimEnd: e.target.value })} />
          {err('claimEnd')}
        </label>
      </div>
      <div className="cr-actions">
        <button className="w-btn green" disabled={busy} onClick={() => void submit()}>
          {t('Zur Bestätigung ans Handy senden')}
        </button>
        <button className="w-btn ghost" disabled={busy} onClick={onCancel}>
          {t('Abbrechen')}
        </button>
        <span className="ws-tools-spacer" />
        {type && type.chainStatus === 'onchain' && !type.retired && (
          <button className="w-btn" disabled={busy} onClick={() => setRetire(true)}>
            {t('Stilllegen')}
          </button>
        )}
      </div>
      {retire && (
        <Confirm
          title={t('Stilllegen')}
          body={t('Alle Ausweise dieses Typs verlieren sofort ihre Gültigkeit. Das kann nicht rückgängig gemacht werden.')}
          confirmLabel={t('Stilllegen')}
          busy={busy}
          onConfirm={() => void doRetire()}
          onCancel={() => setRetire(false)}
        />
      )}
    </div>
  );
}
