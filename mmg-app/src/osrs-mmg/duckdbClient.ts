import * as duckdb from "@duckdb/duckdb-wasm";
import duckdb_wasm from "@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url";
import mvp_worker from "@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url";
import duckdb_wasm_eh from "@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url";
import eh_worker from "@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url";

import { DUCKDB_FILENAME } from "./dataConfig";

const MANUAL_BUNDLES: duckdb.DuckDBBundles = {
  mvp: {
    mainModule: duckdb_wasm,
    mainWorker: mvp_worker,
  },
  eh: {
    mainModule: duckdb_wasm_eh,
    mainWorker: eh_worker,
  },
};

/** Attached database alias — queries run against this schema via USE. */
const DB_ALIAS = "mmg";

let dbPromise: Promise<duckdb.AsyncDuckDB> | null = null;
let conn: duckdb.AsyncDuckDBConnection | null = null;
let initChain: Promise<void> = Promise.resolve();
let loadedKey: string | null = null;

async function getDb(): Promise<duckdb.AsyncDuckDB> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const bundle = await duckdb.selectBundle(MANUAL_BUNDLES);
      const worker = new Worker(bundle.mainWorker!, { type: "module" });
      const logger = new duckdb.VoidLogger();
      const db = new duckdb.AsyncDuckDB(logger, worker);
      await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
      return db;
    })();
  }
  return dbPromise;
}

async function getConn(): Promise<duckdb.AsyncDuckDBConnection> {
  if (!conn) {
    const db = await getDb();
    conn = await db.connect();
  }
  return conn;
}

async function isDbAttached(connection: duckdb.AsyncDuckDBConnection): Promise<boolean> {
  const result = await connection.query(
    `SELECT 1 FROM duckdb_databases() WHERE database_name = '${DB_ALIAS}' LIMIT 1`,
  );
  return result.toArray().length > 0;
}

async function openDatabase(bytes: ArrayBuffer, cacheKey: string | null): Promise<void> {
  if (cacheKey && loadedKey === cacheKey) {
    return;
  }

  const db = await getDb();
  const connection = await getConn();

  await db.registerFileBuffer(DUCKDB_FILENAME, new Uint8Array(bytes));

  if (await isDbAttached(connection)) {
    await connection.query(`DETACH ${DB_ALIAS}`);
  }

  await connection.query(`ATTACH '${DUCKDB_FILENAME}' AS ${DB_ALIAS} (READ_ONLY)`);
  await connection.query(`USE ${DB_ALIAS}`);

  loadedKey = cacheKey;
}

export async function initDuckdbWithBytes(bytes: ArrayBuffer, cacheKey?: string): Promise<void> {
  const key = cacheKey ?? null;
  if (key && loadedKey === key) {
    return;
  }
  initChain = initChain.then(() => openDatabase(bytes, key));
  return initChain;
}

export async function queryRows<T extends Record<string, unknown>>(
  sql: string,
): Promise<T[]> {
  await initChain;
  const connection = await getConn();
  const result = await connection.query(sql);
  return result.toArray() as T[];
}

export async function closeDuckdb(): Promise<void> {
  initChain = initChain.then(async () => {
    if (conn) {
      if (await isDbAttached(conn)) {
        await conn.query(`DETACH ${DB_ALIAS}`);
      }
      await conn.close();
      conn = null;
    }
    loadedKey = null;
  });
  await initChain;
}
