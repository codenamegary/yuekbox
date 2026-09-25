// Throwaway spike probe (#51). Reports what import.meta resolves to for a
// module that is bundled but is not the entrypoint.
export const otherModuleMeta = {
  file: import.meta.file,
  dir: import.meta.dir,
  path: import.meta.path,
  url: import.meta.url,
}
