import crypto from 'crypto';
import { Db, MongoClient } from 'mongodb';

type MongoWhere = Record<string, any>;
type MongoSelect = Record<string, boolean>;
type MongoInclude = Record<string, any>;
type MongoOrderBy = Record<string, 'asc' | 'desc' | 1 | -1> | Array<Record<string, 'asc' | 'desc' | 1 | -1>>;

type RelationSpec = {
  collection: string;
  localField: string;
  foreignField: string;
  many?: boolean;
  select?: string[];
};

type CountSpec = {
  collection: string;
  foreignField: string;
};

const relationMap: Record<string, Record<string, RelationSpec>> = {
  agent: {
    company: { collection: 'company', localField: 'company_id', foreignField: 'id' },
    clients: { collection: 'client', localField: 'id', foreignField: 'agent_id', many: true },
    policies: { collection: 'policy', localField: 'id', foreignField: 'agent_id', many: true },
  },
  client: {
    agent: { collection: 'agent', localField: 'agent_id', foreignField: 'id' },
    policies: { collection: 'policy', localField: 'id', foreignField: 'client_id', many: true },
    events: { collection: 'event', localField: 'id', foreignField: 'client_id', many: true },
  },
  company: {
    agents: { collection: 'agent', localField: 'id', foreignField: 'company_id', many: true },
    policies: { collection: 'policy', localField: 'id', foreignField: 'company_id', many: true },
  },
  policy: {
    client: { collection: 'client', localField: 'client_id', foreignField: 'id' },
    agent: { collection: 'agent', localField: 'agent_id', foreignField: 'id' },
    company: { collection: 'company', localField: 'company_id', foreignField: 'id' },
    transactions: { collection: 'transaction', localField: 'id', foreignField: 'policy_id', many: true },
  },
  transaction: {
    policy: { collection: 'policy', localField: 'policy_id', foreignField: 'id' },
  },
  notificationRead: {
    notification: { collection: 'bulkNotification', localField: 'notification_id', foreignField: 'id' },
    agent: { collection: 'agent', localField: 'agent_id', foreignField: 'id' },
  },
  bulkNotification: {
    target_agent: { collection: 'agent', localField: 'target_agent_id', foreignField: 'id' },
    creator: { collection: 'admin', localField: 'created_by', foreignField: 'id' },
    reads: { collection: 'notificationRead', localField: 'id', foreignField: 'notification_id', many: true },
  },
  note: {
    agent: { collection: 'agent', localField: 'agent_id', foreignField: 'id' },
  },
  event: {
    agent: { collection: 'agent', localField: 'agent_id', foreignField: 'id' },
    client: { collection: 'client', localField: 'client_id', foreignField: 'id' },
  },
  session: {
    user: { collection: 'user', localField: 'user_id', foreignField: 'id' },
  },
  refreshToken: {
    user: { collection: 'user', localField: 'user_id', foreignField: 'id' },
  },
  passwordReset: {
    user: { collection: 'user', localField: 'user_id', foreignField: 'id' },
  },
  emailVerification: {
    user: { collection: 'user', localField: 'user_id', foreignField: 'id' },
  },
  twoFactorAuth: {
    user: { collection: 'user', localField: 'user_id', foreignField: 'id' },
  },
};

const countMap: Record<string, Record<string, CountSpec>> = {
  agent: {
    clients: { collection: 'client', foreignField: 'agent_id' },
    policies: { collection: 'policy', foreignField: 'agent_id' },
  },
  client: {
    policies: { collection: 'policy', foreignField: 'client_id' },
    events: { collection: 'event', foreignField: 'client_id' },
  },
  company: {
    agents: { collection: 'agent', foreignField: 'company_id' },
    policies: { collection: 'policy', foreignField: 'company_id' },
  },
  policy: {
    transactions: { collection: 'transaction', foreignField: 'policy_id' },
  },
};

