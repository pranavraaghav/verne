import pkg from "semver";
const { lte } = pkg;
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
  foundIn: string;
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
  if (remoteDepVersion == "") {
    return {
      exists: exists,
      isAllowHigherVersion: isAllowHigherVersion,
      version_satisfied: false,
      foundIn: "",
    };
  }
  if (remoteDepVersion[0] == "^") {
    isAllowHigherVersion = true;
    remoteDepVersion = remoteDepVersion.substring(1);
  }
  // returns true if inputVersion <= remoteVersion
  const version_satisfied = lte(inputDepVersion, remoteDepVersion);

  return {
    exists: exists,
    isAllowHigherVersion: isAllowHigherVersion,
    version_satisfied: version_satisfied,
    foundIn: foundIn,
  };
}
