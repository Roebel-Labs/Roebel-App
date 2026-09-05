/**
 * Gnosis Pay onboarding: open a Konto (euro balance + Visa debit card) for a
 * person, and optionally make their business a stablecoin acceptance point.
 *
 * Drives the fixed Gnosis Pay sequence (signup -> terms -> KYC -> source of
 * funds -> phone -> Safe deploy) and, when the Safe exists, writes it into the
 * registry and creates a virtual card. With `entityId` in the route params it
 * also links the business -- that link is the moment the place appears on the
 * map, which is what "Sie sind live" means. Without it the same steps end at
 * "Konto eröffnet" (entry: the Konto & Karte card on every personal profile).
 *
 * The step order is decided by lib/gnosispay/onboarding.nextStep -- this screen
 * only renders what it is told and reports results back. Every network call
 * returns a GpResult, so nothing here throws on an expected failure.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useActiveAccount } from 'thirdweb/react';

import { OnboardingStep } from '@/components/payments/OnboardingStep';
import { useTheme } from '@/context/ThemeContext';
import {
  REQUIRED_TERMS,
  acceptTerm,
  createVirtualCard,
  deploySafe,
  getKycLink,
  getSafeConfig,
  getSafeDeployStatus,
  getSourceOfFundsQuestions,
  getTerms,
  getUser,
  requestPhoneOtp,
  signup,
  submitSourceOfFunds,
  verifyPhoneOtp,
} from '@/lib/gnosispay/api';
import { getStoredToken, signIn } from '@/lib/gnosispay/auth';
import {
  type OnboardingStep as Step,
  nextStep,
  stepProgress,
} from '@/lib/gnosispay/onboarding';
import type { GpSourceOfFundsQuestion, GpUser } from '@/lib/gnosispay/types';
import { linkEntity, upsertMerchantAccount } from '@/lib/merchant/registry';
import type { MerchantEntityType } from '@/lib/merchant/types';

/** Poll cadence while Sumsub reviews; the webhook usually beats this. */
const KYC_POLL_MS = 10_000;
/** Safe deployment takes about a minute; give it two before we stop waiting. */
const DEPLOY_POLL_MS = 5_000;
const DEPLOY_MAX_ATTEMPTS = 24;
/** Gnosis Pay's own default daily card allowance, in whole euro. */
const DEFAULT_DAILY_ALLOWANCE_EUR = 350;

