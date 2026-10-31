# baridi

A fan controller i vibe coded when default one failed on my system

## Baridi - Fancontroller (v2)

Application Tauri (React + shadcn/ui) pour piloter les ventilateurs d'un portable ASUS, avec un contrôleur Go
qui peut tourner comme service Windows.

- `app/` : interface React + coque Tauri (`src-tauri/`)
- `controller/` : contrôleur Go (API locale `127.0.0.1:8787`, service `FanControllerCore`)

### Binaires tiers à fournir

Non versionnés (licences propriétaires) — à copier à la main avant de compiler :

| Fichier | Destination |
| --- | --- |
| `AsusWinIO64.dll` (ASUS) | `controller/` et `app/src-tauri/binaries/` |
| `PsExec.exe` (Sysinternals) | `app/src-tauri/binaries/` |

### Développer

Terminal **administrateur** (le contrôleur pilote le matériel) :

```bash
cd app
bun install
bun run core        # compile le contrôleur Go dans src-tauri/binaries/
bun run tauri dev
```

`bun run tauri build` produit l'installateur NSIS.
