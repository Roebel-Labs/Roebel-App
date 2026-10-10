/**
 * NSP-15 Social lists — how a Netizen node mirrors follows and mutes to Nostr.
 * kind 3 (NIP-02): public `p` tags of followed ORG pubkeys only.
 * kind 10000 (NIP-51 mutes) and kind 30000 d=netizen-unfollowed: all items NIP-44-encrypted to self;
 * persons appear as ["netizen_account", <account uuid>], orgs additionally as ["p", <org pubkey>].
 * Org pubkeys resolve via nostr_publications(source_type='org_profile', source_id=<account uuid>).
 */
export const NSP15_KINDS = { contacts: 3, mutes: 10000, followSet: 30000 } as const;
export const NSP15_ACCOUNT_TAG = "netizen_account";
export const NSP15_UNFOLLOWED_D = "netizen-unfollowed";
export const NSP15_ORG_LEDGER_SOURCE = "org_profile";
