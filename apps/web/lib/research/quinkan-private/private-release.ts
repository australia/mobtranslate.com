import "server-only";

import {
  loadPrivateReleaseFromConfig,
  type VerifiedPrivateRelease,
} from "./private-release-loader-core";

let configuredRelease: Promise<VerifiedPrivateRelease> | undefined;

export function loadConfiguredPrivateRelease(): Promise<VerifiedPrivateRelease> {
  const releasesDir = process.env.QUINKAN_PRIVATE_RELEASES_DIR;
  const releaseId = process.env.QUINKAN_PRIVATE_RELEASE_ID;
  if (!releasesDir || !releaseId) {
    return Promise.reject(new Error("private release is not configured"));
  }
  configuredRelease ??= loadPrivateReleaseFromConfig({releasesDir, releaseId});
  return configuredRelease;
}
