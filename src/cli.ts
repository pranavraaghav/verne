#!/usr/bin/env node

import meow from "meow";
import * as fs from "fs";
import { checkDependency, DependencyResponse } from "./versionCheck.js";
import { fileURLToPath } from "url";
import { dirname } from "path";
import * as csv from "fast-csv";
import { Octokit } from "octokit";
import * as dotenv from "dotenv";
import moment from "moment";
import { getAccessToken } from "./githubToken.js";
import Conf from "conf";

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
    },
  }
);

// OBTAIN GITHUB ACCESS TOKEN
const oauthClientID = process.env["OAUTH_CLIENT_ID"];
if (oauthClientID == undefined) {
  process.exit(-1);
}

let access_token;

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
      access_token = await getAccessToken(oauthClientID);
    } catch (error) {
      console.log(error);
      process.exit();
    }
    conf.set("ACCESS_TOKEN", access_token);
    conf.set("EXPIRES_AT", moment().add(6, "hours").toString()); // Tokens by default last 8 hours
  }
}

// MAIN LOGIC
let promises: Promise<DependencyResponse>[] = [];

const octokit = new Octokit({
  auth: access_token,
});

const dependencyToCheck = cli.input[0];
fs.createReadStream(`${__dirname}/${cli.flags.file}`)
  .pipe(csv.parse({ headers: true }))
  .on("error", (error) => console.error(error))
  .on("data", (row) => {
    const url = row["repo"];
    promises.push(checkDependency(dependencyToCheck, url, octokit));
  })
  .on("end", () => {
    const csvOutStream = csv.format({ headers: true });

    csvOutStream
      .pipe(fs.createWriteStream(`${__dirname}/output.csv`))
      .on("end", () => process.exit());

    Promise.all(promises).then((resolved) => {
      resolved.forEach((item) => {
        csvOutStream.write(item);
      });
    });
  });
