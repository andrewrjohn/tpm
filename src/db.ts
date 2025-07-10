import { DatabaseSync } from "node:sqlite";
import { Record } from "./types.ts";

export const Db = {
  /** Setup the database tables if needed. */
  ensureTables(db: DatabaseSync) {
    db.exec(
      `
        CREATE TABLE IF NOT EXISTS records (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          username TEXT NOT NULL,
          password TEXT NOT NULL,
          website TEXT,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
        `
    );
  },

  fetchRecords(db: DatabaseSync) {
    const records = db.prepare(`SELECT * from records ORDER BY name`).all() as {
      id: number;
      name: string;
      username: string;
      password: string;
      website?: string;
    }[];

    return records;
  },

  insertRecord(db: DatabaseSync, record: Omit<Record, "id" | "created_at">) {
    db.prepare(
      `
        INSERT INTO records (name, username, website, password)
        VALUES (?, ?, ?, ?)
        `
    ).run(record.name, record.username, record.website ?? "", record.password);
  },

  deleteRecord(db: DatabaseSync, id: number) {
    db.prepare(`DELETE FROM records where id = ?`).run(id);
  },
};
