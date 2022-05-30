import { checkDependency } from "./versionCheck.js";

// Temporary driver code
async function foo() {
  const result = await checkDependency(
    "figures@3.0.0",
    "https://github.com/semantic-release/semantic-release/",
    "package.json"
  );
  console.log(result);
}

foo();
