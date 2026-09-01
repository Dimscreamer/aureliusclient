const { JWT } = require('google-auth-library');
const axios = require('axios');

// Credentials for Google Sheets API
const SERVICE_ACCOUNT = {
  client_email: "antigravity-bot@aureliusclients.iam.gserviceaccount.com",
  private_key: "-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQCifqITFOajmOTE\nflbYqjLkwLzoVowdtOoyoiRVWUIa4UQFxuPqSkeOJIWctr+2dL21vmSFvcw8qX+8\nkPMFGjNKW1WI4JH8E4IeZ/220B+J+C6cStJg52DI6SEdr94aTXk0PxwVNpdMZJik\nCwMdnh7Pbstfd3+olhybzbrvEAdY2g84gUi2mGG8uV2XYMe/eBvAychqtQkdeHve\n55uP5/KEcyd4eezG5MHTqdp0IhVF+7HvAx7wuImfKsOqCzxOR3Feysaftyw0f9zc\nUfotMj3PG54aPs7jeEk6lDsVynqMiHl9b4BcEIU2ozcyoDkiSx4rMER2RnGx3r4f\n95+L4hBrAgMBAAECggEAExkMBm8Z7lddZ8Srg1p5kc4fRbVKUYF+VwYcfBV6AfvA\nyWcHSXWCdG/RbkpCPPj6hP5EBT3535VSSIDGty5NoesbIfO25KgMTnONa6uJUWdk\nXwUiNbZr9yEDPeB6G6BIYv4Z2FpqrNVT5U/QBW6ck2ejqmw6ij9eTGeBFXDOVEBY\nvo8xngAl8gzktzK5c7mBBqqP2TOvHW6tiTVnNG2da3LXJrB6ok6XUDOZr0QgDpdP\nZ8+r7XcniLZKGXUnhT13A7uwDIBrUwqpLZ6PjNfFkOlxlDcrnvaoJ5Yz5gqoIV50\ni5uLSZbXCCafUKUlxUfkoSjfiVM9iGEjFfSD2f6DVQKBgQDQU1hVPph6/0TP4L6b\nPZm4OW3wO9UreFpU2aSyhfJ5NbhzR2cgriWcgs9uCakb6YXOnZ2xrJYy5IGB4Qsa\nqqsUXhcjwNT8tx94cdnkiMZJHao+BQfQGgQKsi1MiU9yicPD0hYXTe49tJhjqZDa\n8RCDYMjojPe2KQovUXA5GGk39wKBgQDHrk5aLZNSPDS7T2NR1T4ZmzbedLgBXqoX\n72kmsnzh2WGPzB1nx/FLekSh/yjyn6sECOOuq4MJ8R/IXbCU9GythuKbGo9NASya\ncsDmHjiGtZBVvb8Ak8TN55g4o+S7iLTb43tZB/KhrW09N4RPvK58HLImaVcDVjkQ\nhg32YQwWLQKBgAVaXuax2REwBgChccRjbNPDBgQqRWv8h7WucgD0WCqtKrQrnYbF\ncsn2woW9Uc8ZzQpmGms6WBGutXU05ygkQokfcdDFX7OusOxTYJnyucWfMYSudGjw\ngjIUKf3ReW0kBRe/CjpHElwbi97juIknsJjvn7n6BVN08oIMwal16x45AoGBAI4Z\nPuzxrftBmQ0LC9T6eXzjdgKM8T0YTtdFqoC9WB2pAsLAMNTf9pkN47WczVkLwznV\n0aFFsLTsgP+nnLgD0SsT6EMUfZIBGeq3awrXysYigxphM4GHpvAYtbzo9Sd3u60X\nj3nmLAZeUnTUAzZzQYBVM3oeUKuxOl7F5z3EBkPpAoGBALr5brjC+lLpumx8HD3j\nwvbnijxcSa1WHdSp0cJKwq9pcCy4Qvkzk/lDnzvBPjWk2syjnQqzZ9b2YpSRv/O0\n1pr+a9XazuSo/z52a7WLEWeDtqhEJmV3q4vzhsylrK1C9G89fLckV1l+E3sTPUtA\nkzYYhbfQ2e0YEuytSzx2vzdR\n-----END PRIVATE KEY-----\n"
};

const MASTER_SPREADSHEET_ID = '1MLhrsKbmuR63xIRNouqb1EsfJzYH2WzNxR6BvzdLhaA';

let cachedAuthClient = null;
let tokenExpiry = 0;
let cachedToken = null;

async function getAccessToken() {
  const now = Date.now();
  if (cachedToken && now < tokenExpiry - 60000) {
    return cachedToken;
  }
  if (!cachedAuthClient) {
    cachedAuthClient = new JWT({
      email: SERVICE_ACCOUNT.client_email,
      key: SERVICE_ACCOUNT.private_key,
      scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });
  }
  const res = await cachedAuthClient.getAccessToken();
  cachedToken = res.token;
  tokenExpiry = now + 3500 * 1000;
  return cachedToken;
}

globalThis.pendingLogPromises = globalThis.pendingLogPromises || [];

/**
 * Добавляет строку в указанный лист Google Таблицы
 */
function appendSheetRow(sheetName, rowValues, spreadsheetId = MASTER_SPREADSHEET_ID) {
  const p = (async () => {
    try {
      const token = await getAccessToken();
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}:append?valueInputOption=USER_ENTERED`;
      await axios.post(url, {
        values: [rowValues]
      }, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        timeout: 6000
      });
    } catch (err) {
      console.error(`[GoogleSheets] appendSheetRow error on "${sheetName}":`, err.message);
    }
  })();

  if (globalThis.pendingLogPromises) {
    globalThis.pendingLogPromises.push(p);
  }
  return p;
}

/**
 * Логирование в SysLogs в формате: [Дата-Время, Модуль/Тег, Сообщение]
 */
function logToSysLogs(tag, message) {
  const timestamp = new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Kiev' });
  const row = [timestamp, tag || 'ARES_SYS', String(message || '').substring(0, 15000)];
  return appendSheetRow('SysLogs', row);
}

/**
 * Ожидание завершения всех фоновых записей перед закрытием Cloud Function
 */
async function flushPendingLogs() {
  if (globalThis.pendingLogPromises && globalThis.pendingLogPromises.length > 0) {
    const list = [...globalThis.pendingLogPromises];
    globalThis.pendingLogPromises = [];
    await Promise.allSettled(list);
  }
}

module.exports = {
  appendSheetRow,
  logToSysLogs,
  flushPendingLogs,
  MASTER_SPREADSHEET_ID
};
