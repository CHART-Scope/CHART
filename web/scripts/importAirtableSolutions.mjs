import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const baseId = process.env.AIRTABLE_BASE_ID ?? "appVDjIOHVtUA4Z3l";
const tableName = process.env.AIRTABLE_TABLE_NAME ?? "Step 3: Solutions";
const explicitTableId = process.env.AIRTABLE_TABLE_ID;
const token = process.env.AIRTABLE_TOKEN;
const outputDir = process.env.AIRTABLE_OUTPUT_DIR ?? "data/airtable";
const publicAssetDir =
  process.env.AIRTABLE_PUBLIC_ASSET_DIR ?? "web/public/imported-airtable";

if (!token) {
  throw new Error("AIRTABLE_TOKEN is required.");
}

async function airtableFetch(url) {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const body = await response.json().catch(() => null);

  if (!response.ok) {
    const detail = body ? JSON.stringify(body, null, 2) : response.statusText;
    throw new Error(`Airtable request failed (${response.status}): ${detail}`);
  }

  return body;
}

function pickField(fields, names) {
  for (const name of names) {
    const value = fields[name];

    if (value !== undefined && value !== null && value !== "") {
      return value;
    }
  }

  return undefined;
}

function asArray(value) {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value;
  }

  return [value];
}

function sanitizeFilename(input) {
  return input
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

async function localizeAttachment(recordId, attachment, prefix) {
  if (!attachment?.url) {
    return attachment;
  }

  const filename = sanitizeFilename(
    attachment.filename ?? `${attachment.id ?? prefix}.bin`,
  );
  const localFilename = `${prefix}-${filename}`;
  const localDir = path.resolve(publicAssetDir, recordId);
  const localPath = path.join(localDir, localFilename);
  const publicUrl = `/imported-airtable/${recordId}/${localFilename}`;

  await mkdir(localDir, { recursive: true });

  const response = await fetch(attachment.url);

  if (!response.ok) {
    return {
      ...attachment,
      originalUrl: attachment.url,
    };
  }

  await writeFile(localPath, Buffer.from(await response.arrayBuffer()));

  return {
    id: attachment.id,
    filename: attachment.filename,
    type: attachment.type,
    size: attachment.size,
    url: publicUrl,
    originalUrl: attachment.url,
  };
}

async function normalizeSolution(record) {
  const fields = record.fields ?? {};
  const name = pickField(fields, ["Name", "Solution", "Title"]) ?? record.id;
  const description = pickField(fields, ["Description", "Summary", "Overview"]) ?? "";
  const hazardNames = asArray(
    pickField(fields, [
      "Climate hazard (from Climate hazards)",
      "Climate hazards copy",
      "Climate hazards copy 2",
    ]),
  );

  const image = await localizeAttachment(
    record.id,
    asArray(pickField(fields, ["Picture"]))[0],
    "image",
  );
  const caseStudies = await Promise.all(
    asArray(pickField(fields, ["Case studies", "Case Studies", "Attachments"])).map(
      (attachment, index) =>
        localizeAttachment(record.id, attachment, `case-study-${index + 1}`),
    ),
  );

  return {
    airtableId: record.id,
    createdTime: record.createdTime,
    name,
    description,
    hazards: hazardNames.length
      ? hazardNames
      : asArray(pickField(fields, ["Climate hazards", "Climate Hazards", "Hazards"])),
    hazardRecordIds: asArray(
      pickField(fields, ["Climate hazards", "Climate Hazards", "Hazards"]),
    ),
    solutionTypes: asArray(
      pickField(fields, ["Solution type", "Solution Type", "Type"]),
    ),
    costOfImplementation:
      pickField(fields, ["Cost of implementation", "Implementation cost", "Cost"]) ??
      "",
    usefulLinks: pickField(fields, ["Useful links", "Useful Links", "Links"]),
    image:
      image && image.url
        ? {
            id: image.id,
            filename: image.filename,
            type: image.type,
            size: image.size,
            url: image.url,
            originalUrl: image.originalUrl,
          }
        : undefined,
    caseStudies: caseStudies.map((attachment) => ({
      id: attachment.id,
      filename: attachment.filename,
      type: attachment.type,
      size: attachment.size,
      url: attachment.url,
      originalUrl: attachment.originalUrl,
    })),
    fields,
  };
}

async function fetchRecords(tableIdOrName) {
  const records = [];
  let offset;

  do {
    const url = new URL(
      `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableIdOrName)}`,
    );

    if (offset) {
      url.searchParams.set("offset", offset);
    }

    const page = await airtableFetch(url);
    records.push(...(page.records ?? []));
    offset = page.offset;
  } while (offset);

  return records;
}

async function main() {
  const schema = await airtableFetch(
    `https://api.airtable.com/v0/meta/bases/${baseId}/tables`,
  );
  const tables = schema.tables ?? [];
  const table =
    (explicitTableId
      ? tables.find((candidate) => candidate.id === explicitTableId)
      : undefined) ??
    tables.find((candidate) => candidate.name === tableName) ??
    tables.find((candidate) => candidate.name.toLowerCase().includes("solution"));

  if (!table) {
    throw new Error(
      `Could not find a solutions table. Available tables: ${tables
        .map((candidate) => candidate.name)
        .join(", ")}`,
    );
  }

  const recordsByTable = [];

  for (const candidate of tables) {
    const tableRecords = await fetchRecords(candidate.id);
    recordsByTable.push({
      id: candidate.id,
      name: candidate.name,
      records: tableRecords,
    });
  }

  const records =
    recordsByTable.find((candidate) => candidate.id === table.id)?.records ?? [];
  const normalized = await Promise.all(records.map(normalizeSolution));
  const summary = {
    baseId,
    tableId: table.id,
    tableName: table.name,
    recordCount: records.length,
    tableCount: tables.length,
    fieldCount: table.fields?.length ?? 0,
    importedTables: recordsByTable.map((candidate) => ({
      id: candidate.id,
      name: candidate.name,
      recordCount: candidate.records.length,
    })),
    fields: table.fields?.map((field) => ({
      id: field.id,
      name: field.name,
      type: field.type,
      options: field.options,
    })),
  };

  const targetDir = path.resolve(outputDir);
  const tablesDir = path.join(targetDir, "tables");
  await mkdir(targetDir, { recursive: true });
  await mkdir(tablesDir, { recursive: true });

  await writeFile(
    path.join(targetDir, "base-schema.json"),
    `${JSON.stringify(schema, null, 2)}\n`,
  );
  await writeFile(
    path.join(targetDir, "solutions.raw.json"),
    `${JSON.stringify(records, null, 2)}\n`,
  );
  await writeFile(
    path.join(targetDir, "solutions.normalized.json"),
    `${JSON.stringify(normalized, null, 2)}\n`,
  );
  await writeFile(
    path.join(targetDir, "solutions.summary.json"),
    `${JSON.stringify(summary, null, 2)}\n`,
  );
  await writeFile(
    path.join(tablesDir, "index.json"),
    `${JSON.stringify(summary.importedTables, null, 2)}\n`,
  );

  for (const tableSnapshot of recordsByTable) {
    await writeFile(
      path.join(tablesDir, `${tableSnapshot.id}.json`),
      `${JSON.stringify(tableSnapshot, null, 2)}\n`,
    );
  }

  console.log(
    `Imported ${records.length} solution records and ${recordsByTable.length} tables into ${outputDir}`,
  );
}

await main();
