# Minilogue XD Librarian Tools

A standalone web tool for converting between Korg Minilogue XD librarian formats:

- `.mnlgxdlib` ⇆ `.mnlgxdpreset`
- `.mnlgxdlib` / `.mnlgxdpreset` ⇢ individual `.mnlgxdprog`
- Combine multiple `.mnlgxdprog` files into a new library or preset pack

All file processing happens locally in the browser via WebAssembly-safe JS (`fflate`). No uploads are required.

## Getting started

```bash
npm install
npm run dev
```

Open the local URL that Vite prints (typically <http://localhost:5173/>) to use the tool.

## Building for production

```bash
npm run build
```

The static build is emitted to `dist/` and can be hosted on any static file host.

## Automation CLI

Run the automation helper to script exports or builds without the UI:

```bash
npm run cli -- --help
```

### Export a patch summary

```bash
npm run cli -- summary path/to/library.mnlgxdlib --format csv --out summary.csv
```

### Build a preset pack from individual patches

```bash
npm run cli -- build --kind preset --name "Bass Pack" --out bass.mnlgxdpreset patches/*.mnlgxdprog
```

The CLI reuses the same parsing and export logic as the app, so results match what you would download from the browser.

## Offline builds

If your environment blocks npm from downloading Rollup's optional native binaries, run `npm run ensure:rollup-native` before building. The script copies a vendored Linux x64 build into `node_modules` so `npm run build` can succeed without network access.

## MIDI librarian mode

The app now speaks directly to a connected minilogue xd via the Web MIDI API:

- Click **Enable MIDI** in the new *MIDI Librarian* panel (Chrome, Edge, and other Chromium browsers support Web MIDI with SysEx).
- Choose the `minilogue xd SOUND` output and `minilogue xd KBD/KNOB` input ports, then connect.
- Fetch the current program, an arbitrary program slot, or a range of slots; fetched programs are added to the workspace and ranges populate the library view.
- Send any workspace or library patch back to a device slot when you're ready to audition or restore it.

Browser security prompts appear the first time you request SysEx access. Approve the request so the synthesizer can respond.

## Notes

- Drag-and-drop or click to add `.mnlgxdlib`, `.mnlgxdpreset`, or `.mnlgxdprog` files.
- Save and reapply preset metadata templates to keep author/version details consistent.
- Configure the 16-slot favorites layout for library exports before downloading.
- Exports are stamped with the converter version and build timestamp for easy provenance.
- Edit patch names/comments in bulk with auto-numbering, prefix/suffix, and find/replace tools before exporting.
- Reorder, shuffle, or reverse patch order to fine-tune library layouts.
- Craft new sounds quickly with the parameter randomizer by constraining per-parameter ranges before applying.
- Filter patches in-app by name or comment to focus on specific sounds during editing.
- Uploaded archives surface warnings (missing entries, clamped favorites) so you can fix issues before exporting.
- Frequently used libraries stay cached locally for one-click reloads.
- Drill into a patch with the detail inspector to view its hash, status, and full program metadata.
- Factory/init patches are detected automatically (highlighted in lists and summarised in the inspector).
- When building a preset pack, metadata fields are editable before export.
- Downloads are generated using temporary object URLs; no files leave your machine.
- User oscillator and effect units bundled in an archive are surfaced for download and preserved when exporting.
