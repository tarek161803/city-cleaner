# City Cleaner (সিটি ক্লিনার)

Third-person arcade smasher (Three.js + TypeScript + Vite). A sharp young guy with a huge sledgehammer
clears Dhaka's jammed streets by smashing battery rickshaws and footpath stalls that spill into the road.
Nobody gets hurt: pedestrians run, while pullers and shopkeepers stand their ground — they block you and shove you back, and nearby owners come to help — until their grit runs out after 2–3 hits on their property. Smashed things fall apart,
disappear, and respawn later (rickshaws after ~18 s somewhere out of sight, stalls after ~25 s once you
have walked away).

```sh
npm install
npm run dev        # click the canvas to capture the mouse
npm run build      # type-check + production build into dist/
```

## Controls
WASD move · Shift sprint · Space jump · LMB hammer combo (swing, backhand, ground slam with
shockwave) · RMB heavy spin smash · Tab lock-on.

## Layout
- `src/Game.ts` — loop, hammer hit resolution, slam shockwave, debris/score
- `src/world/City.ts` — street grid, buildings with Bangla signboards, wires, lanes, stall slots, collisions
- `src/city/` — vehicles (rickshaws, cars, buses, pickups, motorcycles) + traffic (lane following, weaving, wrong-way driving, crashes), stalls + market, part-based props
- `src/npcs/` — pedestrians, pullers, shopkeepers (walk the footpaths, flee from the hammer)
- `src/core/` — input, procedural character rig (walk/pedal/panic, arm IK onto the hammer), actor physics
- `src/combat/` — hammer, attack definitions/combo runner, hit detection, debris, hit-stop/shake/particles/trail
- `src/player/` — player controller, third-person camera
- `src/ui/` — HUD
