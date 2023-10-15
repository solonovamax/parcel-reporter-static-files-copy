"use strict";
const {Reporter} = require("@parcel/plugin");
const fs = require("fs");
const path = require("path");
const {minimatch} = require("minimatch");

const PACKAGE_JSON_SECTION = "staticFiles";

const staticCopyPlugin = new Reporter({
  async report({event, options}) {
    if (event.type === "buildSuccess") {
      const projectRoot = findProjectRoot(event, options);
      const configs = getSettings(projectRoot);

      // Get all dist dir from targets, we'll copy static files into them
      const targets = Array.from(
        new Set(
          event.bundleGraph
            .getBundles()
            .filter((b) => b.target && b.target.distDir)
            .map((b) => b.target.distDir)
        )
      );

      for (const config of configs) {
        /**@type {string} */
        let distPaths = config.distDir ? [config.distDir] : targets;
        let includeGlob = config.includeGlob ? config.includeGlob : "**";

        if (config.env) {
          if (!doesEnvironmentVarsMatches(config.env)) {
            continue;
          }
        }

        if (config.staticOutPath) {
          distPaths = distPaths.map((p) => path.join(p, config.staticOutPath));
        }
        /**@type {string}*/
        let staticPath = config.staticPath || path.join(projectRoot, "static");

        let fn = fs.statSync(staticPath).isDirectory() ? copyDir : copyFile;

        for (let distPath of distPaths) {
          fn(staticPath, distPath, includeGlob);
        }
      }
    }
  },
});

function copySingleFile(src, copyTo, includeGlob) {
  if (shouldBeIncluded(src, includeGlob)) {
    fs.copyFileSync(src, copyTo);
  }
}

const shouldBeIncluded = (file, includeGlob) => {
  return minimatch(file, path.join(includeGlob));
};

const copyFile = (copyFrom, copyTo, includeGlob) => {
  if (!fs.existsSync(copyTo)) {
    fs.mkdirSync(copyTo, {recursive: true});
  }

  let dest = path.join(copyTo, path.basename(copyFrom));
  copySingleFile(copyFrom, dest, includeGlob);
};

/**
 * @param {string} copyFrom
 * @param {string} copyTo
 * @param {string} includeGlob
 */
const copyDir = (copyFrom, copyTo, includeGlob) => {
  if (!fs.existsSync(copyTo)) {
    fs.mkdirSync(copyTo, {recursive: true});
  }
  const copy = (filepath, relative, filename) => {
    const dest = path.join(copyTo, relative);
    if (!filename) {
      if (!fs.existsSync(dest)) {
        fs.mkdirSync(dest, {recursive: true});
      }
    } else {
      copySingleFile(filepath, dest, includeGlob);
    }
  };
  recurseSync(copyFrom, copy);
};

/**
 * Recurse into directory and execute callback function for each file and folder.
 *
 * Based on https://github.com/douzi8/file-system/blob/master/file-system.js#L254
 *
 * @param dirpath directory to start from
 * @param callback function to be run on every file/directory
 */
const recurseSync = (dirpath, callback) => {
  const rootpath = dirpath;

  function recurse(dirpath) {
    fs.readdirSync(dirpath).forEach(function (filename) {
      const filepath = path.join(dirpath, filename);
      const stats = fs.statSync(filepath);
      const relative = path.relative(rootpath, filepath);

      if (stats.isDirectory()) {
        callback(filepath, relative);
        recurse(filepath);
      } else {
        callback(filepath, relative, filename);
      }
    });
  }

  recurse(dirpath);
};

const findProjectRoot = (event, options) => {
  if (options.env["npm_package_json"]) {
    return path.dirname(options.env["npm_package_json"]);
  }
  if (options.env["PNPM_SCRIPT_SRC_DIR"]) {
    return options.env["PNPM_SCRIPT_SRC_DIR"];
  }
  return options.projectRoot;
};
/**
 *
 * @param projectRoot
 * @returns {any[]}
 */
const getSettings = (projectRoot) => {
  let packageJson = JSON.parse(
    fs.readFileSync(path.join(projectRoot, "package.json"))
  );
  var section = packageJson[PACKAGE_JSON_SECTION];
  if (Array.isArray(section)) {
    return section;
  } else {
    return [Object.assign({}, section)];
  }
};

const doesEnvironmentVarsMatches = (envVars) => {
  var allMatches = true;
  for (var envVarName in envVars) {
    if (process.env[envVarName] !== envVars[envVarName]) {
      allMatches = false;
      break;
    }
  }
  return allMatches;
};

exports.default = staticCopyPlugin;
