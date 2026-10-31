# baridi

A fan controller i vibe coded when default one failed on my system

## Baridi - Fancontroller (v2)

Application Tauri (React + shadcn/ui) pour piloter les ventilateurs d'un portable ASUS, avec un contrôleur Go
qui peut tourner comme service Windows.

- `app/` : interface React + coque Tauri (`src-tauri/`)
- `controller/` : contrôleur Go (API locale `127.0.0.1:8787`, service `FanControllerCore`)

### Binaires tiers inclus

Pour que le dépôt fonctionne dès le clonage, deux binaires tiers sont versionnés :

| Fichier | Emplacement | Origine |
| --- | --- | --- |
| `AsusWinIO64.dll` | `controller/` et `app/src-tauri/binaries/` | ASUS |
| `PsExec.exe` | `app/src-tauri/binaries/` | Sysinternals (Microsoft) |

Ils restent soumis à leurs licences d'origine.

### Développer

Terminal **administrateur** (le contrôleur pilote le matériel) :

```bash
cd app
bun install
bun run core        # compile le contrôleur Go dans src-tauri/binaries/
bun run tauri dev
```

`bun run tauri build` produit l'installateur NSIS.
