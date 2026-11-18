# gta6-01-v1

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/aurorabelle788/gta6-01-v1/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/aurorabelle788/gta6-01-v1/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

**Solmar Vice** — an original open-world crime game in a sun-soaked coastal city. You are Rico Vale, a driver-for-hire who owes $2,800. Three story missions pay it off: pick up a package at the docks, lose a 3-star wanted level, and make one last timed delivery across town with the cops on your tail.

Built with vendored three.js (no network, no build step): a procedural 8×8-block city with a beach and downtown towers, on-foot and driving controls, traffic and pedestrians, a 1–5 star wanted system with police cars and foot cops, a minimap HUD, synthesized WebAudio sound, and localStorage saves.

## Play it

```sh
node serve.ts
# open http://localhost:8080
```

WASD move / drive · mouse look · SHIFT run · SPACE jump / handbrake · E enter / exit car · F punch · M mute · P pause.

## Hand it in

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```
