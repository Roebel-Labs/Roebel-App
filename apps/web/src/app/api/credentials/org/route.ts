// Org-side credential actions for the dashboard, Ortis Studio and the app: list orgs and types,
// prepare register actions (the phone confirms them). Accepts the app's signed request and the
// pairing session (lib/credentials/caller.ts).
import { NextRequest } from "next/server";
import type { Address, Hex } from "viem";
import { failResponse, jsonFail, jsonOk } from "@/lib/signed-request/verify";
import { authenticateCaller, ORG_ACTIONS } from "@/lib/credentials/caller";
import {
  listActions,
  listDelegatesForOrg,
  listOrgs,
  listTypesForOrg,
  prepareDelegateAction,
  prepareMembersPublicAction,
  prepareTypeAction,
  viaOf,
  type Result,
} from "@/lib/credentials/actions";
import { prepareBatch, prepareRevocation, previewPeople, type BatchInput, type RecipientInput } from "@/lib/credentials/batch";
import { listPeople, searchPeople } from "@/lib/credentials/people";
import { ensureEventQr, eventBadgeGet, eventBadgesList, prepareEventBadge, prepareEventBadgeAuto, setupEventBadge } from "@/lib/credentials/event-badges";
import { credentialDeps } from "@/lib/credentials/runtime";
import { prepareLetters } from "@/lib/credentials/delivery";
import { renderLetters } from "@/lib/credentials/letters";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The shared input of people_preview and batch_prepare (the csv is parsed and validated by lib/credentials/batch). */
function batchInput(p: Record<string, unknown>): BatchInput {
  return {
    accountId: String(p.accountId ?? ""),
    typeId: p.typeId as BatchInput["typeId"],
    recipients: p.recipients as RecipientInput[] | undefined,
    csv: p.csv as string | undefined,
    fromMemberList: p.fromMemberList === true,
    validUntil: p.validUntil as string | undefined,
    source: p.source as BatchInput["source"],
    dropRejected: p.dropRejected === true,
  };
}

function respond<T>(r: Result<T>) {
  return r.ok ? jsonOk(r.data) : jsonFail(r.status, r.code, r.message);
}

export async function POST(request: NextRequest) {
  const d = credentialDeps();
  if (!d) return jsonFail(503, "NOT_CONFIGURED", "Das Ausweis-Register ist auf diesem Knoten nicht eingerichtet.");
  const body = await request.json().catch(() => null);
  const c = await authenticateCaller(request, body, ORG_ACTIONS);
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
      case "delegates_list":
        return respond(await listDelegatesForOrg(d, c, { accountId: String(p.accountId ?? "") }));
      case "members_public_prepare":
        return respond(await prepareMembersPublicAction(d, c, { accountId: String(p.accountId ?? ""), membersPublic: p.membersPublic as boolean, via }));
      case "people_list":
        return respond(await listPeople(d, c, { accountId: String(p.accountId ?? ""), typeId: p.typeId as Hex }));
      case "people_search":
        return respond(await searchPeople(d, c, { accountId: String(p.accountId ?? ""), query: String(p.query ?? "") }));
      case "people_preview":
        return respond(await previewPeople(d, c, batchInput(p)));
      case "batch_prepare":
        return respond(await prepareBatch(d, c, batchInput(p)));
      case "revoke_prepare":
        return respond(
          await prepareRevocation(d, c, {
            accountId: String(p.accountId ?? ""),
            invitationIds: p.invitationIds as string[] | undefined,
            batchId: p.batchId as string | undefined,
          }),
        );
      case "event_badges_list":
        return respond(await eventBadgesList(d, c, { accountId: String(p.accountId ?? "") }));
      case "event_badge_get":
        return respond(await eventBadgeGet(d, c, { eventId: String(p.eventId ?? "") }));
      case "event_badge_prepare":
        return respond(
          await prepareEventBadge(d, c, { eventId: String(p.eventId ?? ""), name: p.name as string | undefined, imageUrl: p.imageUrl as string | undefined }),
        );
      case "event_badge_setup":
        return respond(
          await setupEventBadge(d, c, {
            eventId: String(p.eventId ?? ""),
            enabled: p.enabled as boolean,
            name: p.name as string | undefined,
            imageUrl: p.imageUrl as string | undefined,
            supplyCap: p.supplyCap as number | undefined,
          }),
        );
      case "event_badge_qr":
        return respond(await ensureEventQr(d, c, { eventId: String(p.eventId ?? "") }));
      case "event_badge_auto":
        return respond(await prepareEventBadgeAuto(d, c, { eventId: String(p.eventId ?? ""), enabled: p.enabled as boolean }));
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
