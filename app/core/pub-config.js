// Publicité (AdMob) — réglages. Identifiants RideNCT réels (Android + iOS).
// testing: true  → Google envoie des pubs de TEST (aucun revenu, aucun risque pour le compte AdMob). À garder pendant les essais.
// testing: false → vraies pubs : à mettre UNIQUEMENT dans la version publiée (jamais cliquer sur ses propres pubs).
// Les identifiants d'application se règlent aussi pour le natif : npm run sync (patch-permissions.js les recopie).
const ADS_CONFIG = {
    testing: true,
    android: {
        appId: 'ca-app-pub-9944644498857137~3265961501',
        banner: 'ca-app-pub-9944644498857137/6321042246',
        interstitial: 'ca-app-pub-9944644498857137/5766508479'
    },
    ios: {
        appId: 'ca-app-pub-9944644498857137~5162718293',
        banner: 'ca-app-pub-9944644498857137/6668526601',
        interstitial: 'ca-app-pub-9944644498857137/4996352285'
    },
    startDelayMs: 3000,        // pause avant la pub de démarrage (après connexion, compte gratuit)
    minGapMs: 180000,          // 3 min minimum entre deux pubs plein écran
    minRideMs: 300000          // pas de pub de fin de sortie si la sortie a duré moins de 5 min
};
