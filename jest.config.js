const nextJest = require("next/jest.js");

const createJestConfig = nextJest({ dir: "./" });

/** @type {import('jest').Config} */
const customJestConfig = {
  // jsdom, plus the Web globals it omits and `next/cache` needs at import time. See the header of
  // that file — without it, every suite that touches a `use cache` server component fails to load.
  testEnvironment: "<rootDir>/test/jsdom-web-apis.js",
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
  testMatch: ["<rootDir>/test/**/*.test.{ts,tsx}"],
  // Several suites mount a whole page of panels and drive it through userEvent. Those take tens of
  // seconds once Jest is running files in parallel, and against the 5s default they failed
  // intermittently in full runs while passing in isolation — with the failure landing on a
  // different test each time. The work is slow, not stuck, so the budget is raised; a genuine hang
  // still fails, just 20s later.
  testTimeout: 20_000,
  collectCoverage: true,
  collectCoverageFrom: ["app/components/**/*.{ts,tsx}"],
  coverageThreshold: {
    global: {
      statements: 100,
      branches: 100,
      functions: 100,
      lines: 100,
    },
  },
  coverageReporters: ["text", "text-summary"],
  moduleNameMapper: {
    "^marked$": require.resolve("./node_modules/marked/lib/marked.umd.js"),
  },
};

module.exports = createJestConfig(customJestConfig);
