// Extract the repository-relative path from a full file path
export function getRepoRelativePath(fullPath) {
  if (!fullPath) return fullPath;

  // Look for common patterns that indicate the start of the repo content
  // Pattern: /extracted/{repo-name}/
  const extractedMatch = fullPath.match(/\/extracted\/[^/]+\/(.+)$/);
  if (extractedMatch) {
    return extractedMatch[1];
  }

  // Fallback: just return the filename if no pattern matches
  const parts = fullPath.split("/");
  return parts[parts.length - 1];
}
