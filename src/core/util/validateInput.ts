import pkg from "semver";
const { valid } = pkg;

export function validateInput(s: string): boolean {
  // Evaluate basic structure of input <string>@<string>
  let regex = /^(.+)@(.+)$/i;
  if (regex.test(s) == false) {
    return false;
  }
  // Validate version number using semver
  const vNumber = s.split("@")[1];
  // valid() returns a string if input is valid version number
  if (typeof valid(vNumber) != "string") {
    return false;
  }
  return true;
}