function isPlainObject(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildFieldCondition(value: any): any {
  if (!isPlainObject(value)) {
    return value;
  }

  const keys = Object.keys(value);
  const operatorKeys = ['contains', 'startsWith', 'endsWith', 'in', 'lt', 'lte', 'gt', 'gte', 'not', 'equals'];
  const hasOperator = keys.some((key) => operatorKeys.includes(key));

  if (!hasOperator) {
    const nested: Record<string, any> = {};
    for (const [nestedKey, nestedValue] of Object.entries(value)) {
      nested[`${nestedKey}`] = buildFieldCondition(nestedValue);
    }
    return nested;
  }

  const result: Record<string, any> = {};

  if (value.equals !== undefined) {
    return value.equals;
  }

  if (value.contains !== undefined) {
    result.$regex = escapeRegExp(String(value.contains));
    result.$options = String(value.mode || '').toLowerCase() === 'insensitive' ? 'i' : '';
  }
  if (value.startsWith !== undefined) {
    result.$regex = `^${escapeRegExp(String(value.startsWith))}`;
    result.$options = String(value.mode || '').toLowerCase() === 'insensitive' ? 'i' : '';
  }
  if (value.endsWith !== undefined) {
    result.$regex = `${escapeRegExp(String(value.endsWith))}$`;
    result.$options = String(value.mode || '').toLowerCase() === 'insensitive' ? 'i' : '';
  }
  if (value.in !== undefined) result.$in = value.in;
  if (value.lt !== undefined) result.$lt = value.lt;
  if (value.lte !== undefined) result.$lte = value.lte;
  if (value.gt !== undefined) result.$gt = value.gt;
  if (value.gte !== undefined) result.$gte = value.gte;
  if (value.not !== undefined) result.$ne = value.not;

  return result;
}

function toMongoFilter(where: MongoWhere = {}): Record<string, any> {
  const mongoWhere: Record<string, any> = {};

  for (const [key, value] of Object.entries(where)) {
    if (key === 'AND' && Array.isArray(value)) {
      mongoWhere.$and = value.map((item) => toMongoFilter(item));
      continue;
    }

    if (key === 'OR' && Array.isArray(value)) {
      mongoWhere.$or = value.map((item) => toMongoFilter(item));
      continue;
    }

    if (key === 'NOT' && Array.isArray(value)) {
      mongoWhere.$nor = value.map((item) => toMongoFilter(item));
      continue;
    }

    if (key === 'NOT' && isPlainObject(value)) {
      mongoWhere.$nor = [toMongoFilter(value)];
      continue;
    }

    if (value === null || value === undefined) {
      mongoWhere[key] = value;
      continue;
    }

    if (isPlainObject(value)) {
      const fieldCondition = buildFieldCondition(value);
      if (isPlainObject(fieldCondition) && Object.keys(fieldCondition).some((k) => k.startsWith('$'))) {
        mongoWhere[key] = fieldCondition;
      } else if (isPlainObject(fieldCondition) && Object.keys(value).length > 0) {
        for (const [nestedKey, nestedValue] of Object.entries(fieldCondition)) {
          mongoWhere[`${key}.${nestedKey}`] = nestedValue;
        }
      } else {
        mongoWhere[key] = fieldCondition;
      }
      continue;
    }

    mongoWhere[key] = value;
  }

  return mongoWhere;
}

function normalizeOrderBy(orderBy?: MongoOrderBy): Record<string, 1 | -1> | undefined {
  if (!orderBy) return undefined;

  const normalized: Record<string, 1 | -1> = {};
  const entries = Array.isArray(orderBy) ? orderBy : [orderBy];

  for (const entry of entries) {
    for (const [key, value] of Object.entries(entry)) {
      normalized[key] = String(value).toLowerCase() === 'desc' || value === -1 ? -1 : 1;
    }
  }

  return normalized;
}

function applySelect<T extends Record<string, any>>(document: T, select?: MongoSelect): Partial<T> {
  if (!select) return document;

  const selected: Record<string, any> = {};
  for (const [key, shouldInclude] of Object.entries(select)) {
    if (shouldInclude && key in document) {
      selected[key] = document[key];
    }
  }
  return selected as Partial<T>;
}

function getCountSpecs(collectionName: string): Record<string, CountSpec> {
  return countMap[collectionName] || {};
}

function getRelationSpecs(collectionName: string): Record<string, RelationSpec> {
  return relationMap[collectionName] || {};
}

/**
 * The MongoDB Node driver changed the return shape of `findOneAndUpdate`,
 * `findOneAndDelete`, and `findOneAndReplace` between v5 and v6+:
 *
 *   - v5:  { value: <doc> | null, ok: 1, lastErrorObject: {...} }
 *   - v6+: <doc> | null   (with `{ includeResultMetadata: true }` to get the old shape)
 *
 * Normalise both shapes to just the document (or null).
 */
function unwrapMongoResult(raw: any): any {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'object' && raw !== null && 'value' in raw && 'ok' in raw) {
    return raw.value ?? null;
  }
  return raw;
}

