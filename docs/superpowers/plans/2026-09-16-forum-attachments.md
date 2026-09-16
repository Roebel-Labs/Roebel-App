# Forum Anhänge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let citizens attach images and files to forum threads and replies, show every attachment of a discussion in one "Anhänge" carousel, and mirror them to Nostr — deliverable by EAS update only (no native module added).

**Architecture:** A `forum_attachments` table plus a `forum-attachments` storage bucket; uploads go through the existing `uploadMediaFile` for images and a new base64 upload for files; files are picked with a modal `react-native-webview` file input (already in the binary). Presentational components under `components/forum/`, pure helpers under `lib/` with jest.

**Tech Stack:** Expo SDK 56, expo-image-picker, react-native-webview 13.16, expo-web-browser, Supabase Storage + PostgREST, `@netizen-labs/nostr`.

**Spec:** `docs/superpowers/specs/2026-09-16-forum-attachments-design.md`

## Global Constraints

- **OTA only**: no new native dependency, no `expo install` of native modules. Everything must run in the current preview binary (build 39, runtime 3.7.0).
- Styling: `StyleSheet.create()` + `useTheme()`; `fontFamily` tokens. UI copy German, identifiers English.
- Migrations in `apps/expo/supabase/migrations/`, applied through the Supabase MCP (project `wwbeqhkslxdxhktqzqti`).
- Stage only the files you changed; commit per task.
- Type check: `cd apps/expo && NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit | grep <touched files>`; jest: `npx jest <path> --watchAll=false`.

---

### Task 1: Schema, bucket, types

**Files:**
- Create: `apps/expo/supabase/migrations/20260916_forum_attachments.sql`
- Modify: `apps/expo/lib/types/feed.ts`

**Interfaces:**
- Produces: `ForumAttachmentKind`, `ForumAttachmentRecord`, `PendingAttachment`; `CreateForumThreadInput.attachments?`, `CreateForumReplyInput.attachments?`; table `forum_attachments`, RPC `delete_owned_forum_attachment(p_attachment_id uuid, p_wallet text)`, bucket `forum-attachments`.

- [ ] **Step 1: Migration**

`apps/expo/supabase/migrations/20260916_forum_attachments.sql`:
```sql
-- Forum Anhänge: images + files on threads and replies, one carousel per discussion.
-- Spec: docs/superpowers/specs/2026-09-16-forum-attachments-design.md §3

CREATE TABLE IF NOT EXISTS public.forum_attachments (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id      uuid NOT NULL REFERENCES public.forum_threads(id) ON DELETE CASCADE,
  reply_id       uuid REFERENCES public.forum_replies(id) ON DELETE CASCADE,
  wallet_address text NOT NULL REFERENCES public.users(wallet_address),
  account_id     uuid REFERENCES public.accounts(id),
  kind           text NOT NULL CHECK (kind IN ('image', 'pdf', 'file')),
  url            text NOT NULL,
  mime_type      text NOT NULL,
  file_name      text NOT NULL CHECK (length(file_name) BETWEEN 1 AND 255),
  size_bytes     integer,
  width          integer,
  height         integer,
  status         text NOT NULL DEFAULT 'published' CHECK (status IN ('published', 'deleted')),
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS forum_attachments_thread_idx ON public.forum_attachments (thread_id, created_at DESC);
CREATE INDEX IF NOT EXISTS forum_attachments_reply_idx  ON public.forum_attachments (reply_id);

ALTER TABLE public.forum_attachments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS forum_attachments_select ON public.forum_attachments;
CREATE POLICY forum_attachments_select ON public.forum_attachments
  FOR SELECT USING (status = 'published');
DROP POLICY IF EXISTS forum_attachments_insert ON public.forum_attachments;
CREATE POLICY forum_attachments_insert ON public.forum_attachments
  FOR INSERT WITH CHECK (status = 'published');
-- No update/delete policies: removal goes through the owner-checked RPC below.
GRANT SELECT, INSERT ON public.forum_attachments TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.delete_owned_forum_attachment(p_attachment_id uuid, p_wallet text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  UPDATE public.forum_attachments SET status = 'deleted'
   WHERE id = p_attachment_id
     AND lower(wallet_address) = lower(p_wallet)
     AND status = 'published';
  IF NOT FOUND THEN RAISE EXCEPTION 'attachment not found or not owned by %', p_wallet; END IF;
END; $$;
REVOKE ALL ON FUNCTION public.delete_owned_forum_attachment(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.delete_owned_forum_attachment(uuid, text) TO anon, authenticated;

-- Storage: public read, client insert, 25 MB, allow-listed types. Append-only
-- like the images bucket (no update/delete policies for clients).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('forum-attachments', 'forum-attachments', true, 26214400, ARRAY[
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain', 'text/csv'
])
ON CONFLICT (id) DO NOTHING;
DROP POLICY IF EXISTS forum_attachments_public_read ON storage.objects;
CREATE POLICY forum_attachments_public_read ON storage.objects
  FOR SELECT USING (bucket_id = 'forum-attachments');
DROP POLICY IF EXISTS forum_attachments_public_insert ON storage.objects;
CREATE POLICY forum_attachments_public_insert ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'forum-attachments');

NOTIFY pgrst, 'reload schema';
```
Apply with `mcp__supabase__apply_migration` (`20260916_forum_attachments`). Verify:
```sql
select (select count(*) from information_schema.columns where table_name='forum_attachments') as cols,
       (select relrowsecurity from pg_class where relname='forum_attachments') as rls,
       (select public from storage.buckets where id='forum-attachments') as bucket_public,
       (select count(*) from pg_policies where schemaname='storage' and policyname like 'forum_attachments_%') as storage_policies;
```
Expected: `cols 14`, `rls true`, `bucket_public true`, `storage_policies 2`.

- [ ] **Step 2: Types**

