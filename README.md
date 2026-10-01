# Ward of Chicago

Fan tower-defense game. Choose a court — Dresden, Red Court, Winter Court, or Summer Court — and a ground. Each ground has its own road. Hold the last door for ten nights. On a phone the board sits above a scrolling roster; a wide landscape window keeps the side panel. Add it to your home screen from Settings to open it full screen.

Not affiliated with Jim Butcher or the rights holders. Original art. No official logos.

## Play

```bash
npm install
npm run dev
```

You start with 175 coin and 20 lives. Post towers on the gold dots beside the street. Anything that reaches the stoop costs lives. Clear all ten nights, or walk it again from the end screen. Best night held stays in this browser.

| Tower | Role | Cost |
| --- | --- | --- |
| Harry Dresden | Balanced blasting rod | 80 |
| Toot-Toot | Fast and cheap | 50 |
| Bob the Skull | Spirit fire that slows | 115 |
| Karrin Murphy | Long range, ignores armor | 155 |
| Michael Carpenter | Short cleave | 175 |

Tap a name, then a sidewalk. Upgrade twice (Honed, then Warden) to raise damage and fire rate. Aim First, Nearest, or Strongest. Sell refunds part of what you spent.

## Android

The website is the game. The Android package is the same game, installed from a file.

GitHub Actions builds `Ward-of-Chicago.apk` and attaches it to a release. Download that file on the phone, open it, and allow the install when Android asks. There is no store listing.

Keys: `1`–`5` pick a tower, `U` hones, `Space` sends the night or pauses.
