import pkg from "semver";
const { valid } = pkg;

export function validateInput(s: string): boolean {
  // Validate input semver
  const vNumber = s.split("@")[1];
  // valid() returns a string if input is valid version number
  if (typeof valid(vNumber) != "string") {
    return false;
  }
  return true;
}
