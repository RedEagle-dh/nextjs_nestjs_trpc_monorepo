module.exports = {
	branches: [
		"main",
		{
			name: "stage",
			channel: "rc",
			prerelease: "rc",
		},
		{
			name: "develop",
			channel: "beta",
			prerelease: "beta",
		},
	],
	plugins: [
		"@semantic-release/commit-analyzer",
		"@semantic-release/release-notes-generator",
		[
			"@semantic-release/changelog",
			{
				changelogFile: "CHANGELOG.md",
			},
		],
		[
			"@semantic-release/npm",
			{
				npmPublish: false,
			},
		],
		[
			"@semantic-release/exec",
			{
				prepareCmd:
					"node ./scripts/update-version.js ${nextRelease.version}",
			},
		],
		[
			"@semantic-release/git",
			{
				assets: ["package.json", "CHANGELOG.md", "public/version.json"],
				message:
					"chore(release): ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}",
			},
		],
	],
};