In `apps/expo/lib/types/feed.ts`, after `BuergerratSummary`:
```ts
export type ForumAttachmentKind = 'image' | 'pdf' | 'file';

export type ForumAttachmentRecord = {
  id: string;
  thread_id: string;
  /** Null for attachments on the thread body itself. */
  reply_id: string | null;
  wallet_address: string;
  account_id: string | null;
  kind: ForumAttachmentKind;
  url: string;
  mime_type: string;
  file_name: string;
  size_bytes: number | null;
  width: number | null;
  height: number | null;
  status: 'published' | 'deleted';
  created_at: string;
};

/** An uploaded file waiting to be attached to a thread or reply row. */
export type PendingAttachment = Pick<ForumAttachmentRecord, 'kind' | 'url' | 'mime_type' | 'file_name'> & {
  size_bytes?: number | null;
  width?: number | null;
  height?: number | null;
};
```
Add `attachments?: PendingAttachment[];` to both `CreateForumThreadInput` and `CreateForumReplyInput`.

- [ ] **Step 3: Commit**
```bash
git add apps/expo/supabase/migrations/20260916_forum_attachments.sql apps/expo/lib/types/feed.ts
git commit -m "feat(supabase): forum attachments table, bucket and owner delete RPC"
```

---

### Task 2: Helpers — upload, picker HTML, Nostr tags

**Files:**
- Create: `apps/expo/lib/forum-attachments.ts`, `apps/expo/lib/file-picker-html.ts`
- Modify: `apps/expo/lib/nostr/forum-tags.ts`, `packages/nostr/src/forum.ts`
- Test: `apps/expo/lib/__tests__/forum-attachments.test.ts`, `apps/expo/lib/__tests__/file-picker-html.test.ts`, `apps/expo/lib/__tests__/forum-tags.test.ts` (append), `packages/nostr/test/forum.test.ts` (append)

**Interfaces:**
- Produces: `FORUM_ATTACHMENTS_BUCKET`, `MAX_FILE_BYTES`, `ALLOWED_ATTACHMENT_MIMES`, `isAllowedAttachmentMime`, `kindForMime`, `formatFileSize`, `safeFileName`, `uploadForumImage(uri, wallet, mime?, opts?)`, `uploadForumFileFromBase64(base64, mime, name, size)`; `buildFilePickerHtml(accept, maxBytes?)`, `parsePickedFileMessage(raw)`, `PickedFileMessage`; `attachmentTags(items)`, `attachmentContentSuffix(items)`; `buildForumReplyEvent(…, { createdAt?, extraTags? })`.

- [ ] **Step 1: Tests**

`apps/expo/lib/__tests__/forum-attachments.test.ts`:
```ts
import { formatFileSize, isAllowedAttachmentMime, kindForMime, safeFileName } from '../forum-attachments';

describe('forum attachment helpers', () => {
  it('classifies mimes', () => {
    expect(kindForMime('image/png')).toBe('image');
    expect(kindForMime('application/pdf')).toBe('pdf');
    expect(kindForMime('text/csv')).toBe('file');
  });
  it('allows the documented list only', () => {
    expect(isAllowedAttachmentMime('application/pdf')).toBe(true);
    expect(isAllowedAttachmentMime('IMAGE/JPEG')).toBe(true);
    expect(isAllowedAttachmentMime('application/x-msdownload')).toBe(false);
  });
  it('formats sizes in German style', () => {
    expect(formatFileSize(512)).toBe('512 B');
    expect(formatFileSize(20 * 1024)).toBe('20 KB');
    expect(formatFileSize(2.5 * 1024 * 1024)).toBe('2,5 MB');
    expect(formatFileSize(null)).toBe('');
  });
  it('sanitises file names', () => {
    expect(safeFileName(' Plan:2026/*.pdf ')).toBe('Plan_2026__.pdf');
    expect(safeFileName('')).toBe('datei');
  });
});
```

`apps/expo/lib/__tests__/file-picker-html.test.ts`:
```ts
import { buildFilePickerHtml, parsePickedFileMessage } from '../file-picker-html';

describe('file picker html', () => {
  it('embeds the accept list and the size guard', () => {
    const html = buildFilePickerHtml(['application/pdf', 'text/plain'], 1024);
    expect(html).toContain('accept="application/pdf,text/plain"');
    expect(html).toContain('f.size>1024');
    expect(html).toContain('ReactNativeWebView');
  });
  it('parses only known message shapes', () => {
    expect(parsePickedFileMessage(JSON.stringify({ type: 'file', name: 'a.pdf', mime: 'application/pdf', size: 3, base64: 'AAA=' }))?.type).toBe('file');
    expect(parsePickedFileMessage(JSON.stringify({ type: 'cancel' }))).toEqual({ type: 'cancel' });
    expect(parsePickedFileMessage('{"type":"other"}')).toBeNull();
    expect(parsePickedFileMessage('not json')).toBeNull();
  });
});
```

Append to `apps/expo/lib/__tests__/forum-tags.test.ts`:
```ts
import { attachmentContentSuffix, attachmentTags } from '../nostr/forum-tags';

describe('attachment tags', () => {
  const items = [
    { url: 'https://x/a.jpg', mime_type: 'image/jpeg', file_name: 'a.jpg' },
    { url: 'https://x/b.pdf', mime_type: 'application/pdf', file_name: 'Plan.pdf' },
  ];
  it('builds NIP-92 imeta tags and a URL suffix', () => {
    expect(attachmentTags(items)).toEqual([
      ['imeta', 'url https://x/a.jpg', 'm image/jpeg', 'alt a.jpg'],
      ['imeta', 'url https://x/b.pdf', 'm application/pdf', 'alt Plan.pdf'],
    ]);
    expect(attachmentContentSuffix(items)).toBe('\n\nhttps://x/a.jpg\nhttps://x/b.pdf');
    expect(attachmentContentSuffix([])).toBe('');
  });
});
```

Append inside `describe("forum reply (kind 1111, NIP-22)")` in `packages/nostr/test/forum.test.ts`:
```ts
  it("appends extra tags after the NIP-22 scope tags", () => {
    const event = buildForumReplyEvent(
      SECRET_KEY,
      "Antwort",
      { id: ROOT_ID, pubkey: PUBKEY },
      undefined,
      { createdAt: CREATED_AT, extraTags: [["imeta", "url https://x/a.jpg", "m image/jpeg"]] },
    );
    assert.deepEqual(event.tags[event.tags.length - 1], ["imeta", "url https://x/a.jpg", "m image/jpeg"]);
    assert.equal(event.tags[0][0], "E");
    assert.ok(verifyEvent(event));
  });
```

