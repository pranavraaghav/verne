/**
 * Link format: https://github.com/{owner}/{repo}/ (trailing "/" not mandatory)
 */
export function getOwnerAndRepoFromGithubUrl(url: string): {
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
