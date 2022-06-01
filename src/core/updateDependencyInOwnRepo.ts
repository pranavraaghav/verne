import { Octokit } from "octokit";
import { checkPackageJsonForDependency } from "./util/checkPackageJsonForDependency.js";
import { getFileAndShaFromGithubRepo } from "./util/getFileAndShaFromGithubRepo.js";
import { updatePackageJsonContent } from "./util/updatePackageJsonContent.js";

const NEW_BRANCH_NAME = "dependency-update";

export async function updateDependencyInOwnRepo(
  dep: string,
  url: string,
  owner: string,
  repo: string,
  filename: string,
  octokit: Octokit
): Promise<DependencyResponse> {
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

  const {
    exists,
    isAllowHigherVersion,
    version_satisfied,
    remoteVersion,
    foundIn,
    isMajorChange,
  } = checkPackageJsonForDependency(depName, depVersion, file);

  let update_pr_placeholder = "";
  if (isMajorChange) {
    update_pr_placeholder = "Major version change";
  }
  // No changes to be made in these cases, exit
  if (exists == false || version_satisfied == true || isMajorChange) {
    return {
      name: repo,
      repo: url,
      version: remoteVersion,
      version_satisfied: version_satisfied,
      exists: exists,
      update_pr: update_pr_placeholder,
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
        version: remoteVersion,
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
    version: remoteVersion,
    version_satisfied: version_satisfied,
    exists: exists,
    update_pr: pullRequestURL,
  };
}
