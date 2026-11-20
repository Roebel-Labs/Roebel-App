/**
 * "Neuer Ausweis-Typ" on the phone: pick a template (the dashboard's list), adjust name and
 * description, then the type goes to the approve screen (type_prepare op create). Images, limits
 * and claim windows stay on the dashboard. With the Ausweis-Designer switched on (status
 * `designer`), this screen hands over to the designer instead.
 */
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { fontFamily } from '@/constants/theme';
import { CredentialScreenFrame, CredentialStatus } from '@/components/credentials/CredentialScreenFrame';
import { OrgChainNotice, useCredOrg } from '@/components/credentials/OrgCredentialParts';
import { prepareTypeCreate } from '@/lib/credreg/api';
import { submittedMessage } from '@/lib/credreg/org';
import { useDesignerOpen } from '@/lib/card-design/designer-status';
import { KIND_LABEL, TYPE_TEMPLATES, templateFormError, templatePayload, type TemplateKey } from '@/lib/credreg/templates';

const KEYS = Object.keys(TYPE_TEMPLATES) as TemplateKey[];

export default function NewTypeScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { state, account } = useCredOrg();
  const org = state.status === 'ready' ? state.org : null;
  const [key, setKey] = useState<TemplateKey | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const designer = useDesignerOpen();
  useEffect(() => {
    if (designer) router.replace('/org/credentials/designer?new=1' as any);
  }, [designer, router]);

  const title = 'Neuer Ausweis-Typ';
  if (state.status === 'loading' || designer !== false) {
    return (
      <CredentialScreenFrame title={title}>
        <CredentialStatus loading />
      </CredentialScreenFrame>
    );
  }
  if (!org) {
    return (
      <CredentialScreenFrame title={title}>
        <CredentialStatus title="Keine Berechtigung" message="Ausweis-Typen anlegen können Inhaber:innen und Admins einer Organisation." />
      </CredentialScreenFrame>
    );
  }
  if (org.onChain !== 'ready') {
    return (
      <CredentialScreenFrame title={title}>
        <OrgChainNotice reason={org.onChain === 'no_chain_authority' ? 'no_chain_authority' : 'org_not_registered'} />
      </CredentialScreenFrame>
    );
  }

  const pick = (k: TemplateKey) => {
    setKey(k);
    setName(TYPE_TEMPLATES[k].name);
    setDescription(TYPE_TEMPLATES[k].description);
    setError(null);
  };
  const formError = key ? templateFormError({ name, description }) : null;

  const submit = async () => {
    if (inFlight.current || !account || !key || formError) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const res = await prepareTypeCreate(account, { accountId: org.accountId, ...templatePayload(key, { name, description }) });
      if (res.ok && res.data.actionId) {
        router.replace({ pathname: '/org/credentials/approve/[id]', params: { id: res.data.actionId, org: org.accountId } } as any);
      } else if (!res.ok) {
        setError(submittedMessage(res));
      }
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  return (
    <CredentialScreenFrame title={title}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={[styles.label, { color: colors.textPrimary }]}>Vorlage</Text>
        {KEYS.map((k) => {
          const t = TYPE_TEMPLATES[k];
          const active = key === k;
          return (
            <Pressable
              key={k}
              onPress={() => pick(k)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              style={[styles.option, { borderColor: active ? colors.primary : colors.borderSecondary, backgroundColor: colors.surface }]}
            >
              <Text style={[styles.optionTitle, { color: colors.textPrimary }]}>{t.name}</Text>
              <Text style={[styles.meta, { color: colors.textSecondary }]}>{`${KIND_LABEL[t.kind]} · ${t.description}`}</Text>
            </Pressable>
          );
        })}

        {key ? (
          <View style={styles.form}>
            <Text style={[styles.label, { color: colors.textPrimary }]}>Name</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              maxLength={60}
              style={[styles.input, { borderColor: colors.border, color: colors.textPrimary, backgroundColor: colors.surface }]}
              accessibilityLabel="Name"
            />
            <Text style={[styles.label, { color: colors.textPrimary }]}>Beschreibung</Text>
            <TextInput
              value={description}
              onChangeText={setDescription}
              multiline
              maxLength={300}
              style={[styles.input, styles.multi, { borderColor: colors.border, color: colors.textPrimary, backgroundColor: colors.surface }]}
              accessibilityLabel="Beschreibung"
            />
            {formError ? <Text style={[styles.meta, { color: colors.error }]}>{formError}</Text> : null}
            {error ? <Text style={[styles.meta, { color: colors.error }]}>{error}</Text> : null}
            <Text style={[styles.meta, { color: colors.textSecondary }]}>Bild, Höchstzahl und Zeitraum stellst du im Dashboard am Computer ein.</Text>
            <Pressable
              onPress={submit}
              disabled={busy || !!formError}
              style={[styles.primary, { backgroundColor: colors.primary }, (busy || !!formError) && styles.disabled]}
              accessibilityRole="button"
            >
              {busy ? <ActivityIndicator color={colors.onPrimary} /> : <Text style={[styles.primaryText, { color: colors.onPrimary }]}>Weiter zur Bestätigung</Text>}
            </Pressable>
          </View>
        ) : null}
      </ScrollView>
    </CredentialScreenFrame>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 10, paddingBottom: 48 },
  label: { fontSize: 15, fontFamily: fontFamily.semiBold, marginTop: 6 },
  option: { borderWidth: 1.5, borderRadius: 12, padding: 12, gap: 2 },
  optionTitle: { fontSize: 15, fontFamily: fontFamily.medium },
  meta: { fontSize: 13, fontFamily: fontFamily.regular, lineHeight: 18 },
  form: { gap: 8, marginTop: 8 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, fontFamily: fontFamily.regular },
  multi: { minHeight: 80, textAlignVertical: 'top' },
  primary: { paddingVertical: 16, borderRadius: 12, alignItems: 'center', marginTop: 8 },
  primaryText: { fontSize: 16, fontFamily: fontFamily.semiBold },
  disabled: { opacity: 0.5 },
});
