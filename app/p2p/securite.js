// P2P sécurité : clés AES, validation des identifiants, images
// Étend ModuleCommunity (défini dans groupe/groupe.js) : ce fichier doit être chargé APRÈS lui.
Object.assign(ModuleCommunity, {
                validSid(s) { return typeof s === 'string' && /^[a-f0-9]{16}$/.test(s); },
                validPk(s) { return typeof s === 'string' && s.length < 200 && /^[A-Za-z0-9+/=]+$/.test(s); },
                async aesKey(pkB64) {
                    if (this.state.aesCache.has(pkB64)) return this.state.aesCache.get(pkB64);
                    const pub = await crypto.subtle.importKey('raw', this.unb64(pkB64), { name: 'ECDH', namedCurve: 'P-256' }, false, []);
                    const key = await crypto.subtle.deriveKey({ name: 'ECDH', public: pub }, this.state.keys.privateKey, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
                    this.state.aesCache.set(pkB64, key); return key;
                },
                // Texte venu d'un autre téléphone : sans caractères de contrôle ni de renversement du sens d'écriture, longueur bornée
                cleanText(x, n) { return String(x == null ? '' : x).replace(/[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g, '').trim().slice(0, n || 40); },
                // Identifiants de canal / de motard : lettres, chiffres, tiret
                cleanCode(x, n) { return String(x == null ? '' : x).replace(/[^A-Za-z0-9_-]/g, '').slice(0, n || 24); },
                shrinkImage(dataUrl, max) {
                    return new Promise((resolve) => {
                        if (!dataUrl) return resolve(null);
                        const img = new Image();
                        img.onload = () => {
                            const k = Math.min(1, max / Math.max(img.width, img.height));
                            const cv = document.createElement('canvas'); cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
                            cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
                            resolve(cv.toDataURL('image/jpeg', 0.7));
                        };
                        img.onerror = () => resolve(null);
                        img.src = dataUrl;
                    });
                },
                sanitizeImg(x) { return (typeof x === 'string' && x.length < 120000 && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(x)) ? x : null; },
});
