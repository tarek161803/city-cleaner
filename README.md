# City Cleaner (সিটি ক্লিনার)

Third-person arcade smasher (Three.js + TypeScript + Vite). A sharp young guy with a huge sledgehammer
clears Dhaka's jammed streets by smashing battery rickshaws and footpath stalls that spill into the road.
Nobody gets hurt: pedestrians run, while pullers and shopkeepers stand their ground — they block you and shove you back, and nearby owners come to help — until their grit runs out after 2–3 hits on their property. Smashed things fall apart,
disappear, and respawn later (rickshaws after ~18 s somewhere out of sight, stalls after ~25 s once you
have walked away).

Everything is procedural — models, textures and sound are generated in code, with no asset files.

```sh
npm install
npm run dev        # click the canvas to capture the mouse (and start the audio)
npm run typecheck  # tsc only
npm run build      # type-check + production build into dist/
```

## Controls
WASD move · Left Shift sprint · Space jump · LMB hammer combo (swing, backhand, ground slam with
shockwave) · RMB heavy spin smash · M mute/unmute.

Attack clicks are buffered briefly, so clicking during a swing's recovery chains the next hit.

## Scoring
- Rickshaw 100, stall 150, plus 10 per hit
- ×1.5 for breaking something while its owner was guarding it; +100 for a stall blocking the road itself
- Smash again within 4 s to build a combo multiplier (up to ×8); milestone banners every 10 smashes

## The street
- Traffic: battery rickshaws, cars, buses, pickups, CNGs and motorcycles that follow lanes, weave,
  drive the wrong way, honk and crash
- Footpath shops: tea stall, fruit and pickle vans, fuchka cart, clothes and sandals on sheets, vegetables,
  books, phone accessories, sugarcane press, jhalmuri, guava-makha, green coconut and pitha sellers
- Buildings with painted Bangla signboards, overhead wires, brick pavers and worn asphalt

## Layout
- `src/main.ts` — entry point
- `src/Game.ts` — loop, hammer hit resolution, slam shockwave, debris/score
- `src/world/City.ts` — street grid, buildings with Bangla signboards, wires, lanes, stall slots, collisions
- `src/world/Textures.ts` — procedural canvas textures (asphalt, pavers, kerbs, facades)
- `src/city/` — vehicles (`Rickshaw`, `Motors`, `Vehicle`) + `Traffic` (lane following, weaving, wrong-way driving, crashes), `Shops`/`Stall`/`Market` (footpath stalls and respawning), `Destructible` base, `Parts` builder for part-based props
- `src/npcs/` — pedestrians, pullers, shopkeepers (walk the footpaths, flee from the hammer, defend their property)
- `src/core/` — input (pointer lock, action buffering), procedural character rig (walk/pedal/panic, arm IK onto the hammer), `Outfit` (clothing: lungi, saree, kameez, gamchha…), actor physics, math helpers
- `src/combat/` — hammer, attack definitions/combo runner, hit detection, debris, hit-stop/shake/particles/trail
- `src/player/` — player controller, third-person camera
- `src/audio/` — procedural positional Web Audio sound effects (impacts, horns, reverb)
- `src/ui/` — HUD: score, combo meter, popups, milestone banners, speech bubbles, owner grit meters