export default function MerchantOnboardingScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const account = useActiveAccount();
  const params = useLocalSearchParams<{ entityType?: string; entityId?: string }>();
  const entityType = (params.entityType ?? 'business') as MerchantEntityType;
  const entityId = params.entityId ?? '';
  // With a business to link this is the merchant flow; without one it is a
  // person opening a Konto + card for themselves. Same steps, different words.
  const isMerchantFlow = entityId.length > 0;
  const [cardCreated, setCardCreated] = useState(false);

  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<GpUser | null>(null);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [step, setStep] = useState<Step>('signup');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [otpRequested, setOtpRequested] = useState(false);
  const [sofQuestions, setSofQuestions] = useState<GpSourceOfFundsQuestion[]>([]);
  const [sofAnswers, setSofAnswers] = useState<Record<string, string>>({});

  // termsAccepted is read inside refresh() but must not re-create it on every
  // toggle, or the KYC poll effect tears down and restarts.
  const termsRef = useRef(termsAccepted);
  termsRef.current = termsAccepted;

  const refresh = useCallback(async (jwt: string): Promise<GpUser | null> => {
    const result = await getUser(jwt);
    if (!result.ok) {
      setError(result.message);
      return null;
    }
    setUser(result.data);
    setStep(nextStep(result.data, termsRef.current));
    return result.data;
  }, []);

  /**
   * Sign in to Gnosis Pay; a stored JWT short-circuits the signature. Exposed
   * as a callback so the first screen can offer a retry when it fails -- the
   * user should not have to leave and re-enter the wizard.
   */
  const establishSession = useCallback(async (): Promise<string | null> => {
    if (!account) return null;
    const stored = await getStoredToken(account.address);
    if (stored) return stored;
    const signed = await signIn(account);
    if (signed.ok) return signed.data;
    // Surface what the server actually said. An earlier version guessed
    // "account not deployed", which sent debugging down the wrong path --
    // the real causes so far have been a text/plain nonce and an unregistered
    // SIWE domain, neither of which the guess described.
    console.error('[gnosispay] sign-in failed', signed.code, signed.message);
    setError(`Anmeldung bei Gnosis Pay fehlgeschlagen (${signed.code}): ${signed.message}`);
    return null;
  }, [account]);

  useEffect(() => {
    if (!account) return;
    let cancelled = false;

    (async () => {
      setBusy(true);
      const jwt = await establishSession();
      if (cancelled) return;
      if (jwt) {
        setToken(jwt);
        await refresh(jwt);
      }
      setBusy(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [account, establishSession, refresh]);

  /** Poll while Sumsub reviews, as a backstop for the webhook. */
  useEffect(() => {
    if (step !== 'kyc_wait' || !token) return;
    const timer = setInterval(() => {
      void refresh(token);
    }, KYC_POLL_MS);
    return () => clearInterval(timer);
  }, [step, token, refresh]);

  const run = useCallback(async (work: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await work();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unbekannter Fehler');
    } finally {
      setBusy(false);
    }
  }, []);

  const progress = stepProgress(step);

  const header = (
    <View style={styles.header}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Zurück"
        onPress={() => router.back()}
        hitSlop={12}
      >
        <Text style={[styles.headerBack, { color: colors.primary }]}>Zurück</Text>
      </Pressable>
      <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
        {isMerchantFlow ? 'Stablecoin-Zahlungen' : 'Konto & Karte'}
      </Text>
      <View style={styles.headerSpacer} />
    </View>
  );

  function renderStep() {
    if (!account) {
      return (
        <OnboardingStep
          stepIndex={1}
          stepTotal={progress.total}
          title="Kurz anmelden"
          body="Bitte melden Sie sich in der App an, um Stablecoin-Zahlungen einzurichten."
        />
      );
    }

    if (step === 'signup') {
      return (
        <OnboardingStep
          stepIndex={progress.index}
          stepTotal={progress.total}
          title={
            isMerchantFlow ? 'Geld, das sofort auf Ihrer Karte ist' : 'Konto & Karte in zehn Minuten'
          }
          body={
            isMerchantFlow
              ? 'Sie nehmen Zahlungen in digitalen Euro an. Das Geld liegt auf Ihrem eigenen Konto und lässt sich sofort mit Karte ausgeben.'
              : 'Ein Euro-Konto mit Visa-Debitkarte. Sie zahlen mit Guthaben, weltweit und per Google Pay. Einmal Ausweis und Selfie, fertig.'
          }
          actionLabel={token ? "Los geht's" : 'Anmeldung wiederholen'}
          busy={busy}
          error={error}
          actionDisabled={token ? !email.includes('@') : false}
          onAction={() =>
            run(async () => {
              if (!token) {
                // The sign-in failed earlier (or is still blocked upstream).
                // Retry it in place; establishSession sets the error itself.
                const jwt = await establishSession();
                if (!jwt) return;
                setToken(jwt);
                await refresh(jwt);
                return;
              }
              const result = await signup(email.trim(), token);
              if (!result.ok && result.code !== 'ALREADY_DONE') {
                throw new Error(result.message);
              }
              const fresh = await refresh(token);
              if (fresh) {
                await upsertMerchantAccount(account!, {
                  gpUserId: fresh.id,
                  status: 'pending_kyc',
                });
              }
            })
          }
        >
          <Text style={[styles.label, { color: colors.textSecondary }]}>E-Mail-Adresse</Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            placeholder="wirt@beispiel.de"
            placeholderTextColor={colors.textTertiary}
            style={[
              styles.input,
              { borderColor: colors.border, color: colors.textPrimary, backgroundColor: colors.surface },
            ]}
          />
        </OnboardingStep>
      );
    }

    if (step === 'terms') {
      return (
        <OnboardingStep
          stepIndex={progress.index}
          stepTotal={progress.total}
          title="Bedingungen"
          body="Für Konto und Karte gelten die Bedingungen von Gnosis Pay und des Kartenherausgebers Monavate."
          actionLabel="Zustimmen und weiter"
          busy={busy}
          error={error}
          onAction={() =>
            run(async () => {
              if (!token) throw new Error('Nicht bei Gnosis Pay angemeldet.');
              const list = await getTerms(token);
              if (!list.ok) throw new Error(list.message);
              for (const term of list.data) {
                if (!(REQUIRED_TERMS as readonly string[]).includes(term.id)) continue;
                const accepted = await acceptTerm(term.id, term.version, token);
                if (!accepted.ok && accepted.code !== 'ALREADY_DONE') {
                  throw new Error(accepted.message);
                }
              }
              setTermsAccepted(true);
              termsRef.current = true;
              setStep(nextStep(user, true));
            })
          }
        />
      );
    }

    if (step === 'kyc') {
      return (
        <OnboardingStep
          stepIndex={progress.index}
          stepTotal={progress.total}
          title="Identität prüfen"
          body="Einmal Ausweis und Selfie, etwa fünf Minuten. Danach ist Ihr Konto startklar."
          actionLabel="Prüfung starten"
          busy={busy}
          error={error}
          onAction={() =>
            run(async () => {
              if (!token) throw new Error('Nicht bei Gnosis Pay angemeldet.');
              const link = await getKycLink(token, 'de');
              if (!link.ok) throw new Error(link.message);
              await WebBrowser.openBrowserAsync(link.data.url);
              await refresh(token);
            })
          }
        />
      );
    }

    if (step === 'kyc_wait') {
      return (
        <OnboardingStep
          stepIndex={progress.index}
          stepTotal={progress.total}
          title="Prüfung läuft"
          body="Ihre Angaben werden geprüft. Das dauert meist nur wenige Minuten. Sie können die App währenddessen schließen."
          busy
          error={error}
        />
      );
    }

    if (step === 'kyc_blocked') {
      return (
        <OnboardingStep
          stepIndex={progress.index}
          stepTotal={progress.total}
          title="Prüfung nicht abgeschlossen"
          body="Die Identitätsprüfung konnte nicht abgeschlossen werden. Bitte wenden Sie sich an den Support von Gnosis Pay."
          error={error}
        />
      );
    }

    if (step === 'source_of_funds') {
      const answered =
        sofQuestions.length > 0 && sofQuestions.every((q) => sofAnswers[q.question]);
      return (
        <OnboardingStep
          stepIndex={progress.index}
          stepTotal={progress.total}
          title="Zwei kurze Fragen"
          body="Gesetzlich vorgeschrieben: woher stammt das Geld, das über das Konto läuft?"
          actionLabel="Antworten senden"
          busy={busy}
          error={error}
          actionDisabled={!answered}
          onAction={() =>
            run(async () => {
              if (!token) throw new Error('Nicht bei Gnosis Pay angemeldet.');
              const answers = sofQuestions.map((q) => ({
                question: q.question,
                answer: sofAnswers[q.question],
              }));
              const result = await submitSourceOfFunds(answers, token);
              if (!result.ok) throw new Error(result.message);
              await refresh(token);
            })
          }
        >
          <SourceOfFundsQuestions
            token={token}
            questions={sofQuestions}
            setQuestions={setSofQuestions}
            answers={sofAnswers}
            setAnswers={setSofAnswers}
            onError={setError}
          />
        </OnboardingStep>
      );
    }

    if (step === 'phone') {
      return (
        <OnboardingStep
          stepIndex={progress.index}
          stepTotal={progress.total}
          title="Telefonnummer bestätigen"
          body={
            otpRequested
              ? 'Wir haben Ihnen einen Code geschickt. Bitte hier eintragen.'
              : 'Für die Kontosicherheit brauchen wir Ihre Mobilnummer.'
          }
          actionLabel={otpRequested ? 'Code bestätigen' : 'Code anfordern'}
          busy={busy}
          error={error}
          actionDisabled={otpRequested ? otp.trim().length < 4 : phone.trim().length < 6}
          onAction={() =>
            run(async () => {
              if (!token) throw new Error('Nicht bei Gnosis Pay angemeldet.');
              if (!otpRequested) {
                const result = await requestPhoneOtp(phone.trim(), token);
                if (!result.ok) throw new Error(result.message);
                setOtpRequested(true);
                return;
              }
              const result = await verifyPhoneOtp(otp.trim(), token);
              if (!result.ok) throw new Error(result.message);
              await refresh(token);
            })
          }
        >
          <TextInput
            value={otpRequested ? otp : phone}
            onChangeText={otpRequested ? setOtp : setPhone}
            keyboardType={otpRequested ? 'number-pad' : 'phone-pad'}
            placeholder={otpRequested ? '123456' : '+49 151 12345678'}
            placeholderTextColor={colors.textTertiary}
            style={[
              styles.input,
              { borderColor: colors.border, color: colors.textPrimary, backgroundColor: colors.surface },
            ]}
          />
        </OnboardingStep>
      );
    }

    if (step === 'deploy') {
      return (
        <OnboardingStep
          stepIndex={progress.index}
          stepTotal={progress.total}
          title="Konto wird eröffnet"
          body="Das dauert etwa eine Minute."
          actionLabel="Konto eröffnen"
          busy={busy}
          error={error}
          onAction={() =>
            run(async () => {
              if (!token) throw new Error('Nicht bei Gnosis Pay angemeldet.');
              await upsertMerchantAccount(account!, { status: 'deploying' });

              const started = await deploySafe(token, DEFAULT_DAILY_ALLOWANCE_EUR);
              if (!started.ok) throw new Error(started.message);

              // The endpoint is idempotent, so polling is safe to repeat.
              for (let attempt = 0; attempt < DEPLOY_MAX_ATTEMPTS; attempt += 1) {
                await new Promise((resolve) => setTimeout(resolve, DEPLOY_POLL_MS));
                const status = await getSafeDeployStatus(token);
                if (status.ok && status.data.status === 'ok') break;
                if (status.ok && status.data.status === 'failed') {
                  throw new Error('Konto konnte nicht eröffnet werden. Bitte erneut versuchen.');
                }
              }

              const config = await getSafeConfig(token);
              if (!config.ok || config.data.accountStatus !== 0) {
                throw new Error(
                  'Das Konto ist noch nicht bereit. Bitte in einer Minute erneut öffnen.',
                );
              }

              await upsertMerchantAccount(account!, {
                safeAddress: config.data.address,
                status: 'live',
              });
              if (isMerchantFlow) {
                const linked = await linkEntity(account!, { entityType, entityId });
                if (!linked.ok) {
                  throw new Error(
                    'Das Konto ist da, aber der Eintrag auf der Karte hat nicht geklappt. Bitte erneut versuchen.',
                  );
                }
              }
              // A virtual Visa is free and instant; 409 means one already
              // exists. Anything else must not block the finish -- the Konto
              // is the deliverable, the card can be ordered later.
              const card = await createVirtualCard(token);
              if (card.ok || card.code === 'ALREADY_DONE') {
                setCardCreated(true);
              } else {
                console.warn('[gnosispay] virtual card not created', card.code, card.message);
              }
              await refresh(token);
            })
          }
        />
      );
    }

    return (
      <OnboardingStep
        stepIndex={progress.total}
        stepTotal={progress.total}
        title={isMerchantFlow ? 'Sie sind live' : 'Konto eröffnet'}
        body={
          (isMerchantFlow
            ? 'Ihr Geschäft ist ab sofort auf der Karte als Stablecoin-Annahmestelle sichtbar. '
            : 'Ihr Euro-Konto ist aktiv. ') +
          (cardCreated
            ? 'Ihre virtuelle Visa-Karte ist bereits aktiv; Kartendaten und IBAN folgen im Konto-Bereich.'
            : 'Die Karte lässt sich im Konto-Bereich bestellen.')
        }
        actionLabel="Fertig"
        onAction={() => router.back()}
      />
    );
  }

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
      edges={['top', 'bottom']}
    >
      <Stack.Screen options={{ headerShown: false }} />
      {header}
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {renderStep()}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/** Loads the questionnaire the first time the step is shown. */
function SourceOfFundsQuestions({
  token,
  questions,
  setQuestions,
  answers,
  setAnswers,
  onError,
}: {
  token: string | null;
  questions: GpSourceOfFundsQuestion[];
  setQuestions: (q: GpSourceOfFundsQuestion[]) => void;
  answers: Record<string, string>;
  setAnswers: (a: Record<string, string>) => void;
  onError: (message: string) => void;
}) {
  const { colors } = useTheme();

  useEffect(() => {
    if (!token || questions.length > 0) return;
    let cancelled = false;
    (async () => {
      const result = await getSourceOfFundsQuestions(token);
      if (cancelled) return;
      if (!result.ok) {
        onError(result.message);
        return;
      }
      setQuestions(result.data);
    })();
    return () => {
      cancelled = true;
    };
  }, [token, questions.length, setQuestions, onError]);

  return (
    <ScrollView style={styles.flex} keyboardShouldPersistTaps="handled">
      {questions.map((question) => (
        <View key={question.question} style={styles.question}>
          <Text style={[styles.label, { color: colors.textPrimary }]}>{question.question}</Text>
          {question.answers.map((option) => {
            const selected = answers[question.question] === option;
            return (
              <Pressable
                key={option}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                onPress={() => setAnswers({ ...answers, [question.question]: option })}
                style={[
                  styles.option,
                  {
                    borderColor: selected ? colors.primary : colors.border,
                    backgroundColor: selected ? colors.primaryLight : colors.surface,
                  },
                ]}
              >
                <Text style={[styles.optionText, { color: colors.textPrimary }]}>{option}</Text>
              </Pressable>
            );
          })}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  headerBack: { fontFamily: 'Inter-Medium', fontSize: 16, width: 70 },
  headerTitle: { fontFamily: 'Inter-SemiBold', fontSize: 16 },
  headerSpacer: { width: 70 },
  label: { fontFamily: 'Inter-Medium', fontSize: 14, marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: 'Inter-Regular',
    fontSize: 16,
  },
  question: { marginBottom: 20 },
  option: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 8,
  },
  optionText: { fontFamily: 'Inter-Regular', fontSize: 15 },
});
