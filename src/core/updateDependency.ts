import { Octokit } from "octokit";
import { updateDependencyInDiffRepo } from "./updateDependencyInDiffRepo.js";
import { updateDependencyInOwnRepo } from "./updateDependencyInOwnRepo.js";
import { getOwnerAndRepoFromGithubUrl } from "./util/getOwnerAndRepoFromGithubUrl.js";

export async function updateDependency(
  dep: string,
  url: string,
  octokit: Octokit,
  filename = "package.json"
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
