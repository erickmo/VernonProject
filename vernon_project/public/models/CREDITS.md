# Avatar model credits

Served at `/assets/vernon_project/models/`. Referenced by `Avatar Item.model_url`.
To upgrade any model, replace the file in place (keep the same filename) and rebuild.

| File | Source | License |
|------|--------|---------|
| `base_human.glb` | "miku" by **sugamo**, via [Poly Pizza](https://poly.pizza/m/2KgrjYOJPmf) | [CC-BY 3.0](https://creativecommons.org/licenses/by/3.0/) — attribution required (recorded here) |
| `base_cat.glb` | "Kitten" by **jeremy**, via [Poly Pizza](https://poly.pizza/m/dXyLRVNOalM) | [CC-BY 3.0](https://creativecommons.org/licenses/by/3.0/) — attribution required (recorded here) |
| `hat_cap.glb` | Procedural low-poly placeholder | CC0 / project-owned |
| `hat_crown.glb` | Procedural low-poly placeholder | CC0 / project-owned |
| `face_glasses.glb` | Procedural low-poly placeholder | CC0 / project-owned |

## Attribution (CC-BY)

- **`base_human.glb`** — "miku" by sugamo, source <https://poly.pizza/m/2KgrjYOJPmf>,
  licensed under Creative Commons Attribution 3.0 (<https://creativecommons.org/licenses/by/3.0/>).
  A colorful chibi character (big head / small body) with 7 distinct authored material colors —
  teal twin-tail hair (`58A398`/`47B39E`), cream skin (`FFF0C0`), pink accents (`FF6C94`), grey top,
  black skirt/boots, white. Eyes and mouth are flat-colored geometry (not a texture). Downloaded as
  GLB, then normalized with `@gltf-transform` (centered x/z, feet at y=0, uniformly scaled to 1.5
  units tall; weld/dedup/prune). Faces +Z (camera).

- **`base_cat.glb`** — "Kitten" by jeremy, source <https://poly.pizza/m/dXyLRVNOalM>,
  licensed under Creative Commons Attribution 3.0 (<https://creativecommons.org/licenses/by/3.0/>).
  A cute chibi cat (big head / small body) with 4 authored material colors — dark orange (`DD9944`),
  light-orange belly (`FFCC88`), purple nose (`BA68C8`), black eyes (`1A1A1A`). Normalized with
  `@gltf-transform` (centered x/z, feet at y=0, scaled to 1.5 tall, yawed -90° to face +Z/camera;
  weld/dedup/prune).

## Notes

Both bases now carry their **authored multi-material colors**. The avatar viewer was updated to
preserve each model's material colors and only tint meshes literally named `skin` — so a colorful,
multi-material chibi (visible eyes/face/hair/clothing) is exactly the right kind of base. Neither
base contains a mesh named `skin`, so all authored colors are preserved as-is.

Replaced (2026-06): `base_human.glb` was a single-color chibi blob (one flat `lambert1` material) →
swapped for the colorful Miku chibi. `base_cat.glb` was the CC0 "Fox" (textured, muted grey-blue,
not actually a cat) → swapped for the cuter, colorful "Kitten" (an actual cat, big-head chibi facing
the camera). Both are clearly cuter and more colorful than what they replaced.

The viewer auto-fits any bbox (`<Center>` + drei `<Bounds fit>`), so absolute scale is not critical,
but each base is normalized upright (Y-up), feet at y=0, centered, ~1.5 units tall. Swap in new art by
overwriting the file at the same path — no code change needed; anchor fit is tuned in
`frontend/src/avatar/anchors.ts` (head_top / face sockets derived from the base bounding box).
