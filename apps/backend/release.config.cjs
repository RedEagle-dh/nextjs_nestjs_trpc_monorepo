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
	tagFormat: "backend-v${version}",
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
			"@semantic-release/git",
			{
				assets: ["package.json", "CHANGELOG.md"],
				message:
					"chore(release): backend ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}",
			},
		],
		[
			"@semantic-release/exec",
			{
				prepareCmd:
					"node -e \"console.log(JSON.stringify({ version: '${nextRelease.version}' }))\" > version.json",
			},
		],
	],
};
