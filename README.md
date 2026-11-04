# Spicy Lyrics — Aloncie's fork

This is an unofficial fork of [Spicy Lyrics](https://github.com/Spikerko/spicy-lyrics) with extra features and fixes on top. Everything else is the original extension, kept in sync with the main project.

> [!NOTE]
> **I don't write the code myself.** The changes in this fork are made with an AI coding agent (Claude Code); I decide what to change, test the results in my own Spotify, and maintain the fork. Keep that in mind when you use it or read the code.
>
> I mainly add what I need myself. Suggestions are welcome as issues, but I may decline ones I wouldn't use, since every extra feature is more to keep working after updates.

> [!IMPORTANT]
> This fork is not supported by the Spicy Lyrics team. If something breaks here, please [open an issue in this fork](https://github.com/Aloncie/spicy-lyrics/issues), not in the Spicy Lyrics Discord.

## What's different

All of these live in **Settings → Experiments**, so each one can be turned off to get the original behaviour back.

| Change | What it does | Branch |
| --- | --- | --- |
| Add to playlist | A button right of repeat in the fullscreen controls opens a list of your playlists over the artwork, so you can save the current track without leaving fullscreen. Playlists that already hold the track are checked, Liked Songs is listed too, and a click adds or removes the track without closing the list. The basic picker (click a playlist to add the track) is open as [PR #373](https://github.com/Spikerko/spicy-lyrics/pull/373); the checks and remove are only here. | [`feat/playlist-membership`](https://github.com/Aloncie/spicy-lyrics/tree/feat/playlist-membership) |
| Queue | A button in the fullscreen controls opens the queue over the lyrics, on the side away from the cover (on the right in compact mode): now playing, what you queued, next up, and a Recently played tab. Click a track to play it. Open as [PR #375](https://github.com/Spikerko/spicy-lyrics/pull/375). | [`feat/fullscreen-queue`](https://github.com/Aloncie/spicy-lyrics/tree/feat/fullscreen-queue) |
| Lyrics toggle | A button in the fullscreen controls hides the lyrics and centres the cover, the same layout shown for songs without lyrics. Click again to bring them back. | [`feat/fullscreen-lyrics-toggle`](https://github.com/Aloncie/spicy-lyrics/tree/feat/fullscreen-lyrics-toggle) |
| Remove recommendation | While smart shuffle plays a track it mixed in, a thumbs-down button left of shuffle in the fullscreen controls removes that recommendation, the same as Spotify's own button in the playbar. | [`feat/fullscreen-remove-recommendation`](https://github.com/Aloncie/spicy-lyrics/tree/feat/fullscreen-remove-recommendation) |
| Lyrics as text | A button in the view controls opens the lyrics as plain text, on the normal page and in fullscreen. Select any part and copy it with right-click → Copy (Ctrl+C doesn't work in the Spotify client), or use Copy all. Switches between original and romanized text. | [`feat/lyrics-text-panel`](https://github.com/Aloncie/spicy-lyrics/tree/feat/lyrics-text-panel) |
| Smart shuffle | The fullscreen shuffle button steps through off, shuffle and smart shuffle like Spotify's own button, and smart shuffle has its own icon. | [`fix/fullscreen-smart-shuffle`](https://github.com/Aloncie/spicy-lyrics/tree/fix/fullscreen-smart-shuffle) |
| Clearer shuffle/repeat | In fullscreen, shuffle and repeat are dimmed while off and get a dot while on, so you can tell them apart on any cover. | [`style/fullscreen-toggle-states`](https://github.com/Aloncie/spicy-lyrics/tree/style/fullscreen-toggle-states) |
| Escape leaves fullscreen *(personal preference, off by default)* | One Escape closes fullscreen instead of dropping to Cinema View first. Useful if you keep Spotify maximised. | [`personal/esc-exits-fullscreen`](https://github.com/Aloncie/spicy-lyrics/tree/personal/esc-exits-fullscreen) |

Each change also has its own branch based on the original code. Features and fixes the Spicy Lyrics team is open to, I send to the main project as pull requests, so everyone gets them there. The rest stay here for personal use.

## Install the fork

You need Spicetify installed (see [step 1 below](#1-install-spicetify)).

1. **Remove the official Spicy Lyrics** if you have it: Marketplace → Installed → Spicy Lyrics → Remove. Otherwise two copies run at once.
2. **Download `spicy-lyrics.js`** from the [latest release](https://github.com/Aloncie/spicy-lyrics/releases/latest).
3. **Put it in your Spicetify `Extensions` folder:**
   - Windows: `%appdata%\spicetify\Extensions`
   - macOS / Linux: `~/.config/spicetify/Extensions`
4. **Enable it and apply**, in a terminal:
   ```bash
   spicetify config extensions spicy-lyrics.js
   spicetify apply
   ```

### Updating

Download the new `spicy-lyrics.js` from the [releases](https://github.com/Aloncie/spicy-lyrics/releases), replace the old file, and run `spicetify apply` again. The fork does not update itself.

When the official Spicy Lyrics publishes a new version, the extension will show its "update is out" notice. Clicking *Update* only reloads Spotify and keeps the fork; wait for a new release here instead.

### Going back to the official version

```bash
spicetify config extensions spicy-lyrics.js-
spicetify apply
```

Then delete `spicy-lyrics.js` from the `Extensions` folder and install Spicy Lyrics from the Marketplace again.

---

*The original Spicy Lyrics README follows.*

# Spicy Lyrics
[![Github Version](https://img.shields.io/github/v/release/spikerko/spicy-lyrics)](https://github.com/spikerko/spicy-lyrics/) [![Github Stars badge](https://img.shields.io/github/stars/spikerko/spicy-lyrics?style=social)](https://github.com/spikerko/spicy-lyrics/) [![Discord Badge](https://dcbadge.limes.pink/api/server/uqgXU5wh8j?style=flat)](https://discord.com/invite/uqgXU5wh8j)

### *[oursitee](https://yoursit.ee/lyrics)*

Spicy Lyrics replaces Spotify's lyrics view with animated lyrics, dynamic backgrounds, romanization, and customization options. It is an open-source extension for the Spotify desktop client, built on [Spicetify](https://spicetify.app).

![Extension Example](./previews/wide_home.webp)

**Links:** [Guides](https://guides.spicylyrics.org/s/guides) · [FAQ](https://guides.spicylyrics.org/s/tools/doc/faq-anGSiKrnmX) · [Status](https://status.spicylyrics.org/) · [Discord](https://discord.gg/lyrc) · [Developers Platform](https://developers.spicylyrics.org)

## Installation

Spicy Lyrics runs only in the Spotify **desktop** client, through Spicetify. It does not need Spotify Premium.

### 1. Install Spicetify

**Windows** (PowerShell):

```powershell
iwr -useb https://raw.githubusercontent.com/spicetify/cli/main/install.ps1 | iex
```

**macOS / Linux** (Terminal):

```bash
curl -fsSL https://raw.githubusercontent.com/spicetify/cli/main/install.sh | sh
```

> [!WARNING]
> Spicetify cannot modify a Snap-based Spotify installation on Linux. See the [official Spicetify guide](https://spicetify.app/docs/getting-started) for other setups.

### 2. Check that the Marketplace is installed

Look for the **Marketplace** button in Spotify's top-left corner. If it's missing, install it:

**Windows:**

```powershell
iwr -useb https://raw.githubusercontent.com/spicetify/marketplace/main/resources/install.ps1 | iex
```

**macOS / Linux:**

```bash
curl -fsSL https://raw.githubusercontent.com/spicetify/marketplace/main/resources/install.sh | sh
```

### 3. Install Spicy Lyrics

1. Open the **Marketplace**.
2. Go to **Extensions** and search for **Spicy Lyrics**.
3. Select **Install**.

Play a song and open the lyrics view to confirm it loaded. Marketplace installs update automatically; restart Spotify if a new version hasn't appeared.

<details>
<summary><strong>Manual installation (not recommended)</strong></summary>

1. Download [`spicy-lyrics.mjs`](./builds/spicy-lyrics.mjs).
2. Put it in your Spicetify Extensions folder. [Find the folder for your OS](https://spicetify.app/docs/customization/extensions#manual-installation).
3. Run:

```bash
spicetify config extensions spicy-lyrics.mjs
spicetify apply
```

Manual installs don't update automatically.

</details>

## Troubleshooting

If Spicy Lyrics disappears after a Spotify update or fails to load, try these in order:

```bash
spicetify apply
spicetify backup apply
spicetify update
spicetify restore backup apply
```

**Lyrics missing, outdated, or wrong?**

1. Make sure you opened the song version you meant to. Singles, albums, deluxe, clean, and remastered releases can have different lyrics or timing.
2. Try another release of the same recording.
3. Clear the lyrics cache in Spicy Lyrics' settings, then reopen the song.
4. Check the [status page](https://status.spicylyrics.org/).
5. Search [#lyric-issues](https://discord.com/channels/1369992682214264993/1370023661830148106) on Discord, then report it with the exact Spotify link.

**High CPU or memory use?** Animated lyrics, dynamic backgrounds, themes, custom CSS, and other extensions all add load. Restart Spotify, test without other extensions or snippets, and check Spotify's hardware-acceleration setting.

### Reporting a bug

Search [#extension-bugs](https://discord.com/channels/1369992682214264993/1370023518313644193) first. If it's new, include:

- your operating system
- Spotify, Spicetify, and Spicy Lyrics versions
- exact steps to reproduce
- what you expected and what happened instead
- the affected song link, if relevant
- screenshots, video, or console errors

> [!CAUTION]
> Never share account tokens, cookies, authorization headers, or other secrets in a bug report.

Security issues go through [SECURITY.md](./SECURITY.md), not public channels.

## FAQ

<details>
<summary><strong>What types of lyrics are supported?</strong></summary>

| Type | What it does |
|------|--------------|
| Word-synced | Highlights individual words, or timed parts of words, as they're sung. |
| Line-synced | Advances one timed line at a time. |
| Static | Shows lyrics without timing. |

The sync type depends on the lyric data available for that exact track. There's no setting to turn line-synced lyrics into word-synced ones.

</details>

<details>
<summary><strong>Where do the lyrics come from?</strong></summary>

Community-uploaded TTML lyrics first, then other supported sources, including Apple Music and Spotify. What you see depends on availability, matching, and source priority.

</details>

<details>
<summary><strong>Can I use it on mobile?</strong></summary>

No. The extension runs in Spotify's desktop client only.

[Spicy Player](https://github.com/thex24/Spicy-Player/) is a separate offline Android music player by TX24 that ports the Spicy Lyrics experience. It is not a Spotify mobile extension.

</details>

<details>
<summary><strong>Can I use it offline?</strong></summary>

Online lyric lookup needs an internet connection. Lyrics you import into the **Lyrics Manager's** persistent local library stay on your device until you remove them.

</details>

<details>
<summary><strong>Can I use my own TTML file without uploading it?</strong></summary>

Yes. Open the **Lyrics Manager** and import the TTML as a temporary upload (for quick testing) or a persistent one (kept in your local library). There's no setting for adding other online lyric providers.

</details>

<details>
<summary><strong>Why is the timing off in Spotify?</strong></summary>

If one song is off, the lyric file may have been timed against a different release. Report it with the song link.

If every song is off on your device, use the playback-offset setting in Spicy Lyrics.

</details>

<details>
<summary><strong>Can I change the lyrics font?</strong></summary>

Install the font on your computer, then:

1. Open **Marketplace → Snippets → Add CSS**.
2. Paste this, replacing `Your Font Name` with the font's exact name:

   ```css
   * {
     font-family: "Your Font Name" !important;
   }
   ```

3. Name and save the snippet.
4. In Spicy Lyrics settings, enable **Use System Font** under **Appearance**.

This changes Spotify's whole interface font, not only the lyrics. Disable the snippet if characters go missing or layouts break.

</details>

<details>
<summary><strong>Where can I request a feature?</strong></summary>

Search [#extension-suggestions](https://discord.com/channels/1369992682214264993/1370023393675575369) first, then post if your idea isn't already there. Describe the problem and who it affects, not only the solution you want.

</details>

More answers are in the [full FAQ](https://guides.spicylyrics.org/s/tools/doc/faq-anGSiKrnmX).

## Contributing lyrics

Most word-synced lyrics in Spicy Lyrics are TTML files made by the community. TTML is an XML-based format that can store line and word timing, background vocals, duet positioning, and romanization, which LRC can't do consistently.

To make one, start with the [TTML Guide](https://guides.spicylyrics.org/s/ttml):

1. [Import the song](https://guides.spicylyrics.org/s/ttml/doc/1-import-the-song-iHfycCuOSU)
2. [Import the lyrics](https://guides.spicylyrics.org/s/ttml/doc/2-import-the-lyrics-CK0YxRxPwp)
3. [Check the lyrics](https://guides.spicylyrics.org/s/ttml/doc/3-check-the-lyrics-ZHDMonddCz)
4. [Sync the lyrics](https://guides.spicylyrics.org/s/ttml/doc/4-sync-the-lyrics-MJsQ3M0dIS)
5. [Add the songwriters](https://guides.spicylyrics.org/s/ttml/doc/5-add-the-songwriters-cP7OWZhyKd)
6. [Export and test the TTML](https://guides.spicylyrics.org/s/ttml/doc/6-export-and-test-the-ttml-nzae0Py9JJ)
7. [Submit your first TTML](https://guides.spicylyrics.org/s/ttml/doc/submit-your-first-ttml-sX53doCeNh)

Line-synced TTML is fully valid. If it's your first file, start with whole-word timing and learn syllable splitting later.

| Guide | Covers |
|-------|--------|
| [Transcription Guide](https://guides.spicylyrics.org/s/transcription) | Spelling, capitalization, punctuation, ad-libs, censored lyrics, repeats, and romanization |
| [Splitting Guide](https://guides.spicylyrics.org/s/splitting) | Splitting words into timed syllables, and which splits are accepted |
| [Uploading and TTML Rules](https://guides.spicylyrics.org/s/tools/doc/uploading-and-ttml-rules-rvofBBi0PV) | What an upload must meet to be approved |
| [Separating Vocals](https://guides.spicylyrics.org/s/tools/doc/separating-vocals-for-better-syncing-HYKpdByeMF) | Isolating vocals so words are easier to hear while syncing |
| [TTML Tool Feature Reference](https://guides.spicylyrics.org/s/tools/doc/ttml-tool-feature-reference-hx9XAG06L8) | Every feature of the TTML Tool |

The short version of the rules:

- **The recording is the source of truth.** Check copied lyrics against the exact song version; even official lyrics can be wrong.
- **No AI transcription or AI timing.** AI vocal separation is fine as a listening aid, and so is the TTML Tool's built-in automation, as long as you check its output.
- **No filler.** Don't add `[Instrumental]`, section headings, ellipses, or placeholders. Spicy Lyrics draws interludes itself.
- **One timing mode per file.** Line-synced or word-synced, never both.
- **One file per distinct version.** Different audio, censorship, intros, or timing need separate TTMLs.
- **No unreleased songs.** Wait until the song is playable on Spotify in at least one timezone.
- **Clear the lyrics cache after every upload**, then verify the result against the streamed song.

## Development

Requires [Bun](https://bun.sh) and a working Spicetify install.

```bash
bun install
bun run dev
bun run build
bun run lint
bun run fmt
```

## Support the project

- Donate to Spikerko on [Ko-fi](https://ko-fi.com/spikerko)
- Contribute code to this repository
- Boost the [Discord server](https://discord.gg/lyrc)
- Report bugs you can reproduce
- Make accurate TTML lyrics

## License

The extension is licensed under [AGPL-3.0](./LICENSE). The hosted services, databases, and websites behind Spicy Lyrics are separate and aren't covered by this license.

*Inspired by [Beautiful Lyrics](https://github.com/surfbryce/beautiful-lyrics)*
