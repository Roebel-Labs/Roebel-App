/**
 * German translations for Röbel/Müritz DAO
 * All UI text in German
 */

export const de = {
  common: {
    loading: "Lädt...",
    error: "Fehler",
    success: "Erfolgreich",
    cancel: "Abbrechen",
    confirm: "Bestätigen",
    back: "Zurück",
    next: "Weiter",
    submit: "Absenden",
    save: "Speichern",
    delete: "Löschen",
    edit: "Bearbeiten",
    view: "Ansehen",
    close: "Schließen",
    copy: "Kopieren",
    copied: "Kopiert!",
    connectWallet: "Wallet verbinden",
    disconnectWallet: "Wallet trennen",
    noData: "Keine Daten",
    viewOnBlockExplorer: "Im Block-Explorer ansehen",
    transactionPending: "Transaktion wird verarbeitet...",
    transactionSuccess: "Transaktion erfolgreich!",
    transactionFailed: "Transaktion fehlgeschlagen",
    waitingForSignature: "Warte auf Signatur...",
  },

  navigation: {
    home: "Startseite",
    dashboard: "Dashboard",
    verification: "Verifizierung",
    proposals: "Vorschläge",
    admin: "Admin",
    backToDashboard: "← Zurück zum Dashboard",
  },

  verification: {
    title: "Bürgerverifizierung",
    subtitle: "Werde Teil der Röbel/Müritz DAO Community",
    description: "Das dezentrale Identitätssystem für verifizierte Gemeindemitglieder",

    // Status section
    yourStatus: "Dein Status",
    verificationStatus: "Verifizierungsstatus",
    isAttester: "Du bist Bescheiniger",
    isCitizen: "Du bist Bürger",
    notVerified: "Noch nicht verifiziert",
    pendingRequests: "Offene Anträge",
    yourRequests: "Deine Anträge",
    noRequests: "Keine offenen Anträge",

    // Request types
    attestationRequest: "Attestierungs-Antrag",
    revocationRequest: "Widerrufs-Antrag",
    attesterRequest: "Bescheiniger-Antrag",
    citizenRequest: "Bürger-Antrag",

    // Request status
    pending: "Ausstehend",
    approved: "Genehmigt",
    rejected: "Abgelehnt",
    executed: "Ausgeführt",

    // Actions
    requestCitizenNFT: "Bürger-Pass beantragen",
    requestAttesterNFT: "Bescheiniger-Pass beantragen",
    approveRequest: "Genehmigen",
    rejectRequest: "Ablehnen",
    viewRequest: "Antrag ansehen",
    viewAllRequests: "Alle Anträge ansehen",

    // Signatures
    signatures: "Unterschriften",
    signatureProgress: "Unterschriften-Fortschritt",
    signaturesRequired: "Benötigte Unterschriften",
    attesterSignatures: "Bescheiniger-Unterschriften",
    citizenSignatures: "Bürger-Unterschriften",
    youHaveSigned: "Du hast unterschrieben",
    youCanSign: "Du kannst unterschreiben",
    alreadySigned: "Bereits unterschrieben",

    // Signature counts
    requiresAttesterAndCitizen: "Benötigt: 1 Bescheiniger + 1 Bürger",
    requiresThreeAttesters: "Benötigt: 3 Bescheiniger",
    attesterAlsoCitizen: "Diese Person zählt für beide Rollen",

    // Request creation
    createRequest: "Antrag erstellen",
    requestCreated: "Antrag wurde erstellt",
    requestId: "Antrags-ID",
    requester: "Antragsteller",
    target: "Ziel-Adresse",
    evidence: "Nachweis",
    evidenceURI: "Nachweis-URI",
    uploadEvidence: "Nachweis hochladen",
    viewEvidence: "Nachweis ansehen",
    openOnIPFS: "Original auf IPFS öffnen",

    // Forms
    fullName: "Vollständiger Name",
    address: "Adresse in Röbel/Müritz",
    reason: "Grund für Antrag",
    reasonPlaceholder: "Beschreibe, warum du Mitglied werden möchtest...",
    uploadFile: "Datei hochladen",
    dragDropFile: "Datei hier ablegen oder klicken zum Auswählen",
    supportedFormats: "Unterstützte Formate: PDF, JPG, PNG",
    fileSelected: "Datei ausgewählt",
    uploadToIPFS: "Angaben bestätigen",
    ipfsHash: "IPFS Hash",

    // Steps
    steps: {
      checkEligibility: "Berechtigung prüfen",
      uploadEvidence: "Nachweis hochladen",
      createRequest: "Antrag erstellen",
      success: "Erfolgreich",
    },

    // Messages
    messages: {
      eligibilityChecking: "Prüfe Berechtigung...",
      alreadyHasNFT: "Du besitzt bereits diesen Pass",
      alreadyHasPendingRequest: "Du hast bereits einen ausstehenden Antrag",
      eligible: "Du bist berechtigt, einen Antrag zu stellen",
      uploadingToIPFS: "Bestätige Angaben...",
      ipfsUploadSuccess: "Angaben bestätigt",
      ipfsUploadFailed: "IPFS-Upload fehlgeschlagen",
      creatingRequest: "Erstelle Antrag...",
      requestCreatedSuccess: "Dein Antrag wurde erfolgreich erstellt!",
      waitingForSignatures: "Dein Antrag wartet auf Unterschriften",
      requestApproved: "Antrag genehmigt",
      requestRejected: "Antrag abgelehnt",
      nftMinted: "Pass wurde vergeben!",
      youAreNowCitizen: "Du bist jetzt ein verifizierter Bürger!",
      youAreNowAttester: "Du bist jetzt ein Bescheiniger!",
    },

    // Next steps
    nextSteps: "Nächste Schritte",
    nextStepsAfterRequest: [
      "Dein Antrag wartet auf Unterschriften",
      "Du wirst benachrichtigt, wenn er genehmigt wird",
      "Du kannst den Status in deinen Anträgen verfolgen",
    ],
    nextStepsAfterCitizenNFT: [
      "Delegiere deine Stimmrechte, um an Abstimmungen teilzunehmen",
      "Hilf bei der Verifizierung neuer Bürger-Anträge",
      "Nimm an Governance-Vorschlägen teil",
    ],

    // Attester role warning
    attesterRoleWarning: "⚠️ Bescheiniger-Rolle",
    attesterRoleDescription: "Als Bescheiniger hast du Verantwortung für die Community. Prüfe alle Anträge sorgfältig.",

    // View requests
    attesterRequests: "Bescheiniger-Anträge",
    citizenRequests: "Bürger-Anträge",
    allRequests: "Alle Anträge",
    filterByStatus: "Nach Status filtern",
    filterByType: "Nach Typ filtern",

    // Empty states
    noAttesterRequests: "Keine Bescheiniger-Anträge",
    noCitizenRequests: "Keine Bürger-Anträge",
    beFirstToApply: "Sei der Erste, der sich bewirbt!",
  },

  proposals: {
    title: "Vorschläge",
    subtitle: "Community Governance Vorschläge",
    createProposal: "Vorschlag erstellen",
    allProposals: "Alle Vorschläge",
    activeProposals: "Aktive Vorschläge",
    noProposals: "Noch keine Vorschläge",
    createFirstProposal: "Ersten Vorschlag erstellen",

    // Proposal states
    pending: "Ausstehend",
    active: "Aktiv",
    canceled: "Abgebrochen",
    defeated: "Abgelehnt",
    succeeded: "Angenommen",
    queued: "In Warteschlange",
    expired: "Abgelaufen",
    executed: "Ausgeführt",

    // Proposal details
    proposalNumber: "Vorschlag",
    proposer: "Ersteller",
    description: "Beschreibung",
    actions: "Aktionen",
    votes: "Stimmen",
    votingPeriod: "Abstimmungszeitraum",
    votingEnds: "Abstimmung endet",
    votingStarted: "Abstimmung begonnen",
    quorum: "Quorum",
    quorumReached: "Quorum erreicht",
    quorumNotReached: "Quorum nicht erreicht",

    // Voting
    vote: "Abstimmen",
    voteFor: "Dafür stimmen",
    voteAgainst: "Dagegen stimmen",
    voteAbstain: "Enthalten",
    yourVote: "Deine Stimme",
    votedFor: "Du hast dafür gestimmt",
    votedAgainst: "Du hast dagegen gestimmt",
    votedAbstain: "Du hast dich enthalten",
    hasVoted: "Hat abgestimmt",
    votingPower: "Stimmgewicht",
    totalVotes: "Gesamtstimmen",
    forVotes: "Dafür",
    againstVotes: "Dagegen",
    abstainVotes: "Enthaltungen",

    // Create proposal
    createProposalForm: {
      title: "Neuen Vorschlag erstellen",
      subtitle: "Nur Bescheiniger können Vorschläge erstellen",
      notAttester: "Du musst ein Bescheiniger sein, um Vorschläge zu erstellen",

      basicInfo: "Basis-Informationen",
      proposalTitle: "Titel",
      proposalTitlePlaceholder: "Z.B. Community Event finanzieren",
      proposalDescription: "Beschreibung",
      proposalDescriptionPlaceholder: "Beschreibe deinen Vorschlag ausführlich...",
      category: "Kategorie",

      categories: {
        finance: "Finanzen",
        events: "Veranstaltungen",
        infrastructure: "Infrastruktur",
        other: "Sonstiges",
      },

      onChainActions: "On-Chain Aktionen",
      addAction: "Aktion hinzufügen",
      removeAction: "Entfernen",
      noActions: "Keine Aktionen (nur Diskussion)",
      targetAddress: "Ziel-Adresse",
      targetAddressPlaceholder: "0x...",
      ethAmount: "ETH-Betrag",
      ethAmountPlaceholder: "0",
      calldata: "Funktionsaufruf (optional)",
      calldataPlaceholder: "0x...",

      preview: "Vorschau",
      estimatedGas: "Geschätzte Gas-Kosten",
      submitProposal: "Vorschlag absenden",
      proposalCreated: "Vorschlag erstellt!",
      viewProposal: "Vorschlag ansehen",
    },

    // Execution
    executeProposal: "Vorschlag ausführen",
    executionWarning: "Dies wird die On-Chain Aktionen ausführen",
    proposalExecuted: "Vorschlag wurde ausgeführt",

    // Info box
    howVotingWorks: "So funktioniert die Abstimmung",
    votingInfo: [
      "Vorschläge haben eine Wartezeit, bevor die Abstimmung beginnt",
      "Die Dauer der Abstimmungsperiode wird durch Governance-Parameter festgelegt",
      "Jeder Pass, den du hältst, repräsentiert eine Stimme",
      "Erfolgreiche Vorschläge können ausgeführt werden",
    ],

    // Loading states
    loadingProposals: "Lade Vorschläge...",
    loadingProposalDetails: "Lade Vorschlagsdetails...",
    creatingProposal: "Erstelle Vorschlag...",
    castingVote: "Stimme wird abgegeben...",
    executingProposal: "Führe Vorschlag aus...",
  },

  admin: {
    title: "Admin Panel",
    subtitle: "Verifizierungssystem-Verwaltung",
    onlyOwner: "Nur der Contract-Owner kann auf diesen Bereich zugreifen",

    // Statistics
    statistics: "Statistiken",
    totalAttesters: "Gesamt Bescheiniger",
    totalCitizens: "Gesamt Bürger",
    pendingAttesterRequests: "Ausstehende Bescheiniger-Anträge",
    pendingCitizenRequests: "Ausstehende Bürger-Anträge",

    // Bootstrap
    bootstrap: "System-Initialisierung",
    bootstrapRequired: "Initialisierung erforderlich",
    bootstrapDescription: "Vergebe Pässe an die ersten 3 Gründungsmitglieder",
    foundingMember: "Gründungsmitglied",
    foundingMemberAddress: "Adresse des Gründungsmitglieds",
    mintAttesterNFT: "Bescheiniger-Pass vergeben",
    mintCitizenNFT: "Bürger-Pass vergeben",
    bootstrapComplete: "System erfolgreich initialisiert!",

    // Tables
    allAttesterRequests: "Alle Bescheiniger-Anträge",
    allCitizenRequests: "Alle Bürger-Anträge",
    requestId: "ID",
    target: "Ziel",
    type: "Typ",
    status: "Status",
    signatures: "Unterschriften",
    actions: "Aktionen",

    // Pagination
    page: "Seite",
    of: "von",
    perPage: "pro Seite",
  },

  errors: {
    generic: "Ein Fehler ist aufgetreten",
    walletNotConnected: "Wallet nicht verbunden",
    networkError: "Netzwerkfehler",
    transactionFailed: "Transaktion fehlgeschlagen",
    insufficientFunds: "Unzureichende Mittel",
    userRejected: "Benutzer hat Transaktion abgelehnt",
    contractError: "Contract-Fehler",
    ipfsError: "IPFS-Fehler",
    loadingDataFailed: "Fehler beim Laden der Daten",
    invalidAddress: "Ungültige Adresse",
    invalidInput: "Ungültige Eingabe",
    unauthorized: "Nicht autorisiert",
  },
};

export type Translation = typeof de;
