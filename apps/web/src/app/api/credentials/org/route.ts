// Org-side credential actions for the dashboard, Ortis Studio and the app: list orgs and types,
// prepare register actions (the phone confirms them). Accepts the app's signed request and the
// pairing session (lib/credentials/caller.ts).
import { NextRequest } from "next/server";
import type { Address, Hex } from "viem";
import { failResponse, jsonFail, jsonOk } from "@/lib/signed-request/verify";
import type { CredentialAction } from "@/lib/signed-request/message";
import { authenticateCaller } from "@/lib/credentials/caller";
import {
  listActions,
  listOrgs,
  listTypesForOrg,
  prepareDelegateAction,
  prepareMembersPublicAction,
  prepareTypeAction,
  viaOf,
  type Result,
} from "@/lib/credentials/actions";
import { prepareBatch, prepareRevocation, type RecipientInput } from "@/lib/credentials/batch";
import { listPeople, parsePeopleCsv, searchPeople } from "@/lib/credentials/people";
import { credentialDeps } from "@/lib/credentials/runtime";
import { prepareLetters } from "@/lib/credentials/delivery";
import { renderLetters } from "@/lib/credentials/letters";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ACTIONS: readonly CredentialAction[] = [
  "types_list",
  "type_prepare",
  "delegate_prepare",
  "members_public_prepare",
  "orgs_list",
  "actions_list",
  "people_list",
  "people_search",
  "batch_prepare",
  "revoke_prepare",
  "letters",
];

/** Upper bound for a pasted list (2000 people fit comfortably). */
const MAX_CSV_CHARS = 512 * 1024;

function respond<T>(r: Result<T>) {
  return r.ok ? jsonOk(r.data) : jsonFail(r.status, r.code, r.message);
}

export async function POST(request: NextRequest) {
  const d = credentialDeps();
  if (!d) return jsonFail(503, "NOT_CONFIGURED", "Das Ausweis-Register ist auf diesem Knoten nicht eingerichtet.");
  const body = await request.json().catch(() => null);
  const c = await authenticateCaller(request, body, ACTIONS);
  if (!c.ok) return failResponse(c);
  const p = c.payload;
  const via = viaOf(c, p.client);
  try {
    switch (c.action) {
      case "orgs_list":
        return respond(await listOrgs(d, c));
      case "types_list":
        return respond(await listTypesForOrg(d, c, String(p.accountId ?? "")));
      case "actions_list":
        return respond(await listActions(d, c, String(p.accountId ?? "")));
      case "type_prepare":
        return respond(
          await prepareTypeAction(d, c, {
            accountId: String(p.accountId ?? ""),
            op: p.op as "create" | "update" | "retire",
            typeId: p.typeId as Hex | undefined,
            template: p.template as string | undefined,
            name: p.name as string | undefined,
            description: p.description as string | undefined,
            imageUrl: p.imageUrl as string | undefined,
            benefits: p.benefits as string[] | undefined,
            kind: p.kind as "role" | "membership" | "badge" | undefined,
            publicClaim: p.publicClaim as boolean | undefined,
            supplyCap: p.supplyCap as number | undefined,
            claimStart: p.claimStart as string | undefined,
            claimEnd: p.claimEnd as string | undefined,
            via,
          }),
        );
      case "delegate_prepare":
        return respond(
          await prepareDelegateAction(d, c, {
            accountId: String(p.accountId ?? ""),
            typeId: p.typeId as Hex,
            delegate: p.delegate as Address,
            allowed: p.allowed as boolean,
            label: p.label as string | undefined,
            via,
          }),
        );
      case "members_public_prepare":
        return respond(await prepareMembersPublicAction(d, c, { accountId: String(p.accountId ?? ""), membersPublic: p.membersPublic as boolean, via }));
      case "people_list":
        return respond(await listPeople(d, c, { accountId: String(p.accountId ?? ""), typeId: p.typeId as Hex }));
      case "people_search":
        return respond(await searchPeople(d, c, { accountId: String(p.accountId ?? ""), query: String(p.query ?? "") }));
      case "batch_prepare": {
        let recipients = p.recipients as RecipientInput[] | undefined;
        if (typeof p.csv === "string") {
          if (p.csv.length > MAX_CSV_CHARS) return jsonFail(400, "BAD_REQUEST", "Die Liste ist zu groß.");
          // Validated (with row numbers) by prepareBatch.
          recipients = [...(Array.isArray(recipients) ? recipients : []), ...(parsePeopleCsv(p.csv) as RecipientInput[])];
        }
        return respond(
          await prepareBatch(d, c, {
            accountId: String(p.accountId ?? ""),
            typeId: p.typeId as Hex,
            recipients,
            fromMemberList: p.fromMemberList === true,
            validUntil: p.validUntil as string | undefined,
            source: p.source as "people" | "member_list" | "event" | undefined,
          }),
        );
      }
      case "revoke_prepare":
        return respond(
          await prepareRevocation(d, c, {
            accountId: String(p.accountId ?? ""),
            invitationIds: p.invitationIds as string[] | undefined,
            batchId: p.batchId as string | undefined,
          }),
        );
      case "letters": {
        // Owner or admin; the PDF holds the personal links of the batch's open claim-key invitations.
        const r = await prepareLetters(d, c, { accountId: String(p.accountId ?? ""), batchId: String(p.batchId ?? "") }, renderLetters);
        if (!r.ok) return respond(r);
        return new Response(new Uint8Array(r.data), {
          status: 200,
          headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": 'attachment; filename="ausweis-briefe.pdf"',
            "Cache-Control": "no-store",
          },
        });
      }
      default:
        return jsonFail(400, "BAD_REQUEST", "Unbekannte Aktion.");
    }
  } catch (err) {
    console.error("[credentials/org]", c.action, err instanceof Error ? err.message : err);
    return jsonFail(502, "UNAVAILABLE", "Gerade nicht erreichbar. Bitte versuche es gleich noch einmal.");
  }
}
