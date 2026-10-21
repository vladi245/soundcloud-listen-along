# Chrome Web Store (unlisted)

An unlisted item is not searchable; only people with the link can install it. Chrome then installs and updates it like any store extension.

## Files

Run `npm run release:hosted` first, then use:

| Store field                | File                                                                                                       |
| -------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Package                    | `.output/soundcloud-listen-along-X.Y.Z-chrome.zip`                                                         |
| Store icon (128×128)       | `public/icon/128.png`                                                                                      |
| Screenshots (1280×800)     | `docs/store/screenshot-lobby.png`, `docs/store/screenshot-session.png`, `docs/store/screenshot-invite.png` |
| Small promo tile (440×280) | `docs/store/promo-tile.png`                                                                                |
| Privacy policy URL         | `https://soundcloud-listen-along.vladi245.workers.dev/privacy`                                             |

## Steps

1. Register at https://chrome.google.com/webstore/devconsole with a Google account and pay the one-time US$5 fee. Use a contact email you are comfortable showing on the listing.
2. Select **New item** and upload the Chrome ZIP.
3. **Store listing:** paste the text below, upload the icon, screenshots and promo tile, and pick category **Entertainment**.
4. **Privacy:** paste the single purpose, permission justifications and data answers below, and enter the privacy policy URL.
5. **Distribution:** set visibility to **Unlisted** and choose all regions.
6. Submit for review. Reviews of extensions with optional broad host access can take a few days.
7. After approval, set `CHROME_STORE_URL` in `server/wrangler.hosted.toml` to the listing URL and run `npm run release:hosted`. The invitation page then shows **Add to Chrome** instead of load-unpacked steps.

## Store listing

**Name:** SoundCloud Listen Along (Unofficial)

**Summary:** Listen to SoundCloud together. Start a room from any track and friends hear what you play, in sync.

**Description:**

Listen Along lets you listen to SoundCloud with friends at the same time.

• Open any track on SoundCloud and select Start a room. The invite link is copied for you.
• Friends open the link and select Join room. SoundCloud opens and plays along with you.
• Play, pause, seek or skip, and everyone in the room follows.

Audio always streams from SoundCloud in each listener's own browser. The extension only shares the current track link and playback position with the room server while you are in a room. Rooms are private, unlisted and deleted when they end. There are no accounts, ads, analytics or tracking.

You can also run your own room server on Cloudflare instead of the public one.

This independent extension is not affiliated with, authorized by, sponsored by, or endorsed by SoundCloud.

## Privacy tab

**Single purpose:** Synchronize SoundCloud playback between people in a shared listening room.

**Permission justifications:**

- `activeTab`: Reads the address of the current tab when the user opens the popup, to start a room from the SoundCloud tab or read an invitation link.
- `storage`: Remembers the selected room server and keeps the active room's state while the browser is open.
- Host permission for the public room server: Creates rooms and carries the synchronization connection.
- Optional host permissions (`https://*/*`, localhost): Requested only when a user chooses their own self-hosted room server, and only for that one address.
- Content scripts on soundcloud.com: Read and apply play, pause, position and track on SoundCloud pages.
- Content script on the public room server: Adds a Join room button to its invitation page.
- Remote code: No. All code is in the package.

**Data usage:** select **Web history** (the SoundCloud track link) and **User activity** (play, pause and position on SoundCloud). Leave every other category unselected.

Certify all three statements: data is not sold to third parties, not used for unrelated purposes, and not used for creditworthiness or lending.
