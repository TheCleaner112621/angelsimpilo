const config = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 3000),
  corsOrigin: process.env.CORS_ORIGIN || 'https://angelsimpilo.com',
  jwtSecret: process.env.JWT_SECRET || 'development-secret-change-before-production',
  jwtExpiresInSeconds: Number(process.env.JWT_EXPIRES_IN_SECONDS || 8 * 60 * 60),
  dataFile: process.env.DATA_FILE || './data/maintenance-db.json',
  seedAdminEmail: process.env.SEED_ADMIN_EMAIL || 'admin@angelsimpilo.com',
  seedAdminPassword: process.env.SEED_ADMIN_PASSWORD || 'ChangeMe123!',
  seedAdminName: process.env.SEED_ADMIN_NAME || 'Angels Impilo Admin'
};

module.exports = { config };
