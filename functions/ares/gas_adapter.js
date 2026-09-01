const { spawnSync } = require('child_process');
const { logToSysLogs, appendSheetRow } = require('./google_sheets_client');

globalThis.require = require;
globalThis.logToSysLogs = logToSysLogs;
globalThis.appendSheetRow = appendSheetRow;
globalThis.module = { exports: {} };

globalThis.Logger = {
  log: function(...args) {
    console.log('[ARES_LOGGER]', ...args);
  }
};

globalThis.Utilities = {
  formatDate: function(date, tz, format) {
    const d = (date instanceof Date) ? date : new Date(date);
    const options = { timeZone: tz || 'Europe/Kiev', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false };
    const parts = new Intl.DateTimeFormat('en-GB', options).formatToParts(d);
    const map = {};
    parts.forEach(p => map[p.type] = p.value);
    
    if (format === 'yyyyMMdd-HHmmss') {
      return `${map.year}${map.month}${map.day}-${map.hour}${map.minute}${map.second}`;
    }
    if (format === 'yyyy-MM-dd HH:mm:ss') {
      return `${map.year}-${map.month}-${map.day} ${map.hour}:${map.minute}:${map.second}`;
    }
    if (format === 'dd.MM.yyyy HH:mm:ss' || format === 'dd.MM.yyyy HH:mm') {
      return `${map.day}.${map.month}.${map.year} ${map.hour}:${map.minute}:${map.second || '00'}`;
    }
    if (format === 'HH:mm:ss') {
      return `${map.hour}:${map.minute}:${map.second}`;
    }
    return d.toISOString();
  },
  parseDate: function(str, tz, format) {
    return new Date(str);
  },
  sleep: function(ms) {
    const start = Date.now();
    while (Date.now() - start < ms) {}
  }
};

const memoryCache = new Map();
const memoryProperties = new Map();

globalThis.CacheService = {
  getScriptCache: function() {
    return {
      get: (key) => memoryCache.get(key) || null,
      put: (key, val, ttl) => memoryCache.set(key, val),
      remove: (key) => memoryCache.delete(key)
    };
  },
  getUserCache: function() {
    return this.getScriptCache();
  }
};

globalThis.PropertiesService = {
  getScriptProperties: function() {
    return {
      getProperty: (key) => memoryProperties.get(key) || null,
      setProperty: (key, val) => memoryProperties.set(key, val),
      deleteProperty: (key) => memoryProperties.delete(key),
      getProperties: () => Object.fromEntries(memoryProperties)
    };
  },
  getUserProperties: function() {
    return this.getScriptProperties();
  }
};

globalThis.SpreadsheetApp = {
  openById: function(id) {
    return {
      getSheetByName: function(name) {
        return {
          getDataRange: () => ({ getValues: () => [[]] }),
          getRange: (r) => ({
            getValues: () => [[]],
            setValue: () => {},
            setValues: () => {},
            setFontWeight: () => ({ setBackground: () => {} })
          }),
          appendRow: (row) => {
            try {
              const { appendSheetRow } = require('./google_sheets_client');
              appendSheetRow(name, row, id).catch(() => {});
            } catch(e) {
              console.log(`[SpreadsheetApp] appendRow error:`, e.message);
            }
          },
          getLastRow: () => 1
        };
      },
      insertSheet: function(name) {
        return this.getSheetByName(name);
      }
    };
  }
};

globalThis.ScriptApp = {
  getProjectTriggers: () => [],
  newTrigger: () => ({
    timeBased: () => ({
      after: () => ({ create: () => ({ getUniqueId: () => 'trig_' + Date.now() }) })
    })
  }),
  deleteTrigger: () => {}
};

globalThis.UrlFetchApp = {
  fetch: function(url, options = {}) {
    const method = (options.method || 'GET').toUpperCase();
    let headers = options.headers || {};
    if (options.contentType) {
      headers['Content-Type'] = options.contentType;
    }
    const payload = options.payload || '';

    const args = ['-s', '-L', '-X', method];
    Object.keys(headers).forEach(h => {
      args.push('-H', `${h}: ${headers[h]}`);
    });
    if (payload) {
      args.push('--data-raw', payload);
    }
    args.push(url);

    try {
      const res = spawnSync('curl', args, { encoding: 'utf8', maxBuffer: 15 * 1024 * 1024, timeout: 30000 });
      return {
        getResponseCode: () => 200,
        getContentText: () => res.stdout || ''
      };
    } catch(e) {
      console.error('[UrlFetchApp.fetch] error:', e.message);
      return {
        getResponseCode: () => 500,
        getContentText: () => JSON.stringify({ error: e.message })
      };
    }
  }
};

globalThis.HtmlService = {
  createHtmlOutput: (txt) => ({ text: txt })
};

module.exports = { memoryCache, memoryProperties };
