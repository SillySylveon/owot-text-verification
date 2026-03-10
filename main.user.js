// ==UserScript==
// @name         OWOT Text Signatures
// @namespace    https://ourworldoftext.com/
// @version      1.0.0
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

    var VERSION = '1.0.0';

    if (typeof GM_getValue === "undefined") {
        alert('This script must be executed with a userscript manager (e.g. Tampermonkey).');
        return;
    }
    if (typeof unsafeWindow.w === "undefined") {
        return;
    }

    function parseSemanticVersion(str) {
        if (/^\d+\.\d+\.\d+.*/g.test(str)) {
            let [match, major, minor, bugfix] = str.matchAll(/(^\d+)\.(\d+)\.(\d+)/g).toArray()[0];
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
        // TODO: allow user to skip updates
        const lV = GM_getValue('latestVersion', VERSION);
        const latestVersion = parseSemanticVersion(lV);
        const currentVersion = parseSemanticVersion(VERSION);
        let type = '';
        const keyMap = ['major', 'minor', 'bugfix'];
        const diff = Array(3).fill(0).map((a, b) => latestVersion[keyMap[b]] - currentVersion[keyMap[b]]);
        const typeVals = ['<i>major</i> update', '<i>feature</i> update', '<i>bug fix</i>'];
        for (let i = 0; i < 3; i++) {
            if (diff[i] > 0) {
                type = typeVals[i];
                break;
            } else if (diff[i] < 0) {
                break;
            }
        }
        if (type !== '') {
            unsafeWindow.w.doAnnounce(`New ${type} found: OWOT Text Signatures v${lV.trim()}. <a href="${base_url}main.user.js">Click here to update.</a>`, 'textSignaturesUpdateBanner');
        }
    }
    var base_url = 'https://raw.githubusercontent.com/SillySylveon/owot-text-verification/refs/heads/main/';
    var lastUpdate = GM_getValue('lastUpdate', 0);
    if (Date.now() - lastUpdate > 1000 * 60 * 5) {
        fetch(base_url + 'VERSION.txt').then(r=>r.text()).then(lV => {
            GM_setValue('latestVersion', lV);
            GM_setValue('lastUpdate', Date.now());
            checkVersion();
        }).catch(e => {
            checkVersion();
            GM_setValue('lastUpdate', Date.now());
        });
    }
    var s = crypto.subtle;
    var keyPair = JSON.parse(GM_getValue('keyPair', '{"private":null,"public":null}'));
	var baseConvert; // to make Tampermonkey happy

    var ui = new unsafeWindow.Modal();
    ui.setMinimumSize(350, 100);
    ui.setMaximumSize(500, 500);
    ui.createForm();
    ui.addTab(2, 'Sign text');
    ui.addTab(3, 'Verify text');
    ui.addTab(0, 'Manage keys');
    ui.addTab(1, 'Options');
    var submit = ui.client.querySelector('button').parentElement;
    ui.focusTab(1);
	ui.client.style.overflow = 'scroll';
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
    refetchBtn.onclick = function() {
        refetchBtn.innerText = 'Updating...';
        updateAllDbs(function(status) {
            if (status.done) {
                refetchBtn.innerText = 'Database updated!';
                setTimeout(() => {
                    refetchBtn.innerText = 'Update database';
                }, 3000);
            } else {
                refetchBtn.innerText = `Updating... (${status.status} of ${status.total})`;
            }
        });
    };
    ui.client.insertBefore(div, ui.client.children[0]);
    ui.focusTab(0);
    var div2 = document.createElement('div');
    div2.innerHTML = `<h3>Manage keys</h3><br style="display: block; margin: 4px 0;"><hr><br style="display: block; margin: 4px 0;">
<div>Your public key:</div>
<textarea id="public_key" style="width: 100%; height: 50px"></textarea>
<br>
<div>Your private key:</div>
<textarea id="private_key" style="width: 100%; height: 50px" placeholder="This key is hidden."></textarea>
<b>Do not share your private key with anyone!</b> Private keys can only be viewed once. If lost, you must regenerate.<br>
<br style="display: block; margin: 12px 0;">
<h3>Generate a key</h3>
<br style="display: block; margin: 4px 0;">
<hr>
<br style="display: block; margin: 4px 0;">
<button id="generate">Generate new key</button> or <a id="generate_password" style="color: blue; text-decoration: underline; cursor: pointer;">generate from a password</a><br>
<br style="display: block; margin: 12px 0;"><hr><br>
<div class="submitarea"></div>`;
    ui.client.insertBefore(div2, ui.client.children[0]);
    var generateBtn = div2.querySelector('#generate');
    var generatePassBtn = div2.querySelector('#generate_password');
    var privateTxt = div2.querySelector('#private_key');
    var publicTxt = div2.querySelector('#public_key');
    publicTxt.value = keyPair.public ?? '';
    generateBtn.onclick = async function() {
        const tmpKey = await s.generateKey("Ed25519", true, ["sign", "verify"]);
        privateTxt.value = toHex(await s.exportKey('pkcs8', tmpKey.privateKey));
        publicTxt.value = toHex(await s.exportKey('raw', tmpKey.publicKey));
    };
    var pass = new unsafeWindow.Modal();
    pass.setMinimumSize(350, 100);
    pass.createForm();
    var newDiv = document.createElement('div');
    newDiv.innerHTML = `<label for="owot_username">Username: </label><input type="text" id="owot_username" disabled style="width: 100%">
<br><label for="user_password">Password*: </label><input type="password" id="user_password" style="width: 100%" placeholder="Enter a password...">
<br><a style="font-size: 12px; color: #555">* Do not use your Uvias password.</a>`;
    pass.client.insertBefore(newDiv, pass.client.children[0]);
    var argon2; // to make Tampermonkey happy
    pass.onSubmit(async function() {
        unsafeWindow.w.doAnnounce('Calculating, please wait...', 'passCalcAnnouncement');
		try {
			let textEncoder = new TextEncoder();
			let usr = new Uint8Array(await s.digest("SHA-256", textEncoder.encode(unsafeWindow.state.userModel.username)));
			let pwd = textEncoder.encode(newDiv.querySelector('#user_password').value);
			let hash = await argon2.hash({
				pass: pwd,
				salt: usr,
				time: 3,
				mem: 32768,
				hashLen: 32,
				parallelism: 1,
				type: argon2.ArgonType.Argon2id
			});
			let generated_private_key = fromHex("302e020100300506032b657004220420" + hash.hashHex);
			let gen_priv = await s.importKey("pkcs8", generated_private_key, "Ed25519", true, ['sign']);
			let gen_spki = await s.exportKey("jwk", gen_priv);
			delete gen_spki.d;
			gen_spki.key_ops = ['verify'];
			let gen_publ = await s.importKey("jwk", gen_spki, "Ed25519", true, ['verify']);
			let generated_public_key = await s.exportKey("raw", gen_publ);
			unsafeWindow.w.ui.announcements.passCalcAnnouncement.close.click();
			pass.close();
			ui.open();
			privateTxt.value = toHex(generated_private_key);
			publicTxt.value = toHex(generated_public_key);
		} catch (e) {
			unsafeWindow.w.ui.announcements.passCalcAnnouncement.close.click();
			unsafeWindow.w.doAnnounce(`Failed to calculate key: ${e}`, 'passCalcFailedAnnouncement');
			console.error('Failed to calculate key:', e);
		}
    });
    pass.onClose(function() {
        newDiv.querySelector('#user_password').value = '';
    });
    generatePassBtn.onclick = async function() {
        newDiv.querySelector('#owot_username').value = unsafeWindow.state.userModel.username;
        newDiv.querySelector('#user_password').value = '';
        pass.open();
    };
    ui.focusTab(2);
    var div3 = document.createElement('div');
    div3.innerHTML = `<div>Text:</div>
<textarea id="text_sign" style="width: 100%; height: 80px"></textarea>
<br>
<div>Signature:</div>
<textarea id="signature_sign" style="width: 100%; height: 50px"></textarea>
<br>
<div>Hash:</div>
<textarea id="hash_sign" style="width: 100%; height: 30px"></textarea>
<br><br>
<button id="sign_btn">Sign manually</button> or <button id="sign_select_btn">Sign selection (recommended)</button>
<br><br><hr><br>
<div class="submitarea"></div>`;
    ui.client.insertBefore(div3, ui.client.children[0]);
    div3.querySelector('#sign_btn').onclick = async function() {
        if (keyPair.private === null || keyPair.public === null) {
            alert('You must first generate a key pair (in the "Manage keys" tab) before you can create text signatures.');
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
            alert('You must first generate a key pair (in the "Manage keys" tab) before you can create text signatures.');
            return;
        }
        ui.close();
        let signSelection = new unsafeWindow.RegionSelection();
        signSelection.onselection(async function(coordA, coordB) {
            let str = '';
            let startX = coordA[0] * 16 + coordA[2];
            let startY = coordA[1] * 8 + coordA[3];
            let endX = coordB[0] * 16 + coordB[2];
            let endY = coordB[1] * 8 + coordB[3];
            for (let y = startY; y <= endY; y++) {
                for (let x = startX; x <= endX; x++) {
                    str += unsafeWindow.getCharInfoXY(x, y).char
                }
                if (y !== endY) {
                    str += '\n'
                }
            }
            let str2 = str.split('\n').map(a=>a.trim()).join('\n').trim();
            let hash = btoa((await hash_text(str2)).match(/.{2}/g).map(a=>String.fromCharCode(parseInt(a,16))).join('')).replaceAll('=', '');
            let signature = btoa((await sign_text(str2)).match(/.{2}/g).map(a=>String.fromCharCode(parseInt(a,16))).join('')).replaceAll('=', '');
            let alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'.split('');
			let random = Array(4).fill(0).map(a=>alphabet[Math.floor(Math.random()*64)]).join('');
            let prefix = `note:Signed by ${unsafeWindow.state.userModel.username}: `;
            let charCount = 512 - (prefix.length + 6);
            let meta = (JSON.stringify({
				"v": VERSION, // version
                // username now included in signature message
                "t": str2, // text
                "s": signature, // signature
                "h": hash, // hash
				"d": Date.now() // timestamp
            }).match(new RegExp(`.{1,${charCount}}`, 'g')) ?? []).map((a,b)=>{
				const converted = baseConvert([b], 4096, 64);
				const str = [...Array(2 - converted.length).fill(0), ...converted].map(c=>alphabet[c]).join('');
				return `${prefix}${random}${str}${a}`
			});

            let split = str2.split('\n');
            let offsetY = 0;
            let coords = [];
            let n = 0;
            let queue = [];
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
            let lastTime = Date.now();
            let rate = 250;
            let inter = setInterval(() => {
                let diff = Date.now() - lastTime;
                lastTime = Date.now();
                let amt = Math.round(rate * (diff / 1000));
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
<textarea id="text_verify" style="width: 100%; height: 80px"></textarea><div class="manual_entry">
<br>
<div>Signature:</div>
<textarea id="signature_verify" style="width: 100%; height: 50px"></textarea>
<br>
<div>Hash:</div>
<textarea id="hash_verify" style="width: 100%; height: 30px"></textarea>
<br></div>
<div id="status_verify"></div><div class="manual_entry">
<br>
<button id="verify_btn">Verify text</button> or <button id="verify_select_btn">Use from selection (recommended)</button>
<br></div><br><hr><br>
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
        let verifySelection = new unsafeWindow.RegionSelection();
        verifySelection.onselection(async function(coordA, coordB) {
			div4.querySelectorAll('.manual_entry').forEach(a=>{a.setAttribute('style', 'display: none')});
            let startX = coordA[0] * 16 + coordA[2];
            let startY = coordA[1] * 8 + coordA[3];
            let endX = coordB[0] * 16 + coordB[2];
            let endY = coordB[1] * 8 + coordB[3];
            let meta = null;
            let meta_tmp = {};
			let legacy = false;
            let user_name = null;
            for (let y = startY; y <= endY; y++) {
                for (let x = startX; x <= endX; x++) {
                    const link = unsafeWindow.getLinkXY(x, y);
                    if (link !== null && link.type === 'url') {
						if (link.url.match(/^note:Signed text - \d{1,4}\|[A-Za-z0-9+\/=]+$/g) !== null) {
							legacy = true;
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
						} else if (link.url.match(/^note:Signed by .{1,30}\: [A-Za-z0-9\-_]{6}.+/g) !== null) {
							user_name = link.url.match(/(?<=^note:Signed by ).{1,30}(?=\: [A-Za-z0-9\-_]{6}.+)/g);
                            const dd = link.url.match(/(?<=^note:Signed by .{1,30}\: )[A-Za-z0-9\-_]{4}/g)[0];
							let id = link.url.match(/(?<=^note:Signed by .{1,30}\: [A-Za-z0-9\-_]{4})[A-Za-z0-9\-_]{2}/g)[0];
							const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'.split('');
							id = baseConvert(id.split('').map(a=>alphabet.indexOf(a)), 64, 4096)[0];
							const mD = link.url.match(/(?<=^note:Signed by .{1,30}\: [A-Za-z0-9\-_]{6}).+/g)[0];
							if (!(dd in meta_tmp)) {
								meta_tmp[dd] = {};
							}
							if (!(id in meta_tmp[dd])) {
								meta_tmp[dd][id] = [];
							}
							meta_tmp[dd][id].push(mD);
						}
                    }
                }
            }
			if (legacy) {
				for (let i = 0; i < 3; i++) {
					let str = '';
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
						continue;
					};
				}
			} else {
				if (Object.keys(meta_tmp).length > 1) {
					div4.querySelector('#status_verify').innerHTML = `<br><div><b>Verification failed: </b>More than one text signature found (please select only one).</div>`;
					ui.open();
					return;
				} else if (Object.keys(meta_tmp).length === 0) {
					div4.querySelector('#status_verify').innerHTML = `<br><div><b>Verification failed: </b>No signed text found!</div>`;
					ui.open();
					return;
				} else {
					const randId = Object.keys(meta_tmp)[0];
					for (let i = 0; i < 5; i++) {
						let str = '';
						for (let k in meta_tmp[randId]) {
							const val = meta_tmp[randId][k];
							str += val[Math.floor(Math.random() * val.length)];
						}
						if (str.length === 0) {
							div4.querySelector('#status_verify').innerHTML = `<br><div><b>Verification failed: </b>No signed text found!</div>`;
							return;
						}
						try {
							meta = JSON.parse(str);
							meta.h = atob(meta.h.padEnd(Math.ceil(meta.h.length / 4) * 4, '=')).split('').map(a=>a.charCodeAt(0).toString(16).padStart(2, '0')).join('');
							meta.s = atob(meta.s.padEnd(Math.ceil(meta.s.length / 4) * 4, '=')).split('').map(a=>a.charCodeAt(0).toString(16).padStart(2, '0')).join('');
                            meta.u = user_name;
						} catch (e) {
							continue;
						}
					}
				}
			}

            if (meta === null) {
				div4.querySelector('#status_verify').innerHTML = `<br><div><b>Verification failed: </b>Could not parse signed text.</div>`;
                ui.open();
                return;
            }

            let hash = meta.h;
            let signature = meta.s;
            let text = meta.t;
            let username = meta.u;
			let timestamp = meta.d ?? null;
			let signedVer = meta.v ?? '0.0.0';

			let scriptVersion = parseSemanticVersion(VERSION);
			let signedVersion = parseSemanticVersion(signedVer);
			if (signedVersion.major > scriptVersion.major) {
				div4.querySelector('#status_verify').innerHTML = `<br><div><b>Verification failed: </b>Unsupported version (signed for v${signedVer} but you are running v${VERSION}).</div>`;
			}

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
                    div4.querySelector('#status_verify').innerHTML = `<br><div><b>Verification failed: </b>Integrity check failed (User "<b>${username}</b>" not recognized, try updating the database via <i>Options -> Update database</i>).</div>`;
                } else if (match === null && user_found) {
                    div4.querySelector('#status_verify').innerHTML = `<br><div><b>Verification failed: </b>Integrity check failed (invalid signature)</div>`;
                } else if (match !== null && match !== username) {
                    div4.querySelector('#status_verify').innerHTML = `<br><div><b>Verification failed: </b>Text signed for "<b>${username}</b>" but validated as "<b>${match}</b>" (impersonation likely).</div>`;
                } else {
					let dateObj = new Date(timestamp ?? 0);
					let dateStr = timestamp !== null ? ` on ${dateObj.getFullYear()}-${dateObj.getMonth()}-${dateObj.getDate()} at ${dateObj.getHours()}:${String(dateObj.getMinutes()).padStart(2, '0')}` : '';
                    div4.querySelector('#status_verify').innerHTML = `<br><div>Text is <b>valid</b> (signed by <b>${match}</b>${dateStr}).</div>`;
                }
            } catch (e) {
                div4.querySelector('#status_verify').innerHTML = `<br><div><b>Unexpected error:</b> ${e.name}: ${e.message}${'stack' in e ? '<br><b>Stack trace:</b> ' + e.stack : ''}</div>`;
            }
            ui.open();
        });
        verifySelection.startSelection();
    }
    ui.focusTab(2);
    ui.submitFn = async function() {
        let id = ui.getCurrentTabId();
        if (id === 1) {
            GM_setValue('keys', keys_elem.value);
            GM_setValue('dbs', dbs_elem.value);
            keys = GM_getValue('keys', '');
            dbs = GM_getValue('dbs', '/sylveon/keys');
        } else if (id === 0) {
            let keyPairTmp = {
                "private": privateTxt.value.length < 1 ? keyPair.private : privateTxt.value,
                "public": publicTxt.value
            };
            if ((keyPairTmp.public !== keyPair.public || keyPairTmp.private !== keyPair.private) && (keyPair.private === null || keyPair.public === null || confirm('Are you sure you would like to change your key pairs? This cannot be undone.'))) {
                if (!(/^[a-f0-9]{64}$/g.test(keyPairTmp.public)) || !(/^30[0-9a-f]{2}02010030[0-9a-f]{2}06032b657004[0-9a-f]{2}0420(.{64})/g.test(keyPairTmp.private))) {
                    alert(`Error setting key: Key is invalid`);
                    return;
                }
                keyPair = keyPairTmp;
                let tmpPublic = keyPair.public;
                GM_setValue('keyPair', JSON.stringify(keyPair));
                keys += '\n' + JSON.stringify({user: unsafeWindow.state.userModel.username, key: tmpPublic});
                keys_elem.value = keys;
                GM_setValue('keys', keys);
                const dbs2 = dbs.split('\n');
                let closedSockets = 0, totalSockets = 0;
                for (let i in dbs2) {
                    totalSockets++;
                    let world = dbs2[i];
                    if (!world.startsWith('/')) {
                        world = '/' + world;
                    }
                    if (!world.endsWith('/')) {
                        world += '/';
                    }
                    let tmpWs = new WebSocket('wss://ourworldoftext.com'+world+'ws/');
                    tmpWs.onopen = function() {
                        tmpWs.send(JSON.stringify({"kind":"chat","nickname":unsafeWindow.YourWorld.Nickname,"message":tmpPublic,"location":"page","color":"#000000"}));
                    };

                    let msgData;
                    let msgDeleted = false;
                    let isClosed = false;
                    tmpWs.onmessage = function(data) {
                        let msg = JSON.parse(data.data);
                        if (msg.kind === 'chat' && msg.realUsername === unsafeWindow.state.userModel.username && msg.message === tmpPublic) {
                            msgData = {id: msg.id, time: msg.date};
                        } else if (msg.kind === 'chatdelete') {
                            if (typeof msgData !== "undefined" && msg.id === msgData.id && msg.time === msgData.time) {
                                closedSockets++;
                                tmpWs.close();
                                isClosed = true;
                            }
                        }
                    }
                    tmpWs.onclose = function() {
                        if (closedSockets === totalSockets) {
                            unsafeWindow.w.doAnnounce('Warning: At least one of your configured databases did not save your key. Signing text will continue to work, but other users may not be able to verify your signatures.', 'databaseTimedOutAnnouncement');
                        }
                    };
                    setTimeout(function() {
                        if (!isClosed) {
                            closedSockets++;
                            tmpWs.close();
                        }
                    }, 15000);
                }
            }
        }
        div4.querySelector('#status_verify').innerHTML = '';
        div4.querySelectorAll('.manual_entry').forEach(a=>{a.removeAttribute('style')});
    };
	ui.onClose(function() {
        privateTxt.value = '';
		div4.querySelectorAll('.manual_entry').forEach(a=>{a.removeAttribute('style')});
		div4.querySelector('#status_verify').innerHTML = '';
	});
    ui.onTabChange(function() {
        div4.querySelector('#status_verify').innerHTML = '';
        div4.querySelectorAll('.manual_entry').forEach(a=>{a.removeAttribute('style')});
        privateTxt.value = '';
        setTimeout(() => {
            ui.client.querySelector('.submitarea').appendChild(submit);
			ui.client.style.overflow = 'scroll';
        }, 0);
    });

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
        return new Promise(async function(res, rej) {
            try {
                let contents = [];
                let y = 0;
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
            } catch (e) {
                rej(e);
            }
        });
    };

    async function updateAllDbs(callback = null) {
        const tmp_db = keys.split('\n').filter(a=>a.length>0);
        const dbs2 = dbs.split('\n');
        for (let i in dbs2) {
            let world = dbs2[i];
            if (!world.startsWith('/')) {
                world = '/' + world;
            }
            if (callback) {
                callback({"done": false, "status": Number(i), "total": dbs2.length});
            }
            try {
                let db = await fetch_db(dbs2[i]);
                delete db[db.length-1];
                for (let k in db) {
                    if ('user' in db[k] && 'key' in db[k]) {
                        const append = JSON.stringify({"user":db[k].user,"key":db[k].key});
                        if (!tmp_db.includes(append)) {
                            tmp_db.push(append);
                        }
                    }
                }
            } catch (e) {
                await fetch(`https://ourworldoftext.com${world}?fetch=1&min_tileX=0&max_tileX=0&min_tileY=-1&max_tileY=-1&content_only=true&concat=true`).then(r=>r.text()).then(r => {
                    try {
                        const parsed = JSON.parse(r.trim());
                        if ('v' in parsed) {
                            unsafeWindow.w.doAnnounce(`Failed to fetch <b>${dbs2[i]}</b>: World not yet supported`);
                        }
                    } catch (err) {
                        window.console.warn(`Database ${dbs2[i]} failed to fetch: ${e}`);
                        unsafeWindow.w.doAnnounce(`Failed to fetch <b>${dbs2[i]}</b>: ${e}`);
                    };
                }).catch(err => {
                    window.console.warn(`Database ${dbs2[i]} failed to fetch: ${e}`);
                    unsafeWindow.w.doAnnounce(`Failed to fetch <b>${dbs2[i]}</b>: ${e}`);
                });
            }
            if (callback && Number(i) === dbs2.length - 1) {
                callback({"done": true, "status": dbs2.length, "total": dbs2.length});
            }
        }
        GM_setValue('keys', tmp_db.join('\n'));
        keys = tmp_db.join('\n');
        keys_elem.value = keys;
        GM_setValue('lastFetch', Date.now());
    };

    if (Date.now() - last_fetch > 1000*60*30) {
        updateAllDbs();
    }

    argon2 = (()=>{var A,I,g={773:(A,I,g)=>{var B,Q="undefined"!=typeof self&&void 0!==self.Module?self.Module:{},C={};for(B in Q)Q.hasOwnProperty(B)&&(C[B]=Q[B]);var E,i,o,D,e=[];E="object"==typeof window,i="function"==typeof importScripts,o="object"==typeof process&&"object"==typeof process.versions&&"string"==typeof process.versions.node,D=!E&&!o&&!i;var n,t,a,r,s,y="";o?(y=i?g(967).dirname(y)+"/":"//",n=function(A,I){return r||(r=g(145)),s||(s=g(967)),A=s.normalize(A),r.readFileSync(A,I?null:"utf8")},a=function(A){var I=n(A,!0);return I.buffer||(I=new Uint8Array(I)),G(I.buffer),I},process.argv.length>1&&process.argv[1].replace(/\\/g,"/"),e=process.argv.slice(2),A.exports=Q,process.on("uncaughtException",(function(A){if(!(A instanceof V))throw A})),process.on("unhandledRejection",u),Q.inspect=function(){return"[Emscripten Module object]"}):D?("undefined"!=typeof read&&(n=function(A){return read(A)}),a=function(A){var I;return"function"==typeof readbuffer?new Uint8Array(readbuffer(A)):(G("object"==typeof(I=read(A,"binary"))),I)},"undefined"!=typeof scriptArgs?e=scriptArgs:void 0!==arguments&&(e=arguments),"undefined"!=typeof print&&("undefined"==typeof console&&(console={}),console.log=print,console.warn=console.error="undefined"!=typeof printErr?printErr:print)):(E||i)&&(i?y=self.location.href:"undefined"!=typeof document&&document.currentScript&&(y=document.currentScript.src),y=0!==y.indexOf("blob:")?y.substr(0,y.lastIndexOf("/")+1):"",n=function(A){var I=new XMLHttpRequest;return I.open("GET",A,!1),I.send(null),I.responseText},i&&(a=function(A){var I=new XMLHttpRequest;return I.open("GET",A,!1),I.responseType="arraybuffer",I.send(null),new Uint8Array(I.response)}),t=function(A,I,g){var B=new XMLHttpRequest;B.open("GET",A,!0),B.responseType="arraybuffer",B.onload=function(){200==B.status||0==B.status&&B.response?I(B.response):g()},B.onerror=g,B.send(null)}),Q.print||console.log.bind(console);var F,c,w=Q.printErr||console.warn.bind(console);for(B in C)C.hasOwnProperty(B)&&(Q[B]=C[B]);C=null,Q.arguments&&(e=Q.arguments),Q.thisProgram&&Q.thisProgram,Q.quit&&Q.quit,Q.wasmBinary&&(F=Q.wasmBinary),Q.noExitRuntime,"object"!=typeof WebAssembly&&u("no native wasm support detected");var h=!1;function G(A,I){A||u("Assertion failed: "+I)}var N,R,f="undefined"!=typeof TextDecoder?new TextDecoder("utf8"):void 0;function U(A){N=A,Q.HEAP8=new Int8Array(A),Q.HEAP16=new Int16Array(A),Q.HEAP32=new Int32Array(A),Q.HEAPU8=R=new Uint8Array(A),Q.HEAPU16=new Uint16Array(A),Q.HEAPU32=new Uint32Array(A),Q.HEAPF32=new Float32Array(A),Q.HEAPF64=new Float64Array(A)}Q.INITIAL_MEMORY;var M,Y=[],S=[],H=[],d=0,k=null,J=null;function u(A){throw Q.onAbort&&Q.onAbort(A),w(A+=""),h=!0,A="abort("+A+"). Build with -s ASSERTIONS=1 for more info.",new WebAssembly.RuntimeError(A)}function p(A){return A.startsWith("data:application/octet-stream;base64,")}function L(A){return A.startsWith("file://")}Q.preloadedImages={},Q.preloadedAudios={};var l,K="argon2.wasm";function q(A){try{if(A==K&&F)return new Uint8Array(F);if(a)return a(A);throw"both async and sync fetching of the wasm failed"}catch(A){u(A)}}function b(A){for(;A.length>0;){var I=A.shift();if("function"!=typeof I){var g=I.func;"number"==typeof g?void 0===I.arg?M.get(g)():M.get(g)(I.arg):g(void 0===I.arg?null:I.arg)}else I(Q)}}function x(A){try{return c.grow(A-N.byteLength+65535>>>16),U(c.buffer),1}catch(A){}}p(K)||(l=K,K=Q.locateFile?Q.locateFile(l,y):y+l);var m,X={a:function(A,I,g){R.copyWithin(A,I,I+g)},b:function(A){var I,g=R.length,B=2147418112;if((A>>>=0)>B)return!1;for(var Q=1;Q<=4;Q*=2){var C=g*(1+.2/Q);if(C=Math.min(C,A+100663296),x(Math.min(B,((I=Math.max(A,C))%65536>0&&(I+=65536-I%65536),I))))return!0}return!1}},W=(function(){var A={a:X};function I(A,I){var g,B=A.exports;Q.asm=B,U((c=Q.asm.c).buffer),M=Q.asm.k,g=Q.asm.d,S.unshift(g),function(A){if(d--,Q.monitorRunDependencies&&Q.monitorRunDependencies(d),0==d&&(null!==k&&(clearInterval(k),k=null),J)){var I=J;J=null,I()}}()}function g(A){I(A.instance)}function B(I){return function(){if(!F&&(E||i)){if("function"==typeof fetch&&!L(K))return fetch(K,{credentials:"same-origin"}).then((function(A){if(!A.ok)throw"failed to load wasm binary file at '"+K+"'";return A.arrayBuffer()})).catch((function(){return q(K)}));if(t)return new Promise((function(A,I){t(K,(function(I){A(new Uint8Array(I))}),I)}))}return Promise.resolve().then((function(){return q(K)}))}().then((function(I){return WebAssembly.instantiate(I,A)})).then(I,(function(A){w("failed to asynchronously prepare wasm: "+A),u(A)}))}if(d++,Q.monitorRunDependencies&&Q.monitorRunDependencies(d),Q.instantiateWasm)try{return Q.instantiateWasm(A,I)}catch(A){return w("Module.instantiateWasm callback failed with error: "+A),!1}F||"function"!=typeof WebAssembly.instantiateStreaming||p(K)||L(K)||"function"!=typeof fetch?B(g):fetch(K,{credentials:"same-origin"}).then((function(I){return WebAssembly.instantiateStreaming(I,A).then(g,(function(A){return w("wasm streaming compile failed: "+A),w("falling back to ArrayBuffer instantiation"),B(g)}))}))}(),Q.___wasm_call_ctors=function(){return(Q.___wasm_call_ctors=Q.asm.d).apply(null,arguments)},Q._argon2_hash=function(){return(Q._argon2_hash=Q.asm.e).apply(null,arguments)},Q._malloc=function(){return(W=Q._malloc=Q.asm.f).apply(null,arguments)}),T=(Q._free=function(){return(Q._free=Q.asm.g).apply(null,arguments)},Q._argon2_verify=function(){return(Q._argon2_verify=Q.asm.h).apply(null,arguments)},Q._argon2_error_message=function(){return(Q._argon2_error_message=Q.asm.i).apply(null,arguments)},Q._argon2_encodedlen=function(){return(Q._argon2_encodedlen=Q.asm.j).apply(null,arguments)},Q._argon2_hash_ext=function(){return(Q._argon2_hash_ext=Q.asm.l).apply(null,arguments)},Q._argon2_verify_ext=function(){return(Q._argon2_verify_ext=Q.asm.m).apply(null,arguments)},Q.stackAlloc=function(){return(T=Q.stackAlloc=Q.asm.n).apply(null,arguments)});function V(A){this.name="ExitStatus",this.message="Program terminated with exit("+A+")",this.status=A}function j(A){function I(){m||(m=!0,Q.calledRun=!0,h||(b(S),Q.onRuntimeInitialized&&Q.onRuntimeInitialized(),function(){if(Q.postRun)for("function"==typeof Q.postRun&&(Q.postRun=[Q.postRun]);Q.postRun.length;)A=Q.postRun.shift(),H.unshift(A);var A;b(H)}()))}A=A||e,d>0||(function(){if(Q.preRun)for("function"==typeof Q.preRun&&(Q.preRun=[Q.preRun]);Q.preRun.length;)A=Q.preRun.shift(),Y.unshift(A);var A;b(Y)}(),d>0||(Q.setStatus?(Q.setStatus("Running..."),setTimeout((function(){setTimeout((function(){Q.setStatus("")}),1),I()}),1)):I()))}if(Q.allocate=function(A,I){var g;return g=1==I?T(A.length):W(A.length),A.subarray||A.slice?R.set(A,g):R.set(new Uint8Array(A),g),g},Q.UTF8ToString=function(A,I){return A?function(A,I,g){for(var B=I+g,Q=I;A[Q]&&!(Q>=B);)++Q;if(Q-I>16&&A.subarray&&f)return f.decode(A.subarray(I,Q));for(var C="";I<Q;){var E=A[I++];if(128&E){var i=63&A[I++];if(192!=(224&E)){var o=63&A[I++];if((E=224==(240&E)?(15&E)<<12|i<<6|o:(7&E)<<18|i<<12|o<<6|63&A[I++])<65536)C+=String.fromCharCode(E);else{var D=E-65536;C+=String.fromCharCode(55296|D>>10,56320|1023&D)}}else C+=String.fromCharCode((31&E)<<6|i)}else C+=String.fromCharCode(E)}return C}(R,A,I):""},Q.ALLOC_NORMAL=0,J=function A(){m||j(),m||(J=A)},Q.run=j,Q.preInit)for("function"==typeof Q.preInit&&(Q.preInit=[Q.preInit]);Q.preInit.length>0;)Q.preInit.pop()();j(),A.exports=Q,Q.unloadRuntime=function(){"undefined"!=typeof self&&delete self.Module,Q=c=M=N=R=void 0,delete A.exports}},631:function(A,I,g){var B,Q;"undefined"!=typeof self&&self,void 0===(Q="function"==typeof(B=function(){const A="undefined"!=typeof self?self:this,I={Argon2d:0,Argon2i:1,Argon2id:2};function B(I){if(B._promise)return B._promise;if(B._module)return Promise.resolve(B._module);let C;return C=A.process&&A.process.versions&&A.process.versions.node?Q().then((A=>new Promise((I=>{A.postRun=()=>I(A)})))):(A.loadArgon2WasmBinary?A.loadArgon2WasmBinary():Promise.resolve(g(721)).then((A=>function(A){const I=atob(A),g=new Uint8Array(new ArrayBuffer(I.length));for(let A=0;A<I.length;A++)g[A]=I.charCodeAt(A);return g}(A)))).then((g=>function(I,g){return new Promise((B=>(A.Module={wasmBinary:I,wasmMemory:g,postRun(){B(Module)}},Q())))}(g,I?function(A){const I=1024,g=64*I,B=(1024*I*1024*2-64*I)/g,Q=Math.min(Math.max(Math.ceil(A*I/g),256)+256,B);return new WebAssembly.Memory({initial:Q,maximum:B})}(I):void 0))),B._promise=C,C.then((A=>(B._module=A,delete B._promise,A)))}function Q(){return A.loadArgon2WasmModule?A.loadArgon2WasmModule():Promise.resolve(g(773))}function C(A,I){return A.allocate(I,"i8",A.ALLOC_NORMAL)}function E(A,I){return C(A,new Uint8Array([...I,0]))}function i(A){if("string"!=typeof A)return A;if("function"==typeof TextEncoder)return(new TextEncoder).encode(A);if("function"==typeof Buffer)return Buffer.from(A);throw new Error("Don't know how to encode UTF8")}return{ArgonType:I,hash:function(A){const g=A.mem||1024;return B(g).then((B=>{const Q=A.time||1,o=A.parallelism||1,D=i(A.pass),e=E(B,D),n=D.length,t=i(A.salt),a=E(B,t),r=t.length,s=A.type||I.Argon2d,y=B.allocate(new Array(A.hashLen||24),"i8",B.ALLOC_NORMAL),F=A.secret?C(B,A.secret):0,c=A.secret?A.secret.byteLength:0,w=A.ad?C(B,A.ad):0,h=A.ad?A.ad.byteLength:0,G=A.hashLen||24,N=B._argon2_encodedlen(Q,g,o,r,G,s),R=B.allocate(new Array(N+1),"i8",B.ALLOC_NORMAL);let f,U,M;try{U=B._argon2_hash_ext(Q,g,o,e,n,a,r,y,G,R,N,s,F,c,w,h,19)}catch(A){f=A}if(0!==U||f){try{f||(f=B.UTF8ToString(B._argon2_error_message(U)))}catch(A){}M={message:f,code:U}}else{let A="";const I=new Uint8Array(G);for(let g=0;g<G;g++){const Q=B.HEAP8[y+g];I[g]=Q,A+=("0"+(255&Q).toString(16)).slice(-2)}M={hash:I,hashHex:A,encoded:B.UTF8ToString(R)}}try{B._free(e),B._free(a),B._free(y),B._free(R),w&&B._free(w),F&&B._free(F)}catch(A){}if(f)throw M;return M}))},verify:function(A){return B().then((g=>{const B=i(A.pass),Q=E(g,B),o=B.length,D=A.secret?C(g,A.secret):0,e=A.secret?A.secret.byteLength:0,n=A.ad?C(g,A.ad):0,t=A.ad?A.ad.byteLength:0,a=E(g,i(A.encoded));let r,s,y,F=A.type;if(void 0===F){let g=A.encoded.split("$")[1];g&&(g=g.replace("a","A"),F=I[g]||I.Argon2d)}try{s=g._argon2_verify_ext(a,Q,o,D,e,n,t,F)}catch(A){r=A}if(s||r){try{r||(r=g.UTF8ToString(g._argon2_error_message(s)))}catch(A){}y={message:r,code:s}}try{g._free(Q),g._free(a)}catch(A){}if(r)throw y;return y}))},unloadRuntime:function(){B._module&&(B._module.unloadRuntime(),delete B._promise,delete B._module)}}})?B.apply(I,[]):B)||(A.exports=Q)},721:function(A,I){A.exports="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DwtBixEPC0GeEyEBCyABC48DAQF/IwBBgANrIgQkACAEQQA2AowBIARBjAFqIAEQBwJAIAFBwABNBEAgBEGQAWogARAYQQBIDQEgBEGQAWogBEGMAWpBBBAGQQBIDQEgBEGQAWogAiADEAZBAEgNASAEQZABaiAAIAEQEhoMAQsgBEGQAWpBwAAQGEEASA0AIARBkAFqIARBjAFqQQQQBkEASA0AIARBkAFqIAIgAxAGQQBIDQAgBEGQAWogBEFAa0HAABASQQBIDQAgACAEKQNANwAAIAAgBCkDSDcACCAAIAQpA1g3ABggACAEKQNQNwAQIABBIGohACABQSBrIgJBwQBPBEADQCAEIARBQGtBwAAQBSIBQUBrQcAAIAEQMUEASA0CIAAgASkDQDcAACAAIAEpA0g3AAggACAEKQNYNwAYIAAgBCkDUDcAECAAQSBqIQAgAkEgayICQcAASw0ACwsgBCAEQUBrQcAAEAUiAUFAayACIAEQMUEASA0AIAAgAUFAayACEAUaCyAEQZABakHwARAEIARBgANqJAALAwABC5kCACAARQRAQQAPCwJ/AkAgAAR/IAFB/wBNDQECQEGgHigCACgCAEUEQCABQYB/cUGAvwNGDQMMAQsgAUH/D00EQCAAIAFBP3FBgAFyOgABIAAgAUEGdkHAAXI6AABBAgwECyABQYCwA09BACABQYBAcUGAwANHG0UEQCAAIAFBP3FBgAFyOgACIAAgAUEMdkHgAXI6AAAgACABQQZ2QT9xQYABcjoAAUEDDAQLIAFBgIAEa0H//z9NBEAgACABQT9xQYABcjoAAyAAIAFBEnZB8AFyOgAAIAAgAUEGdkE/cUGAAXI6AAIgACABQQx2QT9xQYABcjoAAUEEDAQLC0HcHkEZNgIAQX8FQQELDAELIAAgAToAAEEBCwtQAQN/AkAgACgCACwAABAPRQRADAELA0AgACgCACICLAAAIQMgACACQQFqNgIAIAEgA2pBMGshASACLAABEA9FDQEgAUEKbCEBDAALAAsgAQu7AgACQCABQRRLDQACQAJAAkACQAJAAkACQAJAAkACQCABQQlrDgoAAQIDBAUGBwgJCgsgAiACKAIAIgFBBGo2AgAgACABKAIANgIADwsgAiACKAIAIgFBBGo2AgAgACABNAIANwMADwsgAiACKAIAIgFB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AUHjFEEDEBANACABQQNqIANBDGoQFSIBRQ0AIAAgAygCDDYCKCABQecUQQMQEA0AIAFBA2ogA0EMahAVIgFFDQAgACADKAIMIgQ2AjAgACAENgI0IAEtAABBJEcNACADIAc2AgwgACgCECADQQxqIAFBAWoQLCIBRQ0AIAAgAygCDDYCFCABLQAAQSRHDQAgAyAGNgIMIAAoAgAgA0EMaiABQQFqECwiAUUNACAAIAMoAgw2AgQgAEEANgJEIABCADcCPCAAQgA3AhggAEIANwIgIAAQHCICDQBBYEEAIAEtAAAbIQILIANBEGokACACCykBAn8DQCAAIAJBA3QiA2ogASADaikAADcDACACQQFqIgJBgAFHDQALCwwAIABBAEGACBALGgtlAQJ/IAAgAhAeIgIEfyACBUFdQQACfyAAKAIAIQRBACECIAAoAgQiAAR/A0AgAyACIARqLQAAIAEgAmotAABzciEDIAJBAWoiAiAARw0ACyADQQFrQQh2QQFxQQFrBUEACwsbCwtdAQJ/IwBB8AFrIgMkAEF/IQQCQCACRSAARSABRXJyIAFBwABLcg0AIAMgARAYQQBIDQAgAyACQcAAEAZBAEgNACADIAAgARASIQQLIANB8AEQBCADQfABaiQAIAQLCQAgACABNwAACxAAIwAgAGtBcHEiACQAIAALMwEBfyAAKAIUIgMgASACIAAoAhAgA2siASABIAJLGyIBEAUaIAAgACgCFCABajYCFCACC9oBAQR/IwBB0ABrIggkAAJAIABFBEBBYCEADAELIAggABAKIgk2AgwgCCAJNgIcIAggCRAJIgo2AhggCCAJEAkiCzYCCEEAIQkCQAJAIApFIAtFcg0AIAggAjYCFCAIIAE2AhAgCEEIaiAAIAcQLSIADQEgCCgCCCEJIAggCCgCDBAJIgA2AgggAEUNACAIIAY2AiwgCCAFNgIoIAggBDYCJCAIIAM2AiAgCEEIaiAJIAcQMCEADAELQWohAAsgCCgCGBAIIAgoAggQCCAJEAgLIAhB0ABqJAAgAAuQAgEDfyMAQdAAayIRJABBfiETAkAgCEEESQ0AIAgQCSISRQRAQWohEwwBCyARQQA2AkwgEUIANwJEIBEgAjYCPCARIAI2AjggESABNgI0IBEgADYCMCARIA82AiwgESAONgIoIBEgDTYCJCAR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IGxvbmcgb3IgdG9vIHNob3J0AE1pc3NpbmcgYXJndW1lbnRzAFRvbyBtYW55IGxhbmVzAFRvbyBmZXcgbGFuZXMAVG9vIG1hbnkgdGhyZWFkcwBOb3QgZW5vdWdoIHRocmVhZHMATWVtb3J5IGFsbG9jYXRpb24gZXJyb3IATWVtb3J5IGNvc3QgaXMgdG9vIHNtYWxsAFRpbWUgY29zdCBpcyB0b28gc21hbGwAYXJnb24yaQBBcmdvbjJpAFRoZSBwYXNzd29yZCBkb2VzIG5vdCBtYXRjaCB0aGUgc3VwcGxpZWQgaGFzaABPdXRwdXQgcG9pbnRlciBtaXNtYXRjaABPdXRwdXQgaXMgdG9vIGxvbmcAU2FsdCBpcyB0b28gbG9uZwBTZWNyZXQgaXMgdG9vIGxvbmcAUGFzc3dvcmQgaXMgdG9vIGxvbmcAQXNzb2NpYXRlZCBkYXRhIGlzIHRvbyBsb25nAFRocmVhZGluZyBmYWlsdXJlAE1lbW9yeSBjb3N0IGlzIHRvbyBsYXJnZQBUaW1lIGNvc3QgaXMgdG9vIGxhcmdlAFVua25vd24gZXJyb3IgY29kZQBhcmdvbjJpZABBcmdvbjJpZABFbmNvZGluZyBmYWlsZWQARGVjb2RpbmcgZmFpbGVkAGFyZ29uMmQAQXJnb24yZABBcmdvbjJfQ29udGV4dCBjb250ZXh0IGlzIE5VTEwAT3V0cHV0IHBvaW50ZXIgaXMgTlVMTABUaGUgYWxsb2NhdGUgbWVtb3J5IGNhbGxiYWNrIGlzIE5VTEwAVGhlIGZyZWUgbWVtb3J5IGNhbGxiYWNrIGlzIE5VTEwAT0sAJHY9ACx0PQAscD0AJG09AFRoZXJlIGlzIG5vIHN1Y2ggdmVyc2lvbiBvZiBBcmdvbjIAU2FsdCBwb2ludGVyIGlzIE5VTEwsIGJ1dCBzYWx0IGxlbmd0aCBpcyBub3QgMABTZWNyZXQgcG9pbnRlciBpcyBOVUxMLCBidXQgc2VjcmV0IGxlbmd0aCBpcyBub3QgMABQYXNzd29yZCBwb2ludGVyIGlzIE5VTEwsIGJ1dCBwYXNzd29yZCBsZW5ndGggaXMgbm90IDAAQXNzb2NpYXRlZCBkYXRhIHBvaW50ZXIgaXMgTlVMTCwgYnV0IGFkIGxlbmd0aCBpcyBub3QgMAAobnVsbCkAAACbCAAAuwcAAEkJAADACQAAsAkAAPAHAAAfCAAAMAgAAMkIAABvCgAA4AkAABYKAAA7CgAAQwgAACsLAADBCgAAkgoAAPQKAAACCAAAEQgAAFsJAABbCAAAdAkAAHQIAAAFCQAAdAcAAC0JAACeBwAA9AgAAGIHAAAYCQAAiAcAAOEIAABOBwAA/wkAAFwKAAABAEGkGAsBAgBByxgLBf//////AEGQGQtBEQAKABEREQAAAAAFAAAAAAAACQAAAAALAAAAAAAAAAARAA8KERERAwoHAAEACQsLAAAJBgsAAAsABhEAAAAREREAQeEZCyELAAAAAAAAAAARAAoKERERAAoAAAIACQsAAAAJAAsAAAsAQZsaCwEMAEGnGgsVDAAAAAAMAAAAAAkMAAAAAAAMAAAMAEHVGgsBDgBB4RoLFQ0AAAAEDQAAAAAJDgAAAAAADgAADgBBjxsLARAAQZsbCx4PAAAAAA8AAAAACRAAAAAAABAAABAAABIAAAASEhIAQdIbCw4SAAAAEhISAAAAAAAACQBBgxwLAQsAQY8cCxUKAAAAAAoAAAAACQsAAAAAAAsAAAsAQb0cCwEMAEHJHAsnDAAAAAAMAAAAAAkMAAAAAAAMAAAMAAAwMTIzNDU2Nzg5QUJDREVGAEHwHAsBAQBBoB4LAogPAEHYHgsDkBFQ"},145:()=>{},967:()=>{}},B={};function Q(A){var I=B[A];if(void 0!==I)return I.exports;var C=B[A]={exports:{}};return g[A].call(C.exports,C,C.exports,Q),C.exports}return I=Object.getPrototypeOf?A=>Object.getPrototypeOf(A):A=>A.__proto__,Q.t=function(g,B){if(1&B&&(g=this(g)),8&B)return g;if("object"==typeof g&&g){if(4&B&&g.__esModule)return g;if(16&B&&"function"==typeof g.then)return g}var C=Object.create(null);Q.r(C);var E={};A=A||[null,I({}),I([]),I(I)];for(var i=2&B&&g;"object"==typeof i&&!~A.indexOf(i);i=I(i))Object.getOwnPropertyNames(i).forEach((A=>E[A]=()=>g[A]));return E.default=()=>g,Q.d(C,E),C},Q.d=(A,I)=>{for(var g in I)Q.o(I,g)&&!Q.o(A,g)&&Object.defineProperty(A,g,{enumerable:!0,get:I[g]})},Q.o=(A,I)=>Object.prototype.hasOwnProperty.call(A,I),Q.r=A=>{"undefined"!=typeof Symbol&&Symbol.toStringTag&&Object.defineProperty(A,Symbol.toStringTag,{value:"Module"}),Object.defineProperty(A,"__esModule",{value:!0})},Q(631)})();
	baseConvert = function(t,e,n){let o=0,f=[];for(;;){let l=0,r=!0;for(let f=o;f<t.length;f++){let i=e*l+t[f];t[f]=Math.floor(i/n),l=i%n,r&&(t[f]?r=!1:o=f)}if(f.unshift(l),r)return f}};
})();
