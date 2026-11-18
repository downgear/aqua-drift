# Aqua Drift

A Frutiger Aero brick-breaker side-scroller. A photoreal fish rides inside a glass
bubble. Keep it bouncing on a Windows 7-style scrollbar thumb, scroll the stage
along, smash glass bricks, slip through the gaps in the pillars and reach the goal portal.

![Aqua Drift](docs/screenshot.png)

**Play in the browser:** https://downgear.github.io/aqua-drift/
**Download:** see [Releases](https://github.com/downgear/aqua-drift/releases). Unzip it and open `index.html`; no install or server needed.

## Controls

| Action | Input |
| --- | --- |
| Move the platform (scrollbar thumb) | Mouse / drag |
| Scroll the stage | Left / Right arrow keys, A / D, or the scrollbar arrow buttons |
| Launch the fish | Click, Space or tap |
| Pause / Sound | P or Esc / M |

The edges of the screen push the fish forward as you scroll, but you can't push it
through a wall. Break the bricks or bounce it through a gap first.

## Scoring

- Glass brick: 50 points (100 for the double-rim tough ones)
- Golden pearl: 25 points
- Getting through a gate: 100 points
- Stage clear: bonus based on lives left, plus an extra life

Stages get longer, with smaller gaps and moving pillars.

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
