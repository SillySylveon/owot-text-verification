// ==UserScript==
// @name         OWOT Text Signatures
// @namespace    https://ourworldoftext.com/
// @version      0.0.0
// @description  Sign and verify text written on the canvas.
// @author       You
// @match        http*://ourworldoftext.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=ourworldoftext.com
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        unsafeWindow
// ==/UserScript==

(async function() {
    'use strict';

    var VERSION = '0.0.0';

    function parseSemanticVersion(str) {
        if (/^\d+\.\d+\.\d+.*/g.test(str)) {
            var [match, major, minor, bugfix] = str.matchAll(/(^\d+)\.(\d+)\.(\d+)/g).toArray()[0];
            [major, minor, bugfix] = [major, minor, bugfix].map(a=>Number(a));
            return {major, minor, bugfix};
        }
        return null;
    }
    function convertString(data) {
        return (new TextEncoder()).encode(data)
    }
    function toHex(data) {
        return Array.from(new Uint8Array(data)).map(a=>a.toString(16).padStart(2, '0')).join('');
    }
    function fromHex(data) {
        return Uint8Array.from((data.match(/.{2}/g) ?? []).map(a=>parseInt(a, 16)));
    }
    function fromHexBuf(data) {
        return Uint8Array.from((data.match(/.{2}/g) ?? []).map(a=>parseInt(a, 16))).buffer;
    }
    function checkVersion() {
        var lV = GM_getValue('latestVersion', VERSION);
        var latestVersion = parseSemanticVersion(lV);
        var currentVersion = parseSemanticVersion(VERSION);
        let type = '';
        if (latestVersion.major > currentVersion.major) {
            type = '<i>major</i> update';
        } else if (latestVersion.minor > currentVersion.minor) {
            type = '<i>minor</i> update';
        } else if (latestVersion.bugfix > currentVersion.bugfix) {
            type = '<i>bug fix</i>';
        }
        if (type !== '') {
            unsafeWindow.w.doAnnounce(`New ${type} found OWOT Text Signatures v${lV.trim()}. <a href="${base_url}main.js">Click here to update.</a>`, 'textSignaturesUpdateBanner');
        }
    }
    var base_url = 'https://raw.githubusercontent.com/SillySylveon/owot-text-verification/refs/heads/main/';
    var lastUpdate = GM_getValue('lastUpdate', Date.now());
    if (lastUpdate > 1000 * 60 * 5) {
        fetch(base_url + 'VERSION.txt').then(r=>r.text()).then(lV => {
            GM_setValue('latestVersion', lV);
            GM_setValue('lastUpdate', Date.now());
            checkVersion();
        }).catch(e => {
            checkVersion();
            GM_setValue('lastUpdate', Date.now());
        });
    } else {
        checkVersion();
    }
    var s = crypto.subtle;
    var keyPair = JSON.parse(GM_getValue('keyPair', '{"private":null,"public":null}'));

    var ui = new unsafeWindow.Modal();
    ui.setMinimumSize(350, 100);
    ui.setMaximumSize(500, 500);
    ui.createForm();
    ui.addTab(2, 'Sign text');
    ui.addTab(3, 'Verify text');
    ui.addTab(0, 'Your keys');
    ui.addTab(1, 'Options');
    ui.submitFn = function() {
        var id = ui.getCurrentTabId();
        if (id === 1) {
            GM_setValue('keys', keys_elem.value);
            GM_setValue('dbs', dbs_elem.value);
            keys = GM_getValue('keys', '');
            dbs = GM_getValue('dbs', '/sylveon/keys');
        } else if (id === 0) {
            if (confirm('Are you sure you would like to change your key pairs? This cannot be undone.')) {
                keyPair = {
                    "private": privateTxt.value,
                    "public": publicTxt.value
                };
                GM_setValue('keyPair', JSON.stringify(keyPair));
            }
        }
    };
    var submit = ui.client.querySelector('button').parentElement;
    ui.focusTab(1);
    var div = document.createElement('div');
    div.innerHTML = `<div><i>Note: If you do not know what these settings mean, <b>do not change them</b>.</i></div><br><hr><br><div>Public keys:</div>
<textarea id="key" style="width: 100%; height: 100px" placeholder="{&quot;user&quot;:&quot;username&quot;,&quot;key&quot;:&quot;deadbeef&quot;}"></textarea>
<br><br>
<div>Key databases (optional):</div>
<textarea id="db" style="width: 100%; height: 100px" placeholder="/world_name"></textarea>
<br><br>
<button id="refetch">Update database</button>
<br><br><hr><br>
<div class="submitarea"></div>`;
    var refetchBtn = div.querySelector('#refetch');
    refetchBtn.onclick = async function() {
        refetchBtn.innerText = 'Updating...';
        await updateAllDbs();
        refetchBtn.innerText = 'Database updated!';
        setTimeout(() => {
            refetchBtn.innerText = 'Update database';
        }, 3000);
    };
    ui.client.insertBefore(div, ui.client.children[0]);
    ui.focusTab(0);
    var div2 = document.createElement('div');
    div2.innerHTML = `<div>Your public key:</div>
<textarea id="public_key" style="width: 100%; height: 100px"></textarea>
<br>
<div>Your private key:</div>
<textarea id="private_key" style="width: 100%; height: 100px" placeholder="This key is hidden."></textarea>
<b>Do not share your private key with anyone!</b> Private keys can only be viewed once. If lost, you must regenerate.<br>
<br>
<button id="generate">Generate new key</button>
<br><br><hr><br>
<div class="submitarea"></div>`;
    ui.client.insertBefore(div2, ui.client.children[0]);
    var generateBtn = div2.querySelector('#generate');
    var privateTxt = div2.querySelector('#private_key');
    var publicTxt = div2.querySelector('#public_key');
    var privateArea = div2.querySelector('#private_area');
    publicTxt.value = keyPair.public ?? '';
    generateBtn.onclick = async function() {
        const tmpKey = await s.generateKey("Ed25519", true, ["sign", "verify"]);
        privateTxt.value = toHex(await s.exportKey('pkcs8', tmpKey.privateKey));
        publicTxt.value = toHex(await s.exportKey('raw', tmpKey.publicKey));
    };
    ui.onTabChange(function() {
        privateTxt.value = '';
        setTimeout(() => {
            ui.client.querySelector('.submitarea').appendChild(submit);
        }, 0);
    });
    ui.onClose(function() {
        privateTxt.value = '';
    });
    ui.focusTab(2);
    var div3 = document.createElement('div');
    div3.innerHTML = `<div>Text:</div>
<textarea id="text_sign" style="width: 100%; height: 100px"></textarea>
<br>
<div>Signature:</div>
<textarea id="signature_sign" style="width: 100%; height: 50px"></textarea>
<br>
<div>Hash:</div>
<textarea id="hash_sign" style="width: 100%; height: 50px"></textarea>
<br><br>
<button id="sign_btn">Sign manually</button> or <button id="sign_select_btn">Sign selection (recommended)</button>
<br><br><hr><br>
<div class="submitarea"></div>`;
    ui.client.insertBefore(div3, ui.client.children[0]);
    div3.querySelector('#sign_btn').onclick = async function() {
        if (keyPair.private === null || keyPair.public === null) {
            alert('You must first generate a key pair (in the "Your keys" tab) before you can create text signatures.');
            return;
        }
        const txt = div3.querySelector('#text_sign').value.replaceAll('\r', '');
        const signature = await sign_text(txt);
        const hash = await hash_text(txt);
        div3.querySelector('#signature_sign').value = signature;
        div3.querySelector('#hash_sign').value = hash;
    };
    div3.querySelector('#sign_select_btn').onclick = async function() {
        if (keyPair.private === null || keyPair.public === null) {
            alert('You must first generate a key pair (in the "Your keys" tab) before you can create text signatures.');
            return;
        }
        ui.close();
        var signSelection = new unsafeWindow.RegionSelection();
        signSelection.onselection(async function(coordA, coordB) {
            var str = '';
            var startX = coordA[0] * 16 + coordA[2];
            var startY = coordA[1] * 8 + coordA[3];
            var endX = coordB[0] * 16 + coordB[2];
            var endY = coordB[1] * 8 + coordB[3];
            for (let y = startY; y <= endY; y++) {
                for (let x = startX; x <= endX; x++) {
                    str += unsafeWindow.getCharInfoXY(x, y).char
                }
                if (y !== endY) {
                    str += '\n'
                }
            }
            var str2 = str.split('\n').map(a=>a.trim()).join('\n').trim();

            var hash = await hash_text(str2);
            var signature = await sign_text(str2);
            var meta = (Array.from((new TextEncoder()).encode(JSON.stringify({
                "u": unsafeWindow.state.userModel.username,
                "t": str2,
                "s": signature,
                "h": hash
            }))).map(a=>String.fromCodePoint(a)).join('').match(/.{1,366}/g) ?? []).map((a,b)=>`note:Signed text - ${b}|${btoa(a)}`);


            var split = str2.split('\n');
            var offsetY = 0;
            var coords = [];
            var n = 0;
            var queue = [];
            for (let i in split) {
                const k = split[i];
                const y = str.substring(0, str.indexOf(k)).split('\n').length - 1;
                const offsetX = str.split('\n')[y].indexOf(k);
                for (let l = offsetX; l < k.length + offsetX; l++) {
                    const cX = l + startX, cY = y + startY;
                    const tileX = Math.floor(cX / 16), tileY = Math.floor(cY / 8), charX = cX - tileX * 16, charY = cY - tileY * 8;

                    queue.push([{
                        tileY: tileY,
                        tileX: tileX,
                        charY: charY,
                        charX: charX
                    }, "url", {"url": meta[n % meta.length]}]);
                    n++;
                }
            }
            var lastTime = Date.now();
            var rate = 250;
            var inter = setInterval(() => {
                var diff = Date.now() - lastTime;
                lastTime = Date.now();
                var amt = Math.round(rate * (diff / 1000));
                for (let i = 0; i < amt; i++) {
                    if (queue.length === 0) {
                        clearInterval(inter);
                        break;
                    }
                    unsafeWindow.network.link(...queue.shift());
                }
            }, rate);
        });
        signSelection.startSelection();
    };
    ui.focusTab(3);
    var div4 = document.createElement('div');
    div4.innerHTML = `<div>Text:</div>
<textarea id="text_verify" style="width: 100%; height: 100px"></textarea>
<br>
<div>Signature:</div>
<textarea id="signature_verify" style="width: 100%; height: 50px"></textarea>
<br>
<div>Hash:</div>
<textarea id="hash_verify" style="width: 100%; height: 50px"></textarea>
<br>
<div id="status_verify"></div>
<br>
<button id="verify_btn">Verify text</button> or <button id="verify_select_btn">Use from selection (recommended)</button>
<br><br><hr><br>
<div class="submitarea"></div>`;
    ui.client.insertBefore(div4, ui.client.children[0]);
    div4.querySelector('#verify_btn').onclick = async function() {
        try {
            const keyDb = keys.split('\n').map(a=>JSON.parse(a));
            const txt = div4.querySelector('#text_verify').value.replaceAll('\r', '');
            const signature = div4.querySelector('#signature_verify').value;
            const hash = div4.querySelector('#hash_verify').value;
            const txt_hash = await hash_text(txt);
            let match = null;
            if (keyDb.length > 0) {
                for (let i of keyDb) {
                    if (await verify_text(txt, signature, i.key)) {
                        match = i.user;
                    }
                }
            }
            if (hash !== txt_hash) {
                div4.querySelector('#status_verify').innerHTML = `<br><div><b>Verification failed: </b>Hash does not match (text may have been modified)${match === null ? '; integrity check failed (invalid signature)' : ''}.</div>`;
            } else if (keyDb.length === 0) {
                div4.querySelector('#status_verify').innerHTML = `<br><div><b>Verification failed: </b>No public keys found.</div>`;
            } else if (match === null) {
                div4.querySelector('#status_verify').innerHTML = `<br><div><b>Verification failed: </b>Integrity check failed (invalid signature)</div>`;
            } else {
                div4.querySelector('#status_verify').innerHTML = `<br><div>Text is <b>valid</b> (signed by <b>${match}</b>)</div>`;
            }
        } catch (e) {
            div4.querySelector('#status_verify').innerHTML = `<br><div><b>Unexpected error:</b> ${e}</div>`;
        }
    };
    div4.querySelector('#verify_select_btn').onclick = async function() {
        ui.close();
        var verifySelection = new unsafeWindow.RegionSelection();
        verifySelection.onselection(async function(coordA, coordB) {
            var startX = coordA[0] * 16 + coordA[2];
            var startY = coordA[1] * 8 + coordA[3];
            var endX = coordB[0] * 16 + coordB[2];
            var endY = coordB[1] * 8 + coordB[3];
            var meta = null;
            var meta_tmp = {};
            for (let y = startY; y <= endY; y++) {
                for (let x = startX; x <= endX; x++) {
                    const link = unsafeWindow.getLinkXY(x, y);
                    if (link !== null && link.type === 'url' && link.url.match(/^note:Signed text - \d{1,4}\|[A-Za-z0-9+\/=]+$/g) !== null) {
                        const id = Number(link.url.match(/(?<=^note:Signed text - )\d{1,4}/g)[0]);
                        const mD = link.url.match(/(?<=^note:Signed text - \d{1,4}\|).+/g)[0];
                        try {
                            const decoded = (new TextDecoder()).decode(Uint8Array.from(atob(mD).split('').map(a=>a.codePointAt(0))));
                            if (!(id in meta_tmp)) {
                                meta_tmp[id] = [];
                            }
                            meta_tmp[id].push(decoded);
                        } catch (e) {
                            div4.querySelector('#status_verify').innerHTML = `<br><div><b>Unexpected error:</b> ${e.name}: ${e.message}${'stack' in e ? '<br><b>Stack trace:</b> ' + e.stack : ''}<br><b>Other debugging info:</b>${btoa(mD)}</div>`;
                            return;
                        };
                    }
                }
            }

            for (let i = 0; i < 3; i++) {
                var str = '';
                for (let k in meta_tmp) {
                    const val = meta_tmp[k];
                    str += val[Math.floor(Math.random() * val.length)];
                }
                if (str.length === 0) {
                    div4.querySelector('#status_verify').innerHTML = `<br><div><b>Verification failed: </b>No signed text found!</div>`;
                    return;
                }
                try {
                    meta = JSON.parse(str);
                    break;
                } catch(e) {
                    div4.querySelector('#status_verify').innerHTML = `<br><div><b>Unexpected error:</b> ${e}<br><b>Other debugging info:</b>${btoa(str)}</div>`;
                    continue;
                };
            }

            if (meta === null) {
                ui.open();
                return;
            }

            var hash = meta.h;
            var signature = meta.s;
            var text = meta.t;
            var username = meta.u;

            try {
                const keyDb = keys.split('\n').map(a=>JSON.parse(a));
                div4.querySelector('#text_verify').value = text;
                div4.querySelector('#signature_verify').value = signature;
                div4.querySelector('#hash_verify').value = hash;
                const txt_hash = await hash_text(text);
                let match = null;
                let user_found = false;
                if (keyDb.length > 0) {
                    for (let i of keyDb) {
                        if (await verify_text(text, signature, i.key)) {
                            match = i.user;
                        }
                        if (i.user === username) {
                            user_found = true;
                        }
                    }
                }
                if (hash !== txt_hash) {
                    div4.querySelector('#status_verify').innerHTML = `<br><div><b>Verification failed: </b>Hash does not match (text may have been modified)${match === null ? '; integrity check failed (invalid signature)' : ''}.</div>`;
                } else if (keyDb.length === 0) {
                    div4.querySelector('#status_verify').innerHTML = `<br><div><b>Verification failed: </b>No public keys found.</div>`;
                } else if (match === null && !user_found) {
                    div4.querySelector('#status_verify').innerHTML = `<br><div><b>Verification failed: </b>Integrity check failed (user "${username}" not recognized, database may be out of date)</div>`;
                } else if (match === null && user_found) {
                    div4.querySelector('#status_verify').innerHTML = `<br><div><b>Verification failed: </b>Integrity check failed (invalid signature)</div>`;
                } else if (match !== null && match !== username) {
                    div4.querySelector('#status_verify').innerHTML = `<br><div><b>Verification failed: </b>Text signed for "<b>${username}</b>" but validated as "<b>${match}</b>" (impersonation likely).</div>`;
                } else {
                    div4.querySelector('#status_verify').innerHTML = `<br><div>Text is <b>valid</b> (signed by <b>${match}</b>)</div>`;
                }
            } catch (e) {
                div4.querySelector('#status_verify').innerHTML = `<br><div><b>Unexpected error:</b> ${e.name}: ${e.message}${'stack' in e ? '<br><b>Stack trace:</b> ' + e.stack : ''}</div>`;
            }
            ui.open();
        });
        verifySelection.startSelection();
    }
    ui.focusTab(2);

    var keys_elem = div.querySelector('#key');
    var dbs_elem = div.querySelector('#db');
    var keys = GM_getValue('keys', ''), dbs = GM_getValue('dbs', '/sylveon/keys');

    unsafeWindow.menu.addOption('OWOT Text Signatures', function() {
        keys = GM_getValue('keys', '');
        dbs = GM_getValue('dbs', '/sylveon/keys');
        keys_elem.value = keys;
        dbs_elem.value = dbs;
        ui.open();
    });

    async function sign_text(text) {
        const imported_key = await s.importKey('pkcs8', fromHex(keyPair.private), "Ed25519", false, ["sign"]);
        return toHex(await s.sign("Ed25519", imported_key, convertString(text)));
    };
    async function verify_text(text, signature, pub_key) {
        const imported_key = await s.importKey('raw', fromHex(pub_key), "Ed25519", false, ["verify"]);
        return await s.verify("Ed25519", imported_key, fromHexBuf(signature), convertString(text));
    };
    async function hash_text(text) {
        return toHex(await s.digest("SHA-256", convertString(text)));
    };

    var last_fetch = GM_getValue('lastFetch', 0);

    async function fetch_db(world) {
        if (!world.startsWith('/')) {
            world = '/' + world;
        }
        return new Promise(async function(res) {
            var contents = [];
            var y = 0;
            async function loop() {
                let txt = 'a'.repeat(7).split('a');
                const tmp = await fetch(`https://ourworldoftext.com${world}?fetch=1&min_tileX=0&max_tileX=7&min_tileY=${y}&max_tileY=${y}&content_only=true`).then(r=>r.json());
                for (let i in tmp) {
                    if (tmp[i] === null) {
                        tmp[i] = ' '.repeat(128);
                    }
                    const split = tmp[i].match(/.{16}/g)
                    for (let k = 0; k < split.length; k++) {
                        txt[k] += split[k]
                    }
                }
                txt = txt.map(a=>a.trim()).filter(a=>a.length>0).map(a=>JSON.parse(a));
                contents.push(...txt);
                if (txt.length === 0 || ('end' in txt[txt.length-1] && txt[txt.length-1].end)) {
                    res(contents);
                    return;
                } else {
                    y += 1;
                    setTimeout(loop, 0);
                }
            }
            await loop();
        });
    };

    async function updateAllDbs() {
        const tmp_db = {};
        const dbs2 = dbs.split('\n');
        for (let i in dbs2) {
            var db = await fetch_db(dbs2[i]);
            delete db[db.length-1];
            for (let k in db) {
                tmp_db[db[k].user] = db[k].key;
            }
        }
        const tmp_db_2 = [];
        for (let i in tmp_db) {
            tmp_db_2.push(JSON.stringify({"user":i,"key":tmp_db[i]}))
        }
        GM_setValue('keys', tmp_db_2.join('\n'));
        keys = tmp_db_2.join('\n');
        GM_setValue('lastFetch', Date.now());
    };

    if (Date.now() - last_fetch > 1000*60*60) {
        updateAllDbs();
    }

})();
