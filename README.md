# Ward of Chicago

Fan tower-defense game. The front door asks for single player or a local battle before the night, the court, and the ground. Single player is Standard Night, Endless Night, or Speed Run. Multiplayer stays on this device: your court holds one street, a rival court holds the other, coin ticks in, and you spend it to build or to push creeps onto their road. The first door to break loses. On a phone the board sits above a scrolling roster; a wide landscape window keeps the side panel. Add it to your home screen from Settings to open it full screen.

Not affiliated with Jim Butcher or the rights holders. Original art. No official logos.

## Play

```bash
npm install
npm run dev
```

You start with 175 coin and 20 lives. Post towers on the gold dots beside the street. Anything that reaches the stoop costs lives. A finished run records gold generated, lives lost, the simulated time of each night, and the highest night you finished. Two-times speed and the pause button do not change that clock. Best nights, endless high scores, and speed-run times stay in this browser.

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
