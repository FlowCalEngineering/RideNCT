// Textes juridiques de RideNCT (CGU, CGV, mentions légales, politique de confidentialité) — source : documents de l'éditeur.
// Pour modifier un texte : éditer ici. Si les CGU changent, modifier aussi `version` de « cgu » : tous les comptes devront ré-accepter au lancement suivant.
// Format : [libellé](url) = lien ; [libellé](app:cgu|cgv|mentions|confidentialite) = ouvre un autre document dans l'appli ; **gras** ; { ul: [...] } = liste à puces ; sub:true = sous-titre.
const LEGAL_TEXTS = {
 "cgu": {
  "version": "2026-11-18.1",
  "title": "Conditions d'utilisation",
  "date": "18 novembre 2026",
  "sections": [
   {
    "n": 1,
    "t": "Objet",
    "p": [
     "Les présentes conditions générales d'utilisation (« CGU ») définissent les règles d'accès et d'usage de l'application mobile RideNCT (« l'Application ») et du site web RideNCT (« le Site »), édités par François PICHON, entrepreneur individuel exerçant sous le nom FlowCal Engineering (« l'Éditeur »). Ses coordonnées figurent dans les [mentions légales](app:mentions). « L'Utilisateur » désigne toute personne qui utilise l'Application ou le Site."
    ]
   },
   {
    "n": 2,
    "t": "Acceptation et évolution des CGU",
    "p": [
     "L'Utilisateur accepte les CGU en cochant la case prévue à la création de son compte, et en continuant à utiliser l'Application ou le Site. L'Éditeur peut modifier les CGU. Les Utilisateurs en sont informés dans l'Application ou sur le Site, et doivent accepter la nouvelle version pour continuer à utiliser les services. Pour toute modification importante, un délai raisonnable est laissé avant son entrée en vigueur.",
     "Le service est réservé aux personnes âgées d'au moins 15 ans."
    ]
   },
   {
    "n": 3,
    "t": "Description du service",
    "p": [
     "RideNCT est une application communautaire dédiée aux motards. Elle propose des fonctions de navigation et de cartographie, de communication vocale, de partage d'itinéraires et de musique, de gestion de véhicules (Atelier, garage) et de sécurité. Le Site présente l'Application, permet de gérer son compte et propose un planificateur d'itinéraire. L'Application est proposée sur Android. Sur iPhone, elle est d'abord disponible sous forme d'application web installable (PWA), en attendant l'application iOS."
    ]
   },
   {
    "n": 4,
    "t": "Compte",
    "p": [
     "Un compte est nécessaire pour utiliser l'Application, en version gratuite comme complète. Il sert à gérer l'abonnement de l'Utilisateur et à faire fonctionner les fonctions communautaires (pseudo, amis, invitations, événements, signalements). Le planificateur du Site peut être utilisé sans compte.",
     {
      "ul": [
       "L'Utilisateur fournit une adresse e-mail valide et choisit un nom d'utilisateur qui respecte les règles de la section 14. Certains noms sont refusés automatiquement.",
       "Le compte est personnel. L'Utilisateur garde ses identifiants confidentiels et prévient l'Éditeur en cas d'usage frauduleux.",
       "L'Utilisateur peut supprimer son compte à tout moment depuis la page [Mon compte](https://ridenct.fr/compte.html)."
      ]
     }
    ]
   },
   {
    "n": 5,
    "t": "Version gratuite et abonnement",
    "p": [
     "Une partie des fonctions est gratuite ; la version gratuite de l'Application comprend de la publicité (voir la [politique de confidentialité](app:confidentialite)). La version complète est proposée par abonnement, mensuel ou annuel au choix, aux tarifs indiqués sur la page [Tarifs](https://ridenct.fr/tarifs.html) et dans l'Application. Dans l'Application, l'abonnement est souscrit et payé par l'intermédiaire de Google Play ou de l'App Store. Un essai gratuit peut être proposé ; il est alors indiqué avant la souscription. L'abonnement débloque notamment le radar amis, la carte en mode expert, l'intercom en groupe, le partage d'itinéraire et de musique, le mode rencontre, le garage à plusieurs motos, les cartes hors ligne et les thèmes visuels, et supprime la publicité. L'Éditeur peut faire évoluer le contenu de chaque offre, sans retirer à un abonné en cours de période une fonction pour laquelle il a payé.",
     "Les conditions de vente de l'abonnement (prix, paiement, durée, renouvellement, résiliation, rétractation, médiateur) sont dans les [conditions générales de vente](app:cgv), à accepter avant tout paiement. L'Éditeur peut aussi offrir un accès complet pour une durée limitée."
    ]
   },
   {
    "n": 6,
    "t": "Sécurité routière et responsabilité de l'Utilisateur",
    "p": [
     "L'Application doit être utilisée dans le strict respect du Code de la route. L'Utilisateur est seul responsable de sa conduite. L'Application est une aide à la conduite et à la vie de la communauté, elle ne doit jamais détourner son attention. Elle se manipule à l'arrêt ou avec des commandes adaptées à la conduite à moto. L'Éditeur ne peut pas être tenu responsable d'un accident résultant d'une conduite ou d'une utilisation de l'Application contraire à ces règles, dans les limites de la section 17."
    ]
   },
   {
    "n": 7,
    "t": "Navigation et signalements communautaires",
    "p": [
     "L'Application propose des cartes (MapLibre, données OpenStreetMap), des bibliothèques de roadbooks et des signalements de danger (verglas, gravillons, accident, etc.) et d'événements renseignés par les Utilisateurs. Ces informations sont fournies à titre indicatif : l'Éditeur ne garantit ni leur exactitude, ni leur exhaustivité, ni leur mise à jour en temps réel. L'absence d'un signalement ne signifie pas l'absence de danger. Un itinéraire proposé, y compris en mode expert, ne dispense pas l'Utilisateur de vérifier les conditions réelles de la route et de la signalisation."
    ]
   },
   {
    "n": 8,
    "t": "Communication vocale : intercom et mode rencontre",
    "p": [
     "L'Application permet la communication vocale en groupes privés ou publics et, avec le mode rencontre, la mise en relation vocale avec d'autres Utilisateurs situés à proximité. L'Utilisateur choisit d'activer ces modes et peut les quitter à tout moment. Il s'engage à rester respectueux : les propos injurieux, discriminatoires, diffamatoires, menaçants ou illégaux sont interdits. L'Éditeur ne contrôle pas le contenu des échanges vocaux en direct."
    ]
   },
   {
    "n": 9,
    "t": "Partage de musique et droits d'auteur",
    "p": [
     "L'Application permet d'écouter de la musique stockée sur l'appareil ou accessible par un lien de partage, et de la partager avec d'autres Utilisateurs via l'intercom. L'Utilisateur s'engage à ne partager que des contenus libres de droits ou pour lesquels il détient les droits nécessaires à leur diffusion. L'Éditeur ne stocke pas les fichiers audio : le flux transite d'appareil à appareil. L'Utilisateur est seul responsable des contenus qu'il partage et de leur licéité vis-à-vis des titulaires de droits."
    ]
   },
   {
    "n": 10,
    "t": "Géolocalisation, radar et profil",
    "p": [
     "Certaines fonctions reposent sur la géolocalisation de l'appareil, avec l'autorisation de l'Utilisateur.",
     {
      "ul": [
       "**Radar global et radar amis :** l'Utilisateur choisit d'être visible par les motards situés à environ 300 mètres, ou seulement par ses amis. Il peut désactiver sa visibilité à tout moment dans les réglages.",
       "**Croisement de profils :** lors d'un croisement, des éléments de profil (bio, liens vers des réseaux sociaux, garage) peuvent être partagés selon les paramètres de confidentialité choisis. L'Utilisateur est seul responsable des informations et des liens qu'il décide d'afficher."
      ]
     }
    ]
   },
   {
    "n": 11,
    "t": "Détection de chute et alertes",
    "p": [
     "La fonction de sécurité peut détecter une chute probable, alerter les motards utilisant l'Application dans un rayon d'environ 1 km, appeler en premier un contact d'urgence choisi par l'Utilisateur, et préparer l'envoi de messages (SMS) avec la position GPS à des proches choisis, accompagnés, si l'Utilisateur l'a activé, de ses informations médicales (groupe sanguin, allergies, traitements…) qu'il a saisies dans l'Application. L'alerte n'est envoyée qu'à l'issue d'un compte à rebours resté sans réponse.",
     "**Avertissement important :** cette fonction est un outil d'entraide et de confort. Elle ne remplace en aucun cas les services de secours (112, 15, 18). La détection dépend des capteurs du téléphone et la réception des alertes dépend du réseau mobile : l'Éditeur ne garantit ni la détection de toutes les chutes, ni la réception des alertes par la communauté ou par les proches. En cas d'accident, l'Utilisateur ou un témoin doit appeler les secours."
    ]
   },
   {
    "n": 12,
    "t": "Atelier et documents",
    "p": [
     "La section Atelier permet de suivre l'entretien de la moto et de conserver des documents numériques liés au véhicule. Ces données restent sur l'appareil de l'Utilisateur : il lui appartient de les sauvegarder, par exemple avec la fonction d'export, et de conserver les originaux de ses documents officiels. L'Éditeur ne peut être tenu responsable d'une perte de données stockées sur l'appareil, dans les limites de la section 17."
    ]
   },
   {
    "n": 13,
    "t": "Site web et planificateur",
    "p": [
     "Le planificateur calcule des itinéraires à partir de services tiers et des données OpenStreetMap (© contributeurs OpenStreetMap, licence ODbL). Les résultats (tracé, virages, altitude, météo) sont indicatifs et peuvent contenir des erreurs. L'Utilisateur vérifie l'itinéraire avant de rouler. Le fonctionnement du planificateur est décrit dans la [politique de confidentialité](app:confidentialite)."
    ]
   },
   {
    "n": 14,
    "t": "Règles d'usage, modération et suspension",
    "p": [
     "Il est interdit de :",
     {
      "ul": [
       "choisir un nom d'utilisateur injurieux, haineux, trompeur ou usurpant l'identité d'un tiers ;",
       "publier de faux signalements, ou détourner les votes de confirmation ;",
       "harceler, menacer ou insulter un autre Utilisateur, ou diffuser un contenu illégal ;",
       "perturber le service, contourner ses limites techniques ou tenter d'accéder à des données qui ne sont pas les siennes ;",
       "revendre l'accès à l'Application ou partager son compte."
      ]
     },
     "Un Utilisateur peut en signaler un autre depuis l'Application. En cas de manquement, l'Éditeur peut supprimer un contenu, suspendre un compte ou un appareil, ou supprimer le compte, avec ou sans abonnement en cours, sans préjudice d'autres recours. Quand c'est possible, le motif est communiqué et l'Utilisateur peut contester la décision via la page [Contact](https://ridenct.fr/contact.html). Pour signaler un contenu manifestement illicite, utiliser la même page en précisant le contenu concerné."
    ]
   },
   {
    "n": 15,
    "t": "Disponibilité du service",
    "p": [
     "L'Éditeur s'efforce d'assurer un accès continu au service, mais ne garantit pas une disponibilité permanente. Des maintenances, des pannes de réseau ou des pannes des services tiers (cartographie, hébergement, serveurs de mise en relation des appareils) peuvent entraîner des interruptions. Les fonctions de pair à pair (radar, intercom) dépendent de la qualité du réseau des appareils et de services tiers (serveur de messagerie public EMQX, serveurs STUN de Google et Cloudflare, relais Metered), décrits dans la [politique de confidentialité](app:confidentialite). L'Éditeur peut faire évoluer, suspendre ou arrêter une fonction pour des raisons techniques, légales ou de sécurité."
    ]
   },
   {
    "n": 16,
    "t": "Propriété intellectuelle",
    "p": [
     "L'Application, le Site, le nom RideNCT, son logo, les textes, les visuels et le code sont la propriété de l'Éditeur ou de ses concédants. L'Utilisateur reçoit un droit d'usage personnel, non exclusif et non transférable, pour la durée d'utilisation du service. Toute reproduction, extraction ou revente non autorisée est interdite. L'Utilisateur garde ses droits sur les contenus qu'il crée (nom, biographie, signalements) et accorde à l'Éditeur le droit de les afficher aux autres Utilisateurs pour faire fonctionner le service."
    ]
   },
   {
    "n": 17,
    "t": "Responsabilité",
    "p": [
     "Dans les limites autorisées par la loi, l'Éditeur n'est responsable que des dommages directs résultant d'un manquement à ses obligations, et n'est pas responsable des contenus publiés par les Utilisateurs, ni des dommages causés par une utilisation contraire aux CGU, ni de ceux liés au dysfonctionnement des réseaux, des appareils ou des services tiers. Rien dans les CGU n'exclut ni ne limite la responsabilité de l'Éditeur en cas de dommage corporel, de faute lourde ou de dol, ni les droits que la loi reconnaît aux consommateurs."
    ]
   },
   {
    "n": 18,
    "t": "Données personnelles",
    "p": [
     "Les données personnelles sont traitées conformément au RGPD, comme détaillé dans la [politique de confidentialité](app:confidentialite). L'Utilisateur peut exercer ses droits d'accès, de rectification, d'effacement, de portabilité et d'opposition depuis la page [Mon compte](https://ridenct.fr/compte.html) ou via la page [Contact](https://ridenct.fr/contact.html)."
    ]
   },
   {
    "n": 19,
    "t": "Droit applicable et litiges",
    "p": [
     "Les CGU sont soumises au droit français. En cas de litige, l'Utilisateur peut d'abord contacter l'Éditeur via la page [Contact](https://ridenct.fr/contact.html) pour rechercher une solution amiable. L'Utilisateur consommateur peut recourir gratuitement à un médiateur de la consommation, le **CM2C** (Centre de la médiation de la consommation de conciliateurs de justice), 49 rue de Ponthieu, 75008 Paris, [www.cm2c.net](https://www.cm2c.net), [contact@cm2c.net](mailto:contact@cm2c.net), 01 89 47 00 14. À défaut d'accord, les tribunaux français sont compétents, sans préjudice des règles de compétence protectrices du consommateur.",
     "![Médiateur de la consommation CM2C](img:mediateur-cm2c)"
    ]
   }
  ]
 },
 "cgv": {
  "version": "2026-11-18.1",
  "title": "Conditions générales de vente",
  "date": "18 novembre 2026",
  "sections": [
   {
    "n": 1,
    "t": "Vendeur",
    "p": [
     "François PICHON, entrepreneur individuel exerçant sous le nom FlowCal Engineering (SIREN 107 094 708), La Furetais, 44130 Bouvron, France. Contact : page [Contact](https://ridenct.fr/contact.html). Voir aussi les [mentions légales](app:mentions). Les présentes conditions s'appliquent aux abonnements pris sur le site ; l'utilisation de l'application reste soumise aux [conditions d'utilisation](app:cgu)."
    ]
   },
   {
    "n": 2,
    "t": "Offre",
    "p": [
     "Un abonnement, mensuel ou annuel au choix, donne accès à toutes les fonctions de la version complète de RideNCT (radar amis, carte en mode expert, intercom en groupe, partage d'itinéraire et de musique, mode rencontre, garage à plusieurs motos, cartes hors ligne, thèmes visuels, sans publicité), tant qu'il est actif. Les deux formules donnent exactement les mêmes fonctions. Un compte RideNCT est nécessaire. La version gratuite reste disponible sans abonnement."
    ]
   },
   {
    "n": 3,
    "t": "Prix",
    "p": [
     "Formule mensuelle : 2,99 € par mois. Formule annuelle : 24,99 € par an. TVA non applicable, article 293 B du Code général des impôts. Le prix affiché est le prix payé. Le prix peut évoluer ; tout changement est annoncé à l'avance et ne s'applique qu'au renouvellement suivant, avec la possibilité de résilier avant."
    ]
   },
   {
    "n": 4,
    "t": "Paiement",
    "p": [
     "Paiement immédiat à la souscription puis à chaque échéance (chaque mois ou chaque année selon la formule), par prélèvement automatique. Sur le site, le paiement par carte bancaire est traité par Stripe, via RevenueCat ; dans l'application, il est débité sur ton compte Google Play ou Apple par la boutique correspondante. Le vendeur ne conserve aucun numéro de carte.",
     "**Essai gratuit.** Lorsqu'un essai gratuit est proposé (par exemple 7 jours), il est indiqué avant la souscription. Aucun montant n'est débité pendant l'essai ; l'abonnement payant démarre ensuite automatiquement au prix de la formule choisie, sauf si tu résilies avant la fin de l'essai. Un seul essai gratuit par compte boutique."
    ]
   },
   {
    "n": 5,
    "t": "Durée, renouvellement et résiliation",
    "p": [
     "L'abonnement est conclu pour un mois ou pour un an selon la formule choisie, et se renouvelle tacitement à chaque échéance jusqu'à résiliation. Tu peux résilier à tout moment, sans frais ni préavis : directement depuis la page [Mon compte](https://ridenct.fr/compte.html) du site (bouton « Résilier votre contrat », lien également présent en bas de chaque page), ou en écrivant via la page [Contact](https://ridenct.fr/contact.html). La résiliation prend effet à la fin de la période déjà payée, pendant laquelle l'accès reste complet. Aucun remboursement au prorata n'est dû pour la période en cours, sauf rétractation (article 6). Pour un abonnement souscrit dans l'application, la résiliation et les remboursements se gèrent aussi depuis ton compte Google Play ou Apple."
    ]
   },
   {
    "n": 6,
    "t": "Droit de rétractation",
    "p": [
     "Tu disposes de 14 jours à compter de la souscription pour te rétracter, sans donner de motif, en l'indiquant clairement via la page [Contact](https://ridenct.fr/contact.html). Comme l'accès au service est immédiat à ta demande, expressément formulée en cochant la case prévue avant le paiement, tu paies, en cas de rétractation, un montant proportionnel à la part du service déjà fournie jusqu'à ta demande ; le reste est remboursé, sur le moyen de paiement utilisé, au plus tard 14 jours après ta demande.",
     "**Modèle de formulaire de rétractation**",
     "À l'attention de François PICHON (FlowCal Engineering), La Furetais, 44130 Bouvron, France, via la page [Contact](https://ridenct.fr/contact.html) ou à FlowCal_Engineering@outlook.fr :",
     "Je vous notifie par la présente ma rétractation du contrat portant sur la prestation de services ci-dessous : abonnement RideNCT (mensuel / annuel).",
     "Commandé le : ………",
     "Nom : ………",
     "Adresse e-mail du compte RideNCT : ………",
     "Date : ………"
    ]
   },
   {
    "n": 7,
    "t": "Fourniture du service",
    "p": [
     "L'accès est activé en quelques instants après le paiement. En l'absence d'activation, écris via la page [Contact](https://ridenct.fr/contact.html). Les abonnements pris sur Google Play ou l'App Store relèvent de leurs propres conditions et de leur propre gestion."
    ]
   },
   {
    "n": 8,
    "t": "Garanties",
    "p": [
     "Le vendeur répond de la conformité du service numérique et des défauts éventuels, selon les articles L224-25-1 et suivants du Code de la consommation."
    ]
   },
   {
    "n": 9,
    "t": "Données personnelles",
    "p": [
     "Voir la [politique de confidentialité](app:confidentialite)."
    ]
   },
   {
    "n": 10,
    "t": "Litiges",
    "p": [
     "Droit français. Écris d'abord via la page [Contact](https://ridenct.fr/contact.html) pour chercher une solution amiable. Tu peux ensuite recourir gratuitement au médiateur de la consommation : **CM2C** (Centre de la médiation de la consommation de conciliateurs de justice), 49 rue de Ponthieu, 75008 Paris, [www.cm2c.net](https://www.cm2c.net), [contact@cm2c.net](mailto:contact@cm2c.net), 01 89 47 00 14. Tu peux déclarer ton litige directement sur la plate-forme CM2C.",
     "![Médiateur de la consommation CM2C](img:mediateur-cm2c)"
    ]
   }
  ]
 },
 "mentions": {
  "version": "2026-11-17.2",
  "title": "Mentions légales",
  "date": "",
  "sections": [
   {
    "n": 0,
    "t": "Éditeur du site",
    "p": [
     "François PICHON, entrepreneur individuel, exerçant sous le nom commercial **FlowCal Engineering**.",
     {
      "ul": [
       "SIREN : 107 094 708 · SIRET : 107 094 708 00016",
       "Activité : édition et développement de logiciels (code APE 5829C)",
       "Adresse : La Furetais, 44130 Bouvron, France",
       "TVA : non applicable, article 293 B du CGI (franchise en base)",
       "Directeur de la publication : François PICHON",
       "Statut : entrepreneur individuel (EI)",
       "Contact : e-mail : [FlowCal_Engineering@outlook.fr](mailto:FlowCal_Engineering@outlook.fr) · téléphone : 07 88 78 85 90 · formulaire de la page [Contact](https://ridenct.fr/contact.html)"
      ]
     }
    ]
   },
   {
    "n": 0,
    "t": "Hébergement",
    "p": [
     "Site : GitHub, Inc. (GitHub Pages), 88 Colin P. Kelly Jr. Street, San Francisco, CA 94107, États-Unis.",
     "**Comptes, liste d'attente et messages :** Supabase, base de données hébergée dans l'Union européenne (Irlande).",
     "**Envoi des e-mails (confirmation de compte, mot de passe oublié) :** Resend, Inc. (États-Unis)."
    ]
   },
   {
    "n": 0,
    "t": "Propriété intellectuelle",
    "p": [
     "Le nom RideNCT, son logo, les textes, illustrations et le code de ce site sont la propriété de l'éditeur. Toute reproduction sans autorisation est interdite. Les cartes sont fournies par OpenStreetMap (© contributeurs OpenStreetMap)."
    ]
   },
   {
    "n": 0,
    "t": "Confidentialité",
    "p": [
     "Le détail des données conservées, des services utilisés et de tes droits est sur la page [Politique de confidentialité](app:confidentialite)."
    ]
   },
   {
    "n": 0,
    "t": "Droits",
    "p": [
     "Conformément au RGPD, tu peux demander l'accès, la rectification ou la suppression de tes données en écrivant via la page contact."
    ]
   }
  ]
 },
 "confidentialite": {
  "version": "2026-11-18.1",
  "title": "Politique de confidentialité",
  "date": "18 novembre 2026",
  "sections": [
   {
    "n": 0,
    "t": "Qui est responsable de tes données",
    "p": [
     "François PICHON, entrepreneur individuel exerçant sous le nom FlowCal Engineering (SIREN 107 094 708), éditeur de RideNCT. Pour toute question ou demande sur tes données, utilise la page [Contact](https://ridenct.fr/contact.html). Les coordonnées complètes sont dans les [mentions légales](app:mentions)."
    ]
   },
   {
    "n": 0,
    "t": "En bref",
    "p": [
     {
      "ul": [
       "Aucun cookie de suivi ni outil de mesure d'audience sur le site. La version gratuite de l'application affiche de la publicité (Google AdMob) ; les abonnés n'en voient pas.",
       "Un compte est nécessaire pour utiliser l'application ; il sert à gérer ton abonnement et tes fonctions communautaires (pseudo, amis, événements, signalements).",
       "Ton profil, tes trajets et ton carnet restent sur ton téléphone. Seuls les circuits que tu choisis de partager sont envoyés à nos serveurs, et conservés jusqu'à ce que tu les supprimes.",
       "Tu peux télécharger tes données et supprimer ton compte toi-même depuis la page Mon compte."
      ]
     }
    ]
   },
   {
    "n": 0,
    "t": "Ce que nous conservons, pourquoi et combien de temps",
    "p": []
   },
   {
    "n": 0,
    "t": "Compte",
    "p": [
     "**Données :** adresse e-mail, nom d'utilisateur, mot de passe sous forme chiffrée (illisible, y compris pour nous), statut de l'abonnement (y compris un abonnement offert) et dates de création et de dernière connexion.",
     "**Pourquoi :** te permettre d'utiliser l'application, gratuite ou complète, et savoir si ton abonnement est actif. Base légale : exécution du service que tu demandes.",
     "**Durée :** jusqu'à la suppression de ton compte."
    ],
    "sub": true
   },
   {
    "n": 0,
    "t": "Application liée au compte",
    "p": [
     "**Données :** un identifiant anonyme de motard, relié à ton compte quand tu te connectes dans l'application, et la version des conditions d'utilisation que tu as acceptée avec sa date (preuve de ton acceptation).",
     "**Pourquoi :** traiter les signalements que tu fais ou dont tu fais l'objet. Base légale : intérêt légitime (sécurité de la communauté).",
     "**Durée :** supprimé avec le compte."
    ],
    "sub": true
   },
   {
    "n": 0,
    "t": "Signalements, modération et suspensions",
    "p": [
     "**Données :** si tu signales un motard : ton compte comme auteur, l'identifiant du motard signalé, le motif et ton commentaire (300 caractères au plus). Si tu signales un circuit : ton compte comme auteur du signalement. Un avertissement de la modération est lié au compte concerné. En cas d'abus : suspension d'un compte ou d'un appareil, avec son motif.",
     "**Pourquoi :** examiner les signalements et protéger la communauté. Base légale : intérêt légitime.",
     "**Durée :** un signalement est supprimé avec le compte de son auteur. Une suspension est conservée tant qu'elle est en vigueur."
    ],
    "sub": true
   },
   {
    "n": 0,
    "t": "Circuits partagés",
    "p": [
     "**Données :** uniquement quand tu publies un circuit : son titre, sa description, son niveau, sa distance, sa durée, sa région, son tracé (liste de points), ton nom d'utilisateur affiché comme auteur, le compte auteur et le nombre de téléchargements. Tes autres trajets ne sont jamais envoyés.",
     "**Pourquoi :** les rendre visibles et téléchargeables par les autres motards. Base légale : ton consentement, donné en publiant le circuit.",
     "**Durée :** jusqu'à ce que tu supprimes le circuit depuis l'application, ou que tu supprimes ton compte. Un circuit peut aussi être retiré par la modération s'il enfreint les [conditions d'utilisation](app:cgu) ou s'il reçoit trop de signalements. Un circuit téléchargé par un autre motard reste sur son téléphone."
    ],
    "sub": true
   },
   {
    "n": 0,
    "t": "Alertes de danger et événements",
    "p": [
     "**Données :** position et type de l'alerte ou de l'événement, avec un identifiant d'appareil aléatoire (sans lien avec ton identité).",
     "**Durée :** suppression automatique à l'expiration : 7 jours après le départ d'une balade (événement), 2 heures pour un accident ou un animal, 24 heures pour les autres dangers (jusqu'à 48 heures au plus si d'autres motards confirment l'alerte). Une trace anonymisée (type d'alerte, zone arrondie à une dizaine de kilomètres, nombre de confirmations) est gardée 400 jours au plus pour mesurer la qualité du service."
    ],
    "sub": true
   },
   {
    "n": 0,
    "t": "Liste d'attente",
    "p": [
     "**Données :** ton adresse e-mail.",
     "**Pourquoi :** te prévenir de la sortie de l'application, rien d'autre. Base légale : ton consentement, donné en envoyant le formulaire.",
     "**Durée :** jusqu'à la sortie de l'application, puis suppression. Tu peux demander ta suppression à tout moment."
    ],
    "sub": true
   },
   {
    "n": 0,
    "t": "Sondage",
    "p": [
     "**Données :** tes réponses au sondage (type de moto, habitudes, besoins) et, si tu le souhaites, ton adresse e-mail pour la bêta.",
     "**Pourquoi :** comprendre les besoins des motards avant la sortie, et te prévenir pour la bêta si tu le demandes. Base légale : ton consentement, donné en envoyant le sondage. Les réponses ne sont pas liées à un compte.",
     "**Durée :** 12 mois au plus, puis suppression ou anonymisation. L'adresse e-mail est supprimée à la fin de la bêta."
    ],
    "sub": true
   },
   {
    "n": 0,
    "t": "Formulaire de contact",
    "p": [
     "**Données :** ton nom, ton adresse e-mail, le sujet et ton message.",
     "**Pourquoi :** te répondre. Base légale : intérêt légitime et mesures précontractuelles.",
     "**Durée :** 12 mois au plus après le dernier échange."
    ],
    "sub": true
   },
   {
    "n": 0,
    "t": "Protection contre les abus",
    "p": [
     "**Données :** une empreinte non réversible de ton adresse IP, avec le type d'action effectuée (inscription à la liste, message, vérification de nom d'utilisateur, code).",
     "**Pourquoi :** limiter le spam et les tentatives abusives. Base légale : intérêt légitime (sécurité du service).",
     "**Durée :** quelques jours au plus, puis suppression automatique."
    ],
    "sub": true
   },
   {
    "n": 0,
    "t": "Radar, entraide, alerte de chute et intercom (application)",
    "p": [
     "**Données :** ta position approximative (par zone géographique) et les éléments de profil que tu choisis de montrer, quand tu actives le radar, une demande d'aide ou l'alerte de chute ; la voix de l'intercom. Ces fonctions ne s'activent qu'avec ton autorisation de géolocalisation, et tu peux les désactiver à tout moment dans l'application.",
     "**Alerte de chute et appel à l'aide :** l'alerte envoyée aux motards situés à environ 1 km contient ta position précise (à quelques mètres près), ton nom d'utilisateur affiché et l'heure. Tes contacts d'urgence et, si tu les renseignes, tes informations médicales (groupe sanguin, allergies, traitements, pathologies) sont enregistrés uniquement sur ton téléphone : ils ne servent qu'à préparer les SMS à tes contacts, que ton téléphone envoie, et à l'affichage sur l'écran verrouillé si tu l'actives.",
     "**Comment :** pour que les motards proches se trouvent et se mettent en relation, l'application échange de courts messages (balises de zone, invitations, négociation de la liaison, chiffrés et signés pour la mise en relation) par un serveur de messagerie MQTT, EMQX Cloud (EMQ, hébergé en Europe, accès protégé par identifiant). En cas d'indisponibilité, l'application peut utiliser un serveur MQTT public de secours (EMQX, broker.emqx.io). La voix de l'intercom et les données du radar passent ensuite directement de téléphone à téléphone (WebRTC). Si la liaison directe échoue, elles peuvent transiter, toujours chiffrées par WebRTC, par un serveur relais (TURN) de Cloudflare, auquel l'application accède avec des identifiants temporaires délivrés à ton compte connecté ; en secours, elles peuvent passer par un relais gratuit (Open Relay, Metered). Pour établir la liaison, l'application interroge des serveurs STUN de Google et de Cloudflare, qui reçoivent l'adresse IP de ton appareil, et vérifie la connexion réseau auprès de Google (gstatic.com) et de Cloudflare.",
     "**Conservation :** ces échanges ne sont pas enregistrés dans notre base de données et la voix n'est pas conservée par l'éditeur. L'éditeur ne maîtrise pas les serveurs tiers cités ci-dessus."
    ],
    "sub": true
   },
   {
    "n": 0,
    "t": "Journal d'administration et sauvegardes",
    "p": [
     "**Données :** les actions d'administration (suspension, suppression, abonnement offert…) sont inscrites dans un journal réservé à l'équipe, avec l'adresse e-mail du compte concerné. Des sauvegardes de la base (comptes, abonnements, messages de contact, liste d'attente, signalements) permettent de restaurer le service.",
     "**Durée :** le journal est conservé le temps nécessaire à la traçabilité des actions de modération, pour une durée proportionnée à cette finalité. Pour les sauvegardes, seules les 7 dernières sauvegardes automatiques et les 10 dernières sauvegardes manuelles sont gardées ; les plus anciennes sont effacées au fur et à mesure. Une donnée supprimée disparaît donc aussi des sauvegardes lors de leur renouvellement."
    ],
    "sub": true
   },
   {
    "n": 0,
    "t": "Paiement",
    "p": [
     "Les abonnements pris sur le site sont gérés par RevenueCat, Inc. (San Francisco, États-Unis) ; le paiement par carte est traité par Stripe Payments Europe, Ltd. (Irlande). **Données :** identifiant de ton compte RideNCT, adresse e-mail, produit souscrit, dates et statut de l'abonnement. Nous ne voyons ni ne conservons ton numéro de carte. **Base légale :** exécution du contrat. Les abonnements pris sur Google Play ou l'App Store sont traités par ces services. Des transferts hors Union européenne peuvent avoir lieu ; ils sont encadrés par les clauses contractuelles types ou le cadre de protection des données UE-États-Unis."
    ],
    "sub": true
   },
   {
    "n": 0,
    "t": "Publicité (version gratuite de l'application)",
    "p": [
     "**Données :** identifiant publicitaire de ton appareil, adresse IP et informations techniques, traités par Google AdMob (Google). Aucune donnée de ton compte RideNCT, ni ta position, ne leur est transmise par l'éditeur.",
     "**Pourquoi :** afficher des publicités dans la version gratuite (bannières et plein écran, jamais en roulant ni pendant un intercom). Base légale : ton consentement, demandé au premier lancement par un formulaire de consentement (sur iOS, autorisation de suivi). Dans l'Espace économique européen, la publicité n'est affichée qu'avec ce consentement.",
     "**Durée :** selon les règles de Google. Les abonnés ne voient aucune publicité."
    ],
    "sub": true
   },
   {
    "n": 0,
    "t": "Planificateur d'itinéraire",
    "p": [
     "Le planificateur calcule ton trajet en interrogeant des services cartographiques tiers. Les points que tu places (coordonnées) ou les lieux que tu cherches leur sont envoyés : OpenFreeMap (fond de carte), OpenStreetMap / Nominatim, Photon, Adresse.data.gouv.fr (recherche de lieux), OSRM, routing.openstreetmap.de et BRouter (calcul d'itinéraire), Open-Meteo (météo et altitude) et Overpass (points d'intérêt). Dans l'application, les prix des carburants viennent de data.economie.gouv.fr. Ces services reçoivent l'adresse IP de ton appareil, comme tout site web. Aucun itinéraire n'est enregistré sur nos serveurs. Le planificateur s'utilise sans compte."
    ]
   },
   {
    "n": 0,
    "t": "Cookies et stockage dans ton navigateur",
    "p": [
     "Ce site n'utilise aucun cookie de suivi. Il garde seulement dans ton navigateur ce qui est nécessaire à son fonctionnement, sans consentement requis : ta session de connexion, ton dernier itinéraire dans le planificateur et les annonces que tu as fermées. Tu peux les effacer à tout moment dans les réglages de ton navigateur."
    ]
   },
   {
    "n": 0,
    "t": "Qui reçoit tes données",
    "p": [
     {
      "ul": [
       "Supabase : base de données et connexion, hébergées dans l'Union européenne (Irlande).",
       "**GitHub (GitHub Pages)** : hébergement du site. GitHub, société américaine, reçoit l'adresse IP des visiteurs.",
       "**Services cartographiques** du planificateur, listés plus haut.",
       "**EMQX Cloud** (EMQ, serveur MQTT) et, en secours, le serveur MQTT public d'EMQX ; **Google** et **Cloudflare** (serveurs STUN) ; **Cloudflare** (relais TURN) et, en secours, **Metered** (relais Open Relay) : fonctions de proximité de l'application, voir plus haut.",
       "**Resend, Inc.** (États-Unis) : service d'envoi d'e-mails (confirmation de compte, mot de passe oublié). Il reçoit ton adresse e-mail pour t'envoyer ces messages.",
       "**Google (AdMob)** : publicité de la version gratuite de l'application, voir plus haut."
      ]
     },
     "Nous ne vendons ni ne louons aucune donnée. Certains de ces prestataires, comme GitHub, sont situés ou rattachés aux États-Unis : les transferts sont alors encadrés par les garanties prévues par le RGPD (notamment les clauses contractuelles types de la Commission européenne)."
    ]
   },
   {
    "n": 0,
    "t": "Sécurité",
    "p": [
     "Les échanges sont chiffrés (HTTPS), les mots de passe sont stockés sous forme chiffrée, et l'accès aux données est limité par des règles strictes : chaque utilisateur ne peut lire que ses propres informations. Aucun système n'étant infaillible, nous te préviendrions, ainsi que la CNIL, en cas de violation de données susceptible de te porter préjudice."
    ]
   },
   {
    "n": 0,
    "t": "Tes droits",
    "p": [
     "Tu peux à tout moment demander l'accès à tes données, leur rectification, leur effacement, la limitation ou l'opposition à leur traitement, et leur portabilité. Quand le traitement repose sur ton consentement (liste d'attente), tu peux le retirer. Tu peux aussi définir des directives sur le sort de tes données après ton décès.",
     {
      "ul": [
       "**Seul :** depuis la page [Mon compte](https://ridenct.fr/compte.html), télécharge tes données ou supprime ton compte.",
       "**Sur demande :** écris-nous via la page [Contact](https://ridenct.fr/contact.html) en précisant ta demande et l'adresse e-mail concernée. Nous répondons dans un délai d'un mois.",
       "**Réclamation :** si tu estimes que tes droits ne sont pas respectés, tu peux saisir la CNIL ([cnil.fr/plaintes](https://www.cnil.fr/fr/plaintes))."
      ]
     },
     "Nous ne prenons aucune décision automatisée produisant d'effet sur toi."
    ]
   },
   {
    "n": 0,
    "t": "Modifications",
    "p": [
     "Cette politique peut évoluer. La date de dernière mise à jour est indiquée en haut de la page."
    ]
   }
  ]
 }
};
