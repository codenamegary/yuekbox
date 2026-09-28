# cli

The `yuekbox` executable: the process root, the commander command line, and the
lifecycle commands (`start`, `stop`, `status`, `uninstall`). Deep-imports
`server/src/...` as a library through `startServer`; the web package is
untouched. One instance per home: an exclusive `flock` on
`<home>/run/yuekbox.lock` is the source of truth for whether yuekbox is
running, and `<home>/run/yuekbox.json` carries the pid, URL, and log path.

The `lifecycle` slice follows the same vocabulary as the server's slices, plus
two file kinds of its own:

| File | Role |
| --- | --- |
| `lifecycle.parse.ts` | The commander program: the command line is this slice's user interface |
| `lifecycle.paths.ts` | Pure path building over the home layout and the models' file names |
