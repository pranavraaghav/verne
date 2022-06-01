import { Octokit } from "octokit";
import { checkPackageJsonForDependency } from "./util/checkPackageJsonForDependency.js";
import { getFileAndShaFromGithubRepo } from "./util/getFileAndShaFromGithubRepo.js";
import { updatePackageJsonContent } from "./util/updatePackageJsonContent.js";

export async function updateDependencyInDiffRepo(
  dep: string,
  url: string,
  owner: string,
  currentUser: string,
  repo: string,
  filename: string,
  octokit: Octokit
): Promise<DependencyResponse> {
  // fetch file
  const { file, file_sha } = await getFileAndShaFromGithubRepo(
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
  // No changes to be made, exit
  if (exists == false || version_satisfied || isMajorChange) {
    return {
      name: repo,
      repo: url,
      version: remoteVersion,
      version_satisfied: version_satisfied,
      exists: exists,
      update_pr: update_pr_placeholder,
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
    version: remoteVersion,
    version_satisfied: version_satisfied,
    exists: exists,
    update_pr: prResponse.data["url"],
  };
}
