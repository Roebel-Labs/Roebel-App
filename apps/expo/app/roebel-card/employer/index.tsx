// Röbel Card — Employer / Sachbezug employee list.
//
// Lists all employees for the active organisation account, with an empty
// state when none exist yet. Tapping an employee row opens a deactivate
// action sheet. The CTA routes to /roebel-card/employer/add.

import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { useAccount } from '@/context/AccountContext';
import {
  fetchEmployees,
  deactivateEmployee,
  type EmployeeWithBalance,
  type EmployeeStatus,
} from '@/lib/supabase-roebel-card-employees';
import { formatEuros } from '@/lib/format-currency';
import ChevronLeftIcon from '@/assets/icons/chevron-left.svg';

type LoadState =
  | { kind: 'loading' }
  | { kind: 'no-account' }
  | { kind: 'ready'; employees: EmployeeWithBalance[] };

export default function EmployerEmployeeListScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { activeAccount } = useAccount();

  const [loadState, setLoadState] = useState<LoadState>({ kind: 'loading' });
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!activeAccount || activeAccount.account_type !== 'organisation') {
      setLoadState({ kind: 'no-account' });
      return;
    }
    const employees = await fetchEmployees(activeAccount.id);
    setLoadState({ kind: 'ready', employees });
  }, [activeAccount]);

  useEffect(() => {
    void load();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  const handleEmployeePress = (employee: EmployeeWithBalance) => {
    if (employee.status === 'deactivated') return;
    Alert.alert(
      employee.employee_label,
      `Guthaben: ${formatEuros(employee.balance_cents)}\nStatus: ${statusLabel(employee.status)}`,
      [
        { text: 'Abbrechen', style: 'cancel' },
        {
          text: 'Deaktivieren',
          style: 'destructive',
          onPress: () => confirmDeactivate(employee),
        },
      ],
    );
  };

  const confirmDeactivate = (employee: EmployeeWithBalance) => {
    Alert.alert(
      'Bist du sicher?',
      `${employee.employee_label} wird deaktiviert und kann keine Zahlungen mehr empfangen.`,
      [
        { text: 'Abbrechen', style: 'cancel' },
        {
          text: 'Deaktivieren',
          style: 'destructive',
          onPress: async () => {
            try {
              await deactivateEmployee(employee.id);
              await load();
            } catch (err: any) {
              Alert.alert('Fehler', err?.message ?? 'Deaktivierung fehlgeschlagen.');
            }
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable
          onPress={() => router.back()}
          style={styles.headerButton}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Zurück"
        >
          <ChevronLeftIcon width={24} height={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Sachbezug</Text>
        <View style={styles.headerButton} />
      </View>

      {loadState.kind === 'loading' ? (
        <View style={styles.centerFill}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : loadState.kind === 'no-account' ? (
        <NoOrgState colors={colors} router={router} />
      ) : loadState.employees.length === 0 ? (
        <EmptyState colors={colors} router={router} />
      ) : (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
          }
        >
          <Text style={[styles.sectionHeading, { color: colors.textSecondary }]}>
            Mitarbeiter ({loadState.employees.length})
          </Text>

          {loadState.employees.map((employee) => (
            <Pressable
              key={employee.id}
              onPress={() => handleEmployeePress(employee)}
              style={[
                styles.employeeRow,
                { backgroundColor: colors.surface },
                employee.status === 'deactivated' && { opacity: 0.5 },
              ]}
            >
              <Text style={styles.employeeEmoji}>👤</Text>
              <View style={styles.employeeText}>
                <Text style={[styles.employeeName, { color: colors.textPrimary }]} numberOfLines={1}>
                  {employee.employee_label}
                </Text>
                <Text style={[styles.employeeMeta, { color: colors.textSecondary }]}>
                  Guthaben: {formatEuros(employee.balance_cents)}
                </Text>
                <Text style={[styles.employeeMeta, { color: colors.textTertiary }]}>
                  Status: {statusLabel(employee.status)}
                </Text>
              </View>
              <Text style={[styles.chevron, { color: colors.textTertiary }]}>›</Text>
            </Pressable>
          ))}

          <Pressable
            onPress={() => router.push('/roebel-card/employer/add' as any)}
            style={[styles.addButton, { backgroundColor: colors.primary }]}
          >
            <Text style={[styles.addButtonText, { color: colors.onPrimary }]}>
              + Mitarbeiter hinzufügen
            </Text>
          </Pressable>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function EmptyState({
  colors,
  router,
}: {
  colors: ReturnType<typeof useTheme>['colors'];
  router: ReturnType<typeof useRouter>;
}) {
  return (
    <View style={styles.centerFill}>
      <Text style={styles.stateEmoji}>🧾</Text>
      <Text style={[styles.stateTitle, { color: colors.textPrimary }]}>
        Noch keine Mitarbeiter
      </Text>
      <Text style={[styles.stateBody, { color: colors.textSecondary }]}>
        Füge Mitarbeiter hinzu, um ihnen monatlich bis zu 50 € steuerfrei als Röbel
        Card gutzuschreiben (§8 Abs. 2 Satz 11 EStG).
      </Text>
      <Pressable
        onPress={() => router.push('/roebel-card/employer/add' as any)}
        style={[styles.statePrimary, { backgroundColor: colors.primary }]}
      >
        <Text style={[styles.statePrimaryText, { color: colors.onPrimary }]}>
          Ersten Mitarbeiter hinzufügen
        </Text>
      </Pressable>
    </View>
  );
}

function NoOrgState({
  colors,
  router,
}: {
  colors: ReturnType<typeof useTheme>['colors'];
  router: ReturnType<typeof useRouter>;
}) {
  return (
    <View style={styles.centerFill}>
      <Text style={styles.stateEmoji}>🏢</Text>
      <Text style={[styles.stateTitle, { color: colors.textPrimary }]}>
        Kein Unternehmensaccount aktiv
      </Text>
      <Text style={[styles.stateBody, { color: colors.textSecondary }]}>
        Wechsle zu einem Unternehmensaccount, um Sachbezug für Mitarbeiter zu verwalten.
      </Text>
      <Pressable
        onPress={() => router.replace('/create-org' as any)}
        style={[styles.statePrimary, { backgroundColor: colors.primary }]}
      >
        <Text style={[styles.statePrimaryText, { color: colors.onPrimary }]}>
          Unternehmen anlegen
        </Text>
      </Pressable>
    </View>
  );
}

function statusLabel(status: EmployeeStatus): string {
  switch (status) {
    case 'invited': return 'Eingeladen';
    case 'active': return 'Aktiv';
    case 'deactivated': return 'Deaktiviert';
  }
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  header: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    borderBottomWidth: 1,
  },
  headerButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: 'Inter-SemiBold',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 48,
  },
  centerFill: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 12,
  },
  stateEmoji: { fontSize: 56, marginBottom: 8 },
  stateTitle: { fontSize: 20, fontFamily: 'Inter-Bold', textAlign: 'center' },
  stateBody: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 16,
  },
  statePrimary: {
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 32,
    alignSelf: 'stretch',
    alignItems: 'center',
  },
  statePrimaryText: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
  },
  sectionHeading: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 12,
  },
  employeeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 16,
    padding: 16,
    marginBottom: 8,
  },
  employeeEmoji: { fontSize: 28 },
  employeeText: { flex: 1, gap: 2 },
  employeeName: { fontSize: 15, fontFamily: 'Inter-SemiBold' },
  employeeMeta: { fontSize: 12, fontFamily: 'Inter-Regular' },
  chevron: { fontSize: 22, fontFamily: 'Inter-Bold' },
  addButton: {
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 16,
  },
  addButtonText: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
  },
});
