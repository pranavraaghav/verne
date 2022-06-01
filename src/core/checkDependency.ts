import { Octokit } from "octokit";
import { checkPackageJsonForDependency } from "./util/checkPackageJsonForDependency.js";
import { getFileAndShaFromGithubRepo } from "./util/getFileAndShaFromGithubRepo.js";
import { getOwnerAndRepoFromGithubUrl } from "./util/getOwnerAndRepoFromGithubUrl.js";

export async function checkDependency(
  dep: string,
  url: string,
  octokit: Octokit,
  filename = "package.json"
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

  const { exists, version_satisfied, remoteVersion } =
    checkPackageJsonForDependency(depName, depVersion, file);

  return {
    name: repo,
    repo: url,
    version: remoteVersion,
    version_satisfied: version_satisfied,
    exists: exists,
  };
}
