#!/usr/bin/env node

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const SUPABASE_URL = process.env.PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY =
	process.env.SUPABASE_SERVICE_ROLE_KEY ||
	process.env.SUPABASE_SECRET_KEY ||
	process.env.PUBLIC_SUPABASE_ANON_KEY ||
	process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
	console.error(
		'Missing Supabase env vars. Please set PUBLIC_SUPABASE_URL (or SUPABASE_URL) and either SUPABASE_SECRET_KEY / SUPABASE_SERVICE_ROLE_KEY or PUBLIC_SUPABASE_ANON_KEY.'
	);
	process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
	auth: {
		persistSession: false,
		autoRefreshToken: false,
		detectSessionInUrl: false
	}
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BACKUP_ROOT = path.resolve(process.env.HOME || '~', 'bk', 'haradato');

function ensureDir(dir) {
	if (!fs.existsSync(dir)) {
		fs.mkdirSync(dir, { recursive: true });
	}
}

function toSqlLiteral(value) {
	if (value === null || value === undefined) return 'NULL';

	if (typeof value === 'number' && Number.isFinite(value)) {
		return String(value);
	}

	if (typeof value === 'boolean') {
		return value ? 'TRUE' : 'FALSE';
	}

	if (value instanceof Date) {
		return `'${value.toISOString().replace('T', ' ').replace('Z', '+00:00')}'`;
	}

	const asString = typeof value === 'object' ? JSON.stringify(value) : String(value);
	const escaped = asString.replace(/'/g, "''");
	return `'${escaped}'`;
}

function buildInsertStatements(tableName, rows) {
	if (!rows || rows.length === 0) {
		return `-- No rows to back up for ${tableName}\n`;
	}

	const allColumns = Array.from(
		rows.reduce((set, row) => {
			Object.keys(row || {}).forEach((k) => set.add(k));
			return set;
		}, new Set())
	);

	const columnList = allColumns.map((c) => `"${c}"`).join(', ');

	const valueTuples = rows.map((row) => {
		const values = allColumns.map((col) => toSqlLiteral(row[col]));
		return `(${values.join(', ')})`;
	});

	const header = `-- Backup for ${tableName}\n-- Generated at ${new Date().toISOString()}\n\n`;
	const deleteStmt = `DELETE FROM "${tableName}";\n\n`;
	const insertStmt = `INSERT INTO "${tableName}" (${columnList}) VALUES\n${valueTuples.join(
		',\n'
	)};\n`;

	return header + deleteStmt + insertStmt;
}

async function backupTable(tableName, outDir) {
	const { data, error } = await supabase.from(tableName).select('*');

	if (error) {
		console.error(`Failed to back up ${tableName}:`, error.message || error);
		return;
	}

	const sql = buildInsertStatements(tableName, data || []);
	const filePath = path.join(outDir, `${tableName}.sql`);
	fs.writeFileSync(filePath, sql, 'utf8');
	console.log(`Wrote backup for ${tableName} to ${filePath}`);
}

async function main() {
	const args = process.argv.slice(2);

	// If tables/views are passed as CLI args, use those.
	// Otherwise, default to the tables used by the app.
	const defaultTables = ['harada_charts', 'tasks'];
	const tables = args.length > 0 ? args : defaultTables;

	const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
	const outDir = path.join(BACKUP_ROOT, timestamp);
	ensureDir(outDir);

	for (const table of tables) {
		await backupTable(table, outDir);
	}

	console.log('Backup complete.');
}

main().catch((err) => {
	console.error('Backup failed:', err);
	process.exit(1);
});

