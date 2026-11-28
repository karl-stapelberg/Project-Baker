// Enhanced Cookie Clicker Helper
// Load with: Game.LoadMod('https://cdn.jsdelivr.net/gh/karl-stapelberg/Project-Baker@main/Enhanced-Cookie-Clicker-Helper.js');

// TODO:
// Add cyclius automation
// Add dragon petting automation

(function () {
    const MOD_ID = 'Enhanced Cookie Clicker Helper';

    Game.registerMod(MOD_ID, {

        // State (persisted via save/load)
        settings: {
            autoClick: false,
            goldenClick: true,
            wrathClick: false,
            fthofEnabled: true,
            reindeerClick: true,
            deermaxClick: false,
            autoPet: false,
        },

        // Config
        NOTIFY_ON_CAST: false,
        GOLDEN_LAST_SECOND: 2,
        REINDEER_EXIT_MARGIN: 2,
        COMBO_BUFF_NAMES: new Set(['frenzy', 'dragon harvest', 'elder frenzy', 'click frenzy']),
        PET_INTERVAL_MS: 50,

        // Internals
        ticks: 0,
        autoClickHandle: null,
        autoPetHandle: null,
        toggleButtons: [],

        // Mod lifecycle
        init: function () {
            const mod = this;

            // Auto-click the big cookie
            mod.autoClickHandle = setInterval(function () {
                if (mod.settings.autoClick) Game.ClickCookie();
            }, 4);

            // Auto-pet Krumblor
            mod.autoPetHandle = setInterval(function () {
                if (!mod.settings.autoPet) return;
                if (typeof Game.ClickSpecialPic !== 'function') return;
                if (!Game.Has('Pet the dragon')) return;   // upgrade needed before petting does anything
                Game.ClickSpecialPic();
            }, mod.PET_INTERVAL_MS);

            // All other automation runs on the game's own logic tick
            Game.registerHook('logic', function () {
                mod.ticks++;
                if (mod.ticks % 3 === 0) {
                    mod.tickGolden(); 
                    mod.tickReindeer();
                }
                if (mod.ticks % 8 === 0) mod.tickFtHoF();
                if (mod.ticks % 30 === 0) {
                    mod.tickFortune();
                    mod.tickLump();
                }
                if (mod.ticks % 150 === 0) mod.tickWrinklers();
                
            });

            mod.createToggleUI();

            Game.Notify(MOD_ID + ' loaded', '', [16, 5], 4);
            console.log('[' + MOD_ID + '] initialised.');
        },
        
        // Saves settings
        save: function () {
            return JSON.stringify(this.settings);
        },

        // Loads settings
        load: function (str) {
            try {
                const data = JSON.parse(str);
                if (typeof data.autoClick === 'boolean')   this.settings.autoClick = data.autoClick;
                if (typeof data.goldenClick === 'boolean') this.settings.goldenClick = data.goldenClick;
                if (typeof data.wrathClick === 'boolean')  this.settings.wrathClick = data.wrathClick;
                if (typeof data.fthofEnabled === 'boolean') this.settings.fthofEnabled = data.fthofEnabled;
                if (typeof data.reindeerClick === 'boolean') this.settings.reindeerClick = data.reindeerClick;
                if (typeof data.deermaxClick === 'boolean') this.settings.deermaxClick = data.deermaxClick;
                if (typeof data.autoPet === 'boolean') this.settings.autoPet = data.autoPet;

                // Enforce exclusivity if a save somehow has both on
                if (this.settings.reindeerClick && this.settings.deermaxClick) {
                    this.settings.deermaxClick = false;
                }

                // Enforce exclusivity if a save somehow has both on
                if (this.settings.autoClick && this.settings.autoPet) {
                    this.settings.autoPet = false;
                }
            } catch (e) {
                console.warn('[' + MOD_ID + '] could not parse saved settings.', e);
            }
            this.toggleButtons.forEach(function (refresh) { refresh(); });
        },

        // True if any golden or wrath cookie is on screen
        goldenPending: function () {
            const s = this.settings;
            return Game.shimmers.some(function (sh) {
                return sh.type === 'golden' && (sh.wrath === 0 ? s.goldenClick : s.wrathClick);
            });
        },

        // Handles auto-clicking golden and wrath cookies with reindeer wait logic
        tickGolden: function () {
            const s = this.settings;
            if (!s.goldenClick && !s.wrathClick) return;

            const shimmers = Game.shimmers.slice();
            const reindeer = shimmers.filter(function (sh) { return sh.type === 'reindeer'; });

            // Seconds until the soonest reindeer leaves the screen
            const reindeerLeft = reindeer.length
                ? Math.min.apply(null, reindeer.map(function (r) { return r.life / Game.fps; })) : Infinity;

            const waiting = s.deermaxClick;
            const mod = this;

            shimmers.forEach(function (sh) {
                if (sh.type !== 'golden') return;

                const wanted = (sh.wrath === 0) ? s.goldenClick : s.wrathClick;
                if (!wanted) return;

                // Not waiting: pop straight away
                if (!waiting) { sh.pop(); return; }

                // Waiting: same rule for golden and wrath cookies
                const cookieLeft = sh.life / Game.fps;
                if (cookieLeft <= mod.GOLDEN_LAST_SECOND || reindeerLeft <= mod.REINDEER_EXIT_MARGIN) {
                    sh.pop();
                }
            });
        },
        
        cpsBuffActive: function () {
            for (const name in Game.buffs) {
                if (Game.buffs[name].multCpS > 1) return true;
            }
            return false;
        },

        // Auto pops reindeer
        tickReindeer: function () {
            const s = this.settings;
            if (!s.reindeerClick && !s.deermaxClick) return;

            // Wait mode: hold reindeer while any golden/wrath cookie is on screen
            const hold = s.deermaxClick && !this.cpsBuffActive();
            const margin = this.REINDEER_EXIT_MARGIN;

            Game.shimmers.slice().forEach(function (shimmer) {
                if (shimmer.type !== 'reindeer') return;
                if (hold && shimmer.life / Game.fps > margin) return; // let cookies go first
                shimmer.pop();
            });
        },

        // Auto collects fortunes from the news ticker
        tickFortune: function () {
            if (Game.TickerEffect && Game.TickerEffect.type === 'fortune' && Game.tickerL) {
                Game.tickerL.click();
                console.log('[' + MOD_ID + '] Fortune clicked.');
            }
        },

        // Pops the fattest non-shiny wrinkler once every wrinkler slot is in use
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

        // Auto collects sugar lumps while ripe
        tickLump: function () {
            if (typeof Game.canLumps === 'function' && !Game.canLumps()) return;
            if (Date.now() - Game.lumpT >= Game.lumpRipeAge) {
                Game.clickLump();
            }
        },

        // Auto Force the Hand of Fate
        getGrimoire: function () {
            try {
                const wt = Game.ObjectsById[7];
                return (wt && wt.minigame) ? wt.minigame : null;
            } catch (e) {
                return null;
            }
        },
        
        // Checks if any active buff is a combo trigger for Force the Hand of Fate.
        hasComboTriggerBuff: function () {
            for (const name in Game.buffs) {
                const buff = Game.buffs[name];
                if (this.COMBO_BUFF_NAMES.has(name.toLowerCase())) return true;
                // Catches building specials with dynamic names
                if (buff.multCpS > 1) return true;
            }
            return false;
        },

        // Checks if the grimoire is at max mana (or very close to it).
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
        
        // Invokes Force the Hand of Fate
        tickFtHoF: function () {
            if (!this.settings.fthofEnabled) return;
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

        // UI
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
            this.toggleButtons.push(refresh);
        },

        createToggleUI: function () {
            const mod = this;

            const existing = document.getElementById('helperToggles');
            if (existing) existing.remove();

            const container = document.createElement('div');
            container.id = 'helperToggles';
            container.style.cssText = [
                'position:fixed',
                'top:50%',
                'transform: translateY(-50%)',
                'left:10px',
                'z-index:2147483647',
                'display:flex',
                'flex-direction:column',
                'gap:6px'
            ].join(';');

            mod.createToggle(container, 'Auto-Click',
                function () { return mod.settings.autoClick; },
                function (v) {
                    mod.settings.autoClick = v;
                    if (v) mod.settings.autoPet = false;
                    mod.toggleButtons.forEach(function (refresh) { refresh(); });
                },
            null);

            mod.createToggle(container, 'Auto-Pet Krumblor',
                function () { return mod.settings.autoPet; },
                function (v) {
                    mod.settings.autoPet = v;
                    if (v) mod.settings.autoClick = false;
                    mod.toggleButtons.forEach(function (refresh) { refresh(); });
                },
            null);

            mod.createToggle(container, 'Golden Cookies',
                function () { return mod.settings.goldenClick; },
                function (v) { mod.settings.goldenClick = v; },
            null);

            mod.createToggle(container, 'Wrath Cookies',
                function () { return mod.settings.wrathClick; },
                function (v) { mod.settings.wrathClick = v; },
            null);

            mod.createToggle(container, 'Auto FtHoF',
                function () { return mod.settings.fthofEnabled; },
                function (v) { mod.settings.fthofEnabled = v; },
            null);
            
            mod.createToggle(container, 'Reindeer',
                function () { return mod.settings.reindeerClick; },
                function (v) {
                    mod.settings.reindeerClick = v;
                    if (v) mod.settings.deermaxClick = false;
                    mod.toggleButtons.forEach(function (refresh) { refresh(); });
                },
            null);

            mod.createToggle(container, 'Deermaxxing',
                function () { return mod.settings.deermaxClick; },
                function (v) {
                    mod.settings.deermaxClick = v;
                    if (v) mod.settings.reindeerClick = false;
                    mod.toggleButtons.forEach(function (refresh) { refresh(); });
                },
            null);

            document.body.appendChild(container);
        }
    });
})();