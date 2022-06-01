#!/usr/bin/env node

import meow from "meow";
import * as fs from "fs";

import { fileURLToPath } from "url";
import { resolve, dirname } from "path";
import * as csv from "fast-csv";
import { Octokit } from "octokit";
import * as dotenv from "dotenv";
import Conf from "conf";
import { createSpinner } from "nanospinner";
import { updateDependency } from "./core/updateDependency.js";
import { checkDependency } from "./core/checkDependency.js";
import { getAccessToken } from "./auth/getAccessToken.js";

import { validateInput } from "./core/util/validateInput.js";

const currentDir = dirname(fileURLToPath(import.meta.url));
const __dirname = resolve(currentDir + "/..");

dotenv.config();
const conf = new Conf();

// SETUP CLI
const cli = meow(
  `
Usage
$ foo <input>  <input> must be of form <name>@<version-number>

Options
--file, -i   Describe location of CSV 
--update, -u  Update dependancies 
--flush, -f  Clear logged in GitHub user 

Examples
$ foo -i input.csv axios@0.23.0
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
      flush: {
        type: "boolean",
        default: false,
        alias: "f",
      },
    },
  }
);

// OBTAIN GITHUB ACCESS TOKEN
const oauthClientID = process.env["OAUTH_CLIENT_ID"];
if (oauthClientID == undefined) {
  process.exit(-1);
}

let access_token;

if (cli.flags.flush) {
  access_token = await getAccessToken(oauthClientID, conf);
} else {
  access_token = conf.get("ACCESS_TOKEN", undefined);
  if (access_token != undefined) {
    const expires_at = conf.get("EXPIRES_AT", "");
    if (typeof expires_at !== "string") {
      process.exit();
    }
    const date = new Date(expires_at);
    if (new Date() > date) {
      console.log("Existing token has expired, fetching new access token");
      try {
        access_token = await getAccessToken(oauthClientID, conf);
      } catch (error) {
        console.log(error);
        process.exit();
      }
    }
  }
}

// MAIN LOGIC
const promises: Promise<DependencyResponse>[] = [];

const octokit = new Octokit({
  auth: access_token,
});

const dependencyToCheck = cli.input[0];

// Ensuring the user provided input is valid
if (validateInput(dependencyToCheck) == false) {
  console.log("Invalid dependency/version provided.");
  process.exit(1);
}

const spinnerParseCSV = createSpinner("Parsing CSV input").start();
fs.createReadStream(`${__dirname}/${cli.flags.file}`)
  .pipe(csv.parse({ headers: true }))
  .on("error", (error) => console.error(error))
  .on("data", async (row) => {
    const url = row["repo"];
    if (cli.flags.update == true) {
      promises.push(updateDependency(dependencyToCheck, url, octokit));
    } else {
      promises.push(checkDependency(dependencyToCheck, url, octokit));
    }
  })
  .on("end", () => {
    spinnerParseCSV.success();
    const csvOutStream = csv.format({ headers: true });

    csvOutStream
      .pipe(fs.createWriteStream(`${__dirname}/output.csv`))
      .on("end", () => process.exit());

    const spinnerOperations = createSpinner("Performing operations").start();
    Promise.all(promises).then((resolved) => {
      resolved.forEach((item) => {
        csvOutStream.write(item);
      });
      spinnerOperations.success();
    });
  });
