export default {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "type-enum": [
      2,
      "always",
      [
        "feat",     // New feature
        "fix",      // Bug fix
        "docs",     // Documentation only changes
        "style",    // Formatting, missing semi colons, etc
        "refactor", // Code change that neither fixes a bug nor adds a feature
        "perf",     // Performance improvement
        "test",     // Adding missing tests
        "build",    // Changes that affect the build system
        "ci",       // Changes to CI configuration files and scripts
        "chore",    // Other changes that don't modify src or test files
        "revert",   // Reverts a previous commit
      ],
    ],
    "subject-case": [0],
    "body-max-line-length": [0],
  },
}
