/* COMPRÉHENSION DES COMMANDES VOCALES — « petite IA » embarquée (aucun serveur, tout se passe sur le téléphone).
   VoiceNLU.parse(texte) → { intent, ... } ou null si la phrase n'est pas comprise.
   Principe : phrase nettoyée (accents, politesses, hésitations) → recherche d'intentions par familles de mots
   (synonymes) avec tolérance aux erreurs de reconnaissance (distance d'édition) → extraction du « slot » (destination, catégorie).
   Intentions : nav_to{dest} · nearest{cat} · zoom_in · zoom_out · recenter · stop_nav · eta · remaining · weather · yes · no · pick{n} */
const VoiceNLU = {
    // Catégories de lieux « le plus proche » : mots déclencheurs, libellé, recherche Photon (osm_tag) et terme de repli
    CATS: {
        cafe: { label: 'Café', words: ['cafe', 'cafes', 'cafeteria', 'soif', 'boire', 'salon de the', 'un caf'], tags: ['amenity:cafe', 'amenity:bar', 'amenity:pub'], q: 'café' },
        resto: { label: 'Restaurant', words: ['resto', 'restos', 'restau', 'restaurant', 'restaurants', 'manger', 'faim', 'dejeuner', 'diner', 'pizzeria', 'brasserie', 'fast food', 'burger', 'sandwich', 'casse croute'], tags: ['amenity:restaurant', 'amenity:fast_food'], q: 'restaurant' },
        fuel: { label: 'Station-service', words: ['essence', 'carburant', 'carbu', 'station', 'stations', 'gasoil', 'gazole', 'diesel', 'sans plomb', 'reservoir', 'panne seche', 'le plein', 'faire le plein', 'sp95', 'sp98', 'e10'], tags: ['amenity:fuel'], q: 'station service' },
        parking: { label: 'Parking', words: ['parking', 'parkings', 'stationner', 'me garer', 'garer', 'stationnement'], tags: ['amenity:parking'], q: 'parking' },
        pharmacie: { label: 'Pharmacie', words: ['pharmacie', 'pharmacies'], tags: ['amenity:pharmacy'], q: 'pharmacie' },
        hopital: { label: 'Hôpital', words: ['hopital', 'hopitaux', 'urgences', 'urgence', 'clinique', 'medecin'], tags: ['amenity:hospital', 'amenity:clinic'], q: 'hôpital' },
        hotel: { label: 'Hôtel', words: ['hotel', 'hotels', 'dormir', 'chambre', 'auberge', 'logement'], tags: ['tourism:hotel', 'tourism:motel', 'tourism:guest_house'], q: 'hôtel' },
        garage: { label: 'Garage moto', words: ['garage', 'garagiste', 'mecanicien', 'mecano', 'concessionnaire', 'concession', 'reparer', 'depanneur', 'depannage'], tags: ['shop:motorcycle', 'shop:car_repair'], q: 'garage moto' },
        toilettes: { label: 'Toilettes', words: ['toilette', 'toilettes', 'wc', 'sanitaires'], tags: ['amenity:toilets'], q: 'toilettes' },
        distributeur: { label: 'Distributeur', words: ['distributeur', 'atm', 'retirer', 'banque'], tags: ['amenity:atm', 'amenity:bank'], q: 'distributeur' }
    },
    NEAR: ['proche', 'plus proche', 'pres', 'autour', 'cote', 'pas loin', 'alentour', 'environ', 'dans le coin', 'a proximite', 'proximite'],
    ASK: ['trouve', 'cherche', 'chercher', 'trouver', 'ou est', 'ou y a', 'y a t il', 'il y a', 'besoin', 'envie', 'une idee', 'il me faut', 'il faut', 'j ai besoin', 'je veux', 'je voudrais', 'j aimerais', 'montre', 'indique', 'repere'],
    WIDGETS: ['carte', 'compteur', 'meteo', 'musique', 'intercom', 'groupe', 'reglage', 'reglages', 'accueil', 'ecran', 'profil', 'atelier'],

    /* Texte « à plat » : minuscules, sans accents, ponctuation → espaces, MÊMES positions que l'original (pour retrouver le texte brut) */
    flat(raw) {
        let o = '';
        for (const ch of String(raw || '').toLowerCase()) {
            let c = ch.normalize('NFD')[0];
            if (!/[a-z0-9]/.test(c)) c = ' ';
            o += ch.length === 1 ? c : ' '.repeat(ch.length);
        }
        return o;
    },
    lev(a, b) {
        if (a === b) return 0; if (Math.abs(a.length - b.length) > 2) return 3;
        const d = []; for (let i = 0; i <= a.length; i++) { d[i] = [i]; } for (let j = 1; j <= b.length; j++) d[0][j] = j;
        for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        return d[a.length][b.length];
    },
    /* Le mot (ou l'expression) cible est-il dans la phrase ? Tolère une faute de reconnaissance sur les mots d'au moins 5 lettres. */
    has(f, target) {
        const t = ' ' + f.replace(/\s+/g, ' ').trim() + ' ';
        if (t.includes(' ' + target + ' ')) return true;
        if (target.includes(' ') || target.length < 5) return false;
        const max = target.length >= 10 ? 2 : 1;
        return t.trim().split(' ').some(w => w.length >= 4 && Math.abs(w.length - target.length) <= max && this.lev(w, target) <= max);
    },
    any(f, list) { return list.some(w => this.has(f, w)); },

    /* Fin de phrase : politesses retirées */
    cleanTail(s) {
        const m = /\s+(s il (te|vous) plait|stp|svp|merci|please|maintenant|tout de suite|rapidement)[\s.!?]*$/.exec(this.flat(s));
        if (m) s = s.slice(0, m.index);
        return s.replace(/^[\s,.:;-]+|[\s,.:;!?-]+$/g, '').trim();
    },

    STOP: ['le', 'la', 'les', 'l', 'un', 'une', 'des', 'de', 'du', 'd', 'a', 'au', 'aux', 'et', 'moi', 'me', 'te', 'ce', 'cette', 'ces', 'mon', 'ma', 'mes', 'je', 'tu', 'il', 'on', 'qui', 'que', 'en', 'sur', 'pour', 'peux', 'veux', 'voudrais', 's', 'plait', 'stp', 'svp', 'est', 'y'],
    /* Exemples canoniques : sert à proposer « tu voulais dire … ? » quand la phrase n'est pas comprise */
    EXAMPLES: ['musique suivante', 'musique précédente', 'pause', 'lecture', 'volume plus', 'volume moins', 'coupe le micro', 'active le micro', 'zoom avant', 'zoom arrière', 'recentre la carte', 'affiche la carte', 'affiche le compteur', 'affiche la météo', 'affiche la musique', 'affiche l\'intercom', 'plein écran', 'démarre la balade', 'arrête la balade', 'rejoins le groupe', 'quitte le groupe', 'mode rencontre', 'économie d\'énergie', 'signale un accident', 'signale des gravillons', 'signale un animal', 'arrête la navigation', 'à quelle heure on arrive', 'combien de kilomètres il reste', 'quel temps il fait', 'café le plus proche', 'restaurant le plus proche', 'station essence la plus proche', 'rentre à la maison', 'va au travail'],
    suggest(raw) {
        const toks = s => this.flat(s).split(/\s+/).filter(t => t && !this.STOP.includes(t));
        const T = toks(raw); if (!T.length) return null;
        let best = null, bs = 0;
        for (const ex of this.EXAMPLES) {
            const E = toks(ex); if (!E.length) continue;
            let hit = 0; for (const t of T) if (E.some(e => e === t || (t.length >= 4 && e.length >= 4 && this.lev(t, e) <= 1))) hit++;
            const sc = hit / Math.max(T.length, E.length) + (hit ? .1 : 0);
            if (hit && sc > bs) { bs = sc; best = ex; }
        }
        return bs >= .34 ? best : null;
    },
    /* Verbes : mot exact, ou à une faute près pour les mots de 7 lettres et plus (même première lettre) : « suivan », « precedan », « accepte » → « acepte » */
    mkEx(f) {
        const t = ' ' + f.replace(/\s+/g, ' ').trim() + ' ', words = t.trim().split(' ');
        return (l) => l.some(x => t.includes(' ' + x + ' ') || (x.length >= 7 && !x.includes(' ') && words.some(w => w.length >= 6 && w[0] === x[0] && Math.abs(w.length - x.length) <= 1 && this.lev(w, x) <= 1)));
    },
    /* Niveau demandé : « 50 », « cinquante », « à fond », « moitié », « minimum » → 0..100, ou null */
    level(f) {
        const d = /\b(\d{1,3})\s*(%|pour cent|pourcent)?(?:\s|$)/.exec(f); if (d && +d[1] <= 100) return +d[1];
        if (/\b(maximum|max|a fond|a donf|au max|le plus fort|plein pot)\b/.test(f)) return 100;
        if (/\b(minimum|mini|au plus bas|le plus bas|presque rien)\b/.test(f)) return 10;
        if (/\b(moitie|a moitie|milieu)\b/.test(f)) return 50;
        let v = 0; const tk = f.replace(/\bpour cent\b/g, ' ').split(/\s+/);
        for (const x of tk) { if (this.NUM[x] !== undefined && this.NUM[x] >= 10) v += this.NUM[x]; else if (x === 'et' || x === 'pour' || x === 'cent') continue; else if (v && this.NUM[x] !== undefined) v += this.NUM[x]; }
        return v > 0 && v <= 100 ? v : null;
    },
    /* Infos et commandes « riches » (invitations, groupe, volume précis, titre, météo, compteur…). Renvoie un intent ou null. */
    info(f, r) {
        const any = (l) => this.any(f, l), ex = this.mkEx(f), tk = f.split(/\s+/).filter(Boolean), n = tk.length, W = (re) => re.test(f);
        const inv = any(['invitation', 'invitations']);
        // — Invitations de groupe vocal —
        if (inv && (W(/\b(mes|des|quelles|combien|liste|lis|y a t il|j ai|qui m)\b/) || ex(['montre', 'affiche', 'ouvre', 'regarde', 'liste'])) && !ex(['accepte', 'accepter', 'refuse', 'refuser', 'decline', 'rejette', 'ignore'])) return { intent: 'invite_list' };
        if (W(/\bqui m a invite\b|\bqui m invite\b/)) return { intent: 'invite_list' };
        const who = (() => { const m = /\b(?:de|d|du|par|from)\s+([a-z]{2,})\b/.exec(f); return m && !['invitation', 'groupe', 'canal', 'cette', 'la', 'le'].includes(m[1]) ? m[1] : null; })();
        if (ex(['accepte', 'accepter', 'acceptes', 'acceptons']) && (inv || n <= 4 || any(['groupe', 'canal', 'salon']))) return { intent: 'invite_accept', who };
        if (ex(['refuse', 'refuser', 'refuses', 'refus', 'decline', 'declines', 'decliner', 'rejette', 'rejeter', 'ignore', 'ignorer', 'repousse']) && (inv || n <= 4 || any(['groupe', 'canal', 'salon']))) return { intent: 'invite_refuse', who };
        if (inv && W(/\b(non|pas)\b/) && n <= 5) return { intent: 'invite_refuse', who };
        if (W(/\b(je viens|j arrive|j accepte|avec plaisir)\b/) && n <= 4) return { intent: 'invite_accept', who };
        // — Groupe : qui est là, inviter quelqu'un, mode rencontre —
        if ((any(['groupe', 'canal', 'salon', 'intercom', 'convoi']) || W(/\b(la|ici|connectes?)\b/)) && (W(/\b(qui est|qui y a|qui s y trouve|qui est connecte|combien de personnes|combien de motards|combien on est|combien sommes nous|liste des participants|participants)\b/))) return { intent: 'members' };
        if (W(/\bcombien (de personnes|de motards|on est|sommes nous)\b/) && !any(['kilometres'])) return { intent: 'members' };
        if (ex(['invite', 'inviter', 'invites']) && !inv) { const m = /\b(?:invite|inviter|invites)\s+(?:(?:moi|le|la|les|l|a|au|dans|mon|ma|ce|cet|cette)\s+)*([a-z]{2,})/.exec(f); if (m && !['groupe', 'canal', 'salon', 'motard', 'motards', 'ami', 'amis', 'tout', 'tous', 'quelqu', 'quelquun', 'un', 'une'].includes(m[1])) return { intent: 'invite_rider', name: m[1] }; if (any(['groupe', 'canal', 'salon', 'motard', 'motards', 'ami', 'amis', 'quelqu un', 'quelquun'])) return { intent: 'invite_open' }; }
        if (any(['rencontre', 'rencontres'])) { const off = ex(['desactive', 'coupe', 'arrete', 'eteins', 'stoppe', 'ferme', 'quitte', 'termine', 'desactiver']), on = !off && ex(['active', 'allume', 'lance', 'demarre', 'mets', 'met', 'ouvre', 'activer']); return { intent: 'meet', on: on ? true : off ? false : null }; }
        // — Musique : niveau de volume, titre en cours, aléatoire, répétition —
        const mus = any(['musique', 'chanson', 'morceau', 'titre', 'piste', 'playlist', 'lecteur']);
        if (any(['volume', 'son']) || mus) { const lv = this.level(f); if (lv !== null && (any(['volume']) || W(/\b(le son|du son|mets|met|regle|passe|monte|baisse)\b/)) && !W(/\b(micro|zoom|temperature|degres)\b/)) return { intent: 'volume_set', level: lv }; }
        if (any(['volume']) && W(/\b(combien|quel|quelle|niveau)\b/)) return { intent: 'volume_get' };
        if ((mus || W(/\b(qui chante|qui joue|c est quoi ca|c est quoi ce|artiste|chanteur|groupe qui joue)\b/)) && W(/\b(quel|quelle|c est quoi|qu est ce|nom|comment s appelle|qui chante|qui joue|artiste|chanteur|ecoute|en cours|actuel|actuelle)\b/) && !ex(['suivant', 'precedent', 'passe', 'saute', 'change', 'mets', 'met', 'joue']) ) return { intent: 'track_info' };
        if (any(['aleatoire', 'shuffle', 'melange', 'random', 'hasard'])) return { intent: 'shuffle' };
        if ((mus || any(['boucle'])) && any(['repete', 'repeter', 'boucle', 'repeat', 'en boucle']) || W(/\b(en boucle|repete (le|la|ce|cette|toute))\b/)) return { intent: 'repeat' };
        // — Météo : pluie, vent, température —
        if (!ex(['montre', 'affiche', 'ouvre', 'passe', 'bascule'])) {
            if (any(['pleuvoir', 'pleut', 'pluie', 'pluvieux', 'averse', 'averses', 'parapluie', 'orage', 'orages', 'mouiller', 'mouille', 'ondee'])) return { intent: 'weather', what: 'pluie' };
            if (W(/\b(vent|rafales?|ventee|venteux)\b/) && W(/\b(quel|quelle|combien|fort|souffle|y a|il y a|force|vitesse du vent)\b/)) return { intent: 'weather', what: 'vent' };
            if (W(/\b(froid|chaud|frais|gel|gele|verglas)\b/) && W(/\b(fait|va t il|il fait|aujourd hui|dehors)\b/)) return { intent: 'weather', what: 'temp' };
        }
        // — Compteur et trajet —
        if (W(/\b(ou suis je|quelle rue|quelle ville|dans quelle ville|dans quelle rue|sur quelle route|quelle est ma position|quelle est ma localisation|ou on est)\b/)) return { intent: 'where_am_i' };
        if (W(/\b(ma vitesse|quelle vitesse|a quelle vitesse|vitesse actuelle|vitesse instantanee|je roule a combien|a combien je roule|je roule vite|combien je fais)\b/)) return { intent: 'speed_now' };
        if (W(/\b(distance parcourue|kilometres parcourus|km parcourus|kilometrage|combien de kilometres j ai|combien j ai roule|combien de km j ai|distance de la balade|distance du trajet|compteur kilometrique|trip)\b/)) return { intent: 'trip_dist' };
        if (W(/\b(heures moteur|heures de moteur|temps de moteur|temps de roulage|heures de roulage|duree de la balade|depuis combien de temps je roule|depuis quand je roule)\b/)) return { intent: 'engine_hours' };
        if (any(['batterie']) && W(/\b(quel|quelle|combien|niveau|reste|il me reste|charge)\b/) && !W(/\b(mode|economie|active|desactive)\b/)) return { intent: 'battery' };
        if (W(/\b(limite de vitesse|limitation|vitesse maximale|vitesse autorisee|vitesse limite|je peux rouler a combien|c est limite a combien|limite)\b/) && !any(['regle', 'regler'])) return { intent: 'speed_limit' };
        if (W(/\b(prochaine manoeuvre|prochaine man uvre|prochaine direction|prochaine sortie|prochain virage|que dois je faire|ou je tourne|je tourne ou|quand je tourne|prochaine intersection|prochaine instruction|repete l instruction|repete la consigne|qu est ce que je fais|dans combien je tourne)\b/)) return { intent: 'next_turn' };
        return null;
    },
    /* Commandes « libres » : renvoie la commande canonique que ModuleRoute.command() sait exécuter */
    cmd(f, w, any) {
        const ex = this.mkEx(f);
        const music = any(['musique', 'chanson', 'morceau', 'titre', 'piste', 'son', 'radio', 'playlist', 'track', 'lecteur']);
        // groupe / intercom
        if (any(['groupe', 'canal', 'salon', 'intercom', 'interphone']) && ex(['quitte', 'quite', 'quit', 'quitter', 'sors', 'sortir', 'deconnecte', 'deconnecter', 'laisse']) ) return 'quitte le groupe';
        if (any(['groupe', 'canal', 'salon', 'convoi']) && ex(['rejoins', 'rejoindre', 'entre', 'entrer', 'integre', 'connecte', 'connecter', 'ouvre', 'joindre', 'participe'])) return 'rejoins le groupe';
        if (any(['rencontre', 'rencontres']) || (any(['motards', 'motard']) && any(['autour', 'proximite', 'cherche', 'detecte']))) return 'mode rencontre';
        // micro
        if (any(['micro', 'mike', 'microphone'])) {
            if (ex(['active', 'allume', 'reactive', 'remets', 'remet', 'ouvre', 'reprends', 'unmute', 'rallume', 'reouvre']) && !ex(['desactive', 'coupe', 'ferme'])) return 'active le micro';
            if (ex(['coupe', 'mute', 'muet', 'desactive', 'eteins', 'eteindre', 'ferme', 'silence', 'arrete', 'stop', 'coupes'])) return 'coupe le micro';
        }
        if (any(['muet', 'mute'])) return 'coupe le micro';
        // volume
        if (ex(['trop fort', 'moins fort', 'plus bas', 'baisse', 'diminue', 'reduis', 'doucement', 'trop haut', 'moins de son', 'moins le son']) && (music || any(['volume', 'son', 'fort', 'bas', 'haut', 'doucement']))) return 'volume moins';
        if (ex(['plus fort', 'monte', 'augmente', 'hausse', 'remonte', 'plus haut', 'plus de son', 'j entends rien', 'entends pas', 'entends mal', 'assez fort']) && (music || any(['volume', 'son', 'fort', 'haut', 'entends']))) return 'volume plus';
        // musique : suivant / précédent / pause
        if (music || ex(['suivant', 'suivante', 'prochain', 'prochaine', 'precedent', 'precedente', 'next', 'skip'])) {
            if (ex(['precedent', 'precedente', 'avant', 'revenir', 'reviens', 'recommence', 'retour', 'derniere', 'dernier', 'reprends la derniere', 'd avant'])) return 'precedent';
            if (ex(['suivant', 'suivante', 'prochain', 'prochaine', 'passe', 'passer', 'saute', 'sauter', 'change', 'changer', 'next', 'avance', 'enchaine', 'autre', 'une autre', 'skip'])) return 'suivant';
            if (ex(['pause', 'stop', 'arrete', 'arreter', 'coupe', 'couper', 'mets', 'met', 'mettre', 'joue', 'lance', 'lancer', 'reprends', 'relance', 'play', 'lecture', 'demarre', 'coupe le son', 'silence', 'tais toi'])) return 'pause';
        }
        if (any(['pause', 'lecture', 'play']) && !any(['balade'])) return 'pause';
        // balade
        if (any(['balade', 'sortie', 'roulage', 'virée', 'vire', 'randonnee', 'ride'])) {
            if (ex(['arrete', 'arreter', 'termine', 'terminer', 'fin', 'finis', 'stop', 'stoppe', 'cloture', 'conclus'])) return 'arrete la balade';
            if (ex(['demarre', 'demarrer', 'lance', 'lancer', 'commence', 'commencer', 'start', 'go', 'ouvre', 'begin'])) return 'demarre la balade';
        }
        if (/\b(c est parti|partons|en route|on y va|on roule|je pars|je demarre)\b/.test(f) && !any(['direction', 'vers', 'a'])) return 'demarre la balade';
        if (/\b(on s arrete|c est fini|j ai fini|je m arrete|je suis arrive|fin du trajet|fin de la sortie)\b/.test(f)) return 'arrete la balade';
        // plein écran, économie
        if (/\b(plein ecran|mode immersif|immersif|cache la barre|masque la barre|affiche la barre|montre la barre|barre de navigation|cache les onglets)\b/.test(f) || (any(['plein ecran', 'fullscreen']))) return 'plein ecran';
        if (any(['economie', 'economiser', 'eco', 'veille', 'ecran noir', 'economie d energie', 'batterie']) && any(['mode', 'active', 'desactive', 'passe', 'mets', 'coupe', 'economie', 'ecran', 'noir', 'energie', 'batterie', 'eco'])) return 'economie';
        // danger : types plus variés
        if (any(['accident', 'accrochage', 'collision', 'carambolage', 'chute', 'tombe', 'tombee', 'moto au sol'])) return 'signale accident';
        if (any(['gravillon', 'gravillons', 'gravier', 'graviers', 'sable', 'huile', 'verglas', 'boue', 'glissant', 'glissante', 'gravel'])) return 'signale gravillon';
        if (any(['animal', 'animaux', 'chien', 'cerf', 'sanglier', 'vache', 'vaches', 'mouton', 'moutons', 'chevreuil', 'biche', 'bete'])) return 'signale animal';
        if (any(['danger', 'dangers', 'obstacle', 'signale', 'signaler', 'signalement', 'alerte', 'attention']) && !any(['quel', 'meteo'])) return 'signale danger';
        // widgets : « montre / affiche / passe sur … »
        const show = ex(['montre', 'affiche', 'ouvre', 'passe', 'va', 'mets', 'met', 'bascule', 'voir', 'regarde', 'donne', 'afficher']);
        if (show || f.split(/\s+/).length <= 2) {
            if (any(['compteur', 'vitesse', 'tableau de bord', 'tachymetre', 'speed'])) return 'compteur';
            if (any(['carte', 'plan', 'gps', 'navigation', 'guidage', 'cartographie', 'map'])) return 'carte';
            if (any(['meteo']) || (show && any(['temps']))) return 'meteo';
            if (any(['intercom', 'interphone', 'conversation'])) return 'intercom';
            if (show && any(['musique', 'radio', 'lecteur', 'playlist', 'chansons'])) return 'musique';
        }
        return null;
    },

    /* ---------- phrases abîmées (vent, micro qui craque) : « ène à : 12 rue … » ---------- */
    NAV_VERBS: ['emmene', 'amene', 'conduis', 'guide', 'direction', 'navigue', 'naviguer', 'allons', 'aller', 'rejoins', 'itineraire', 'emmener', 'va'],
    CONNECT: ['a', 'au', 'aux', 'vers', 'pour', 'chez', 'en', 'sur', 'jusqu', 'direction'],
    STREET: /\b(rue|avenue|av|boulevard|bd|chemin|route|impasse|allee|place|cours|quai|square|passage|lotissement|residence|chaussee|promenade|traverse|esplanade|voie|lieu dit|zone|zi|za|rond point|port|col|gare)\b/,
    looksAddress(f) { return /\b\d{1,4}\s*(bis|ter)?\s+(rue|avenue|av|boulevard|bd|chemin|route|impasse|allee|place|cours|quai|square|passage|lotissement|residence|chaussee|promenade|traverse|esplanade|voie)\b/.test(f) || /^\s*(rue|avenue|boulevard|chemin|impasse|allee|quai|square|passage|route de|route du|place)\b/.test(f) || (/\b\d{5}\b/.test(f) && f.trim().split(/\s+/).length >= 3); },
    /* Un mot abîmé ressemble-t-il à un verbe de navigation ? (mot coupé : « ene » ≈ « emmène », « mene », « direcion »…) */
    garbled(t) {
        if (!t || t.length < 2) return false;
        if (['moi', 'moa', 'mois', 'ma', 'me', 'nous'].includes(t)) return true;
        return this.NAV_VERBS.some(v => v === t || (t.length >= 2 && (v.endsWith(t) || v.startsWith(t) || this.sub(t, v))) || (t.length >= 4 && this.lev(t, v) <= Math.floor(v.length / 2.5)));
    },
    sub(t, v) { let i = 0; for (const c of v) if (c === t[i]) i++; return t.length >= 3 && i === t.length; },   // t est une suite de lettres de v (« ene » dans « emmene »)
    /* Début de phrase abîmé : jusqu'à 3 mots qui ressemblent à un verbe + « moi », puis « à ». Renvoie l'index du début de l'adresse, ou -1. */
    garbledLead(f) {
        const toks = []; const re = /\S+/g; let m; while ((m = re.exec(f)) && toks.length < 7) toks.push({ t: m[0], i: m.index });
        const FILL = /^(euh|heu|hum|hm|hmm|uh|ah|oh|eh|ben|bah)$/;
        for (let c = 0; c < Math.min(toks.length - 1, 4); c++) {
            if (!this.CONNECT.includes(toks[c].t)) continue;
            const lead = toks.slice(0, c).filter(x => !FILL.test(x.t));
            if (lead.length && lead.every(x => this.garbled(x.t))) return { i: toks[c + 1].i, verb: true };
            if (!lead.length) return { i: toks[c + 1].i, verb: false };   // « à 12 rue … » : le verbe a été avalé
        }
        // verbe « direction » abîmé, sans « à » : « direcion lyon »
        if (toks.length >= 2 && toks[0].t.length >= 5 && this.lev(toks[0].t, 'direction') <= 2) return { i: toks[1].i, verb: true };
        return null;
    },
    NUM: { un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9, dix: 10, onze: 11, douze: 12, treize: 13, quatorze: 14, quinze: 15, seize: 16, vingt: 20, trente: 30, quarante: 40, cinquante: 50, soixante: 60, cent: 100 },
    /* Adresse nettoyée : hésitations et bégaiements retirés, numéro dit en toutes lettres → chiffres (« douze rue » → « 12 rue ») */
    cleanDest(dest) {
        let toks = String(dest || '').trim().split(/\s+/).filter(Boolean), out = [];
        for (const tk of toks) {
            const ft = this.flat(tk).trim();
            if (/^(euh|heu|hum|hm|hmm|uh|ah|oh|eh|ben|bah|alors|voila|enfin)$/.test(ft)) continue;
            if (out.length && this.flat(out[out.length - 1]).trim() === ft && !/\d/.test(ft)) continue;
            out.push(tk);
        }
        const f = out.map(x => this.flat(x).trim());
        let k = 0, val = 0;
        while (k < f.length && k < 4 && (this.NUM[f[k]] !== undefined || (f[k] === 'et' && k > 0) || (/^(soixante|quatre|vingt)$/.test(f[k - 1] || '') && this.NUM[f[k]]))) { if (f[k] !== 'et') val += this.NUM[f[k]]; k++; }
        if (k && val && f[k] && /^(bis|ter|rue|avenue|av|boulevard|bd|chemin|route|impasse|allee|place|cours|quai|square|passage)$/.test(f[k])) out = [String(val)].concat(out.slice(k));
        // Début de phrase : « à », « vers », verbe répété (« emmène moi à Annecy » après un bégaiement)
        const verbs = new Set(this.NAV_VERBS.concat(['moi', 'a', 'vers', 'pour', 'direction']));
        while (out.length > 1 && verbs.has(this.flat(out[0]).trim())) out.shift();
        return out.join(' ');
    },

    parse(raw, ctx) {
        const pending = !!(ctx && ctx.pending);
        raw = String(raw || '').trim(); if (!raw) return null;
        let f = this.flat(raw); const r = raw.toLowerCase();
        const w = (s) => this.has(f, s), any = (l) => this.any(f, l);
        const tokens = f.split(/\s+/).filter(Boolean);

        // Navigation : l'itinéraire en cours
        if (any(['arrete', 'annule', 'stop', 'termine', 'coupe', 'supprime', 'efface']) && any(['navigation', 'guidage', 'itineraire', 'trajet', 'destination', 'gps']) && !w('balade')) return { intent: 'stop_nav' };

        // Réponses à une question (« oui », « non », « le deuxième »)
        const first = tokens.slice(0, 3).join(' ');
        if (pending && tokens.length <= 4) {
            if (/^(oui|ouais|ok|okay|d accord|daccord|vas y|allez|go|c est bon|confirme|valide|lance|parfait|affirmatif|exact|yes|je viens|j arrive|j accepte|accepte|avec plaisir|bien sur)\b/.test(first)) return { intent: 'yes' };
            if (/^(non|annule|laisse|oublie|pas ca|negatif|nan|nope|stop|laisse tomber|refuse|je refuse|decline|pas maintenant|pas interesse|ignore)\b/.test(first)) return { intent: 'no' };
            const ord = /\b(premier|premiere|1|un)\b/.test(f) ? 1 : /\b(deuxieme|second|seconde|2|deux)\b/.test(f) ? 2 : /\b(troisieme|3|trois)\b/.test(f) ? 3 : 0;
            if (ord && /\b(le|la|numero|n)\b/.test(f + ' ') || (ord && tokens.length === 1)) return { intent: 'pick', n: ord };
            if (/^(autre|suivant|le suivant|un autre)\b/.test(first) && tokens.length <= 3) return { intent: 'pick', n: 'next' };
        }

        // « emmène-moi à la rue de la Pause » : une destination dite avec un verbe de navigation n'est jamais prise pour « pause », « sable »…
        const nm = /\b(?:direction|emmene(?:\s+moi)?|amene(?:\s+moi)?|conduis(?:\s+moi)?|guide(?:\s+moi)?|navigue|naviguer|itineraire|allons|aller|rends\s+moi|rejoins|cap\s+sur|va|vas)\b\s*(?:moi\s+)?(?:(?:a|au|aux|vers|jusqu\s+a|en|sur|chez|pour)\s+)?(.+)$/.exec(f);
        const nd = nm ? nm[1].trim().split(/\s+/) : [], navFirst = !!nm && !/^t il\b/.test(nm[1]) && nd.length >= 2 && !(nd.length <= 2 && nd.some(x => this.WIDGETS.includes(x))) && !/\b(groupe|canal|salon|convoi|invitation|invitations)\b/.test(f) && !this.any(nm[1], ['balade', 'sortie']);
        const ri = navFirst ? null : this.info(f, r); if (ri && ri.intent !== 'weather') return ri;
        if (/\b(quelle heure|a quelle heure|heure d arrivee|on arrive quand|j arrive quand|arrive quand|arrivee estimee)\b/.test(f) || (any(['combien de temps', 'temps restant', 'temps qu il reste']) && any(['reste', 'arriver', 'arrivee', 'destination', 'trajet', 'route'])) ) return { intent: /heure/.test(f) ? 'eta' : 'eta', what: /heure|quand/.test(f) ? 'heure' : 'duree' };
        if ((any(['combien', 'distance', 'kilometres', 'km']) && any(['reste', 'arriver', 'arrivee', 'destination', 'trajet'])) || /\b(distance restante|combien de km|combien de kilometres)\b/.test(f)) return { intent: 'remaining' };
        if (ri) return ri;
        if (/\b(quel temps|il fait combien|quelle temperature|quelle est la temperature|fait il froid|fait il chaud)\b/.test(f) || (w('temperature') && !any(['moteur', 'huile']))) return { intent: 'weather', what: 'general' };

        // Carte : zoom, recentrage
        const zout = /\b(zoom arriere|dezoom\w*|dezoum\w*|zoom moins|zoom out|moins de zoom|zoom en arriere)\b/.test(f) || any(['eloigne', 'recule', 'vue d ensemble', 'plus large', 'plus loin', 'reduis', 'vue large', 'tout voir']);
        const zin = !zout && (/\b(zoom|zoome|zoomer|zoom avant|zoom plus|zoom in|plus de zoom)\b/.test(f) || any(['rapproche', 'agrandis', 'agrandir', 'plus de details', 'plus gros']));
        if (zout) return { intent: 'zoom_out' };
        if (zin) return { intent: 'zoom_in' };
        if (!/\b(enregistre|memorise|retiens|sauvegarde|definis|note)\b/.test(f) && any(['recentre', 'recentrer', 'centre moi', 'centre la carte', 'ou je suis', 'ma position', 'suis moi', 'reviens sur moi', 'retour sur moi', 'me recentrer']) || /\bcentre\b/.test(f) && /\b(carte|moi|position)\b/.test(f)) return { intent: 'recenter' };

        // Commandes libres (musique, micro, volume, groupe, balade, widgets…)
        const c0 = navFirst ? null : this.cmd(f, w, any); if (c0) return { intent: 'cmd', cmd: c0 };

        // Lieux mémorisés : maison / travail
        const home = /\b(maison|domicile|chez moi|la maison|mon chez moi|appart|appartement)\b/.test(f), work = /\b(travail|boulot|bureau|taf|job|entreprise)\b/.test(f);
        if ((home || work) && /\b(enregistre|memorise|retiens|sauvegarde|definis|definir|c est|ici c est|je suis a|je suis au|je suis chez|ma position|note)\b/.test(f) && /\b(ici|position|c est|je suis)\b/.test(f)) return { intent: 'save_place', place: home ? 'home' : 'work' };
        const gl0 = this.garbledLead(f);
        if ((home || work) && ((gl0 && gl0.verb) || /\b(rentre|rentrons|rentrer|retourne|retournons|ramene|reviens|va|vas|aller|allons|emmene|amene|conduis|direction|guide|cap|vers|route|navigue)\b/.test(f))) return { intent: 'go_place', place: home ? 'home' : 'work' };

        // Lieux : « café le plus proche », « j'ai faim », « essence »…
        const navTrig = /\b(direction|emmene|amene|conduis|guide|navigue|naviguer|itineraire|allons|aller|va|vas|rends|rejoins|cap sur|destination|vers|trajet pour|route pour|monte|descends)\b/.test(f);
        let cat = null;
        for (const k of Object.keys(this.CATS)) if (any(this.CATS[k].words)) { cat = k; break; }
        const near = any(this.NEAR), ask = any(this.ASK);
        if (cat && (near || (!navTrig && (ask || tokens.length <= 4 || /\b(faim|soif|panne|reservoir)\b/.test(f))))) return { intent: 'nearest', cat };

        // Navigation vers une destination : « direction Lyon », « emmène-moi à la gare », « va à … »
        const re = /\b(?:direction|emmene(?:\s+moi)?|amene(?:\s+moi)?|conduis(?:\s+moi)?|guide(?:\s+moi)?|navigue(?:\s+vers)?|naviguer(?:\s+vers)?|itineraire(?:\s+pour|\s+vers)?|allons|aller|rends\s+moi|rejoins|cap\s+sur|destination|trajet\s+pour|route\s+pour|vas?)\b\s*(?:moi\s+)?(?:(?:a|au|aux|vers|jusqu\s+a|jusqu\s+au|jusqu\s+aux|en|sur|chez|pour)\s+)?(.+)$/;
        const m = re.exec(f);
        if (m && m[1]) {
            const start = m.index + m[0].length - m[1].length;
            let dest = this.cleanTail(r.slice(start)); const df = this.flat(dest).trim();
            const words = df.split(/\s+/).filter(Boolean);
            if (words.length && !(words.length <= 2 && words.some(x => this.WIDGETS.includes(x))) && df.length >= 2) return { intent: 'nav_to', dest: this.cleanDest(dest) };
        }
        if (/^(vers|a destination de)\s+(.+)/.test(f)) { const mm = /^(?:vers|a destination de)\s+/.exec(f); return { intent: 'nav_to', dest: this.cleanDest(this.cleanTail(r.slice(mm[0].length))) }; }
        // Phrase abîmée : « ène à : 12 rue … », « mène à … », « à 12 rue … » (le verbe est perdu mais la structure est là)
        const gi = this.garbledLead(f);
        if (gi) {
            const dest = this.cleanDest(this.cleanTail(r.slice(gi.i))), df = this.flat(dest).trim();
            if (df.length >= 2 && !this.WIDGETS.includes(df) && (gi.verb || this.looksAddress(df))) return { intent: 'nav_to', dest, fuzzy: true };
        }
        // Une adresse dite seule (« 12 rue de la paix Paris ») : on propose d'y aller
        const fc = this.flat(this.cleanDest(r));
        if (this.looksAddress(fc)) return { intent: 'nav_to', dest: this.cleanTail(this.cleanDest(r)), fuzzy: true };
        // « autre adresse » / « pas là » : on réécoute la destination
        if (/\b(autre adresse|une autre adresse|pas la|corrige|change l adresse|repete l adresse|refais|recommence)\b/.test(f) && tokens.length <= 5) return { intent: 'redo' };
        return null;
    }
};
if (typeof module !== 'undefined') module.exports = VoiceNLU;
