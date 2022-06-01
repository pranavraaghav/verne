interface DependencyResponse {
  name: string;
  repo: string;
  version: string;
  version_satisfied: boolean;
  exists: boolean;
  update_pr?: string;
}
