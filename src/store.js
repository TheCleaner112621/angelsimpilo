const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { config } = require('./config');
const { hashPassword } = require('./security');

function emptyDatabase() {
  return { users: [], assets: [], workOrders: [] };
}

class JsonStore {
  constructor(filePath = config.dataFile) {
    this.filePath = filePath;
    this.database = null;
  }

  load() {
    if (this.database) return this.database;
    if (!fs.existsSync(this.filePath)) {
      this.database = emptyDatabase();
      this.seed();
      this.save();
      return this.database;
    }
    const raw = fs.readFileSync(this.filePath, 'utf8');
    this.database = raw.trim() ? JSON.parse(raw) : emptyDatabase();
    this.seed();
    this.save();
    return this.database;
  }

  save() {
    if (!this.database) return;
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify(this.database, null, 2));
  }

  reset(database = emptyDatabase()) {
    this.database = database;
    this.seed();
    this.save();
  }

  users() { return this.load().users; }
  assets() { return this.load().assets; }
  workOrders() { return this.load().workOrders; }

  seed() {
    if (!this.database || this.database.users.some((user) => user.role === 'admin')) return;
    const now = new Date().toISOString();
    this.database.users.push({
      id: crypto.randomUUID(),
      name: config.seedAdminName,
      email: config.seedAdminEmail.toLowerCase(),
      passwordHash: hashPassword(config.seedAdminPassword),
      role: 'admin',
      createdAt: now,
      updatedAt: now
    });
  }
}

const store = new JsonStore();

module.exports = { JsonStore, store };
