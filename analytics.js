// Statistiques d'usage anonymes (Amplitude) — module chargé à la demande par index.html.
// Vie privée : pas d'identifiant utilisateur, pas d'e-mail, pas de pseudo, pas de contenu de recette,
// pas d'adresse IP, pas de capture automatique des clics, formulaires ni des adresses de page.
// Sans clé ou si le SDK ne se charge pas, l'app fonctionne comme avant.
export async function initAnalytics() {
  let cfg, amp;
  try {
    cfg = await import("./analytics-config.js");
    if (!cfg.amplitudeApiKey) return null;
    amp = await import("./vendor/amplitude.min.js");
  } catch (e) {
    return null;
  }
  amp.init(cfg.amplitudeApiKey, {
    serverZone: cfg.amplitudeServerZone === "EU" ? "EU" : "US",
    autocapture: {
      sessions: true,
      attribution: false,
      pageViews: false,
      formInteractions: false,
      fileDownloads: false,
      elementInteractions: false,
      frustrationInteractions: false,
      pageUrlEnrichment: false,
      networkTracking: false,
      webVitals: false,
    },
    trackingOptions: { ipAddress: false },
    remoteConfig: { fetchRemoteConfig: false }, // réglages fixés ici, pas depuis le tableau de bord
    logLevel: 0,
  });
  return (name, props) => {
    try { amp.track(name, props); } catch (e) {}
  };
}
