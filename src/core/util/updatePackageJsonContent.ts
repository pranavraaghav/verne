export function updatePackageJsonContent(
  file: any,
  foundIn: string,
  isAllowHigherVersion: boolean,
  depName: string,
  depVersion: string
): string {
  let newContent = "";

  const { dependencies, devDependencies } = file;
  if (foundIn == "dependencies") {
    if (isAllowHigherVersion) {
      dependencies[depName] = `^${depVersion}`;
    } else {
      dependencies[depName] = `${depVersion}`;
    }
    file["dependencies"] = dependencies;
    const obj: object = file;
    newContent = Buffer.from(JSON.stringify(obj, null, 2)).toString("base64");
  }
  return newContent;
}
