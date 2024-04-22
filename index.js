#!/usr/bin/env node

const yargs = require("yargs");
const fs = require("fs-extra");
const path = require("path");
const { exec, execSync } = require("child_process");

// Parsing command line arguments
const argv = yargs
    .option("arm", {
        describe: "Path to the ARM directory",
        type: "string",
        demandOption: true,
    })
    .option("intel", {
        describe: "Path to the Intel directory",
        type: "string",
        demandOption: true,
    })
    .option("preview", {
        describe: "Preview the files that will change",
        type: "boolean",
        demandOption: false,
    })
    .option("sign", {
        describe: "codesign the app directory with <keyName>",
        type: "string",
        demandOption: false,
    })
    .help()
    .alias("help", "h")
    .epilogue(
        "Fattens up a NW.js app by using an arm and intel version of the app"
    ).argv;

const specialExecutableFilenames = [
    "web_app_shortcut_copier",
    "nwjs Helper (Alerts)",
];

const excludeExecutableFilenames = [
    "greenworks-linux64.node",
    "greenworks-win64.node",
    "greenworks-win32.node",
    "greenworks-linux32.node",
];

// Function to check if a file is executable
function isExecutable(fileStats, filePath) {
    const executable =
        fileStats.isFile() &&
        (fileStats.mode & parseInt("111", 8) ||
            specialExecutableFilenames.includes(path.basename(filePath)) ||
            filePath.endsWith(".dylib") ||
            filePath.endsWith(".node")) &&
        !filePath.endsWith(".sh") &&
        !excludeExecutableFilenames.includes(path.basename(filePath));
    // if executable is true, also check if the file is already a fat binary
    if (executable) {
        const command = `lipo -info "${filePath}"`;
        const stdout = execSync(command);
        if (!stdout.includes("Non-fat file")) {
            console.log(`Already fat: ${filePath}`);
            return false;
        } else {
            console.log(`Not fat: ${filePath}`);
            return true;
        }
    }
}

/**
 * Recursively copy specific file from source to destination directory.
 *
 * @param {string} srcDir Source directory to search for the file.
 * @param {string} destDir Destination directory to copy the file to.
 * @param {string} filename Name of the file to search and copy.
 */
async function copySpecificFile(srcDir, destDir, filename) {
    try {
        const entries = await fs.readdir(srcDir, { withFileTypes: true });
        for (let entry of entries) {
            const srcPath = path.join(srcDir, entry.name);
            const destPath = path.join(destDir, entry.name);

            if (entry.isDirectory()) {
                // await fs.mkdir(destPath, { recursive: true }); // Ensure directory exists in destination
                await copySpecificFile(srcPath, destPath, filename); // Recurse into subdirectory
            } else if (entry.isFile() && entry.name === filename) {
                if (!argv.preview) {
                    await fs.copyFile(srcPath, destPath); // Copy file if it matches
                }
                console.log(`Copied: ${srcPath} to ${destPath}`);
            }
        }
    } catch (error) {
        console.error("Error during file copying:", error);
    }
}

// Recursive function to find executables
async function findExecutables(dir, basePath, execArray) {
    const files = await fs.readdir(dir);
    for (const file of files) {
        const pathRaw = path.join(dir, file);
        const normalizedPath = path.normalize(pathRaw);
        const fullPath = path.resolve(normalizedPath);
        const fileStats = await fs.lstat(fullPath); // Use lstat to check if symlink
        if (fileStats.isSymbolicLink() && fileStats.isDirectory()) {
            console.log(`Symlink found: ${fullPath}`);
            const targetPath = await fs.realpath(`${fullPath}`); // Follow symlink
            console.log(`Symlink target: ${targetPath}`);
            const targetStats = await fs.stat(targetPath);
            if (targetStats.isDirectory()) {
                await findExecutables(targetPath, basePath, execArray);
            } else if (isExecutable(targetStats, targetPath)) {
                const relativePath = path.relative(basePath, targetPath);
                const intelPath = path.join(argv.intel, relativePath);
                execArray.push({ armPath: targetPath, intelPath });
            }
        } else if (fileStats.isDirectory()) {
            const subDir = path.join(dir, file); // Get the full path of the subdirectory
            await findExecutables(subDir, basePath, execArray); // Recursively call findExecutables with the subdirectory
        } else if (isExecutable(fileStats, fullPath)) {
            // Create intel path from full path using argv.intel as the base path remove the argv.arm path
            const relativePath = path.relative(basePath, fullPath);
            const intelPath = path.join(argv.intel, relativePath);

            execArray.push({ armPath: fullPath, intelPath });
        }
    }
}

/**
 * Sign the app directory using the codesign CLI tool.
 *
 * @param {string} armDirectory The path to the ARM directory.
 * @param {string} keyName The name of the key to use for signing.
 */
function signAppDirectory(armDirectory, keyName) {
    // Find the app directory in the ARM directory look for *.app directory name
    const appDirectory = fs
        .readdirSync(armDirectory)
        .find((file) => file.endsWith(".app"));
    if (!appDirectory) {
        console.error("No app directory found in ARM directory.");
        return;
    }
    // Get path to the app directory
    const appPath = path.join(armDirectory, appDirectory);
    const command = `codesign  --force --deep -s "${keyName}" "${appPath}"`;
    console.log(`Signing app directory: ${appPath}`);
    if (argv.preview) {
        console.log(`Preview: ${command}`);
        return;
    }
    execSync(command, (error, stdout, stderr) => {
        if (error) {
            console.error(`Error: ${error.message}`);
            return;
        }
        if (stderr) {
            console.error(`Stderr: ${stderr}`);
            return;
        }
        console.log(`App directory signed: ${armDirectory}`);
    });
}

/**
 * Execute or preview lipo commands for an array of path objects.
 *
 * @param {Array} pathArray Array of objects with `armPath` and `intelPath`.
 * @param {boolean} preview If true, print the command instead of executing.
 */
function processExecArray(pathArray, preview) {
    pathArray.forEach(({ armPath, intelPath }) => {
        const command = `lipo -create "${armPath}" "${intelPath}" -output "${armPath}"`;

        if (preview) {
            console.log(`Preview: ${command}`);
        } else {
            execSync(command, (error, stdout, stderr) => {
                if (error) {
                    console.error(`Error: ${error.message}`);
                    return;
                }
                if (stderr) {
                    console.error(`Stderr: ${stderr}`);
                    return;
                }
                console.log(`Fattened: ${armPath}`);
            });
        }
    });
}

// Main function to process directories and log output
async function main() {
    const execArray = [];
    await findExecutables(argv.arm, argv.arm, execArray);
    // Log only the final file name
    execArray.forEach((element) => {
        console.log(
            `ARM: ${path.basename(element.armPath)}\tIntel: ${path.basename(
                element.intelPath
            )}`
        );
    });
    processExecArray(execArray, argv.preview);
    // console.log(execArray);
    await copySpecificFile(
        argv.intel,
        argv.arm,
        "v8_context_snapshot.x86_64.bin"
    );
    if (argv.sign) signAppDirectory(argv.arm, argv.sign);
}

main().catch((err) => console.error(err));
