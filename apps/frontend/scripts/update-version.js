const fs = require("node:fs");
const path = require("node:path");

const newVersion = process.argv[2];

if (!newVersion) {
	console.error("Fehler: Es wurde keine Versionsnummer übergeben.");
	process.exit(1);
}

const versionFilePath = path.join(process.cwd(), "public", "version.json");

try {
	const fileContent = fs.readFileSync(versionFilePath, "utf8");
	const versionJson = JSON.parse(fileContent);

	console.log(
		`Aktualisiere Version in ${versionFilePath} von ${versionJson.version} auf ${newVersion}...`,
	);

	versionJson.version = newVersion;

	fs.writeFileSync(
		versionFilePath,
		`${JSON.stringify(versionJson, null, 2)}\n`,
	);

	console.log("version.json wurde erfolgreich aktualisiert.");
} catch (error) {
	console.error(
		`Fehler beim Aktualisieren der version.json: ${error.message}`,
	);
	process.exit(1);
}
