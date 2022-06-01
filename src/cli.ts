#!/usr/bin/env node

import { fileURLToPath } from "url";
import { resolve, dirname } from "path";
import { Octokit } from "octokit";
import { createSpinner } from "nanospinner";
import { updateDependency } from "./core/updateDependency.js";
import { checkDependency } from "./core/checkDependency.js";
import { getAccessToken } from "./auth/getAccessToken.js";
import { validateInput } from "./core/util/validateInput.js";
import meow from "meow";
import * as fs from "fs";
import * as csv from "fast-csv";
import * as dotenv from "dotenv";
import Conf from "conf";
import enquirer from "enquirer";
const { prompt } = enquirer;

// Since esmodules doesn't support __dirname, we make one for ourselves
const __dirname = process.cwd();

// Initialize configs
dotenv.config();
const conf = new Conf({
  projectName: "verne",
  projectVersion: "1.0.0",
});

// Initialize cli
const cli = meow(
  `
Usage
$ verne <input>         <input> must be of form <name>@<version-number>

Options
--file, -i            Describe location of CSV 
--update, -u          Update dependancies 
--clear               Clear logged in GitHub user 

Examples
$ verne -i input.csv axios@0.23.0
`,
  {
    importMeta: import.meta,
    flags: {
      file: {
        type: "string",
        isRequired: true,
        alias: "i",
      },
      update: {
        type: "boolean",
        default: false,
        alias: "u",
      },
      clear: {
        type: "boolean",
        default: false,
      },
    },
  }
);

const inputDependency = cli.input[0];

// Ensuring the user provided input is valid
if (validateInput(inputDependency) == false) {
  console.log("Invalid dependency/version provided.");
  process.exit(1);
}

// Ensuring oauthClientID (used to login to Github) is present
// const oauthClientID = process.env["OAUTH_CLIENT_ID"];
// if (oauthClientID == undefined) {
//   console.error("Undefined environment variable");
//   process.exit(1);
// }
const oauthClientID = "d2b9dffc072606452529";

let access_token;

// Check if force re-login is required
if (cli.flags.clear) {
  access_token = await getAccessToken(oauthClientID, conf);
} else {
  // Try to fetch access_token from local config files (caching)
  access_token = conf.get("ACCESS_TOKEN", undefined);
  if (access_token != undefined) {
    const expires_at = conf.get("EXPIRES_AT", "");
    if (typeof expires_at !== "string") {
      process.exit();
    }
    // Check if access_token is expired, get new one if expired
    const date = new Date(expires_at);
    if (new Date() > date) {
      console.log("Existing token has expired, fetching new access token");
      try {
      } catch (error) {
        console.log(error);
        process.exit();
      }
    }
  } else {
    // Fetch new access_token if not cached
    access_token = await getAccessToken(oauthClientID, conf);
  }
}

// Initiate Octokit singleton
const octokit = new Octokit({
  auth: access_token,
});

const resultPromises: Promise<DependencyResponse>[] = [];

// If the operation to be done is an update, onfirm once again with user
if (cli.flags.update) {
  const promptResp: {
    isProceed: boolean;
  } = await prompt({
    type: "confirm",
    name: "isProceed",
    message:
      "Are you sure you want to update the dependency in repositories? (Major changes will not be auto-updated)",
  });
  if (promptResp["isProceed"] == false) {
    console.log("Exiting...");
    process.exit(0);
  }
}

// Setup Spinners
const spinnerParseCSV = createSpinner("Parsing CSV input");
const spinnerOperations = createSpinner("Performing operations");

spinnerParseCSV.start();
// Reading the CSV file
fs.createReadStream(`${__dirname}/${cli.flags.file}`)
  // Catch any errors while creating stream
  .on("error", (error) => {
    spinnerParseCSV.error();
    console.error(error);
    process.exit(1);
  })
  .pipe(csv.parse({ headers: true }))
  // Catch any errors while parsing
  .on("error", (error) => {
    spinnerParseCSV.error();
    console.error(error);
    process.exit(1);
  })
  // Run the respective operation on each row from CSV
  // and add the result(a Promise) to a queue
  .on("data", (row) => {
    const githubRepoUrl = row["repo"];
    if (cli.flags.update == true) {
      resultPromises.push(
        updateDependency(inputDependency, githubRepoUrl, octokit)
      );
    } else {
      resultPromises.push(
        checkDependency(inputDependency, githubRepoUrl, octokit)
      );
    }
  })
  .on("end", () => {
    spinnerParseCSV.success();
    const csvOutStream = csv.format({ headers: true });

    csvOutStream.pipe(fs.createWriteStream(`${__dirname}/output.csv`));

    spinnerOperations.start();

    Promise.all(resultPromises).then((results) => {
      // Write items from result into an output csv file
      results.forEach((item) => {
        csvOutStream.write(item);
      });
      spinnerOperations.success();
      console.table(results);
    });
  });
