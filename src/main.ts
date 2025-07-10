import {
  confirm,
  input,
  password,
  search,
  select,
  Separator,
} from "@inquirer/prompts";
import { crypto } from "@std/crypto";
import { encodeBase64 } from "@std/encoding";
import * as fs from "@std/fs";
import * as path from "@std/path";
import os from "node:os";
import { parse, stringify } from "@std/csv";
import { DatabaseSync } from "node:sqlite";
import { Encryption } from "./encryption.ts";
import { Db } from "./db.ts";

const BASE_DIR = path.join(os.homedir(), ".password-manager");

const DEFAULT_VAULT_PATH = path.join(BASE_DIR, "vault");
const DEFAULT_LOCKFILE_PATH = path.join(BASE_DIR, "lockfile");

const LOCKFILE_MSG = "andrew";

async function validateMasterPassword() {
  const pw = await password({
    message: "Enter your master password:",
    mask: true,

    validate: async (value) => {
      try {
        const lockfileBase64 = await Deno.readTextFile(DEFAULT_LOCKFILE_PATH);

        const decrypted = await Encryption.decrypt(value, lockfileBase64);
        if (decrypted === LOCKFILE_MSG) {
          return true;
        }

        return "Invalid password";
      } catch {
        return "Invalid password";
      }
    },
  });

  return pw;
}

async function createMasterPassword() {
  const pw1 = await password({ message: "Password:", mask: true });
  const pw2 = await password({
    message: "Confirm Password:",
    mask: true,
    validate: (value) => (pw1 !== value ? "Passwords do not match" : true),
  });

  const base64 = await Encryption.encrypt(pw2, LOCKFILE_MSG);

  await Deno.writeFile(DEFAULT_LOCKFILE_PATH, new TextEncoder().encode(base64));
}

const CHOICES = {
  SEARCH: "Find a record",
  ADD: "Add a record",
  IMPORT: "Import records",
  EXPORT: "Export records",
  EXIT: "Exit",
  DELETE_VAULT: "Delete vault",
};

