import { checkIfVersionSatisfied } from "./checkIfVersionSatisfied.js";

/**
 *
 * @param depName
 * @param depVersion
 * @param file The package.json file as object
 * @returns
 */
export function checkPackageJsonForDependency(
  depName: string,
  depVersion: string,
  file: any
): {
  exists: boolean;
  version_satisfied: boolean;
  isAllowHigherVersion: boolean;
  foundIn: string;
} {
  let exists = false;
  let isAllowHigherVersion = false;
  let ver = "";
  let foundIn = "";

  const { dependencies, devDependencies } = file;

  if (dependencies != undefined && depName in dependencies) {
    ver = dependencies[depName];
    exists = true;
    foundIn = "dependencies";
  } else if (devDependencies != undefined && depName in devDependencies) {
    exists = true;
    ver = devDependencies[depName];
    foundIn = "devDependencies";
  }
  if (ver == "") {
    return {
      exists: exists,
      isAllowHigherVersion: isAllowHigherVersion,
      version_satisfied: false,
      foundIn: "",
    };
  }
  if (ver[0] == "^") {
    isAllowHigherVersion = true;
    ver = ver.substring(1);
  }
  const version_satisfied = checkIfVersionSatisfied(depVersion, ver);

  return {
    exists: exists,
    isAllowHigherVersion: isAllowHigherVersion,
    version_satisfied: version_satisfied,
    foundIn: foundIn,
  };
}
