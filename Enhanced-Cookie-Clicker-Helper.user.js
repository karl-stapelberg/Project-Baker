// ==UserScript==
// @name         Enhanced Cookie Clicker Helper
// @namespace    https://github.com/karl-stapelberg/
// @version      1.0.0
// @description  An enhanced version of petar105's "Cookie Clicker Helper" script that adds auto-popping wrinklers, auto-clicking fortunes, auto-clicking of wrath cookies during the Grandmapocalypse (only when reindeers are on screen), auto-collection of ripe sugar lumps, and Auto Force the Hand of Fate when a combo-worthy buff is active.
// @match        https://orteil.dashnet.org/cookieclicker/
// @icon         https://www.google.com/s2/favicons?domain=dashnet.org
// @grant        none
// ==/UserScript==

    (function() {
        'use strict';

        // Auto-click cookies (toggleable)
        let autoClickEnabled = false;
        setInterval(function() {
            if (autoClickEnabled) Game.ClickCookie();
        }, 4);

    // Pop golden cookies (non-wrath) and wrath cookies during grandmapocalypse (but only when there is a reindeer on screen for the last part)
    let goldenClickEnabled = true;
    setInterval(function() {
        if (!goldenClickEnabled) return;
        Game.shimmers.forEach(function(shimmer) {
            // Pop golden cookies (wrath == 0)
            if(shimmer.type == "golden" && shimmer.wrath == 0)
            {
                shimmer.pop()
            }
            // Pop all (wrath included) cookies during grandmapocalypse (elder wrath > 0), but only when there is at least one reindeer on screen.
            else if(shimmer.type == "golden" && Game.elderWrath > 0)
            {
                for (var h in Game.shimmers){if(Game.shimmers[h].type=="reindeer"){shimmer.pop();}}
            }
        })
    }, 500);

    // Auto click fortunes
    var fortuneclicker = setInterval(function() {
        if (Game.TickerEffect && Game.TickerEffect.type === 'fortune') {
            console.log("Fortune detected.");
            Game.tickerL.click();
            console.log("Fortune clicked.");
        }
    }, 1000);

    // Auto pop fattest wrinkler (non-shiny) if all wrinkler slots are used up
    var autoPopFattest = setInterval(function() {
    // Count active wrinklers and find oldest non-golden
        var activeCount = 0;
        var oldestNonGolden = null;
        var oldestNonGoldenIndex = -1;
        var maxSucked = -1;

        // Base limit
        var wrinklerMax = 10;

        // Add 2 to base limit if you have the Heavenly Upgrade 'Elder Spice'
        if (Game.Has('Elder spice')) {
            wrinklerMax += 2;
        }

        // Add 2 to base limit if you have Krumblor's 'Dragon Guts' aura equipped
        if (Game.auraMults && Game.auraMults['Dragon Guts'] > 0) {
            wrinklerMax += 2;
        }

        // Updates the number of active wrinklers and gets the index of the fattest one
        for (var i = 0; i < wrinklerMax; i++) {
            var wrink = Game.wrinklers[i];
            // Check if wrinkler exists and is active (hp > 0)
            if ((wrink.phase > 0) && (wrink.hp > 0)) {
                activeCount++;

                // Find oldest non-golden wrinkler (type !== 1)
                if (wrink.type !== 1 && wrink.sucked > maxSucked) {
                    maxSucked = wrink.sucked;
                    oldestNonGolden = wrink;
                    oldestNonGoldenIndex = i;
                }
            }
        }

        // Pop the oldest non-golden wrinkler if all wrinkler spots are used up
        if (activeCount >= wrinklerMax && oldestNonGoldenIndex !== -1) {
            Game.wrinklers[oldestNonGoldenIndex].hp = 0;
            console.log("Fattest wrinkler successfully popped!");
        }
    }, 5000);

    // Auto pop reindeer
    var autoReindeer = setInterval(function() { for (var h in Game.shimmers){if(Game.shimmers[h].type=="reindeer"){Game.shimmers[h].pop();}} }, 1000);

    // Auto click ripe sugar lumps
    var autoLump = setInterval(function() {
        var sugarLumpAge = Date.now() - Game.lumpT;
        if (sugarLumpAge >= Game.lumpRipeAge) {
            Game.clickLump();
        }
    }, 1000);

        // UI toggles
    function createToggle(container, label, getState, setState, hotkey) {
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
            document.addEventListener('keydown', function(e) {
                if (e.key === hotkey) toggle();
            });
        }

        refresh();
        container.appendChild(btn);
    }

    function createToggleUI() {
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

        createToggle(container, 'Auto-Click',
            () => autoClickEnabled,
            (v) => { autoClickEnabled = v; },
            null);

        createToggle(container, 'Golden/Wrath Cookies',
            () => goldenClickEnabled,
            (v) => { goldenClickEnabled = v; },
            null);

        document.body.appendChild(container);
    }

    // Wait for the game to load before adding the buttons
    (function waitForUI() {
        if (typeof Game !== 'undefined' && Game.ready && document.body) {
            createToggleUI();
        } else {
            setTimeout(waitForUI, 500);
        }
    })();

    // Auto Force the Hand of Fate
    const CHECK_INTERVAL_MS = 250;

    const NOTIFY_ON_CAST = true;

    const COMBO_BUFF_NAMES = new Set([
        'frenzy',
        'dragon harvest',
        'elder frenzy',
        'click frenzy',
    ]);

    // State
    let loopHandle = null;

    // Returns the Grimoire minigame object, or null if it isn't loaded yet.
    function getGrimoire() {
        try {
            const wt = Game.ObjectsById[7];
            return (wt && wt.minigame) ? wt.minigame : null;
        }
        catch (e) {
            return null;
        }
    }

    // Searches for buffs that are worth comboing into FtHoF. Returns true if at least one is found.
    function hasComboTriggerBuff() {
        for (const name in Game.buffs) {
            const buff = Game.buffs[name];
            if (COMBO_BUFF_NAMES.has(name.toLowerCase())) return true;
            // Catch building specials with dynamic names not covered by the set above.
            if (buff.multCpS > 1) return true;
        }
        return false;
    }

    // Returns true when the magic meter is completely full. Uses a small epsilon to avoid floating-point rounding issues.
    function isAtMaxMana(grimoire) {
        return grimoire.magic >= grimoire.magicM - 0.01;
    }

    //Returns true if the magic meter holds enough to cast FtHoF AND will still have at least 1 point left over after the cast (avoids 0-magic regen freeze).
    function canAffordFtHoF(grimoire) {
        const spell = grimoire.spells['hand of fate'];
        if (!spell) return false;
        const cost = spell.costMin + grimoire.magicM * spell.costPercent;
        return grimoire.magic >= cost + 1;
    }

    // Casts Force the Hand of Fate
    function castFtHoF(grimoire) {
        const spell = grimoire.spells['hand of fate'];
        if (!spell) return false;

        const result = grimoire.castSpell(spell);

        if (result !== false && NOTIFY_ON_CAST) {
            Game.Notify('Force the Hand of Fate cast.', 'Spell fired during active buff –', [16, 5]);
        }
        return result !== false;
    }

    // Sanity checks and main loop.
    function tick() {
        // Game must be fully loaded.
        if (typeof Game === 'undefined' || !Game.ready) return;

        // Grimoire must be available.
        const grimoire = getGrimoire();
        if (!grimoire) return;

        // Only cast while at full mana.
        if (!isAtMaxMana(grimoire)) return;

        // Only cast while a combo-worthy buff is active.
        if (!hasComboTriggerBuff()) return;

        // Confirm we can actually afford the spell.
        if (!canAffordFtHoF(grimoire)) return;

        // Cast the spell and log the event.
        const success = castFtHoF(grimoire);
        if (success) {
            console.log('[FtHoF AutoCast] Cast during buff at',new Date().toLocaleTimeString(),'| Active buffs:',Object.keys(Game.buffs).join(', '));
        }
    }
  
    // Waits for the game to be ready before starting the main loop.
    function waitForGame() {
        if (typeof Game !== 'undefined' && Game.ready) {
            console.log('[FtHoF AutoCast] Game ready – starting buff-triggered loop.');
            loopHandle = setInterval(tick, CHECK_INTERVAL_MS);
            }
        else {
            setTimeout(waitForGame, 1000);
        }
    }

    waitForGame();

    window.addEventListener('beforeunload', () => {
        if (loopHandle) clearInterval(loopHandle);
    });
})();