- [ ] **Step 2: `lib/forum-attachments.ts`**
```ts
import { decode } from 'base64-arraybuffer';
import { supabase } from './supabase';
import { uploadMediaFile } from './upload-media';
import type { ForumAttachmentKind, PendingAttachment } from './types/feed';

export const FORUM_ATTACHMENTS_BUCKET = 'forum-attachments';
/** The WebView file input hands the bytes over as one base64 string. */
export const MAX_FILE_BYTES = 15 * 1024 * 1024;

export const ALLOWED_ATTACHMENT_MIMES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/csv',
] as const;

const EXTENSION_FOR_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.ms-powerpoint': 'ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'text/plain': 'txt',
  'text/csv': 'csv',
};

export function isAllowedAttachmentMime(mime: string): boolean {
  return (ALLOWED_ATTACHMENT_MIMES as readonly string[]).includes(mime.toLowerCase());
}

export function kindForMime(mime: string): ForumAttachmentKind {
  const m = mime.toLowerCase();
  if (m.startsWith('image/')) return 'image';
  if (m === 'application/pdf') return 'pdf';
  return 'file';
}

export function formatFileSize(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
}

export function safeFileName(name: string): string {
  const cleaned = name.trim().replace(/[\\/:*?"<>|]/g, '_');
  return cleaned.slice(0, 120) || 'datei';
}

function extensionFor(name: string, mime: string): string {
  const fromName = name.includes('.') ? name.split('.').pop()!.toLowerCase() : '';
  if (fromName && /^[a-z0-9]{1,5}$/.test(fromName)) return fromName;
  return EXTENSION_FOR_MIME[mime.toLowerCase()] ?? 'bin';
}

/** Image from expo-image-picker → compressed JPEG in the forum bucket. */
export async function uploadForumImage(
  uri: string,
  walletAddress: string,
  mimeType?: string,
  opts: { fileName?: string | null; width?: number | null; height?: number | null } = {},
): Promise<PendingAttachment | null> {
  const url = await uploadMediaFile(uri, walletAddress, 'image', 'images', mimeType, FORUM_ATTACHMENTS_BUCKET);
  if (!url) return null;
  return {
    kind: 'image',
    url,
    mime_type: 'image/jpeg',
    file_name: safeFileName(opts.fileName ?? 'bild.jpg'),
    width: opts.width ?? null,
    height: opts.height ?? null,
    size_bytes: null,
  };
}

/** Any allowed file, delivered as base64 by the WebView picker. */
export async function uploadForumFileFromBase64(
  base64: string,
  mimeType: string,
  fileName: string,
  sizeBytes: number | null,
): Promise<PendingAttachment | null> {
  try {
    const mime = mimeType.toLowerCase();
    if (!isAllowedAttachmentMime(mime)) return null;
    const bytes = decode(base64);
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_FILE_BYTES) return null;
    const path = `files/${Date.now()}-${Math.random().toString(36).slice(2)}.${extensionFor(fileName, mime)}`;
    const { error } = await supabase.storage.from(FORUM_ATTACHMENTS_BUCKET).upload(path, bytes, {
      contentType: mime,
      cacheControl: '31536000',
      upsert: false,
    });
    if (error) {
      console.error('[forum-attachments] upload error', error);
      return null;
    }
    const { data } = supabase.storage.from(FORUM_ATTACHMENTS_BUCKET).getPublicUrl(path);
    return {
      kind: kindForMime(mime),
      url: data.publicUrl,
      mime_type: mime,
      file_name: safeFileName(fileName),
      size_bytes: sizeBytes ?? bytes.byteLength,
      width: null,
      height: null,
    };
  } catch (err) {
    console.error('[forum-attachments] upload failed', err);
    return null;
  }
}
```

- [ ] **Step 3: `lib/file-picker-html.ts`**
```ts
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
```

- [ ] **Step 4: Nostr tags**

Append to `apps/expo/lib/nostr/forum-tags.ts`:
```ts
import type { PendingAttachment } from '@/lib/types/feed';

type AttachmentRef = Pick<PendingAttachment, 'url' | 'mime_type' | 'file_name'>;

/** NIP-92: one imeta tag per attachment whose URL appears in the content. */
export function attachmentTags(items: AttachmentRef[]): string[][] {
  return items.map((a) => ['imeta', `url ${a.url}`, `m ${a.mime_type}`, `alt ${a.file_name}`]);
}

/** The URLs the imeta tags describe, appended to the event content. */
export function attachmentContentSuffix(items: Array<Pick<PendingAttachment, 'url'>>): string {
  return items.length ? '\n\n' + items.map((a) => a.url).join('\n') : '';
}
```
(Merge the `PendingAttachment` import into the existing type import line.)

In `packages/nostr/src/forum.ts` change `buildForumReplyEvent`'s last parameter to `options: { createdAt?: number; extraTags?: string[][] } = {}` and build:
```ts
  const tags = [
    ["E", root.id, "", root.pubkey],
    ["K", String(KIND_FORUM_THREAD)],
    ["P", root.pubkey],
    ["e", p.id, "", p.pubkey],
    ["k", String(p.kind)],
    ["p", p.pubkey],
    ...(options.extraTags ?? []),
  ];
  return buildEvent(secretKey, KIND_FORUM_REPLY, content, { createdAt: options.createdAt, tags });
```

- [ ] **Step 5: Run + commit**
```bash
cd apps/expo && npx jest lib/__tests__/forum-attachments.test.ts lib/__tests__/file-picker-html.test.ts lib/__tests__/forum-tags.test.ts --watchAll=false
cd ../../packages/nostr && pnpm test
git add apps/expo/lib/forum-attachments.ts apps/expo/lib/file-picker-html.ts apps/expo/lib/nostr/forum-tags.ts packages/nostr/src/forum.ts packages/nostr/test/forum.test.ts apps/expo/lib/__tests__/forum-attachments.test.ts apps/expo/lib/__tests__/file-picker-html.test.ts apps/expo/lib/__tests__/forum-tags.test.ts
git commit -m "feat(expo): attachment upload helpers, WebView file picker page, NIP-92 tags"
```

