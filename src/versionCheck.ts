import axios from "axios";
import Joi from "joi";
import { Octokit } from "octokit";

interface DependencyResponse {
  name: string;
  repo: string;
  version: string;
  version_satisfied: boolean;
  exists: boolean;
}

async function checkDependency(
  dep: string,
  url: string,
  octokit: Octokit,
  filename: string = "package.json"
): Promise<DependencyResponse> {
  let exists = false;
  const { author, repo } = getAuthorAndRepoFromGithubUrl(url);

  // fetch file
  let response;
  try {
    response = await octokit.request(
      `GET /repos/${author}/${repo}/contents/${filename}`
    );
  } catch (error) {
    console.log(error);
    return {
      name: "",
      repo: "",
      version: "",
      version_satisfied: false,
      exists: false,
    };
  }

  const schema = Joi.object({
    dependencies: Joi.object({}),
    devDependencies: Joi.object({}),
  }).unknown(true);

  let validatedPackageJson: Joi.ValidationResult<any>;
  if (response.status == 200) {
    const encoded = response.data.content;
    const decoded = Buffer.from(encoded, "base64").toString();
    validatedPackageJson = schema.validate(JSON.parse(decoded));
  } else {
    throw new Error(`GitHub API responded with ${response.status}`);
  }
  const { dependencies, devDependencies } = validatedPackageJson.value;

  // extract dep name and version
  const s = dep.split("@");
  const depName = s[0];
  const depVersion = s[1];

  let ver = "";
  if (depName in dependencies) {
    ver = dependencies[depName];
    exists = true;
  }
  if (devDependencies != undefined && depName in devDependencies) {
    exists = true;
    ver = devDependencies[depName];
  }
  let version_satisfied = false;
  if (ver != "") {
    if (ver[0] == "^") {
      ver = ver.substring(1);
    }
    version_satisfied = checkIfVersionSatisfied(depVersion, ver);
  }

  return {
    name: repo,
    repo: url,
    version: ver,
    version_satisfied: version_satisfied,
    exists: exists,
  };
}

/**
 * Link format: https://github.com/{author}/{repo}/ (trailing "/" not mandatory)
 */
function getAuthorAndRepoFromGithubUrl(url: string): {
  author: string;
  repo: string;
} {
  const words = url.split("/");
  if (words[words.length - 1] == "") {
    words.pop(); // remove last item if empty space
  }
  const repo = words[words.length - 1];
  const author = words[words.length - 2];

  return {
    repo: repo,
    author: author,
  };
}

function checkIfVersionSatisfied(givenVersion: string, remoteVersion: string) {
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

export { checkDependency, DependencyResponse };
