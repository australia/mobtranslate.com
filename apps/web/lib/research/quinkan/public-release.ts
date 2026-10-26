import "server-only";

import {loadPublicReleaseFromConfig, type VerifiedPublicRelease} from "./release-loader-core";

let configuredRelease: Promise<VerifiedPublicRelease> | undefined;

export function loadConfiguredPublicRelease(): Promise<VerifiedPublicRelease> {
  const releasesDir = process.env.QUINKAN_PUBLIC_RELEASES_DIR;
  const releaseId = process.env.QUINKAN_PUBLIC_RELEASE_ID;
  if (!releasesDir || !releaseId) {
    return Promise.reject(new Error("public release is not configured"));
  }
  configuredRelease ??= loadPublicReleaseFromConfig({releasesDir, releaseId});
  return configuredRelease;
}
