const env = require("../config/env");
const fs = require('fs');
const path = require('path');

// Ensure logs directory exists at the repository root: ../../logs
const LOG_DIR = path.resolve(__dirname, '..', '..', 'logs');
try {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
} catch (e) {
  // If log dir cannot be created, fall back to console-only logging
  console.error('[LOGGER] Failed to create logs directory', e);
}

const appendLog = (filename, line) => {
  const filePath = path.join(LOG_DIR, filename);
  try {
    fs.appendFile(filePath, line + '\n', (err) => {
      if (err) {
        // If writing to file fails, still print to console
        console.error('[LOGGER] Failed to write log to file', err);
      }
    });
  } catch (e) {
    console.error('[LOGGER] Exception while appending log', e);
  }
};

const serializeMeta = (meta) => {
  if (!meta || !meta.length) {
    return undefined;
  }

  return meta.map((item) => {
    if (item instanceof Error) {
      return {
        name: item.name,
        message: item.message,
        stack: item.stack,
      };
    }

    if (typeof item === 'string') {
      return item;
    }

    try {
      return JSON.parse(JSON.stringify(item));
    } catch (error) {
      return String(item);
    }
  });
};

const formatLine = (level, message, meta) => {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
  };

  const serializedMeta = serializeMeta(meta);
  if (serializedMeta !== undefined) {
    entry.meta = serializedMeta;
  }

  return JSON.stringify(entry);
};

const logger = {
  info: (message, ...meta) => {
    const line = formatLine('INFO', message, meta);
    console.log(line);
    appendLog('combined.log', line);
  },
  error: (message, error, ...meta) => {
    const errMsg = error ? (error.stack || error.message || String(error)) : '';
    const line = formatLine('ERROR', `${message} ${errMsg}`.trim(), meta);
    console.error(line);
    appendLog('error.log', line);
    appendLog('combined.log', line);
  },
  warn: (message, ...meta) => {
    const line = formatLine('WARN', message, meta);
    console.warn(line);
    appendLog('combined.log', line);
  },
  debug: (message, ...meta) => {
    if (env.NODE_ENV === "development") {
      const line = formatLine('DEBUG', message, meta);
      console.log(line);
      appendLog('combined.log', line);
    }
  }
};

module.exports = logger;