class MongoConnectionManager {
  private static instance: MongoConnectionManager;
  private client: MongoClient | null = null;
  private db: Db | null = null;

  static getInstance(): MongoConnectionManager {
    if (!MongoConnectionManager.instance) {
      MongoConnectionManager.instance = new MongoConnectionManager();
    }
    return MongoConnectionManager.instance;
  }

  private buildUri(): { uri: string; dbName: string } {
    const dbName = process.env.MONGODB_DATABASE || process.env.DB_NAME || 'beemadiary';
    const host = process.env.MONGODB_HOST || 'localhost';
    const port = process.env.MONGODB_PORT || '27017';
    const username = process.env.MONGODB_USERNAME || process.env.DB_USER || '';
    const password = process.env.MONGODB_PASSWORD || process.env.DB_PASSWORD || '';
    const authSource = process.env.MONGODB_AUTH_SOURCE || 'admin';

    if (process.env.MONGODB_URI) {
      return { uri: process.env.MONGODB_URI, dbName };
    }

    const credentials = username ? `${encodeURIComponent(username)}:${encodeURIComponent(password)}@` : '';
    const uri = `mongodb://${credentials}${host}:${port}/${dbName}${username ? `?authSource=${authSource}` : ''}`;
    return { uri, dbName };
  }

  async connect(): Promise<Db> {
    if (this.db) {
      return this.db;
    }

    const { uri, dbName } = this.buildUri();
    this.client = new MongoClient(uri);
    await this.client.connect();
    this.db = this.client.db(dbName);
    return this.db;
  }

  getDatabase(): Db {
    if (!this.db) {
      throw new Error('MongoDB connection has not been initialized');
    }
    return this.db;
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.client = null;
      this.db = null;
    }
  }
}

async function populateDocument(collectionName: string, document: Record<string, any>, include?: MongoInclude): Promise<Record<string, any>> {
  if (!include) {
    return document;
  }

  const db = MongoConnectionManager.getInstance().getDatabase();
  const relationSpecs = getRelationSpecs(collectionName);
  const populated = { ...document };

  for (const [key, specValue] of Object.entries(include)) {
    if (key === '_count' && specValue && typeof specValue === 'object' && 'select' in specValue) {
      const countSelect = (specValue as any).select as Record<string, boolean>;
      const countSpecs = getCountSpecs(collectionName);
      const counts: Record<string, number> = {};

      for (const [countKey, shouldInclude] of Object.entries(countSelect)) {
        if (!shouldInclude) continue;
        const spec = countSpecs[countKey];
        if (!spec) continue;
        counts[countKey] = await db.collection(spec.collection).countDocuments({ [spec.foreignField]: document.id });
      }

      populated._count = counts;
      continue;
    }

    const relationSpec = relationSpecs[key];
    if (!relationSpec) {
      continue;
    }

    const relationCollection = db.collection(relationSpec.collection);
    if (relationSpec.many) {
      const relatedDocuments = await relationCollection.find({ [relationSpec.foreignField]: document[relationSpec.localField] }).toArray();
      populated[key] = relatedDocuments.map((related) => applySelect(related, relationSpec.select ? Object.fromEntries(relationSpec.select.map((field) => [field, true])) : undefined));
      continue;
    }

    const relatedDocument = await relationCollection.findOne({ [relationSpec.foreignField]: document[relationSpec.localField] });
    populated[key] = relatedDocument ? applySelect(relatedDocument, relationSpec.select ? Object.fromEntries(relationSpec.select.map((field) => [field, true])) : undefined) : null;
  }

  return populated;
}

class MongoDelegate {
  constructor(private readonly collectionName: string) {}

  private async collection() {
    const db = await MongoConnectionManager.getInstance().connect();
    return db.collection(this.collectionName);
  }

