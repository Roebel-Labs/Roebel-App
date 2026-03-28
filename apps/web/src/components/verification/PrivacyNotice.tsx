/**
 * Privacy Notice Component
 *
 * Informs users about client-side encryption and GDPR compliance
 * for the citizen verification system.
 */

export interface PrivacyNoticeProps {
  variant?: "full" | "compact";
}

export function PrivacyNotice({ variant = "full" }: PrivacyNoticeProps) {
  if (variant === "compact") {
    return (
      <div className="bg-green-50 border border-green-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <div className="text-2xl flex-shrink-0">🔒</div>
          <div>
            <h3 className="font-medium text-green-900 text-sm mb-1">
              Deine Daten sind verschlüsselt
            </h3>
            <p className="text-sm text-green-800">
              Name und Adresse werden verschlüsselt gespeichert. Nur du kannst sie sehen.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-xl p-6">
      <div className="flex items-start gap-4 mb-4">
        <div className="text-4xl">🔒</div>
        <div>
          <h3 className="text-lg font-medium text-blue-900 mb-2">
            Datenschutz & Verschlüsselung
          </h3>
          <p className="text-sm text-blue-800 mb-3">
            Deine persönlichen Daten werden verschlüsselt und DSGVO-konform gespeichert.
          </p>
        </div>
      </div>

      <div className="space-y-3">
        <div className="bg-card rounded-lg p-4">
          <h4 className="font-medium text-blue-900 text-sm mb-2">
            ✓ Was wird verschlüsselt?
          </h4>
          <ul className="text-sm text-blue-800 space-y-1 ml-4">
            <li>• Dein vollständiger Name</li>
            <li>• Deine Wohnadresse</li>
          </ul>
        </div>

        <div className="bg-card rounded-lg p-4">
          <h4 className="font-medium text-blue-900 text-sm mb-2">
            ✓ Was ist öffentlich sichtbar?
          </h4>
          <ul className="text-sm text-blue-800 space-y-1 ml-4">
            <li>• Deine Begründung für den Antrag</li>
            <li>• Zeitstempel der Antragstellung</li>
            <li>• Deine Wallet-Adresse (0x...)</li>
          </ul>
        </div>

        <div className="bg-card rounded-lg p-4">
          <h4 className="font-medium text-blue-900 text-sm mb-2">
            ✓ Wie funktioniert die Verschlüsselung?
          </h4>
          <ul className="text-sm text-blue-800 space-y-1 ml-4">
            <li>• Verschlüsselung erfolgt lokal in deinem Browser</li>
            <li>• Nur du kannst deine Daten entschlüsseln (mit deiner Wallet)</li>
            <li>• Bescheiniger sehen nur verschlüsselte Daten</li>
            <li>• Persönliche Verifikation durch Vorzeigen deines Ausweises</li>
          </ul>
        </div>

        <div className="bg-card rounded-lg p-4">
          <h4 className="font-medium text-blue-900 text-sm mb-2">
            ✓ E-Mail & Wallet-Wiederherstellung
          </h4>
          <p className="text-sm text-blue-800">
            Deine E-Mail wird nur für die Wallet-Wiederherstellung verwendet (gespeichert von thirdweb).
            Keine persönlichen Daten werden auf der Blockchain gespeichert.
          </p>
        </div>
      </div>

      <div className="mt-4 p-3 bg-blue-100 rounded-lg">
        <p className="text-xs text-blue-900 font-medium">
          🛡️ DSGVO-konform: Keine persönlichen Daten werden unverschlüsselt gespeichert
        </p>
      </div>
    </div>
  );
}

/**
 * Compact privacy badge for inline display
 */
export function PrivacyBadge() {
  return (
    <div className="inline-flex items-center gap-2 px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm font-medium">
      <span>🔒</span>
      <span>Ende-zu-Ende verschlüsselt</span>
    </div>
  );
}

/**
 * Privacy tooltip for hover information
 */
export function PrivacyTooltip() {
  return (
    <div className="group relative inline-block">
      <button
        type="button"
        className="text-primary hover:text-primary/80 text-sm font-medium underline decoration-dotted"
      >
        Datenschutz-Info
      </button>
      <div className="hidden group-hover:block absolute z-10 w-64 p-3 bg-card border border-border rounded-lg shadow-lg bottom-full mb-2 left-1/2 transform -translate-x-1/2">
        <p className="text-xs text-foreground mb-2">
          <strong>Verschlüsselt:</strong> Name, Adresse
        </p>
        <p className="text-xs text-foreground mb-2">
          <strong>Öffentlich:</strong> Begründung, Zeitstempel, Wallet-Adresse
        </p>
        <p className="text-xs text-muted-foreground">
          Nur du kannst deine verschlüsselten Daten sehen.
        </p>
      </div>
    </div>
  );
}