---

### Task 3: Data layer

**Files:**
- Modify: `apps/expo/lib/supabase-forum.ts`, `apps/expo/lib/nostr/publish.ts`

**Interfaces:**
- Produces: `fetchForumAttachments(threadId)`, `addForumAttachments({ thread_id, reply_id?, wallet_address, account_id?, items })`, `deleteForumAttachment(id, wallet)`; `createForumThread`/`createForumReply` honour `attachments`; `publishForumReply(replyId, threadId, content, parentReplyId?, createdAtSec?, extraTags?)`.

- [ ] **Step 1: supabase-forum.ts**

Imports: add `ForumAttachmentRecord, PendingAttachment` to the type import; add `import { attachmentContentSuffix, attachmentTags } from './nostr/forum-tags';` is NOT needed here (mirrors import dynamically, see below).

Add after `fetchForumReplies`:
```ts
const ATTACHMENT_SELECT =
  'id, thread_id, reply_id, wallet_address, account_id, kind, url, mime_type, file_name, size_bytes, width, height, status, created_at';

/** Every published attachment of a discussion (thread body + replies), newest first. */
export async function fetchForumAttachments(threadId: string): Promise<ForumAttachmentRecord[]> {
  const { data, error } = await supabase
    .from('forum_attachments')
    .select(ATTACHMENT_SELECT)
    .eq('thread_id', threadId)
    .eq('status', 'published')
    .order('created_at', { ascending: false });
  if (error) {
    console.error('Error fetching forum attachments:', error);
    return [];
  }
  return (data ?? []) as unknown as ForumAttachmentRecord[];
}

export async function addForumAttachments(input: {
  thread_id: string;
  reply_id?: string | null;
  wallet_address: string;
  account_id?: string | null;
  items: PendingAttachment[];
}): Promise<ForumAttachmentRecord[]> {
  if (input.items.length === 0) return [];
  const rows = input.items.map((a) => ({
    thread_id: input.thread_id,
    reply_id: input.reply_id ?? null,
    wallet_address: input.wallet_address,
    account_id: input.account_id ?? null,
    kind: a.kind,
    url: a.url,
    mime_type: a.mime_type,
    file_name: a.file_name,
    size_bytes: a.size_bytes ?? null,
    width: a.width ?? null,
    height: a.height ?? null,
    status: 'published',
  }));
  const { data, error } = await supabase.from('forum_attachments').insert(rows).select(ATTACHMENT_SELECT);
  if (error) {
    console.error('Error adding forum attachments:', error);
    return [];
  }
  return (data ?? []) as unknown as ForumAttachmentRecord[];
}

export async function deleteForumAttachment(id: string, walletAddress: string): Promise<void> {
  const { error } = await supabase.rpc('delete_owned_forum_attachment', {
    p_attachment_id: id,
    p_wallet: walletAddress,
  });
  if (error) throw error;
}
```

`createForumThread`: after `const thread = normalizeThread(...)` and before the mirror:
```ts
  const attachments = input.attachments ?? [];
  if (attachments.length) {
    await addForumAttachments({
      thread_id: thread.id,
      wallet_address: input.wallet_address,
      account_id: input.account_id || null,
      items: attachments,
    });
  }
  void mirrorThreadToNostr(thread, attachments);
```
`mirrorThreadToNostr(thread: ForumThreadRecord, attachments: PendingAttachment[] = [])`:
```ts
    const { publishForumThread } = await import('./nostr/publish');
    const { officialThreadTags, attachmentTags, attachmentContentSuffix } = await import('./nostr/forum-tags');
    const createdSec = Math.floor(Date.parse(thread.created_at) / 1000);
    await publishForumThread(
      thread.id,
      thread.title,
      thread.body + attachmentContentSuffix(attachments),
      thread.category_slug ?? undefined,
      Number.isFinite(createdSec) ? createdSec : undefined,
      [...officialThreadTags(thread), ...attachmentTags(attachments)],
    );
```
`createForumReply`: same pattern with `reply_id: reply.id` and `void mirrorReplyToNostr(reply, attachments);`. `mirrorReplyToNostr(reply, attachments = [])`:
```ts
    const { publishForumReply } = await import('./nostr/publish');
    const { attachmentTags, attachmentContentSuffix } = await import('./nostr/forum-tags');
    const createdSec = Math.floor(Date.parse(reply.created_at) / 1000);
    await publishForumReply(
      reply.id,
      reply.thread_id,
      reply.body + attachmentContentSuffix(attachments),
      reply.reply_to_reply_id ?? reply.parent_reply_id,
      Number.isFinite(createdSec) ? createdSec : undefined,
      attachmentTags(attachments),
    );
```

- [ ] **Step 2: publish.ts**

`publishForumReply` gains `extraTags?: string[][]` as the sixth parameter and passes `{ createdAt: createdAtSec, extraTags }` as the fifth argument of `buildForumReplyEvent` (replace the previous `createdAtSec ? { createdAt } : {}` expression; `createdAt: undefined` is fine).

Sweep (`retryForumPublications`): import `attachmentTags, attachmentContentSuffix` from `./forum-tags`. After computing `ownThreads` and before the loop, load attachments:
```ts
      const { data: threadFiles } = await supabase
        .from('forum_attachments')
        .select('thread_id, url, mime_type, file_name')
        .in('thread_id', ids)
        .is('reply_id', null)
        .eq('status', 'published');
      const filesByThread = new Map<string, Array<{ url: string; mime_type: string; file_name: string }>>();
      for (const f of threadFiles ?? []) {
        const key = String(f.thread_id);
        filesByThread.set(key, [...(filesByThread.get(key) ?? []), f as { url: string; mime_type: string; file_name: string }]);
      }
```
and in the loop use `String(t.body) + attachmentContentSuffix(filesByThread.get(String(t.id)) ?? [])` and tags `[...officialThreadTags(t as unknown as OfficialThreadFields), ...attachmentTags(filesByThread.get(String(t.id)) ?? [])]`. Same for replies with `.in('reply_id', ids)` → `filesByReply`, passing the suffix and `attachmentTags(...)` as the sixth argument of `publishForumReply`.

