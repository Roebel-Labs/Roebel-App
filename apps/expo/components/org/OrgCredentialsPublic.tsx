/**
 * The public side of an org's credentials (spec 5.3 / 5.6b) on its profile: "Ämter" (holders,
 * with the town's seal on recognised offices), "Mitglieder" (only members who claimed publicly;
 * nothing at all when there are none) and "Abzeichen dieser Organisation" with how many collected
 * them. Data comes from the public org route; no addresses ever reach this component.
 * `boundMiniApp` is the slot for the org's bound mini app (project 3) and renders nothing yet.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import AvatarStack from '@/components/AvatarStack';
import RecognisedSeal from '@/components/profile/RecognisedSeal';
import StampCard from '@/components/credentials/StampCard';
import type { OrgPublicView } from '@/lib/credreg/types';

/** Open question 1: the register section replaces the old member stack only for orgs that use it. */
export function replacesMemberSection(data: OrgPublicView | null, gateOpen: boolean | null): boolean {
  return gateOpen === true && !!data && data.usesRegister;
}

export default function OrgCredentialsPublic({
  data,
  showMembers = true,
  boundMiniApp = null,
}: {
  data: OrgPublicView;
  /** false while the profile still shows its old member section (org without register types). */
  showMembers?: boolean;
  boundMiniApp?: React.ReactNode;
}) {
  const { colors } = useTheme();
  const members = showMembers ? data.publicMembers ?? [] : [];
  const offices = data.offices.filter((o) => o.holders.length > 0);
  return (
    <>
      {offices.length > 0 ? (
        <View style={[styles.section, { borderTopColor: colors.border }]}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>Ämter</Text>
          {offices.map((o) => (
            <View key={o.typeId} style={styles.office}>
              <View style={styles.officeHead}>
                <Text style={[styles.officeName, { color: colors.textPrimary }]}>{o.name}</Text>
                {o.recognised ? (
                  <View accessible accessibilityLabel="Offizielles Amt der Stadt">
                    <RecognisedSeal size={18} />
                  </View>
                ) : null}
              </View>
              <Text style={[styles.meta, { color: colors.textSecondary }]}>{o.holders.map((h) => h.displayName).join(', ')}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {members.length > 0 ? (
        <View style={[styles.section, { borderTopColor: colors.border }]}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>Mitglieder</Text>
          <View style={styles.row}>
            <AvatarStack
              users={members.slice(0, 3).map((m) => ({ avatar_url: m.avatarUrl, username: m.username ?? m.displayName }))}
              totalCount={members.length}
              maxVisible={3}
              size="large"
            />
            <Text style={[styles.meta, { color: colors.textSecondary }]}>{`${members.length} ${members.length === 1 ? 'Mitglied' : 'Mitglieder'}`}</Text>
          </View>
        </View>
      ) : null}

      {data.badges.length > 0 ? (
        <View style={[styles.section, { borderTopColor: colors.border }]}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>Abzeichen dieser Organisation</Text>
          <View style={styles.grid}>
            {data.badges.map((b) => (
              <View key={b.typeId} style={styles.tile}>
                <StampCard imageUrl={b.imageUrl} title={b.name} subtitle={`${b.collected} gesammelt`} state="collected" size="tile" />
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {boundMiniApp}
    </>
  );
}

const styles = StyleSheet.create({
  section: { borderTopWidth: 1, paddingVertical: 16, paddingHorizontal: 16, marginHorizontal: 16, marginTop: 20, gap: 10 },
  title: { fontSize: 16, fontFamily: fontFamily.semiBold },
  office: { gap: 2 },
  officeHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  officeName: { fontSize: 15, fontFamily: fontFamily.medium },
  meta: { fontSize: 14, fontFamily: fontFamily.regular },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: { width: 108 },
});
