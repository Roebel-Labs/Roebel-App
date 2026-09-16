# Forum Anhänge — images and files in discussions, with a thread-level carousel

- **Date:** 2026-09-16
- **Status:** Approved by Max in conversation ("build!"), implementation follows
- **Scope:** apps/expo, Supabase (table + storage bucket), packages/nostr (reply builder), sweep
- **Relates to:** `2026-09-16-buergerrat-discussion-threads-design.md` (the discussion UI this extends), forum spec `2026-08-29-umfragen-forum-design.md`

## 1. Problem

Discussions are text only. Citizens want to share photos (a broken bench, a vision sketch), PDFs (the brochure, a plan) and other files inside a discussion, and see everything that was shared in one place, like the attachments panel of a Jira ticket.

## 2. Decisions (Max, 2026-09-16)

| Decision | Choice |
|---|---|
| Where files live | Supabase Storage bucket `forum-attachments` (public read, client insert, 25 MB, allowed MIME list), rows in `forum_attachments`. Not the `images` bucket (its reencode cron must not touch PDFs). |
| What can be attached | Images (compressed to JPEG like posts), PDFs, common documents (docx, xlsx, pptx, txt, csv). Videos not in this slice. |
| Where | Thread body (composer, also in edit mode) and replies (comment bar). |
| Anhänge carousel | On the thread head: every attachment of the discussion (thread + replies), newest first. Images open the existing swipeable lightbox (`ImageZoomModal` with all image URLs); PDFs and files open in the in-app browser (`expo-web-browser`). |
| Any-file picking | Needs `expo-document-picker`, which is not in the current binary. Added to the app, guarded with `requireOptionalNativeModule('ExpoDocumentPicker')`, so an OTA never crashes: the "Datei" button appears only when the native module exists (after Max's next EAS build). Images work immediately through `expo-image-picker`. |
| Deletion | Owner soft-deletes the row (RPC); the object stays in the bucket (append-only, same posture as `images`). |
| Nostr | Attachment URLs are appended to the event content and described with NIP-92 `imeta` tags on kind 11 and kind 1111. The sweep republishes with attachments. |

## 3. Data model — migration `20260916_forum_attachments.sql`

```
forum_attachments (
  id uuid pk, thread_id uuid not null fk forum_threads cascade,
  reply_id uuid null fk forum_replies cascade,
  wallet_address text not null fk users, account_id uuid null fk accounts,
  kind text not null check in ('image','pdf','file'),
  url text not null, mime_type text not null, file_name text not null,
  size_bytes integer null, width integer null, height integer null,
  status text not null default 'published' check in ('published','deleted'),
  created_at timestamptz not null default now()
)
```
Indexes `(thread_id, created_at desc)`, `(reply_id)`. RLS: select `status='published'` for public; insert for public with `status='published'`; no update/delete policies; RPC `delete_owned_forum_attachment(p_attachment_id, p_wallet)` (SECURITY DEFINER, owner check, sets `deleted`). Realtime not needed: the thread screen refetches attachments together with replies.

Storage: `insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)` for `forum-attachments`; policies `forum_attachments_public_read` (select) and `forum_attachments_public_insert` (insert) on `storage.objects`, mirroring the `images` bucket.

Types: `ForumAttachmentKind = 'image' | 'pdf' | 'file'`, `ForumAttachmentRecord`, `PendingAttachment = Pick<…, 'kind'|'url'|'mime_type'|'file_name'|'size_bytes'|'width'|'height'>`. `CreateForumThreadInput` / `CreateForumReplyInput` gain `attachments?: PendingAttachment[]`.

## 4. Upload

`lib/forum-attachments.ts`:
- `uploadForumImage(uri, wallet, mime)` → `uploadMediaFile(uri, wallet, 'image', 'forum', mime, 'forum-attachments')`, returns a `PendingAttachment` with `kind:'image'`, `mime_type:'image/jpeg'`, `file_name` from the picker or `bild.jpg`, width/height from the picker asset.
- `uploadForumFile(uri, wallet, mime, name, size)` → base64 → ArrayBuffer → `storage.from('forum-attachments').upload('files/<ts>-<rand>.<ext>', …, { contentType })`, returns `PendingAttachment` with `kind` `pdf` for `application/pdf`, else `file`.
- `kindForMime(mime)`, `formatFileSize(bytes)`, `isAllowedAttachmentMime(mime)` (pure, jest-covered).
- `lib/file-picker.ts`: `isFilePickerAvailable()` (module present in the binary) and `pickFile()` returning `{ uri, mimeType, name, size } | null`; uses `expo-document-picker` only when available.

## 5. UI

- **`ForumAttachmentsCarousel`** (`components/forum/`): header "Anhänge (N)", horizontal list of 88px tiles: images as thumbnails (expo-image), PDFs/files as a chip with an icon (`document-text-outline` / `document-outline`), the file name (2 lines) and size. Tap image → `onOpenImage(url)`; tap file → `WebBrowser.openBrowserAsync(url)`. Hidden when N = 0.
- **`ForumReplyAttachments`**: under a reply body: images as a 160×120 thumbnail row (tap → lightbox), files as chips (tap → browser). Rendered by `ForumReplyItem` through a new `attachments` prop; `ForumReplyThread` passes each reply's attachments from a `byReplyId` map.
- **Thread head**: the carousel sits after the citation block and before the vote row. The screen owns one `ImageZoomModal` (`images` = all image URLs of the discussion, `imageUrl` = the tapped one).
- **Composer (`/forum/new`)**: an "Anhänge" row under the body: buttons "Bild" (image picker) and "Datei" (only when `isFilePickerAvailable()`), then the pending list (thumbnail or chip, remove ×). Uploads happen on pick; on create the rows are inserted with the thread. In edit mode existing attachments are listed with remove (RPC) and new ones are inserted immediately with `thread_id`.
- **Comment bar (`CommentInput`)**: new props `disableStickers` (hide emoji/sticker but keep the image button), `enableFiles` (paperclip → `pickFile()` → chip), `uploadTarget?: { bucket; folder }` (forum replies upload into `forum-attachments/replies`). `onSubmit` gains a fourth argument `file: PendingAttachment | null`. Existing callers are unaffected (all new props optional, the extra argument ignored). The thread screen switches from `disableAttachments` to `disableStickers` + `enableFiles` + `uploadTarget`, and passes image + file as attachments to `createForumReply`.

## 6. Nostr

`packages/nostr` `buildForumReplyEvent(…, options: { createdAt?, extraTags? })` appends `extraTags` after the NIP-22 scope tags. `lib/nostr/forum-tags.ts` gains `attachmentTags(items): string[][]` → `["imeta", "url <url>", "m <mime>", "alt <file_name>"]` per item and `attachmentContentSuffix(items)` → `"\n\n<url>\n<url>"`. `mirrorThreadToNostr` / `mirrorReplyToNostr` and the sweep pass attachments (sweep: one query per batch on `forum_attachments` by thread/reply ids).

## 7. Out of scope

Videos, inline PDF viewer, attachment editing after upload, per-attachment comments, virus scanning.

## 8. Testing

Jest: `forum-attachments` helpers (`kindForMime`, `formatFileSize`, `isAllowedAttachmentMime`), `forum-tags` (`attachmentTags`, `attachmentContentSuffix`); packages/nostr reply `extraTags`. Live schema check via MCP. Type check of touched files. Device: Max after the OTA (no dev client on this Mac).
