#!/usr/bin/env node

import meow from "meow";
import { generate, parse, stringify } from "csv";
import * as fs from "fs";
import { checkDependency, DependencyResponse } from "./versionCheck.js";
import { fileURLToPath } from "url";
import { dirname } from "path";
import * as csv from "fast-csv";
import { stdout } from "process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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

let promises: Promise<DependencyResponse>[] = [];

const dependencyToCheck = cli.input[0];
fs.createReadStream(`${__dirname}/${cli.flags.file}`)
  .pipe(csv.parse({ headers: true }))
  .on("error", (error) => console.error(error))
  .on("data", (row) => {
    const url = row["repo"];
    promises.push(checkDependency(dependencyToCheck, url));
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
