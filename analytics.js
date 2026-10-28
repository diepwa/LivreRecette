// Statistiques d'usage (Amplitude) — module chargé à la demande par index.html.
// user_id = identifiant Firebase du compte (jamais l'e-mail ni le pseudo). Pas de contenu de recette,
// pas d'adresse IP, pas de capture automatique d'Amplitude (clics et écrans sont envoyés par index.html).
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
  return {
    track: (name, props) => { try { amp.track(name, props); } catch (e) {} },
    setUserId: (id) => { try { amp.setUserId(id || undefined); } catch (e) {} },
  };
}
