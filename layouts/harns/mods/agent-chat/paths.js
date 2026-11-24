/** The last part of a path, the folder's own name, for either kind of separator. */
export const folderName = path => String(path ?? "").replace(/[\\/]+$/, "").split(/[\\/]/).at(-1) ?? "";
