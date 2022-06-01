export function checkIfVersionSatisfied(
  givenVersion: string,
  remoteVersion: string
) {
  const v1 = givenVersion.split(".");
  const v2 = remoteVersion.split(".");

  if (v1.length != 3 || v2.length != 3) {
    throw new Error("Invalid input");
  }

  if (v1[0] > v2[0]) return false;
  if (v1[1] > v2[1]) return false;
  if (v1[2] > v2[2]) return false;
  return true;
}
