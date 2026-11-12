import { NextResponse } from "next/server";
import { MAX_SKILLS, createSkill, listSkills, parseSkillInput, toSkill } from "@/lib/chat/persona/runtime";
import { badRequest, handleError, readJson, requireWallet, unauthorized } from "../_lib/http";

export const runtime = "nodejs";
export const maxDuration = 30;
export const dynamic = "force-dynamic";

/** GET /api/chat/skills → {skills}. */
export async function GET(request: Request) {
  const wallet = await requireWallet(request);
  if (!wallet) return unauthorized();
  try {
    return NextResponse.json({ skills: (await listSkills(wallet)).map(toSkill) });
  } catch (err) {
    return handleError(err, "skills");
  }
}

/** POST /api/chat/skills — {name, description, body} → {skill}. */
export async function POST(request: Request) {
  const wallet = await requireWallet(request);
  if (!wallet) return unauthorized();
  const parsed = parseSkillInput(await readJson(request));
  if (!parsed.ok) return badRequest(parsed.message);
  try {
    if ((await listSkills(wallet)).length >= MAX_SKILLS) return badRequest(`Du kannst höchstens ${MAX_SKILLS} Fähigkeiten anlegen.`);
    const { name, description, body } = parsed.value;
    return NextResponse.json({ skill: toSkill(await createSkill(wallet, { name: name!, description: description ?? "", body: body! })) });
  } catch (err) {
    return handleError(err, "skills");
  }
}
