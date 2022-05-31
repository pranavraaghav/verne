import Joi from "joi";
import { Octokit } from "octokit";

const NEW_BRANCH_NAME = "dependency-update";

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
  const { owner, repo } = getOwnerAndRepoFromGithubUrl(url);

  // fetch file
  const { file } = await getFileAndShaFromGithubRepo(
    owner,
    repo,
    filename,
    octokit
  );

  // extract dep name and version
  const s = dep.split("@");
  const depName = s[0];
  const depVersion = s[1];

  const { exists, version_satisfied } = checkPackageJsonForDependency(
    depName,
    depVersion,
    file
  );

  return {
    name: repo,
    repo: url,
    version: depVersion,
    version_satisfied: version_satisfied,
    exists: exists,
  };
}

async function updateDependency(
  dep: string,
  url: string,
  octokit: Octokit,
  filename: string = "package.json"
): Promise<DependencyResponse> {
  const { owner, repo } = getOwnerAndRepoFromGithubUrl(url);

  const currentUserResp = await octokit.request("GET /user", {});
  const currentUser = currentUserResp.data["login"];

  if (owner == currentUser) {
    return await updateDependencyInOwnRepo(
      dep,
      url,
      owner,
      repo,
      filename,
      octokit
    );
  } else {
    return await updateDependencyInDiffRepo(
      dep,
      url,
      owner,
      currentUser,
      repo,
      filename,
      octokit
    );
  }
}

async function updateDependencyInDiffRepo(
  dep: string,
  url: string,
  owner: string,
  currentUser: string,
  repo: string,
  filename: string,
  octokit: Octokit
) {
  // fetch file
  let { file, file_sha } = await getFileAndShaFromGithubRepo(
    owner,
    repo,
    filename,
    octokit
  );

  // Extract dep name and version
  const s = dep.split("@");
  const depName = s[0];
  const depVersion = s[1];

  // Check for dependencies
  const { exists, isAllowHigherVersion, version_satisfied, foundIn } =
    checkPackageJsonForDependency(depName, depVersion, file);

  // No changes to be made, exit
  if (exists == false || version_satisfied) {
    return {
      name: repo,
      repo: url,
      version: depVersion,
      version_satisfied: version_satisfied,
      exists: exists,
      update_pr: "",
    };
  }

  // Update contents of package.json
  const newContent = updatePackageJsonContent(
    file,
    foundIn,
    isAllowHigherVersion,
    depName,
    depVersion
  );

  // Get all existing branches of repo
  const branchResp = await octokit.request(
    `GET /repos/${owner}/${repo}/branches`,
    {
      headers: {
        accept: "application/vnd.github.v3+json",
      },
    }
  );

  // Get the base branch's name
  // data[0] since first branch is *usually* base
  const base_branch_name = branchResp.data[0]["name"];

  // Fork the repo
  await octokit.request("POST /repos/{owner}/{repo}/forks", {
    owner: owner,
    repo: repo,
  });

  // Apply changes in your fork
  await octokit.request("PUT /repos/{owner}/{repo}/contents/{path}", {
    owner: currentUser,
    repo: repo,
    path: filename,
    message: `Update dependency ${depName} to v${depVersion}`,
    content: newContent,
    sha: file_sha,
  });

  // Make the PR
  const prResponse = await octokit.request("POST /repos/{owner}/{repo}/pulls", {
    owner: owner,
    repo: repo,
    title: "Updated dependencies",
    body: "Merge these or else 🔪",
    head: `${currentUser}:${base_branch_name}`,
    base: base_branch_name,
  });

  return {
    name: repo,
    repo: url,
    version: depVersion,
    version_satisfied: version_satisfied,
    exists: exists,
    update_pr: prResponse.data["url"],
  };
}