- [ ] **Step 3: Type-check + commit**
```bash
cd apps/expo && NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit 2>&1 | grep -E "supabase-forum|nostr/publish|nostr/forum-tags" | grep -v "type 'never'\|No overload\|not assignable to parameter of type 'undefined'" || echo clean
git add apps/expo/lib/supabase-forum.ts apps/expo/lib/nostr/publish.ts
git commit -m "feat(expo): attachment rows on thread/reply creation, reads, owner delete, Nostr imeta mirror"
```

---

### Task 4: Components — carousel, reply attachments, file picker sheet

**Files:**
- Create: `apps/expo/components/forum/ForumAttachmentsCarousel.tsx`, `apps/expo/components/forum/ForumReplyAttachments.tsx`, `apps/expo/components/forum/FilePickerSheet.tsx`
- Modify: `apps/expo/components/forum/ForumReplyItem.tsx`, `apps/expo/components/forum/ForumReplyThread.tsx`

**Interfaces:**
- Produces: `<ForumAttachmentsCarousel attachments onOpenImage />`, `openAttachment(a)`, `<ForumReplyAttachments attachments onOpenImage />`, `<FilePickerSheet visible onClose onPicked onError? />`; `ForumReplyItem` props `attachments?`, `onOpenImage?`; `ForumReplyThread` props `attachmentsByReply`, `onOpenImage`.

- [ ] **Step 1: `ForumAttachmentsCarousel.tsx`**
```tsx
import React from 'react';
import { View, Text, Pressable, FlatList, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import { formatFileSize } from '@/lib/forum-attachments';
import type { ForumAttachmentRecord } from '@/lib/types/feed';

type Props = {
  attachments: ForumAttachmentRecord[];
  onOpenImage: (url: string) => void;
};

/** PDFs and other files open in the in-app browser; no native viewer needed. */
export function openAttachment(attachment: Pick<ForumAttachmentRecord, 'url'>): void {
  void WebBrowser.openBrowserAsync(attachment.url);
}

/**
 * "Anhänge (N)": everything shared in the discussion, thread body and replies,
 * newest first. Images open the lightbox, files the browser.
 */
export default function ForumAttachmentsCarousel({ attachments, onOpenImage }: Props) {
  const { colors } = useTheme();
  if (attachments.length === 0) return null;
  return (
    <View style={styles.wrap}>
      <Text style={[styles.heading, { color: colors.textSecondary }]}>ANHÄNGE ({attachments.length})</Text>
      <FlatList
        horizontal
        data={attachments}
        keyExtractor={(a) => a.id}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
        renderItem={({ item }) => <AttachmentTile attachment={item} onOpenImage={onOpenImage} />}
      />
    </View>
  );
}

function AttachmentTile({
  attachment,
  onOpenImage,
}: {
  attachment: ForumAttachmentRecord;
  onOpenImage: (url: string) => void;
}) {
  const { colors } = useTheme();
  if (attachment.kind === 'image') {
    return (
      <Pressable
        onPress={() => onOpenImage(attachment.url)}
        accessibilityRole="imagebutton"
        accessibilityLabel={attachment.file_name}
      >
        <Image
          source={{ uri: attachment.url }}
          style={[styles.tile, { backgroundColor: colors.surfaceSecondary }]}
          contentFit="cover"
          accessibilityIgnoresInvertColors
        />
      </Pressable>
    );
  }
  const size = formatFileSize(attachment.size_bytes);
  return (
    <Pressable
      onPress={() => openAttachment(attachment)}
      style={[styles.tile, styles.fileTile, { backgroundColor: colors.surfaceSecondary }]}
      accessibilityRole="button"
      accessibilityLabel={attachment.file_name}
    >
      <Ionicons
        name={attachment.kind === 'pdf' ? 'document-text-outline' : 'document-outline'}
        size={26}
        color={colors.primary}
      />
      <Text style={[styles.fileName, { color: colors.textPrimary }]} numberOfLines={2}>
        {attachment.file_name}
      </Text>
      <Text style={[styles.fileMeta, { color: colors.textTertiary }]} numberOfLines={1}>
        {attachment.kind === 'pdf' ? 'PDF' : 'Datei'}
        {size ? ` · ${size}` : ''}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  heading: { fontSize: 11, fontFamily: fontFamily.semiBold, letterSpacing: 0.6 },
  row: { gap: 8 },
  tile: { width: 88, height: 88, borderRadius: 10 },
  fileTile: { padding: 8, justifyContent: 'space-between' },
  fileName: { fontSize: 11, fontFamily: fontFamily.medium, lineHeight: 14 },
  fileMeta: { fontSize: 10, fontFamily: fontFamily.regular },
});
```

- [ ] **Step 2: `ForumReplyAttachments.tsx`**
```tsx
import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import { formatFileSize } from '@/lib/forum-attachments';
import { openAttachment } from './ForumAttachmentsCarousel';
import type { ForumAttachmentRecord } from '@/lib/types/feed';

type Props = {
  attachments: ForumAttachmentRecord[];
  onOpenImage: (url: string) => void;
};

/** Inline attachments under a reply body: image thumbnails + file chips. */
export default function ForumReplyAttachments({ attachments, onOpenImage }: Props) {
  const { colors } = useTheme();
  if (attachments.length === 0) return null;
  const images = attachments.filter((a) => a.kind === 'image');
  const files = attachments.filter((a) => a.kind !== 'image');
  return (
    <View style={styles.wrap}>
      {images.length > 0 && (
        <View style={styles.imageRow}>
          {images.map((a) => (
            <Pressable
              key={a.id}
              onPress={() => onOpenImage(a.url)}
              accessibilityRole="imagebutton"
              accessibilityLabel={a.file_name}
            >
              <Image
                source={{ uri: a.url }}
                style={[styles.image, { backgroundColor: colors.surfaceSecondary }]}
                contentFit="cover"
                accessibilityIgnoresInvertColors
              />
            </Pressable>
          ))}
        </View>
      )}
      {files.map((a) => {
        const size = formatFileSize(a.size_bytes);
        return (
          <Pressable
            key={a.id}
            onPress={() => openAttachment(a)}
            style={[styles.chip, { backgroundColor: colors.surfaceSecondary }]}
            accessibilityRole="button"
            accessibilityLabel={a.file_name}
          >
            <Ionicons
              name={a.kind === 'pdf' ? 'document-text-outline' : 'document-outline'}
              size={18}
              color={colors.primary}
            />
            <Text style={[styles.chipName, { color: colors.textPrimary }]} numberOfLines={1}>
              {a.file_name}
            </Text>
            {size ? <Text style={[styles.chipMeta, { color: colors.textTertiary }]}>{size}</Text> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6, marginTop: 4 },
  imageRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  image: { width: 160, height: 120, borderRadius: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    maxWidth: '100%',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
  },
  chipName: { fontSize: 13, fontFamily: fontFamily.medium, flexShrink: 1 },
  chipMeta: { fontSize: 11, fontFamily: fontFamily.regular },
});
```

