# TechTreeCard

**A serverless, 3D skill-tree business card. The whole card lives in a link or QR code.**

TechTreeCard turns your skills, experience, credentials and things you're exploring into an interactive 3D graph you can rotate and zoom, then lets you share it as a single URL. There is no account, no database and no backend: the card's data is compressed into the link itself, and your own card is stored in your browser.

English | [繁體中文](README.zh-TW.md)

## Features

- **Skill tree, not a résumé page.** Nodes can depend on several other nodes, so people can see how your skills build on each other.
  - Categories: Skills (grey), Experience (amber), Credential (blue), Exploring (red).
  - Importance level changes node size: *Hello World*, *Production*, *Critical Dependency*.
  - Tags, free-text details, tag search, 2D/3D view and a force-directed layout (physics can be turned off).
- **Share as a link or QR code.** The card is packed into the URL, so opening the link is all the receiver needs.
- **You choose what to share.** Before sharing, tick which fields go out (name, org, education, intro, image URL, intro URL, node descriptions).
- **Cards book.** Save cards you receive into a local card book (searchable, filterable by tag). The saved snapshot still opens even if the original link stops working.
- **Import / Export** your card as JSON.
- **Preview mode** shows your card the way a receiver sees it.
- Dark / light theme, works on mobile.

## How to use

1. Click the **centre sphere** to edit your profile (name, org, education, intro, image URL, link).
2. Open the **☰ menu** and use **+ Node** to add nodes, then click a node to edit its title, category, importance, tags and details.
3. In *Dependencies*, **hold Ctrl (Cmd on Mac) and click** to connect a node to more than one parent.
4. Click **Share** to get a link and a QR code. Click **Cards** to open your card book.

Your card is saved automatically in this browser (`localStorage`). Use **Export** to back it up, because clearing site data deletes it.

## Running it

There is no build step. Serve the folder with any static file server, for example:

```bash
npx serve .
# or
python -m http.server 8000
```

Then open the printed address. It can be hosted as-is on GitHub Pages or any static host.

Share links are built from the page's own address, so a card shared from `localhost` or a `file://` page will not work for other people. Share from the hosted page.

## How sharing works

The card is shrunk in three steps before it goes into the URL:

1. **Compact format.** Long keys and per-node ids are removed, parents are referenced by index, and positions are rounded (the layout re-settles on its own).
2. **[ZipURL](https://github.com/citycafe578/ZipURL)** compresses the result.
3. **Best encoding wins.** The app builds each candidate below and keeps the shortest final URL:

   | Param | Contents |
   |-------|----------|
   | `zb`  | compact → ZipURL → UTF-8 → base64url (best for CJK text) |
   | `z`   | compact → ZipURL, percent-encoded by the URL |
   | `c`   | compact → base64url (no library needed) |
   | `card`| full card → base64url (old links, still readable) |

ZipURL is verified by decompressing before a link is produced, so a link is never lossy.

**Limits**

- Links longer than 12,000 characters are rejected.
- A QR code holds roughly 2.9 KB. If the card is larger, the QR contains a lite version (without node descriptions, then without tags and intro) and says so; the link always carries the full card.

## Card file format

Exported / importable JSON:

```jsonc
{
  "version": 1,
  "id": "did:local:…",
  "profile": { "name": "", "org": "", "edu": "", "intro": "", "imgUrl": "", "introUrl": "" },
  "nodes": [
    {
      "id": "node_1760000000000_1",
      "parentIds": ["center"],          // "center" or other node ids
      "title": "LiteRTOS",
      "desc": "details…",
      "tags": ["rtos", "avr"],
      "category": "experience",         // skill | experience | credential | explore
      "level": 3,                       // 1 | 2 | 3
      "x": 0, "y": 0, "z": 0
    }
  ],
  "updatedAt": "2026-10-22T00:00:00.000Z"
}
```

`ssi-card-sample.json` is an example card you can import.

## Project structure

| File | Purpose |
|------|---------|
| `index.html` | Layout: menu, node / profile panels, Cards book, import and QR dialogs |
| `style.css` | Styling and themes |
| `animation.js` | Three.js scene, nodes, lines, force layout, interaction |
| `script.js` | Card data, storage, sharing / encoding, Cards book, import / export |
| `ssi-card-sample.json` | Example card |

## Dependencies

Loaded from CDNs (no install needed):

- [Three.js](https://threejs.org/) r128 + OrbitControls
- [qr-code-styling](https://github.com/kozakdenys/qr-code-styling) 1.5.0
- [ZipURL](https://github.com/citycafe578/ZipURL), pinned to a specific commit

## About "SSI"

Each card has a locally generated `did:local:…` identifier, in the spirit of self-sovereign identity: you hold your own card and no platform sits in between. It is **not** a full SSI system yet. Cards are not signed, so a receiver cannot verify that a skill or credential is real.

## Roadmap

- Signed cards and verifiable credentials for the *Credential* category
- Bundle the libraries locally so the app has no CDN dependency
- Screenshots / demo
