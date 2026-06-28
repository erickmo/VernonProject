# Avatar model credits

Served at `/assets/vernon_project/models/`. Referenced by `Avatar Item.model_url`.
To upgrade any model, replace the file in place (keep the same filename) and rebuild.

| File | Source | License |
|------|--------|---------|
| `base_cat.glb` | "Fox" by PixelMannen (low-poly animated fox), via [KhronosGroup/glTF-Sample-Assets](https://github.com/KhronosGroup/glTF-Sample-Assets) | CC0 1.0 (public domain) |
| `base_human.glb` | "Lowpoly Chibi Character" by **mehreen1919** ([Behance](https://www.behance.net/mehreenadeel)), via [Poly Pizza](https://poly.pizza/m/nfrpFnfKh3) | [CC-BY 3.0](https://creativecommons.org/licenses/by/3.0/) — attribution required (recorded here) |
| `hat_cap.glb` | Procedural low-poly placeholder | CC0 / project-owned |
| `hat_crown.glb` | Procedural low-poly placeholder | CC0 / project-owned |
| `face_glasses.glb` | Procedural low-poly placeholder | CC0 / project-owned |

## Attribution (CC-BY)

- **`base_human.glb`** — "Lowpoly Chibi Character" by mehreen1919, source <https://poly.pizza/m/nfrpFnfKh3>,
  licensed under Creative Commons Attribution 3.0 (<https://creativecommons.org/licenses/by/3.0/>).
  Downloaded as GLB, then normalized with `@gltf-transform/cli` (centered, feet at y=0, uniformly
  scaled to 1.5 units tall; weld/dedup/prune). A big-head/small-body chibi base — the ideal shape for
  this avatar system, which tints the whole base body to a single `skin_color` and layers hat/face
  overlays on top (see `frontend/src/avatar/AvatarViewer.tsx` + `anchors.ts`).

## Notes

`base_cat.glb` was kept as the CC0 Fox. CC0 chibi cat candidates were evaluated (Quaternius "Cat",
"cat loaf", etc.) but the avatar viewer **overwrites every base material's color with `skin_color`**.
The Fox is *textured*, so its fur pattern and eyes survive the tint (texture × skin_color); the cute
candidate cats are *flat untextured* multi-material (Eye_White/Eye_Black as separate flat colors), so
under the tint they collapse to one uniform skin tone — eyes and markings vanish, looking worse than
the Fox. Per the "replace only if clearly cuter in-app" rule, the Fox stays.

For the same reason a **single-material** base (like the chibi above) is the right kind of base here:
it becomes a clean, uniform skin-toned body at any `skin_color`. Textured/multi-color characters get
warm-shifted with light skins and darken badly with dark skins. Swap in CC0 art by overwriting the
file at the same path — no code change needed; anchor fit is tuned in `frontend/src/avatar/anchors.ts`.