- [ ] **Step 3: `FilePickerSheet.tsx`**
```tsx
import React, { useMemo } from 'react';
import { View, Text, Pressable, Modal, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import { ALLOWED_ATTACHMENT_MIMES } from '@/lib/forum-attachments';
import { buildFilePickerHtml, parsePickedFileMessage } from '@/lib/file-picker-html';

export type PickedFile = { name: string; mime: string; size: number; base64: string };

type Props = {
  visible: boolean;
  onClose: () => void;
  onPicked: (file: PickedFile) => void;
  onError?: (message: string) => void;
};

/**
 * File picking without a native module: a modal WebView hosts a file input
 * (the OS document picker opens from it) and posts the chosen file back as
 * base64. Ships by OTA in the current binary.
 */
export default function FilePickerSheet({ visible, onClose, onPicked, onError }: Props) {
  const { colors } = useTheme();
  const html = useMemo(() => buildFilePickerHtml(ALLOWED_ATTACHMENT_MIMES), []);
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { backgroundColor: colors.background }]}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.textPrimary }]}>Datei anhängen</Text>
            <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Schließen">
              <Ionicons name="close" size={22} color={colors.textPrimary} />
            </Pressable>
          </View>
          <Text style={[styles.hint, { color: colors.textSecondary }]}>
            PDF, Word, Excel, PowerPoint, Text oder Bild · max. 15 MB
          </Text>
          {visible && (
            <WebView
              originWhitelist={['*']}
              source={{ html }}
              style={styles.web}
              javaScriptEnabled
              onMessage={(e) => {
                const message = parsePickedFileMessage(e.nativeEvent.data);
                if (!message) return;
                if (message.type === 'file') {
                  onPicked(message);
                  onClose();
                } else if (message.type === 'error') {
                  onError?.(message.message);
                  onClose();
                } else {
                  onClose();
                }
              }}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: { borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 16, gap: 8, height: 280 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 17, fontFamily: fontFamily.semiBold },
  hint: { fontSize: 12, fontFamily: fontFamily.regular },
  web: { flex: 1, backgroundColor: 'transparent' },
});
```

- [ ] **Step 4: Reply row + thread props**

`ForumReplyItem.tsx`: import `ForumReplyAttachments` and the `ForumAttachmentRecord` type; add props
```ts
  attachments?: ForumAttachmentRecord[];
  onOpenImage?: (url: string) => void;
```
(destructure with defaults `attachments = []`, `onOpenImage`) and render right after the body `<Text>`:
```tsx
        <ForumReplyAttachments attachments={attachments} onOpenImage={onOpenImage ?? (() => {})} />
```
`ForumReplyThread.tsx`: add props `attachmentsByReply: Map<string, ForumAttachmentRecord[]>; onOpenImage: (url: string) => void;` and pass `attachments={attachmentsByReply.get(group.id) ?? []} onOpenImage={onOpenImage}` to the top-level item and `attachments={attachmentsByReply.get(child.id) ?? []} onOpenImage={onOpenImage}` to each child.

- [ ] **Step 5: Type-check + commit**
```bash
cd apps/expo && NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit 2>&1 | grep -E "components/forum/(ForumAttachmentsCarousel|ForumReplyAttachments|FilePickerSheet|ForumReplyItem|ForumReplyThread)" || echo clean
git add apps/expo/components/forum/ForumAttachmentsCarousel.tsx apps/expo/components/forum/ForumReplyAttachments.tsx apps/expo/components/forum/FilePickerSheet.tsx apps/expo/components/forum/ForumReplyItem.tsx apps/expo/components/forum/ForumReplyThread.tsx
git commit -m "feat(expo): Anhänge carousel, inline reply attachments, WebView file picker sheet"
```

---

### Task 5: Comment bar + thread screen

**Files:**
- Modify: `apps/expo/components/feed/CommentInput.tsx`, `apps/expo/app/forum/thread/[id].tsx`

- [ ] **Step 1: CommentInput props**

Imports: add `import FilePickerSheet from '@/components/forum/FilePickerSheet';`, `import { uploadForumFileFromBase64 } from '@/lib/forum-attachments';`, `import type { PendingAttachment } from '@/lib/types/feed';`.

Props type changes:
```ts
  onSubmit: (
    content: string,
    stickerRewardId: string | null,
    imageUrl: string | null,
    file?: PendingAttachment | null,
  ) => Promise<void>;
  …
  /** Text-only mode: hides the sticker and image affordances (legacy). */
  disableAttachments?: boolean;
  /** Keep the image button but hide emoji/stickers (forum replies). */
  disableStickers?: boolean;
  /** Show a paperclip that opens the WebView file picker (forum replies). */
  enableFiles?: boolean;
  /** Where picked images upload; defaults to the images bucket's comments folder. */
  uploadTarget?: { bucket: string; folder: string };
```
Destructure `disableStickers = false, enableFiles = false, uploadTarget,`. State: `const [pendingFile, setPendingFile] = useState<PendingAttachment | null>(null); const [filePickerOpen, setFilePickerOpen] = useState(false);`.

