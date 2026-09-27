# cli

The `yuekbox` executable: the process root, the commander command line, and the
lifecycle commands (`start`, `stop`, `status`, `uninstall`). Deep-imports
`server/src/...` as a library through `startServer`; the web package is
untouched. One instance per home: an exclusive `flock` on
`<home>/run/yuekbox.lock` is the source of truth for whether yuekbox is
running, and `<home>/run/yuekbox.json` carries the pid, URL, and log path.