async function main() {
  console.log("\x1b[34m%s\x1b[0m", "########################");
  console.log("\x1b[34m%s\x1b[0m", "TPM: Tiny Password Manager v0.1.0");
  console.log("\x1b[34m%s\x1b[0m", "########################\n");

  await fs.ensureDir(BASE_DIR);

  if (!fs.existsSync(DEFAULT_LOCKFILE_PATH)) {
    console.log(
      "No master password found, you must create a master password before continuing."
    );
    await createMasterPassword();
    console.log("Master password succesfully created.");
  }

  const db = new DatabaseSync(DEFAULT_VAULT_PATH);

  Db.ensureTables(db);

  const masterPassword = await validateMasterPassword();
  let records = Db.fetchRecords(db);

  console.log(
    `Vault unlocked (${records.length} record${
      records.length === 1 ? "" : "s"
    })\n`
  );

  const mainLoop = async () => {
    const command = await select({
      message: "What do you want to do?",
      choices: [
        ...Object.values(CHOICES).filter((c) => c !== CHOICES.DELETE_VAULT),
        new Separator(),
        CHOICES.DELETE_VAULT,
      ],
      default: CHOICES.SEARCH,
    });

    switch (command) {
      case CHOICES.SEARCH: {
        const selectedId = await search({
          message: "Search for a record (type 'exit' to return to menu):",
          source: (term) => {
            if (!term)
              return records.map((r) => ({ name: r.name, value: r.id }));

            if (term === "exit") {
              return [{ name: "← Exit to menu", value: -1 }];
            }

            return records
              .filter(
                (r) =>
                  r.name.toLowerCase().includes(term.toLowerCase()) ||
                  r.website?.toLowerCase().includes(term.toLowerCase())
              )
              .map((r) => ({
                name: r.name,
                value: r.id,
              }));
          },
        });

        if (selectedId === -1) return await mainLoop();

        const record = records.find((r) => r.id === selectedId);
        if (!record) throw Error("Missing record");
        console.log({
          ...record,
          password: "[hidden]",
        });

        const ACTIONS = {
          REVEAL: "Reveal password",
          DELETE: "Delete record",
          BACK: "Go back",
        };

        const action = await select({
          message: "Actions:",
          default: ACTIONS.REVEAL,
          choices: Object.values(ACTIONS),
        });

        switch (action) {
          case ACTIONS.REVEAL: {
            const decrypted = await Encryption.decrypt(
              masterPassword,
              record.password
            );
            console.log(`${decrypted}\n`);

            return await mainLoop();
          }

          case ACTIONS.DELETE: {
            const confirmDelete = await confirm({
              message: "Are you sure you want to delete this record?",
              default: false,
            });
            if (confirmDelete) {
              Db.deleteRecord(db, record.id);

              records = Db.fetchRecords(db);
              console.log("Record deleted\n");
            }

            return await mainLoop();
          }

          default:
            return await mainLoop();
        }
      }

      case CHOICES.ADD: {
        const name = await input({
          message: "Name:",
          required: true,
          validate: (v) => (!v ? "Must not be an empty string" : true),
        });
        const username = await input({
          message: "Username:",
          required: true,
          validate: (v) => (!v ? "Must not be an empty string" : true),
        });
        const website = await input({ message: "Website (optional):" });

        const autoGenerate = await confirm({
          message: "Auto-generate password?",
        });

        let encryptedPassword = "";
        if (autoGenerate) {
          const generated = encodeBase64(
            crypto.getRandomValues(new Uint8Array(32))
          );
          console.log(`Generated: ${generated}`);
          encryptedPassword = await Encryption.encrypt(
            masterPassword,
            generated
          );
        } else {
          const pw1 = await password({
            message: "Password:",
            mask: true,
            validate: (v) => (!v ? "Must not be an empty string" : true),
          });
          const pw2 = await password({
            message: "Confirm Password:",
            mask: true,
            validate: (v) => pw1 === v,
          });
          encryptedPassword = await Encryption.encrypt(masterPassword, pw2);
        }

        Db.insertRecord(db, {
          name,
          username,
          website,
          password: encryptedPassword,
        });

        records = Db.fetchRecords(db);

        console.log("Password added!\n");
        return await mainLoop();
      }

      case CHOICES.IMPORT: {
        const importChoices = {
          STANDARD:
            "Standard (id, name, username, password, website, created_at)",
          BITWARDEN:
            "Bitwarden (folder, favorite, type, name, notes, fields, reprompt, login_uri, login_username, login_password, login_otp)",
          EXIT: "← Exit to menu",
        };
        const format = await select({
          message: "Please select the CSV file format you are importing",
          choices: Object.values(importChoices),
        });

        if (format === importChoices.EXIT) return await mainLoop();

        let columns: string[] = [];
        if (format === importChoices.STANDARD) {
          columns = [
            "id",
            "name",
            "username",
            "password",
            "website",
            "created_at",
          ];
        } else if (format === importChoices.BITWARDEN) {
          columns = [
            "folder",
            "favorite",
            "type",
            "name",
            "notes",
            "fields",
            "reprompt",
            "login_uri",
            "login_username",
            "login_password",
            "login_otp",
          ];
        } else {
          throw Error(`Invalid import format: ${format}`);
        }

        let filePath = await input({
          message: "Enter absolute file path of CSV file",
        });
        filePath = filePath.replace("~", os.homedir());

        const csvStr = await Deno.readTextFile(filePath);
        const parsed = parse(csvStr, {
          skipFirstRow: true,
          columns,
        });

        let imported = 0;
        for (const record of parsed) {
          let name, website, username, unEncryptedPassword;

          if (format === importChoices.STANDARD) {
            name = record.name;
            website = record.website;
            username = record.username;
            unEncryptedPassword = record.password;
          } else if (format === importChoices.BITWARDEN) {
            name = record.name;
            website = record.login_uri;
            username = record.login_username;
            unEncryptedPassword = record.login_password;
          } else {
            throw Error(`Invalid import format: ${format}`);
          }

          const password = await Encryption.encrypt(
            masterPassword,
            unEncryptedPassword
          );

          Db.insertRecord(db, { name, username, website, password });

          imported++;
        }

        console.log(
          `${imported} record${imported === 1 ? "" : "s"} imported!\n`
        );

        records = Db.fetchRecords(db);

        return await mainLoop();
      }

      case CHOICES.EXPORT: {
        const confirmResponse = await confirm({
          message: `Are you sure you want to export ${records.length} record${
            records.length === 1 ? "" : "s"
          }?`,
          default: false,
        });

        if (!confirmResponse) return await mainLoop();

        const filePath = path.join(
          os.homedir(),
          `Downloads/passwords_${+new Date()}.csv`
        );

        const unEncryptedRecords = await Promise.all(
          records.map(async (r) => ({
            ...r,
            password: await Encryption.decrypt(masterPassword, r.password),
          }))
        );

        const csvStr = stringify(unEncryptedRecords, {
          columns: [
            "id",
            "name",
            "username",
            "password",
            "website",
            "created_at",
          ],
        });

        await Deno.writeTextFile(filePath, csvStr);

        console.log(`Records exported ${filePath}\n`);

        return await mainLoop();
      }

      case CHOICES.DELETE_VAULT: {
        const confirmWipe = await confirm({
          message:
            "Are you sure you want to delete your vault? This action is irreversible and will require you to enter your master password. Once deleted, you will be required to set a new master password upon relaunch.",
          default: false,
        });
        if (!confirmWipe) return await mainLoop();

        await validateMasterPassword();

        await Deno.remove(BASE_DIR, { recursive: true });

        console.log("Vault deleted\n");

        return Deno.exit(0);
      }

      case CHOICES.EXIT: {
        return Deno.exit(0);
      }
      default:
    }
  };

  await mainLoop();
}

Deno.addSignalListener("SIGINT", () => {
  console.log("sigint");
  Deno.exit();
});

if (import.meta.main) {
  try {
    await main();
  } catch (err) {
    if (!(err instanceof Error && err.name === "ExitPromptError")) {
      console.error(err);
    }

    Deno.exit(1);
  }
}