`canSubmit`: `(value.trim().length > 0 || !!pendingSticker || !!imageUrl || !!pendingFile) && !isSubmitting && !isUploading`.
`handleSubmit`: capture `const submittedFile = pendingFile;` set `setPendingFile(null)`; call `await onSubmit(content, stickerId, submittedImage, submittedFile);`.
`handlePickImage`: upload with `uploadMediaFile(asset.uri, walletAddress, 'image', uploadTarget?.folder ?? 'comments', asset.mimeType || undefined, uploadTarget?.bucket ?? 'images')`.
`engaged`: add `|| !!pendingFile`. Add `const showFileIcon = enableFiles && (engaged || !!pendingFile) && !isEditMode && !!walletAddress;`.

Render: after the image preview chip add
```tsx
      {pendingFile && (
        <View style={[styles.stickerChip, { backgroundColor: colors.surfaceSecondary }]}>
          <Ionicons name={pendingFile.kind === 'pdf' ? 'document-text-outline' : 'document-outline'} size={22} color={colors.primary} />
          <Text style={[styles.fileChipName, { color: colors.textPrimary }]} numberOfLines={1}>
            {pendingFile.file_name}
          </Text>
          <Pressable onPress={() => setPendingFile(null)} hitSlop={8}>
            <Ionicons name="close-circle" size={22} color={colors.textTertiary} />
          </Pressable>
        </View>
      )}
```
Emoji button condition becomes `{!isEditMode && !disableAttachments && !disableStickers && (`. After the image button add:
```tsx
          {showFileIcon && !disableAttachments && (
            <Pressable
              onPress={() => setFilePickerOpen(true)}
              style={styles.iconButton}
              hitSlop={6}
              accessibilityLabel="Datei anhängen"
            >
              <Ionicons name="attach-outline" size={22} color={colors.textSecondary} />
            </Pressable>
          )}
```
At the end of the root `<View>` (after the pill) add:
```tsx
      {enableFiles && (
        <FilePickerSheet
          visible={filePickerOpen}
          onClose={() => setFilePickerOpen(false)}
          onPicked={async (file) => {
            setIsUploading(true);
            const uploaded = await uploadForumFileFromBase64(file.base64, file.mime, file.name, file.size);
            setIsUploading(false);
            if (uploaded) setPendingFile(uploaded);
          }}
        />
      )}
```
Style: `fileChipName: { flex: 1, fontSize: 13, fontFamily: 'Inter-Medium' },` (the file already uses the Inter alias names).

- [ ] **Step 2: Thread screen**

Imports: `ForumAttachmentsCarousel`, `ImageZoomModal` (`@/components/ImageZoomModal`), `fetchForumAttachments` (from supabase-forum), `FORUM_ATTACHMENTS_BUCKET` (from `@/lib/forum-attachments`), types `ForumAttachmentRecord, PendingAttachment`.

Query + derived maps (after the replies query):
```tsx
  const { data: attachments = [] } = useQuery({
    queryKey: ['forum', 'attachments', id],
    queryFn: () => fetchForumAttachments(id!),
    enabled: !!id,
  });
  const attachmentsByReply = useMemo(() => {
    const map = new Map<string, ForumAttachmentRecord[]>();
    for (const a of attachments) {
      if (!a.reply_id) continue;
      map.set(a.reply_id, [...(map.get(a.reply_id) ?? []), a]);
    }
    return map;
  }, [attachments]);
  const imageUrls = useMemo(() => attachments.filter((a) => a.kind === 'image').map((a) => a.url), [attachments]);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
```
Realtime handler: also `queryClient.invalidateQueries({ queryKey: ['forum', 'attachments', id] });`.

`handleSubmit(content: string, attachments: PendingAttachment[] = [])`: body = `content.trim() || attachments[0]?.file_name || ''`; guard `if (!body || …)`; pass `attachments` to `createForumReply`; after success also invalidate `['forum', 'attachments', id]`.

`renderGroup`: pass `attachmentsByReply={attachmentsByReply}` and `onOpenImage={setLightboxUrl}`.

Thread head: after the citation block (before `threadHeadActions`) add
```tsx
                <ForumAttachmentsCarousel attachments={attachments} onOpenImage={setLightboxUrl} />
```
Comment bar: replace `disableAttachments` with
```tsx
              disableStickers
              enableFiles
              uploadTarget={{ bucket: FORUM_ATTACHMENTS_BUCKET, folder: 'replies' }}
              onSubmit={async (content, _sticker, imageUrl, file) => {
                const items: PendingAttachment[] = [];
                if (imageUrl) items.push({ kind: 'image', url: imageUrl, mime_type: 'image/jpeg', file_name: 'bild.jpg' });
                if (file) items.push(file);
                await handleSubmit(content, items);
              }}
```
Lightbox, before the closing `</SafeAreaView>`:
```tsx
      <ImageZoomModal
        visible={!!lightboxUrl}
        imageUrl={lightboxUrl ?? ''}
        images={imageUrls.length > 1 ? imageUrls : undefined}
        onClose={() => setLightboxUrl(null)}
      />
```

- [ ] **Step 3: Type-check + commit**
```bash
cd apps/expo && NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit 2>&1 | grep -E "CommentInput|app/forum/thread" || echo clean
git add apps/expo/components/feed/CommentInput.tsx "apps/expo/app/forum/thread/[id].tsx"
git commit -m "feat(expo): images and files on forum replies, Anhänge carousel and lightbox on the thread"
```

---

### Task 6: Composer attachments

**Files:**
- Modify: `apps/expo/app/forum/new.tsx`

- [ ] **Step 1: State + handlers**

Imports: `Image` from expo-image, `Ionicons`, `* as ImagePicker from 'expo-image-picker'`, `FilePickerSheet`, `fetchForumAttachments, addForumAttachments, deleteForumAttachment` (supabase-forum), `uploadForumImage, uploadForumFileFromBase64, formatFileSize` (forum-attachments), types `ForumAttachmentRecord, PendingAttachment`.

