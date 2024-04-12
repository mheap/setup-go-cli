const action = require("./index");
const tc = require("@actions/tool-cache");
const core = require("@actions/core");
const mockEnv = require("mocked-env");

const nock = require("nock");
nock.disableNetConnect();

let originalPlatform;
let originalArch;
let restore;
let restoreTest;

beforeEach(() => {
  restore = mockEnv({
    INPUT_TOKEN: "this_token_is_not_used_due_to_mocks",
    INPUT_OWNER: "mheap",
    INPUT_REPO: "demo-cli",
    INPUT_CLI_NAME: "demo",
  });
  restoreTest = () => {};

  jest.spyOn(console, "log").mockImplementation();
  originalPlatform = process.platform;
  originalArch = process.arch;
});

afterEach(() => {
  jest.restoreAllMocks();
  restore();
  restoreTest();
  if (!nock.isDone()) {
    throw new Error(
      `Not all nock interceptors were used: ${JSON.stringify(
        nock.pendingMocks()
      )}`
    );
  }
  nock.cleanAll();
  setPlatform(originalPlatform);
  setArch(originalArch);
});

describe("automatic version fetching", () => {
  it("does not fetch when a version is provided", async () => {
    // No call to nock(), so no HTTP traffic expected
    restoreTest = mockEnv({
      INPUT_VERSION: "3.2.1",
    });
    setPlatform("linux");
    mockToolIsInCache(true);
    mockExtraction();

    await action();
    expect(console.log).toBeCalledWith(`Installing demo version 3.2.1-linux`);
  });

  it("fetches the latest version when no version is provided", async () => {
    nock("https://api.github.com")
      .get("/repos/mheap/demo-cli/releases")
      .reply(200, [
        {
          tag_name: "v3.2.1",
        },
      ]);

    setPlatform("linux");
    mockToolIsInCache(true);
    mockExtraction();

    await action();
    expect(console.log).toBeCalledWith(`Installing demo version 3.2.1-linux`);
  });

  it("fails when there are no releases and no specific version is provided", async () => {
    nock("https://api.github.com")
      .get("/repos/mheap/demo-cli/releases")
      .reply(200, []);

    try {
      await action();
    } catch (e) {
      expect(e.message).toBe("No releases found in mheap/demo-cli");
    }
  });
});

describe("version parsing", () => {
  it("throws when an invalid version is provided", async () => {
    restoreTest = mockEnv({
      INPUT_VERSION: "banana",
    });
    expect(action).rejects.toThrow("Invalid version provided: 'banana'");
  });

  const cases = [
    ["1.7.0", "1.7.0"],
    ["1.7", "1.7.0"],
    ["1.6", "1.6.0"],
    ["1.6.4", "1.6.4"],
    ["1.8.0-beta2", "1.8.0"],
  ];

  test.each(cases)(
    `accepts a valid semver input (%s)`,
    async (version, expected) => {
      restoreTest = mockEnv({
        INPUT_VERSION: version,
      });

      setPlatform("linux");
      mockToolIsInCache(true);
      mockExtraction();

      await action();
      expect(console.log).toBeCalledWith(
        `Installing demo version ${expected}-linux`
      );
    }
  );
});

describe("install", () => {
  it("does not download if the file is in the cache", async () => {
    restoreTest = mockEnv({
      INPUT_VERSION: "1.7.0",
    });

    jest.spyOn(core, "addPath");
    jest.spyOn(tc, "downloadTool");

    setPlatform("linux");
    mockToolIsInCache(true);
    mockExtraction();

    await action();

    expect(tc.downloadTool).toBeCalledTimes(0);
    expect(core.addPath).toBeCalledWith("/path/to/demo-cli");
  });

  it("downloads if it is not in the cache", async () => {
    restoreTest = mockEnv({
      INPUT_VERSION: "1.7.0",
    });

    setPlatform("linux");
    setArch("amd64");
    mockToolIsInCache(false);
    mockTcDownload();
    mockExtraction();

    await action();

    const versionUrl = `https://github.com/mheap/demo-cli/releases/download/v1.7.0/demo_1.7.0_linux_amd64.tar.gz`;

    expect(tc.downloadTool).toBeCalledWith(versionUrl);
    expect(tc.extractTar).toBeCalledWith(
      "./demo-cli-downloaded",
      "demo-1.7.0-linux"
    );
    expect(core.addPath).toBeCalledWith("/path/to/extracted/demo-cli");
  });

  const osCases = [
    ["default", "linux"],
    ["linux", "linux"],
    ["win32", "windows"],
    ["darwin", "darwin"],
  ];

  test.each(osCases)("downloads correctly for %s", async (platform, os) => {
    restoreTest = mockEnv({
      INPUT_VERSION: "1.7.0",
    });

    setPlatform(platform);
    setArch("amd64");
    mockToolIsInCache(false);
    mockTcDownload();
    mockExtraction();

    await action();

    expect(tc.downloadTool).toBeCalledWith(
      `https://github.com/mheap/demo-cli/releases/download/v1.7.0/demo_1.7.0_${os}_amd64.tar.gz`
    );
  });

  const archCases = [
    ["x64", "amd64"],
    ["arm64", "arm64"],
  ];

  test.each(archCases)(
    "downloads correctly for %s",
    async (node_arch, arch) => {
      restoreTest = mockEnv({
        INPUT_VERSION: "1.7.0",
      });

      setPlatform("linux");
      setArch(node_arch);
      mockToolIsInCache(false);
      mockTcDownload();
      mockExtraction();

      await action();

      expect(tc.downloadTool).toBeCalledWith(
        `https://github.com/mheap/demo-cli/releases/download/v1.7.0/demo_1.7.0_linux_${arch}.tar.gz`
      );
    }
  );
});

function mockToolIsInCache(exists) {
  const path = exists ? "/path/to/demo-cli" : "";
  jest.spyOn(tc, "find").mockImplementationOnce(() => path);
}

function setPlatform(platform) {
  Object.defineProperty(process, "platform", {
    value: platform,
  });
}

function setArch(arch) {
  Object.defineProperty(process, "arch", {
    value: arch,
  });
}

function mockTcDownload() {
  jest
    .spyOn(tc, "downloadTool")
    .mockImplementationOnce(() => "./demo-cli-downloaded");
}

function mockTcExtractTar() {
  jest
    .spyOn(tc, "extractTar")
    .mockImplementationOnce(() => "./demo-cli-extracted-local");
}

function mockTcCacheDir() {
  jest
    .spyOn(tc, "cacheDir")
    .mockImplementationOnce(() => "/path/to/extracted/demo-cli");
}

function mockCoreAddPath() {
  jest.spyOn(core, "addPath").mockImplementationOnce(() => {});
}

function mockExtraction() {
  mockTcExtractTar();
  mockTcCacheDir();
  mockCoreAddPath();
}
