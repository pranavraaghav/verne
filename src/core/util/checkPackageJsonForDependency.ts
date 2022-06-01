import semver from "semver";
const { lte, diff } = semver;
/**
 *
 * @param inputDepName
 * @param inputDepVersion
 * @param file The package.json file as object
 * @returns
 */
export function checkPackageJsonForDependency(
  inputDepName: string,
  inputDepVersion: string,
  file: any
): {
  exists: boolean;
  version_satisfied: boolean;
  isAllowHigherVersion: boolean;
  remoteVersion: string;
  foundIn: string;
  isMajorChange: boolean;
} {
  let exists = false;
  let isAllowHigherVersion = false;
  let remoteDepVersion = "";
  let foundIn = "";

  const { dependencies, devDependencies } = file;

  if (dependencies != undefined && inputDepName in dependencies) {
    remoteDepVersion = dependencies[inputDepName];
    exists = true;
    foundIn = "dependencies";
  } else if (devDependencies != undefined && inputDepName in devDependencies) {
    exists = true;
    remoteDepVersion = devDependencies[inputDepName];
    foundIn = "devDependencies";
  }
  // Case where remote dependency is not present in package.json
  if (remoteDepVersion == "") {
    return {
      exists: exists,
      isAllowHigherVersion: isAllowHigherVersion,
      version_satisfied: false,
      remoteVersion: "",
      foundIn: "",
      isMajorChange: false,
    };
  }

  // Remove pre-fix "^" before processing if present
  if (remoteDepVersion[0] == "^") {
    remoteDepVersion = remoteDepVersion.substring(1);
    isAllowHigherVersion = true;
  }
  // returns true if inputVersion <= remoteVersion
  const version_satisfied = lte(inputDepVersion, remoteDepVersion);

  const releaseType = diff(inputDepVersion, remoteDepVersion);
  return {
    exists: exists,
    isAllowHigherVersion: isAllowHigherVersion,
    version_satisfied: version_satisfied,
    remoteVersion: remoteDepVersion,
    foundIn: foundIn,
    isMajorChange: releaseType == "major",
  };
}
