# Real character images (drop-in)

Drop a **transparent PNG** here named `<character>-<form>.png` and it replaces
the stylized SVG for that character/form everywhere (avatar preview, cards,
chips, saved snapshot). Missing files fall back to the SVG automatically.

Square images work best (rendered `object-contain`). After adding files run
`npm run build` in `frontend/` so they deploy to `/assets/vernon_project/frontend/characters/`.

Expected filenames:

Dragon Ball
- goku-base.png, goku-ssj.png, goku-ssj2.png, goku-ssj3.png, goku-blue.png
- vegeta-base.png, vegeta-ssj.png, vegeta-blue.png
- gohan-base.png, gohan-ssj.png

Naruto
- naruto-base.png, naruto-sage.png, naruto-kurama.png
- sasuke-base.png, sasuke-sharingan.png
- kakashi-base.png