  private ensureDocument(data: Record<string, any>): Record<string, any> {
    const now = new Date();
    const document = { ...data };

    if (!document.id) {
      document.id = crypto.randomUUID();
    }

    if (!document.created_at) {
      document.created_at = now;
    }

    document.updated_at = now;
    return document;
  }

  async findUnique(options: { where?: MongoWhere; include?: MongoInclude; select?: MongoSelect } = {}) {
    const collection = await this.collection();
    const document = await collection.findOne(toMongoFilter(options.where || {}));
    if (!document) return null;

    const populated = await populateDocument(this.collectionName, document, options.include);
    return applySelect(populated, options.select);
  }

  async findFirst(options: { where?: MongoWhere; include?: MongoInclude; select?: MongoSelect; orderBy?: MongoOrderBy } = {}) {
    const collection = await this.collection();
    const cursor = collection.find(toMongoFilter(options.where || {}));

    const sort = normalizeOrderBy(options.orderBy);
    if (sort) cursor.sort(sort);

    const document = await cursor.limit(1).next();
    if (!document) return null;

    const populated = await populateDocument(this.collectionName, document, options.include);
    return applySelect(populated, options.select);
  }

  async findMany(options: {
    where?: MongoWhere;
    include?: MongoInclude;
    select?: MongoSelect;
    orderBy?: MongoOrderBy;
    skip?: number;
    take?: number;
  } = {}) {
    const collection = await this.collection();
    const cursor = collection.find(toMongoFilter(options.where || {}));

    const sort = normalizeOrderBy(options.orderBy);
    if (sort) cursor.sort(sort);
    if (options.skip !== undefined) cursor.skip(Number(options.skip));
    if (options.take !== undefined) cursor.limit(Number(options.take));

    const documents = await cursor.toArray();
    const populatedDocuments = await Promise.all(
      documents.map((document) => populateDocument(this.collectionName, document, options.include))
    );

    return populatedDocuments.map((document) => applySelect(document, options.select));
  }

  async create(options: { data: Record<string, any> }) {
    const collection = await this.collection();
    const document = this.ensureDocument(options.data);
    await collection.insertOne(document);
    return document;
  }

  async update(options: { where: MongoWhere; data: Record<string, any> }) {
    const collection = await this.collection();
    // Strip undefined values before $set — MongoDB treats undefined as null
    // which would overwrite existing fields with null on every update.
    const cleanData = Object.fromEntries(
      Object.entries(options.data).filter(([, v]) => v !== undefined)
    );
    const raw = await collection.findOneAndUpdate(
      toMongoFilter(options.where),
      { $set: { ...cleanData, updated_at: new Date() } },
      { returnDocument: 'after' }
    );

    // MongoDB Node driver v6+ returns the document directly (or null).
    // Driver v5 returned { value, ok, lastErrorObject }. Support both.
    const doc = unwrapMongoResult(raw);

    if (!doc) {
      throw new Error(`Record not found in ${this.collectionName}`);
    }

    return doc;
  }

  async updateMany(options: { where?: MongoWhere; data: Record<string, any> }) {
    const collection = await this.collection();
    const cleanData = Object.fromEntries(
      Object.entries(options.data).filter(([, v]) => v !== undefined)
    );
    return collection.updateMany(toMongoFilter(options.where || {}), { $set: { ...cleanData, updated_at: new Date() } });
  }

  async delete(options: { where: MongoWhere }) {
    const collection = await this.collection();
    const raw = await collection.findOneAndDelete(toMongoFilter(options.where));
    return unwrapMongoResult(raw);
  }

  async deleteMany(options: { where?: MongoWhere }) {
    const collection = await this.collection();
    return collection.deleteMany(toMongoFilter(options.where || {}));
  }

  async count(options: { where?: MongoWhere } = {}) {
    const collection = await this.collection();
    return collection.countDocuments(toMongoFilter(options.where || {}));
  }

  async upsert(options: { where: MongoWhere; create: Record<string, any>; update: Record<string, any> }) {
    const collection = await this.collection();
    const raw = await collection.findOneAndUpdate(
      toMongoFilter(options.where),
      {
        $set: { ...options.update, updated_at: new Date() },
        $setOnInsert: this.ensureDocument(options.create),
      },
      { upsert: true, returnDocument: 'after' }
    );

    return unwrapMongoResult(raw);
  }

