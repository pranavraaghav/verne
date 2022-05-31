#!/usr/bin/env node

import meow from "meow";
import * as fs from "fs";
import {
  checkDependency,
  DependencyResponse,
  updateDependency,
} from "./versionCheck.js";
import { fileURLToPath } from "url";
import { dirname } from "path";
import * as csv from "fast-csv";
import { Octokit } from "octokit";
import * as dotenv from "dotenv";
import Conf from "conf";
import { getAccessToken } from "./githubToken.js";
import { createSpinner } from "nanospinner";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config();
const conf = new Conf();

// SETUP CLI
const cli = meow(
  `
Usage
$ foo <input>

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
let promises: Promise<DependencyResponse>[] = [];

const octokit = new Octokit({
  auth: access_token,
});

const dependencyToCheck = cli.input[0];

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
