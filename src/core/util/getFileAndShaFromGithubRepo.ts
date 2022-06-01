import { Octokit } from "octokit";

export async function getFileAndShaFromGithubRepo(
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
