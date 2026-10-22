# TechTreeCard

**Turn your skills into a tree you can share with one link.**

English | [繁體中文](README.zh-TW.md)

![A tech tree with skills, experience and a certificate around a central core](docs/images/overview.png)

TechTreeCard is a business card that shows how your skills connect. Add what you know, what you've done and what you're learning, then send the whole thing as a link or a QR code. The person who opens it can rotate the tree and click any node to read more.

You don't need an account, and nothing is uploaded anywhere. Your card is stored in your own browser.

**Try it:** https://citycafe578.github.io/TechTreeCard/

---

## Quick start

### 1. Fill in your profile

Click the **sphere in the centre** to open your profile. Add your name, organization, education and a short intro. You can also add a profile picture URL and a link to your own website. Press **Save Changes**.

![The profile panel](docs/images/profile.png)

### 2. Add your nodes

Each node is one thing you want to show: a skill, a project, a certificate.

1. Open the menu (**☰**, top left) and press **+ Node**.
2. Click the new node to edit it, then press **Save Changes**.

![The node panel, with two dependencies selected](docs/images/node-panel.png)

| Field | What it does |
|-------|--------------|
| **Dependencies** | What this node builds on. Choose **Center** or other nodes. To pick more than one, **hold Ctrl (Cmd on Mac) and click**. |
| **Skill Title** | The name shown on the node. |
| **Node Category** | Changes the colour: **Skills** (grey), **Experience** (amber), **Credential** (blue), **Exploring** (red). |
| **Importance Level** | Changes the size: *Hello World* (small), *Production*, *Critical Dependency* (large). |
| **Tags** | Keywords, separated by commas. Used for searching. |
| **Details** | A longer description. Anyone who opens your card can read it. |

To remove a node, open it and press **Delete Node**.

### 3. Share it

Press **Share** (top right). You get a link and a QR code.

![The share window with a QR code and a copy button](docs/images/share.png)

Press **Copy** to copy the link, or let someone scan the QR code.

**Choose what to share first.** In the menu, under **Share Options**, untick anything you don't want others to see (name, organization, education, intro, picture URL, website, or the node descriptions). Only the ticked items go into the link.

---

## Moving around

- **Rotate:** drag (in 3D view). **Zoom:** scroll or pinch. **Pan:** right-click drag, or two fingers.
- In **2D View**, dragging spins the whole tree around the centre instead.
- Nodes arrange themselves. Press **Physics: OFF** to freeze them where they are.
- **2D View** flattens the tree. **3D View** brings it back.
- **Theme** switches between dark and light.

## The menu

![The menu](docs/images/menu.png)

| Button | What it does |
|--------|--------------|
| **Theme** | Switch dark / light |
| **+ Node** | Add a node |
| **2D View / 3D View** | Flatten or restore the tree |
| **Physics: ON / OFF** | Let nodes move on their own, or freeze them |
| **Preview: ON / OFF** | See your card the way someone who opens your link sees it (read-only) |
| **Export** | Download your card as a `.json` file |
| **Import** | Load a `.json` card (see *Back up your card*) |
| **Share Options** | Choose what goes into the link |
| **Search Tag…** | Dim every node that doesn't have the tag you type. **Clear** resets it. The **≡** button shows all tags as a list. |

## Cards from other people

When you open someone's link, you see their card in read-only mode. Click nodes to read the details.

To keep a card, click any node and press **Save This Card**. Saved cards go into your **Cards book** (the **Cards** button, top right).

![The Cards book](docs/images/cards-book.png)

- Search by name, organization or tag, or pick a tag to filter.
- **Open** shows the saved card. **Remove** deletes it from your Cards book.
- The card is saved as a snapshot, so you can still open it even if the original link stops working.

## Back up your card

Your card lives in this browser only. If you clear your browser's site data, or open the page on another device, your card will not be there.

- **Export** downloads a `.json` file. Do this now and then.
- **Import** loads one back. **Importing replaces the card you currently have**, so export first if you want to keep it.

To move your card to another device, either send yourself the share link, or Export on one and Import on the other.

## Good to know

**My QR code is missing details, or doesn't appear.**
A QR code can only hold a limited amount of data. If your card is too big, the QR code holds a lighter version (first without node descriptions, then without tags and intro), and a note under the code tells you so. The link always has everything. If even the lighter version is too large, only the link is shown.

**"Payload too large" when sharing.**
The link would be longer than 12,000 characters. Shorten some descriptions, remove unneeded nodes, or untick **DESCRIPTIONS** in Share Options.

**Can people change my card?**
No. Opening your link only shows them a copy. Your own card stays in your browser.

**Does it prove that my skills are real?**
No. It is a way to present and share your skills. Cards aren't signed or verified, so anyone can write anything on theirs.

**My link used to work and now doesn't.**
Links point to the page's web address. If the page moves to a new address, old links stop working.

## Run your own copy

TechTreeCard is a plain web page with no build step. To publish your own:

1. Put the project in a GitHub repository.
2. Open **Settings → Pages**, choose **Deploy from a branch**, pick `main` and `/ (root)`, and save.
3. After a minute or two, your page is live at `https://<your-username>.github.io/<repo-name>/`.

Share links are made from the page's own address, so share from the published page, not from a file on your computer.

`ssi-card-sample.json` is an example card. Use **Import** to try it.
