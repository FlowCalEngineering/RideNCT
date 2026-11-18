            // ================================================================== //
            // 📶 Mini client MQTT 3.1.1 sur WebSocket (aucune librairie externe)  //
            // Sert de relais Internet entre les téléphones (QoS 0 uniquement).   //
            // ================================================================== //
            class MiniMQTT {
                // url : une adresse, ou une liste [{ url, user, pass }, …] essayées dans l'ordre (bascule sur la suivante après 3 échecs de connexion)
                constructor(url, clientId, handlers) {
                    this.targets = (Array.isArray(url) ? url : [url]).map(t => typeof t === 'string' ? { url: t } : t); this.ti = 0; this.fails = 0;
                    this.url = this.targets[0].url; this.clientId = clientId; this.h = handlers || {};
                    this.ws = null; this.buf = new Uint8Array(0); this.subs = new Set(); this.lastRx = Date.now();
                    this.connected = false; this.pid = 1; this.retry = 1000; this.stopped = true; this.pingTimer = null;
                }
                static enc(str) { return new TextEncoder().encode(str); }
                static str(s) { const b = MiniMQTT.enc(s); const o = new Uint8Array(b.length + 2); o[0] = b.length >> 8; o[1] = b.length & 255; o.set(b, 2); return o; }
                static cat(...arrs) { let n = 0; arrs.forEach(a => n += a.length); const o = new Uint8Array(n); let i = 0; arrs.forEach(a => { o.set(a, i); i += a.length; }); return o; }
                static len(n) { const out = []; do { let d = n % 128; n = Math.floor(n / 128); if (n > 0) d |= 128; out.push(d); } while (n > 0); return new Uint8Array(out); }

                start() { this.stopped = false; this.ti = 0; this.fails = 0; this.url = this.targets[0].url; this.open(); }
                stop() {
                    this.stopped = true; clearInterval(this.pingTimer);
                    if (this.ws) { try { if (this.connected) this.ws.send(new Uint8Array([0xE0, 0])); this.ws.close(); } catch (e) {} }
                    this.ws = null; this.connected = false;
                }
                open() {
                    if (this.stopped) return;
                    if (this.ws && this.ws.readyState <= 1) return; // déjà en cours / ouverte : jamais deux connexions
                    this.h.status && this.h.status('connecting');
                    let ws; const tg = this.targets[this.ti]; this.url = tg.url; try { ws = new WebSocket(tg.url, ['mqtt']); } catch (e) { return this.scheduleReconnect(); }
                    this.ws = ws; ws.binaryType = 'arraybuffer'; this.buf = new Uint8Array(0);
                    ws.onopen = () => {
                        const cred = !!tg.user;   // identifiant + mot de passe du courtier (indicateurs 0x80 et 0x40)
                        const vh = MiniMQTT.cat(MiniMQTT.str('MQTT'), new Uint8Array([4, cred ? 0xC2 : 0x02, 0, 60])); // v3.1.1, clean session, keepalive 60 s
                        this.packet(0x10, MiniMQTT.cat(vh, MiniMQTT.str(this.clientId), cred ? MiniMQTT.cat(MiniMQTT.str(tg.user), MiniMQTT.str(tg.pass || '')) : new Uint8Array(0)));
                    };
                    ws.onmessage = (ev) => { this.lastRx = Date.now(); this.buf = MiniMQTT.cat(this.buf, new Uint8Array(ev.data)); this.parse(); if (this.buf.length > 2e6) { this.buf = new Uint8Array(0); try { ws.close(); } catch (e) {} } };
                    ws.onclose = () => { if (this.ws !== ws) return; if (!ws._ok && this.targets.length > 1 && ++this.fails >= 3) { this.ti = (this.ti + 1) % this.targets.length; this.fails = 0; this.retry = 1000; } this.connected = false; clearInterval(this.pingTimer); this.h.status && this.h.status('offline'); this.scheduleReconnect(); };
                    ws.onerror = () => { try { ws.close(); } catch (e) {} };
                }
                // Réseau revenu (ou liaison morte sans fermeture, fréquent en changeant de wifi/4G) : on repart tout de suite
                reconnectNow() {
                    if (this.stopped) return;
                    const old = this.ws; this.ws = null; this.connected = false; clearInterval(this.pingTimer);
                    try { if (old) { old.onclose = null; old.onerror = null; old.close(); } } catch (e) {}
                    this.retry = 1000; this.lastRx = Date.now(); this.ti = 0; this.fails = 0;   // réseau revenu : on retente d'abord le courtier principal
                    this.h.status && this.h.status('connecting');
                    this.open();
                }
                scheduleReconnect() {
                    if (this.stopped) return;
                    setTimeout(() => this.open(), this.retry); this.retry = Math.min(this.retry * 2, 30000);
                }
                packet(first, body) {
                    if (!this.ws || this.ws.readyState !== 1) return false;
                    this.ws.send(MiniMQTT.cat(new Uint8Array([first]), MiniMQTT.len(body.length), body)); return true;
                }
                parse() {
                    while (this.buf.length >= 2) {
                        let mult = 1, len = 0, i = 1, b;
                        do { if (i >= this.buf.length) return; b = this.buf[i++]; len += (b & 127) * mult; mult *= 128; } while (b & 128);
                        if (this.buf.length < i + len) return;
                        const type = this.buf[0] >> 4, flags = this.buf[0] & 15, body = this.buf.slice(i, i + len);
                        this.buf = this.buf.slice(i + len);
                        this.handle(type, flags, body);
                    }
                }
                handle(type, flags, body) {
                    if (type === 2) { // CONNACK
                        if (body[1] !== 0) { this.h.status && this.h.status('offline'); try { this.ws && this.ws.close(); } catch (e) {} return; } // refus du courtier : on ferme pour que la reconnexion automatique réessaie
                        this.connected = true; this.retry = 1000; this.fails = 0; if (this.ws) this.ws._ok = true;
                        this.subs.forEach(t => this.sendSub(t));
                        clearInterval(this.pingTimer); this.pingTimer = setInterval(() => this.packet(0xC0, new Uint8Array(0)), 30000);
                        this.h.status && this.h.status('online'); this.h.connect && this.h.connect();
                    } else if (type === 3) { // PUBLISH
                        const tl = (body[0] << 8) | body[1];
                        const topic = new TextDecoder().decode(body.slice(2, 2 + tl));
                        let p = 2 + tl; if ((flags >> 1) & 3) p += 2;
                        const payload = new TextDecoder().decode(body.slice(p));
                        try { this.h.message && this.h.message(topic, payload); } catch (e) { console.warn('[Radar]', e); }
                    }
                }
                nextId() { this.pid = (this.pid % 65535) + 1; return new Uint8Array([this.pid >> 8, this.pid & 255]); }
                sendSub(t) { this.packet(0x82, MiniMQTT.cat(this.nextId(), MiniMQTT.str(t), new Uint8Array([0]))); }
                subscribe(t) { if (this.subs.has(t)) return; this.subs.add(t); if (this.connected) this.sendSub(t); }
                unsubscribe(t) { if (!this.subs.delete(t)) return; if (this.connected) this.packet(0xA2, MiniMQTT.cat(this.nextId(), MiniMQTT.str(t))); }
                publish(t, payload, retain) {
                    if (!this.connected) return false;
                    return this.packet(0x30 | (retain ? 1 : 0), MiniMQTT.cat(MiniMQTT.str(t), MiniMQTT.enc(payload)));
                }
            }
