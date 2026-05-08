# pad

`pad` is a local-first file runner for editable browser documents.

## JSON Canvas

Open or create a JSON Canvas file directly from GitHub:

```sh
bunx --bun -p https://github.com/subtleGradient/pad/archive/refs/heads/main.tar.gz pad ./path/to/file.canvas
```

That command starts a temporary local Bun server, opens your browser, and edits the `.canvas` file on disk. If the file does not exist yet, `pad` creates it as:

```json
{
	"nodes": [],
	"edges": []
}
```

The `.canvas` file stays plain JSON. No shebang is written into it.

The browser editor is tldraw-based:

- JSON Canvas `text`, `file`, `link`, and `group` nodes are projected into editable tldraw card shapes.
- JSON Canvas edges are projected into native tldraw arrows with arrow bindings.
- The small PAD toolbar creates JSON Canvas node types directly.
- Native tldraw edits autosave back to JSON Canvas.
- External changes to the on-disk `.canvas` file update the open browser graph in realtime.
- Unknown root, node, and edge fields are preserved when their records are still represented in the canvas.
- Unsupported future node records and unresolved future edges remain in the file.

Local checkout usage:

```sh
bun ./pad.shebang.tsx ./path/to/file.canvas
```

Try the checked-in stress/documentation canvas:

```sh
bun ./pad.shebang.tsx ./examples/jsoncanvas-stress.canvas
```

Or directly from GitHub:

```sh
bunx --bun -p https://github.com/subtleGradient/pad/archive/refs/heads/main.tar.gz pad ./examples/jsoncanvas-stress.canvas
```

The example at [examples/jsoncanvas-stress.canvas](examples/jsoncanvas-stress.canvas) includes every currently supported JSON Canvas node type, labeled edges, preset colors, a custom color value, unknown fields, and future records that should survive load/save even when they are not rendered yet.

The browser loads pinned React and tldraw ESM modules for the editor surface. The file server and persistence path run locally against the file you pass on the command line.

## PAD HTML

Existing `.pad.htm` files still run through the same package bin:

```sh
bunx --bun -p https://github.com/subtleGradient/pad/archive/refs/heads/main.tar.gz pad ./DEV.pad.htm
```

`.pad.htm` files may keep their shebang runner. `.canvas` files should not.