State:
```tsx
  const [pending, setPending] = useState<PendingAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [filePickerOpen, setFilePickerOpen] = useState(false);
  const { data: existing = [] } = useQuery({
    queryKey: ['forum', 'attachments', edit],
    queryFn: () => fetchForumAttachments(edit!),
    enabled: !!edit,
    select: (rows: ForumAttachmentRecord[]) => rows.filter((a) => a.reply_id === null),
  });
```
Handlers:
```tsx
  const pickImage = async () => {
    if (!user?.wallet_address) return;
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    setUploading(true);
    const item = await uploadForumImage(asset.uri, user.wallet_address, asset.mimeType || undefined, {
      fileName: asset.fileName ?? null,
      width: asset.width ?? null,
      height: asset.height ?? null,
    });
    setUploading(false);
    if (!item) {
      setError('Bild konnte nicht hochgeladen werden.');
      return;
    }
    await attach(item);
  };

  const attach = async (item: PendingAttachment) => {
    // Edit mode writes the row right away; create mode keeps it until the thread exists.
    if (isEditMode && edit && user?.wallet_address) {
      await addForumAttachments({ thread_id: edit, wallet_address: user.wallet_address, account_id: activeAccount?.id ?? null, items: [item] });
      await queryClient.invalidateQueries({ queryKey: ['forum', 'attachments', edit] });
      return;
    }
    setPending((prev) => [...prev, item]);
  };

  const removeExisting = async (a: ForumAttachmentRecord) => {
    if (!user?.wallet_address) return;
    try {
      await deleteForumAttachment(a.id, user.wallet_address);
      await queryClient.invalidateQueries({ queryKey: ['forum', 'attachments', edit] });
    } catch {
      setError('Anhang konnte nicht entfernt werden.');
    }
  };
```
In `handleSubmit` create branch pass `attachments: pending` to `createForumThread`. In the edit branch nothing changes (attachments were written on pick).

- [ ] **Step 2: Render**

After the category block (before the error text):
```tsx
          <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>Anhänge (optional)</Text>
          <View style={styles.attachRow}>
            <Pressable onPress={pickImage} style={[styles.attachBtn, { borderColor: colors.border }]} accessibilityRole="button">
              <Ionicons name="image-outline" size={18} color={colors.primary} />
              <Text style={[styles.attachBtnText, { color: colors.primary }]}>Bild</Text>
            </Pressable>
            <Pressable onPress={() => setFilePickerOpen(true)} style={[styles.attachBtn, { borderColor: colors.border }]} accessibilityRole="button">
              <Ionicons name="attach-outline" size={18} color={colors.primary} />
              <Text style={[styles.attachBtnText, { color: colors.primary }]}>Datei</Text>
            </Pressable>
            {uploading && <ActivityIndicator size="small" color={colors.primary} />}
          </View>
          {(existing.length > 0 || pending.length > 0) && (
            <View style={styles.attachList}>
              {existing.map((a) => (
                <AttachmentDraftRow key={a.id} kind={a.kind} url={a.url} name={a.file_name} size={a.size_bytes} onRemove={() => void removeExisting(a)} />
              ))}
              {pending.map((a, i) => (
                <AttachmentDraftRow key={`${a.url}-${i}`} kind={a.kind} url={a.url} name={a.file_name} size={a.size_bytes ?? null} onRemove={() => setPending((prev) => prev.filter((_, j) => j !== i))} />
              ))}
            </View>
          )}
```
and before the closing `</SafeAreaView>`:
```tsx
      <FilePickerSheet
        visible={filePickerOpen}
        onClose={() => setFilePickerOpen(false)}
        onError={(message) => setError(message)}
        onPicked={async (file) => {
          setUploading(true);
          const item = await uploadForumFileFromBase64(file.base64, file.mime, file.name, file.size);
          setUploading(false);
          if (!item) {
            setError('Datei konnte nicht hochgeladen werden (Typ oder Größe).');
            return;
          }
          await attach(item);
        }}
      />
```
Module-level row component (same file):
```tsx
function AttachmentDraftRow({ kind, url, name, size, onRemove }: { kind: ForumAttachmentRecord['kind']; url: string; name: string; size: number | null; onRemove: () => void }) {
  const { colors } = useTheme();
  const sizeLabel = formatFileSize(size);
  return (
    <View style={[styles.draftRow, { backgroundColor: colors.surfaceSecondary }]}>
      {kind === 'image' ? (
        <Image source={{ uri: url }} style={styles.draftThumb} contentFit="cover" accessibilityIgnoresInvertColors />
      ) : (
        <Ionicons name={kind === 'pdf' ? 'document-text-outline' : 'document-outline'} size={22} color={colors.primary} />
      )}
      <Text style={[styles.draftName, { color: colors.textPrimary }]} numberOfLines={1}>{name}{sizeLabel ? ` · ${sizeLabel}` : ''}</Text>
      <Pressable onPress={onRemove} hitSlop={8} accessibilityRole="button" accessibilityLabel="Anhang entfernen">
        <Ionicons name="close-circle" size={22} color={colors.textTertiary} />
      </Pressable>
    </View>
  );
}
```
Styles:
```ts
  attachRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  attachBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  attachBtnText: { fontSize: 13, fontFamily: fontFamily.medium },
  attachList: { gap: 6 },
  draftRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 8, borderRadius: 8 },
  draftThumb: { width: 36, height: 36, borderRadius: 6 },
  draftName: { flex: 1, fontSize: 13, fontFamily: fontFamily.medium },
```

- [ ] **Step 3: Type-check + commit**
```bash
cd apps/expo && NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit 2>&1 | grep -E "app/forum/new" || echo clean
git add apps/expo/app/forum/new.tsx
git commit -m "feat(expo): attach images and files when creating or editing a forum thread"
```

---

### Task 7: Verify, merge, OTA

- [ ] Full jest (`npx jest --watchAll=false`): only the two env-broken suites may fail. Packages: `pnpm test` in `packages/nostr`.
- [ ] Type check touched files (grep list from Tasks 1–6) → clean apart from baseline `never` typing.
- [ ] `git checkout main && git pull && git merge --no-ff feat/buergerrat-diskussion && git push` (Max's instruction 2026-09-16: merge + push everything to main).
- [ ] From `apps/expo` on `main`, with no other `eas`/`hermesc` running: `NODE_OPTIONS="--max-old-space-size=8192" eas update --channel preview --platform android --message "<msg>" --non-interactive`, output to a log file (never pipe through `tail`), expect ~25 min. Report the update group id.