  async groupBy(options: { by: string[]; where?: MongoWhere; _count?: boolean }) {
    const documents = await this.findMany({ where: options.where || {} });
    const groups = new Map<string, any>();

    for (const document of documents) {
      const key = JSON.stringify(options.by.map((field) => document[field] ?? null));
      const current = groups.get(key) || Object.fromEntries(options.by.map((field) => [field, document[field] ?? null]));
      current._count = (current._count || 0) + 1;
      groups.set(key, current);
    }

    return Array.from(groups.values());
  }

  /**
   * Prisma-style aggregate: { where, _sum: {field:true}, _count: true|{...},
   * _avg, _min, _max }. Returns { _sum:{...}, _count:N, _avg:{...}, ... } where
   * absent groups default to 0/null so callers don't crash on `.field` access.
   */
  async aggregate(options: {
    where?: MongoWhere;
    _sum?: Record<string, boolean>;
    _count?: boolean | Record<string, boolean>;
    _avg?: Record<string, boolean>;
    _min?: Record<string, boolean>;
    _max?: Record<string, boolean>;
  } = {}) {
    const collection = await this.collection();
    const match = toMongoFilter(options.where || {});

    const group: Record<string, any> = { _id: null };
    const opMap: Array<[string, '$sum' | '$avg' | '$min' | '$max']> = [
      ['_sum', '$sum'],
      ['_avg', '$avg'],
      ['_min', '$min'],
      ['_max', '$max'],
    ];

    for (const [key, mongoOp] of opMap) {
      const spec = (options as any)[key] as Record<string, boolean> | undefined;
      if (!spec) continue;
      for (const [field, include] of Object.entries(spec)) {
        if (!include) continue;
        group[`${key}__${field}`] = { [mongoOp]: `$${field}` };
      }
    }

    const wantsCount = options._count !== undefined && options._count !== false;
    if (wantsCount) {
      group._count__total = { $sum: 1 };
      if (typeof options._count === 'object' && options._count) {
        for (const [field, include] of Object.entries(options._count)) {
          if (!include) continue;
          // Count non-null values for the given field.
          group[`_count__${field}`] = {
            $sum: { $cond: [{ $ne: [`$${field}`, null] }, 1, 0] },
          };
        }
      }
    }

    const pipeline: any[] = [];
    if (Object.keys(match).length) pipeline.push({ $match: match });
    pipeline.push({ $group: group });

    const [row] = await collection.aggregate(pipeline).toArray();

    const result: Record<string, any> = {};
    for (const [keyKind, _mongoOp] of opMap) {
      const spec = (options as any)[keyKind] as Record<string, boolean> | undefined;
      if (!spec) continue;
      result[keyKind] = {};
      for (const [field, include] of Object.entries(spec)) {
        if (!include) continue;
        const value = row?.[`${keyKind}__${field}`];
        // Prisma returns 0/null when no rows matched; mirror that.
        result[keyKind][field] = keyKind === '_sum' ? (value ?? 0) : (value ?? null);
      }
    }
    if (wantsCount) {
      if (typeof options._count === 'object' && options._count) {
        result._count = {};
        for (const [field, include] of Object.entries(options._count)) {
          if (!include) continue;
          result._count[field] = row?.[`_count__${field}`] ?? 0;
        }
      } else {
        result._count = row?._count__total ?? 0;
      }
    }
    return result;
  }
}

const delegateCache = new Map<string, MongoDelegate>();

const mongoPrisma = new Proxy(
  {},
  {
    get(_target, property) {
      if (property === '$disconnect') {
        return () => MongoConnectionManager.getInstance().disconnect();
      }

      if (property === '$connect') {
        return () => MongoConnectionManager.getInstance().connect();
      }

      if (typeof property !== 'string') {
        return undefined;
      }

      if (!delegateCache.has(property)) {
        delegateCache.set(property, new MongoDelegate(property));
      }

      return delegateCache.get(property);
    },
  }
) as Record<string, any> & { $disconnect: () => Promise<void>; $connect: () => Promise<Db> };

export { MongoConnectionManager };
export default mongoPrisma;
