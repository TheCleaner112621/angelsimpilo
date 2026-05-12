const { createApp } = require('./app');
const { config } = require('./config');
const { store } = require('./store');

store.load();

createApp().listen(config.port, () => {
  console.log(`Maintenance API listening on port ${config.port}`);
});
