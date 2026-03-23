# OWOT Text Signatures

This is a userscript for [Our World of Text](https://ourworldoftext.com/), allowing users to cryptographically sign text written on the canvas, then later verify who wrote it.

## Why this exists

OWOT is intentionally designed to be open. Anyone can write text anywhere, which is part of what makes it interesting. However, that same openness also creates a fundamental lack of trust and authorship. Anyone can easily alter text, reuse someone else's name, or can claim credit for something they did not write.

This script addresses this issue using digital signatures. A user generates a key pair, keeps the private key secret, then shares the public key with others. When the user writes text, they can *sign* it with their private key. Anyone who later sees that text can then *verify* the signature using the author's public key. This allows users to determine both whether or not the text is authentic *and* the author of the text.

## How it works

The script adds a modal interface to OWOT, including multiple tabs for key management, signing, verification, and options. The user can sign or verify text by either entering it manually, or by directly signing a region of text on the canvas.

When signing, the script strips any padding present in the selected text, hashes it (SHA-256), signs it (`Ed25519`), and stores the results alongside various other metadata (such as the original text or a timestamp). The metadata is then stored into a `note:` link and written back onto the canvas.

When verifying, the script reads the metadata, hashes the text, and compares it to the stored hash. If they match, it then verifies the signature against a list of known public keys. If a match is found, the script marks the text as valid. If verification fails or an error is encountered, the text is marked as invalid.

## Usage

After installing the script, a new option (**OWOT Text Signatures**) will appear under the OWOT Menu. Click on it to open the interface.
The "Sign text" tab allows you to sign text, either by manual entry or by a selection. You must have a key pair to sign text.
The "Verify text" tab allows you to verify text, either by manual entry or by a selection.
The "Manage keys" tab allows you to generate a new key pair, either randomly, or by deriving one from a username and password.
The "Options" tab allows you to manage configured public keys and database worlds.

## Other design notes

To make verification easier, the script is designed to automatically keep an up-to-date list of public keys. This list is retrieved from a configured list of database worlds, periodically downloading them and appending it to the cache. This makes it easier for people to verify signatures without manually entering every public key themselves.

This feature is *optional*, and only exists for convenience. Relying on a database world assumes that the database has not been tampered with, and that the stored keys are accurate. For security-sensitive scenarios, this script supports manual key entry.

## Limitations

At a fundamental level, this script can only reliably prove that a block of text was signed by a specific private key. A valid signature does not guarantee that the signer originally wrote the text. For example: If someone copies text and signs it themselves, this script will still mark the text as valid, despite not being the same author. If a private key is leaked somehow, an attacker can sign their own, illegitimate text. It is impossible to detect either scenario.

## Compatibility

This script is designed to be backwards-compatible; text signed in previous versions may be verified successfully in the latest version. In addition, this script is designed to be compatible with the following other scripts (verification only):
- HashBrown 2 by gimmickCellar

## Other notes

I created this script not long after the start of the 2026 Color Ban, when the lack of text colors made it significantly harder to tell whose text I was reading. I had also already seen several attempts to solve the trust problems that come with writing on the canvas, but I had yet to find one that did so without significant flaws.

Many of those scripts relied on character-by-character hashes. The idea was that only the original author could produce the correct hash, and that anyone who wanted to verify it would have to ask the creator of the script whether the hash was genuine. But that approach creates a dependency on being able to contact the original author, which is not always possible. It also means that if the author later becomes unwilling to stand behind what they wrote, they can simply deny it and claim the text was fake. On top of that, the system is exploitable by design. An attacker can copy hashes for individual characters, then simply rearrange them to form a completely different message. Each hash would still be valid, but it would no longer represent the original text.

Even with those problems, that kind of verification script was essentially the only option available at the time. Since I had enough cryptographic knowledge and programming experience, I decided to make my own script instead, with the goal of following better security practices and avoiding the weaknesses I had seen in earlier attempts.
