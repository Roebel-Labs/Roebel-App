/**
 * Deep link roebel://passkey/guardian?safe=<address>[&name=…] — "add this person as my
 * Vertrauensperson". Opened from a shared "Mein Konto-Code" link. Gate closed → home.
 * The `name` param is display-only (and only when the address resolves to nobody).
 */
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { BigButton, Card, Initials, Notice, ScreenHeader, passkeyStyles, usePasskeyGate } from '@/components/passkey/PasskeyUi';
import { useGuardianManager } from '@/components/passkey/useGuardianManager';
import { parseGuardianParams } from '@/lib/passkey/deeplinks';
import { loadMigrationRecord, type MigrationRecord } from '@/lib/passkey/migration';
import { secureKeyValueStorage } from '@/lib/passkey/migration-runtime';
import type { Person } from '@/lib/passkey/people';
import { resolvePeopleNow } from '@/lib/passkey/guardians-runtime';

export default function AddGuardianFromLinkScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams();
  const allowed = usePasskeyGate();
  // useLocalSearchParams may hand out a new object per render: key the parse on its content.
  const paramsKey = JSON.stringify(params);
  const link = useMemo(() => parseGuardianParams(JSON.parse(paramsKey) as Record<string, string>), [paramsKey]);
  const [record, setRecord] = useState<MigrationRecord | null | undefined>(undefined);
  const [person, setPerson] = useState<Person | null>(null);
  const [added, setAdded] = useState(false);

  useEffect(() => {
    if (!allowed) return;
    loadMigrationRecord(secureKeyValueStorage)
      .catch(() => null)
      .then((r) => setRecord(r));
  }, [allowed]);

  useEffect(() => {
    if (!allowed || !link) return;
    resolvePeopleNow([link.safe])
      .then((m) => setPerson(m.get(link.safe.toLowerCase()) ?? null))
      .catch(() => setPerson(null));
  }, [allowed, link]);

  const manager = useGuardianManager(record?.status === 'done' ? record : null);

  if (!allowed || record === undefined) {
    return (
      <SafeAreaView style={[passkeyStyles.container, { backgroundColor: colors.background }]}>
        <View style={passkeyStyles.center}>{allowed === false ? null : <ActivityIndicator color={colors.primary} />}</View>
      </SafeAreaView>
    );
  }

  const name = person?.known ? person.name : (link?.name ?? 'Diese Person');
  const mine = [record?.safe, record?.legacy].filter(Boolean).map((a) => String(a).toLowerCase());
  const isSelf = !!link && mine.includes(link.safe.toLowerCase());
  const already = !!link && manager.guardians.some((g) => g.toLowerCase() === link.safe.toLowerCase());

  return (
    <SafeAreaView style={[passkeyStyles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <ScreenHeader title="Vertrauensperson" />
      <ScrollView contentContainerStyle={passkeyStyles.content}>
        {!link ? (
          <Notice tone="error" text="Dieser Link ist ungültig. Bitte lass dir den Konto-Code noch einmal zeigen." />
        ) : record?.status !== 'done' ? (
          <>
            <Text style={[passkeyStyles.body, { color: colors.textPrimary }]}>
              Um Vertrauenspersonen einzutragen, richte zuerst deinen Passkey ein.
            </Text>
            <BigButton label="Passkey einrichten" onPress={() => router.replace('/settings/passkey' as any)} />
          </>
        ) : (
          <>
            <Card style={{ alignItems: 'center' }}>
              <Initials name={name} size={72} />
              <Text style={[passkeyStyles.lede, { color: colors.textPrimary, textAlign: 'center' }]}>{name}</Text>
              {!person?.known ? (
                <Text style={[passkeyStyles.bodySmall, { color: colors.textSecondary, textAlign: 'center' }]}>
                  Den Namen hat die Person selbst angegeben. Trag nur jemanden ein, den du kennst.
                </Text>
              ) : null}
            </Card>
            <Text style={[passkeyStyles.body, { color: colors.textSecondary }]}>
              Als Vertrauensperson kann {name} dir helfen, wieder an dein Konto zu kommen, wenn du dein Handy verlierst. Allein
              kann niemand dein Konto übernehmen.
            </Text>
            {manager.notice?.text ? <Notice tone={manager.notice.tone} text={manager.notice.text} /> : null}
            {isSelf ? (
              <Notice tone="info" text="Das ist dein eigener Konto-Code." />
            ) : added || already ? (
              <BigButton label="Fertig" onPress={() => router.replace('/settings/passkey' as any)} />
            ) : (
              <BigButton
                label={`${name} eintragen`}
                busy={manager.busy === 'add'}
                disabled={manager.loading}
                onPress={async () => {
                  if (!link) return;
                  const target = link.safe;
                  if (await manager.addGuardian(target, name)) setAdded(true);
                }}
              />
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
