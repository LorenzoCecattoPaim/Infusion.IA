function createSuccessResponse(data) {
  return { data, error: null };
}

function createMaybeSingle(data) {
  return Array.isArray(data) ? data[0] ?? null : data ?? null;
}

let nextId = 1;

function generateId() {
  return `test-id-${nextId++}`;
}

class QueryBuilder {
  constructor(store, tableName, mode = "select") {
    this.store = store;
    this.tableName = tableName;
    this.mode = mode;
    this.payload = null;
    this.filters = [];
    this.selectedColumns = "*";
  }

  select(columns = "*") {
    this.selectedColumns = columns;
    return this;
  }

  insert(payload) {
    this.mode = "insert";
    this.payload = payload;
    return this;
  }

  update(payload) {
    this.mode = "update";
    this.payload = payload;
    return this;
  }

  upsert(payload) {
    this.mode = "upsert";
    this.payload = payload;
    return this;
  }

  eq(field, value) {
    this.filters.push((row) => row?.[field] === value);
    return this;
  }

  neq(field, value) {
    this.filters.push((row) => row?.[field] !== value);
    return this;
  }

  is(field, value) {
    if (value === null) {
      this.filters.push((row) => row?.[field] == null);
    } else {
      this.filters.push((row) => row?.[field] === value);
    }
    return this;
  }

  order() {
    return this;
  }

  maybeSingle() {
    return Promise.resolve(this.#execute(true));
  }

  single() {
    return Promise.resolve(this.#execute(true));
  }

  then(resolve, reject) {
    return Promise.resolve(this.#execute(false)).then(resolve, reject);
  }

  #getRows() {
    if (!Array.isArray(this.store[this.tableName])) {
      this.store[this.tableName] = [];
    }

    return this.store[this.tableName];
  }

  #matches(row) {
    return this.filters.every((filter) => filter(row));
  }

  #applyInsert(rows) {
    const items = (Array.isArray(this.payload) ? this.payload : [this.payload]).map((item) => ({
      id: item?.id ?? generateId(),
      ...item,
    }));

    for (const item of items) {
      rows.push(item);
    }

    return items;
  }

  #applyUpdate(rows) {
    const updated = [];
    for (const row of rows) {
      if (!this.#matches(row)) continue;
      Object.assign(row, this.payload);
      updated.push({ ...row });
    }
    return updated;
  }

  #applyUpsert(rows) {
    const item = { ...(Array.isArray(this.payload) ? this.payload[0] : this.payload) };
    const userId = item.user_id;
    const existing = rows.find((row) => row.user_id === userId);

    if (existing) {
      Object.assign(existing, item);
      return [{ ...existing }];
    }

    rows.push(item);
    return [{ ...item }];
  }

  #project(row) {
    if (!row || this.selectedColumns === "*" || !this.selectedColumns) {
      return row ? { ...row } : row;
    }

    const columns = this.selectedColumns
      .split(",")
      .map((column) => column.trim())
      .filter(Boolean);

    const projected = {};
    for (const column of columns) {
      projected[column] = row[column];
    }
    return projected;
  }

  #execute(single) {
    const rows = this.#getRows();

    if (this.mode === "insert") {
      const inserted = this.#applyInsert(rows).map((row) => this.#project(row));
      return createSuccessResponse(single ? createMaybeSingle(inserted) : inserted);
    }

    if (this.mode === "update") {
      const updated = this.#applyUpdate(rows).map((row) => this.#project(row));
      return createSuccessResponse(single ? createMaybeSingle(updated) : updated);
    }

    if (this.mode === "upsert") {
      const upserted = this.#applyUpsert(rows).map((row) => this.#project(row));
      return createSuccessResponse(single ? createMaybeSingle(upserted) : upserted);
    }

    const selected = rows.filter((row) => this.#matches(row)).map((row) => this.#project(row));
    return createSuccessResponse(single ? createMaybeSingle(selected) : selected);
  }
}

function createFakeSupabase({
  authUser = null,
  authError = null,
  store = {},
  rpcHandlers = {},
} = {}) {
  return {
    store,
    auth: {
      async getUser(token) {
        if (authError) {
          return { data: { user: null }, error: authError };
        }

        if (!token || !authUser) {
          return { data: { user: null }, error: new Error("invalid token") };
        }

        return { data: { user: authUser }, error: null };
      },
    },
    from(tableName) {
      return new QueryBuilder(store, tableName);
    },
    async rpc(name, args) {
      if (!rpcHandlers[name]) {
        return { data: null, error: new Error(`RPC ${name} not available`) };
      }

      return rpcHandlers[name](args, store);
    },
  };
}

export { createFakeSupabase };