async function updateDependencyInOwnRepo(
  dep: string,
  url: string,
  owner: string,
  repo: string,
  filename: string,
  octokit: Octokit
) {
  let base_branch_name = "main";

  // fetch file
  const { file, file_sha } = await getFileAndShaFromGithubRepo(
    owner,
    repo,
    filename,
    octokit
  );
  const { dependencies, devDependencies } = file;

  // Extract dependency name and version
  const s = dep.split("@");
  const depName = s[0];
  const depVersion = s[1];

  const { exists, isAllowHigherVersion, version_satisfied, foundIn } =
    checkPackageJsonForDependency(depName, depVersion, file);

  // No changes to be made in these cases, exit
  if (exists == false || version_satisfied == true) {
    return {
      name: repo,
      repo: url,
      version: depVersion,
      version_satisfied: version_satisfied,
      exists: exists,
      update_pr: "",
    };
  }

  // Get data on existing branches of repo
  const headResp = await octokit.request(
    `GET /repos/${owner}/${repo}/git/refs/heads`,
    {
      headers: {
        accept: "application/vnd.github.v3+json",
      },
    }
  );

  // Get the base branch's name
  // data[0] because first branch is *usually* base
  const c = headResp.data[0]["ref"].split("/");
  base_branch_name = c[c.length - 1];

  // Get sha reference of the branch
  const shaRefOfBranch = headResp.data[0]["object"]["sha"];

  // Ensure branch we want to create doesn't exist already
  headResp.data.forEach((item: object) => {
    // TODO: Handle situations where branch already exists in a better manner
    // If true, it means branch we want to create already exists, so exit
    const branchNameRef = item["ref" as keyof typeof item];
    if (branchNameRef == `refs/heads/${NEW_BRANCH_NAME}`) {
      return {
        name: repo,
        repo: url,
        version: depVersion,
        version_satisfied: version_satisfied,
        exists: exists,
        update_pr: "",
      };
    }
  });

  // Create branch
  await octokit.request(`POST /repos/${owner}/${repo}/git/refs`, {
    owner: owner,
    repo: repo,
    ref: `refs/heads/${NEW_BRANCH_NAME}`,
    sha: shaRefOfBranch,
  });

  // Make the changes to package.json
  const newContent = updatePackageJsonContent(
    file,
    foundIn,
    isAllowHigherVersion,
    depName,
    depVersion
  );

  // Commit changes and push to the branch created earlier
  await octokit.request("PUT /repos/{owner}/{repo}/contents/{path}", {
    owner: owner,
    repo: repo,
    path: filename,
    message: `Update dependency ${depName} to v${depVersion}`,
    content: newContent,
    branch: NEW_BRANCH_NAME,
    sha: file_sha,
  });

  // Create a PR using the new branch
  const prResponse = await octokit.request("POST /repos/{owner}/{repo}/pulls", {
    owner: owner,
    repo: repo,
    title: "Updated Dependencies",
    body: "Please pull these awesome changes in!",
    head: NEW_BRANCH_NAME,
    base: base_branch_name,
  });

  const pullRequestURL = prResponse.data["url"];

  return {
    name: repo,
    repo: url,
    version: depVersion,
    version_satisfied: version_satisfied,
    exists: exists,
    update_pr: pullRequestURL,
  };
}

function updatePackageJsonContent(
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
    newContent = Buffer.from(JSON.stringify(obj, null, 4)).toString("base64");
  }
  return newContent;
}

/**
 *
 * @param depName
 * @param depVersion
 * @param file The package.json file as object
 * @returns
 */
function checkPackageJsonForDependency(
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
    let foundIn = "devDependencies";
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

async function getFileAndShaFromGithubRepo(
  owner: string,
  repo: string,
  filename: string,
  octokit: Octokit
): Promise<{
  file: any;
  file_sha: string;
}> {
  let file: object;
  let packageJsonResponse;
  try {
    packageJsonResponse = await octokit.request(
      `GET /repos/${owner}/${repo}/contents/${filename}`,
      {
        headers: {
          accept: "application/vnd.github.v3+json",
        },
      }
    );
  } catch (error) {
    throw error;
  }

  const schema = Joi.object({
    dependencies: Joi.object({}),
    devDependencies: Joi.object({}),
  }).unknown(true);

  if (packageJsonResponse.status == 200) {
    const encoded = packageJsonResponse.data.content;
    const decoded = Buffer.from(encoded, "base64").toString();
    file = JSON.parse(decoded);
  } else {
    throw new Error(`GitHub API responded with ${packageJsonResponse.status}`);
  }
  return {
    file: file,
    file_sha: packageJsonResponse.data["sha"],
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
