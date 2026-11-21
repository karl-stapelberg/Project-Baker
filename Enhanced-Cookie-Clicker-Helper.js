// Enhanced Cookie Clicker Helper
// Load with:  Game.LoadMod('https://your-host/Enhanced-Cookie-Clicker-Helper.js');
(function () {
    const MOD_ID = 'Enhanced Cookie Clicker Helper';

    if (typeof Game === 'undefined') return;

    // Guard against the script being loaded twice
    if (Game.mods && Game.mods[MOD_ID]) {
        console.log('[' + MOD_ID + '] already loaded, skipping.');
        return;
    }

    Game.registerMod(MOD_ID, {

        // ---------- State (persisted via save/load) ----------
        settings: {
            autoClick: false,
            goldenClick: true
        },

        // ---------- Config ----------
        NOTIFY_ON_CAST: true,
        COMBO_BUFF_NAMES: new Set(['frenzy', 'dragon harvest', 'elder frenzy', 'click frenzy']),

        // ---------- Internals ----------
        ticks: 0,
        autoClickHandle: null,
        toggleButtons: [],

        // ---------- Mod lifecycle ----------
        init: function () {
            const mod = this;

            // Auto-click the big cookie. The game itself caps clicks at ~250/s, so 4ms matches that.
            // (Kept as a real-time interval because the logic hook only runs ~30x per second.)
            mod.autoClickHandle = setInterval(function () {
                if (mod.settings.autoClick) Game.ClickCookie();
            }, 4);

            // All other automation runs on the game's own logic tick (~30 ticks per second)
            Game.registerHook('logic', function () {
                mod.ticks++;
                if (mod.ticks % 8 === 0)   mod.tickFtHoF();         // ~250 ms
                if (mod.ticks % 15 === 0)  mod.tickGolden();        // ~500 ms
                if (mod.ticks % 30 === 0) {                         // ~1 s
                    mod.tickReindeer();
                    mod.tickFortune();
                    mod.tickLump();
                }
                if (mod.ticks % 150 === 0) mod.tickWrinklers();     // ~5 s
            });

            mod.createToggleUI();

            Game.Notify(MOD_ID + ' loaded', '', [16, 5], 4);
            console.log('[' + MOD_ID + '] initialised.');
        },

        save: function () {
            return JSON.stringify(this.settings);
        },

        load: function (str) {
            try {
                const data = JSON.parse(str);
                if (typeof data.autoClick === 'boolean')   this.settings.autoClick = data.autoClick;
                if (typeof data.goldenClick === 'boolean') this.settings.goldenClick = data.goldenClick;
            } catch (e) {
                console.warn('[' + MOD_ID + '] could not parse saved settings.', e);
            }
            this.toggleButtons.forEach(function (refresh) { refresh(); });
        },

        // ---------- Golden / wrath cookies ----------
        // Pops golden cookies, and wrath cookies during grandmapocalypse
        // (only while a reindeer is on screen for the wrath case).
        tickGolden: function () {
            if (!this.settings.goldenClick) return;

            const shimmers = Game.shimmers.slice(); // copy: popping mutates the array
            const reindeerOnScreen = shimmers.some(function (s) { return s.type === 'reindeer'; });

            shimmers.forEach(function (shimmer) {
                if (shimmer.type !== 'golden') return;
                if (shimmer.wrath === 0) {
                    shimmer.pop();
                } else if (Game.elderWrath > 0 && reindeerOnScreen) {
                    shimmer.pop();
                }
            });
        },

        // ---------- Reindeer ----------
        tickReindeer: function () {
            Game.shimmers.slice().forEach(function (shimmer) {
                if (shimmer.type === 'reindeer') shimmer.pop();
            });
        },

        // ---------- Fortune news ticker ----------
        tickFortune: function () {
            if (Game.TickerEffect && Game.TickerEffect.type === 'fortune' && Game.tickerL) {
                Game.tickerL.click();
                console.log('[' + MOD_ID + '] Fortune clicked.');
            }
        },

        // ---------- Wrinklers ----------
        // Pops the fattest non-shiny wrinkler once every wrinkler slot is in use.
        tickWrinklers: function () {
            const max = (typeof Game.getWrinklersMax === 'function') ? Game.getWrinklersMax() : 10;

            let active = 0;
            let fattestIndex = -1;
            let maxSucked = -1;

            for (let i = 0; i < max; i++) {
                const w = Game.wrinklers[i];
                if (!w) continue;
                if (w.phase > 0 && w.hp > 0) {
                    active++;
                    if (w.type !== 1 && w.sucked > maxSucked) { // type 1 = shiny
                        maxSucked = w.sucked;
                        fattestIndex = i;
                    }
                }
            }

            if (active >= max && fattestIndex !== -1) {
                Game.wrinklers[fattestIndex].hp = 0;
                console.log('[' + MOD_ID + '] Fattest wrinkler popped.');
            }
        },

        // ---------- Sugar lumps ----------
        tickLump: function () {
            if (typeof Game.canLumps === 'function' && !Game.canLumps()) return;
            if (Date.now() - Game.lumpT >= Game.lumpRipeAge) {
                Game.clickLump();
            }
        },

        // ---------- Force the Hand of Fate ----------
        getGrimoire: function () {
            try {
                const wt = Game.ObjectsById[7];
                return (wt && wt.minigame) ? wt.minigame : null;
            } catch (e) {
                return null;
            }
        },

        hasComboTriggerBuff: function () {
            for (const name in Game.buffs) {
                const buff = Game.buffs[name];
                if (this.COMBO_BUFF_NAMES.has(name.toLowerCase())) return true;
                // Catches building specials with dynamic names
                if (buff.multCpS > 1) return true;
            }
            return false;
        },

        isAtMaxMana: function (grimoire) {
            return grimoire.magic >= grimoire.magicM - 0.01;
        },

        // Enough magic to cast AND at least 1 point left afterwards
        canAffordFtHoF: function (grimoire) {
            const spell = grimoire.spells['hand of fate'];
            if (!spell) return false;
            const cost = (typeof grimoire.getSpellCost === 'function')
                ? grimoire.getSpellCost(spell)
                : spell.costMin + grimoire.magicM * spell.costPercent;
            return grimoire.magic >= cost + 1;
        },

        tickFtHoF: function () {
            const grimoire = this.getGrimoire();
            if (!grimoire) return;
            if (!this.isAtMaxMana(grimoire)) return;
            if (!this.hasComboTriggerBuff()) return;
            if (!this.canAffordFtHoF(grimoire)) return;

            const spell = grimoire.spells['hand of fate'];
            const result = grimoire.castSpell(spell);

            if (result !== false) {
                if (this.NOTIFY_ON_CAST) {
                    Game.Notify('Force the Hand of Fate cast.', 'Spell fired during active buff', [16, 5]);
                }
                console.log('[' + MOD_ID + '] FtHoF cast at', new Date().toLocaleTimeString(),
                    '| Active buffs:', Object.keys(Game.buffs).join(', '));
            }
        },

        // ---------- UI ----------
        createToggle: function (container, label, getState, setState, hotkey) {
            const btn = document.createElement('button');
            btn.style.cssText = [
                'padding:6px 12px',
                'font:bold 13px Tahoma, Arial, sans-serif',
                'color:#fff',
                'border:2px solid #000',
                'border-radius:6px',
                'cursor:pointer',
                'box-shadow:0 2px 6px rgba(0,0,0,0.6)',
                'text-align:left'
            ].join(';');

            function refresh() {
                const on = getState();
                btn.textContent = label + ': ' + (on ? 'ON' : 'OFF');
                btn.style.background = on ? '#2e8b2e' : '#a32a2a';
            }

            function toggle() {
                setState(!getState());
                refresh();
            }

            btn.addEventListener('click', toggle);

            if (hotkey) {
                document.addEventListener('keydown', function (e) {
                    if (e.key === hotkey) toggle();
                });
            }

            refresh();
            container.appendChild(btn);
            this.toggleButtons.push(refresh); // so load() can refresh the labels
        },

        createToggleUI: function () {
            const mod = this;

            const existing = document.getElementById('helperToggles');
            if (existing) existing.remove();

            const container = document.createElement('div');
            container.id = 'helperToggles';
            container.style.cssText = [
                'position:fixed',
                'bottom:10px',
                'left:10px',
                'z-index:2147483647',
                'display:flex',
                'flex-direction:column',
                'gap:6px'
            ].join(';');

            mod.createToggle(container, 'Auto-Click',
                function () { return mod.settings.autoClick; },
                function (v) { mod.settings.autoClick = v; },
                null);

            mod.createToggle(container, 'Golden/Wrath Cookies',
                function () { return mod.settings.goldenClick; },
                function (v) { mod.settings.goldenClick = v; },
                null);

            document.body.appendChild(container);
        }
    });
})();