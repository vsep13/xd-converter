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

## Notes

- Drag-and-drop or click to add `.mnlgxdlib`, `.mnlgxdpreset`, or `.mnlgxdprog` files.
- Save and reapply preset metadata templates to keep author/version details consistent.
- Configure the 16-slot favorites layout for library exports before downloading.
- Exports are stamped with the converter version and build timestamp for easy provenance.
- Edit patch names/comments in bulk with auto-numbering, prefix/suffix, and find/replace tools before exporting.
- Reorder, shuffle, or reverse patch order to fine-tune library layouts.
- Filter patches in-app by name or comment to focus on specific sounds during editing.
- Uploaded archives surface warnings (missing entries, clamped favorites) so you can fix issues before exporting.
- Frequently used libraries stay cached locally for one-click reloads.
- Drill into a patch with the detail inspector to view its hash, status, and full program metadata.
- Factory/init patches are detected automatically (highlighted in lists and summarised in the inspector).
- When building a preset pack, metadata fields are editable before export.
- Downloads are generated using temporary object URLs; no files leave your machine.
