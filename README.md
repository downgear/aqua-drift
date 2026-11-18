# Aqua Drift

A Frutiger Aero endless brick-breaker side-scroller. A photoreal fish rides
inside a glass bubble. Keep it bouncing on a Windows 7-style scrollbar thumb,
smash glass bricks, slip through moving pillar gaps, and travel as far as you can.

![Aqua Drift](docs/screenshot.png)

**Play in the browser:** https://downgear.github.io/aqua-drift/  
**Download:** see [Releases](https://github.com/downgear/aqua-drift/releases).
Unzip it and open `index.html`; no install or server is needed.

## Controls

| Action | Input |
| --- | --- |
| Launch the fish | Click, tap, or Enter |
| Move the platform after launch | Mouse / drag |
| Shift the view after launch | Left / Right arrow keys, A / D, or the scrollbar arrow buttons |
| Pause / resume | Space, P, Esc, or the Pause button |
| Toggle sound | M or the Sound button |

Before launch, both the platform and course are locked at the real starting
position. This prevents moving the view forward before releasing the fish.

After launch, the platform is tethered to the fish. The mouse can only move it a
set distance from the fish; when the fish moves beyond that distance it drags the
platform back with it. The camera follows the fish inside a limited viewing zone,
so the fish never bounces against the browser's left, right, or top edge. Visible
glass walls and a glass ceiling are the only physical boundaries.

If the fish falls past the platform, you lose a life and the entire endless run
restarts from the beginning. Bricks and pickups return, distance returns to zero,
and the score returns to what it was at the start of the run.

## Endless course

The course is generated deterministically ahead of the fish and has no goal
portal or next stage. Gaps gradually narrow, moving pillars become more common,
and tough glass bricks appear more often as distance increases.

## Scoring

- Glass brick: 50 points (100 for tough double-rim bricks)
- Golden pearl: 25 points
- Rare butterfly: 250 points
- Passing a gate: 100 points

## Develop

```sh
npm install
npm run dev      # serves the source at http://localhost:5173
npm run build    # writes a self-contained build to dist/
```

The source is plain HTML/CSS/JS with no framework. The build inlines and minifies
everything into `dist/index.html` and copies `assets/` alongside it.

## Credits

All images are royalty-free (CC0 or public domain). See [CREDITS.md](CREDITS.md).

Special thanks to **Đậu Văn Đăng Khoa** for supporting me with his toilet.
