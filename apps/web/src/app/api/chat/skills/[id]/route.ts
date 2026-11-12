import { NextResponse } from "next/server";
import { deleteSkill, parseSkillInput, toSkill, updateSkill } from "@/lib/chat/persona/runtime";
import { badRequest, handleError, notFound, readJson, requireWallet, unauthorized } from "../../_lib/http";

export const runtime = "nodejs";
export const maxDuration = 30;

/** PATCH /api/chat/skills/:id — {name?, description?, body?, enabled?} → {skill}. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const wallet = await requireWallet(request);
  if (!wallet) return unauthorized();
  const { id } = await params;
  const parsed = parseSkillInput(await readJson(request), true);
  if (!parsed.ok) return badRequest(parsed.message);
  try {
    const row = await updateSkill(wallet, id, parsed.value);
    if (!row) return notFound("Die Fähigkeit");
    return NextResponse.json({ skill: toSkill(row) });
  } catch (err) {
    return handleError(err, "skills/:id");
  }
}

/** DELETE /api/chat/skills/:id → {ok}. */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const wallet = await requireWallet(request);
  if (!wallet) return unauthorized();
  const { id } = await params;
  try {
    if (!(await deleteSkill(wallet, id))) return notFound("Die Fähigkeit");
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleError(err, "skills/:id");
  }
}
