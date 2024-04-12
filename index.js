const tc = require("@actions/tool-cache");
const core = require("@actions/core");
const github = require("@actions/github");
const semver = require("semver");

async function action() {
  let owner = core.getInput("owner", { required: true });
  let repo = core.getInput("repo", { required: true });
  let cliName = core.getInput("cli_name", { required: true });
  let version = core.getInput("version", { required: false });
  let packageNameTemplate = core.getInput("package_name_template", {
    required: false,
  });

  // Taken from https://github.com/sundowndev/goreleaser-template/blob/main/.goreleaser.yml#L63
  if (!packageNameTemplate) {
    packageNameTemplate = "{{name}}_{{os}}_{{arch}}";
  }

  if (!version) {
    // Fetch the latest release version
    const myToken = core.getInput("token");
    const octokit = github.getOctokit(myToken);
    const { data: releases } = await octokit.rest.repos.listReleases({
      owner,
      repo,
    });

    if (!releases.length) {
      throw new Error(`No releases found in ${owner}/${repo}`);
    }

    for (let i = 0; i < releases.length; i++) {
      if (releases[i].prerelease) {
        continue;
      }

      version = releases[i].tag_name.replace(/^v/, "");
      break;
    }

    if (!version) {
      throw new Error(
        `No releases (excluding prereleases) found in ${owner}/${repo}`
      );
    }
  }

  const semverVersion = semver.valid(semver.coerce(version));

  if (!semverVersion) {
    throw new Error(`Invalid version provided: '${version}'`);
  }

  let os = getPlatform(process.platform);
  let arch = getArch(process.arch);

  const fullVersion = `${semverVersion}-${os}`;
  console.log(`Installing ${cliName} version ${fullVersion}`);

  const packageName = interpolate(packageNameTemplate, {
    name: cliName,
    version: semverVersion,
    os,
    arch,
  });

  let toolDirectory = tc.find(cliName, fullVersion);
  if (!toolDirectory) {
    const versionUrl = `https://github.com/${owner}/${repo}/releases/download/v${semverVersion}/${packageName}.tar.gz`;
    const toolPath = await tc.downloadTool(versionUrl);

    const toolExtractedFolder = await tc.extractTar(
      toolPath,
      `${cliName}-${fullVersion}`
    );

    toolDirectory = await tc.cacheDir(
      toolExtractedFolder,
      cliName,
      fullVersion
    );
  }

  core.addPath(toolDirectory);
}

function getPlatform(platform) {
  if (platform === "win32") {
    return "windows";
  }

  if (process.platform === "darwin") {
    return "darwin";
  }

  return "linux";
}

function getArch(arch) {
  if (process.arch === "x64") {
    return "amd64";
  }

  return process.arch;
}

const interpolate = (string, values) =>
  string.replace(/{{(.*?)}}/g, (match, offset) => values[offset]);

if (require.main === module) {
  action();
}

module.exports = action;
