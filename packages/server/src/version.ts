import rootPackage from "../../../package.json"

/**
 * The managed release version: release-please bumps the root `package.json`,
 * and the bundler inlines this import, so the compiled binary reports it too.
 */
export const version = rootPackage.version
