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
  const { owner, repo } = getOwnerAndRepoFromGithubUrl(url);

  // fetch file
  let response;
  try {
    response = await octokit.request(
      `GET /repos/${owner}/${repo}/contents/${filename}`
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

async function updateDependency(
  dep: string,
  url: string,
  octokit: Octokit,
  filename: string = "package.json"
) {
  const NEW_BRANCH_NAME = "dependency-update";
  let base_branch_name = "main";
  let exists = false;
  const { owner, repo } = getOwnerAndRepoFromGithubUrl(url);

  // fetch file
  let response;
  try {
    response = await octokit.request(
      `GET /repos/${owner}/${repo}/contents/${filename}`,
      {
        headers: {
          accept: "application/vnd.github.v3+json",
        },
      }
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
  let foundIn = "";
  if (depName in dependencies) {
    ver = dependencies[depName];
    exists = true;
    foundIn = "dependencies";
  }
  if (devDependencies != undefined && depName in devDependencies) {
    exists = true;
    ver = devDependencies[depName];
    let foundIn = "devDependencies";
  }
  let version_satisfied = false;
  let isAllowHigherVersion = false;
  if (ver != "") {
    if (ver[0] == "^") {
      isAllowHigherVersion = true;
      ver = ver.substring(1);
    }
    version_satisfied = checkIfVersionSatisfied(depVersion, ver);
  }

  if (exists && version_satisfied == false) {
    // UPDATE THE RECORD
    // CREATE BRANCH
    let isBranchExist = false;
    const headResp = await octokit.request(
      `GET /repos/${owner}/${repo}/git/refs/heads`,
      {
        headers: {
          accept: "application/vnd.github.v3+json",
        },
      }
    );

    const c = headResp.data[0]["ref"].split("/");
    base_branch_name = c[c.length - 1];
    const shaRef = headResp.data[0]["object"]["sha"];
    // But first make sure it doesn't exist already
    headResp.data.forEach((item: object) => {
      if (item["ref" as keyof typeof item] == `refs/heads/${NEW_BRANCH_NAME}`) {
        isBranchExist = true;
      }
    });

    if (isBranchExist == false) {
      const newBranchResp = await octokit.request(
        `POST /repos/${owner}/${repo}/git/refs`,
        {
          owner: owner,
          repo: repo,
          ref: `refs/heads/${NEW_BRANCH_NAME}`,
          sha: shaRef,
        }
      );
    }

    // COMMIT CHANGES TO BRANCH
    if (foundIn == "dependencies") {
      if (isAllowHigherVersion) {
        dependencies[depName] = `^${depVersion}`;
      } else {
        dependencies[depName] = `${depVersion}`;
      }
      validatedPackageJson.value["dependencies"] = dependencies;

      const obj: object = validatedPackageJson.value;
      const newContent = Buffer.from(JSON.stringify(obj, null, 4)).toString(
        "base64"
      );

      await octokit.request("PUT /repos/{owner}/{repo}/contents/{path}", {
        owner: owner,
        repo: repo,
        path: filename,
        message: `Update dependency ${depName} to v${depVersion}`,
        content: newContent,
        branch: NEW_BRANCH_NAME,
        sha: response.data["sha"],
      });
    }
  }

  // MAKE PR USING BRANCH
  const prResponse = await octokit.request("POST /repos/{owner}/{repo}/pulls", {
    owner: owner,
    repo: repo,
    title: "Updated Dependencies",
    body: "Please pull these awesome changes in!",
    head: NEW_BRANCH_NAME,
    base: base_branch_name,
  });

  const pullUrl = prResponse.data["url"];

  return {
    name: repo,
    repo: url,
    version: ver,
    version_satisfied: version_satisfied,
    exists: exists,
    pull_url: pullUrl,
  };
}

/**
 * Link format: https://github.com/{owner}/{repo}/ (trailing "/" not mandatory)
 */
function getOwnerAndRepoFromGithubUrl(url: string): {
  owner: string;
  repo: string;
} {
  const words = url.split("/");
  if (words[words.length - 1] == "") {
    words.pop(); // remove last item if empty space
  }
  const repo = words[words.length - 1];
  const owner = words[words.length - 2];

  return {
    repo: repo,
    owner: owner,
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

export { checkDependency, updateDependency, DependencyResponse };
