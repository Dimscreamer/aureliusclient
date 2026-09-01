/**
 * ==============================================================================
 * ⚙️ 2_Config.js — СИСТЕМНЫЕ КОНСТАНТЫ (ARES Node.js)
 * ==============================================================================
 */

var TG_TOKEN = process.env.ARES_TG_TOKEN || '8243595424:AAEDhZ4xeP3WnVdLpCL0VZ-shM6QuAlaH8Q';
var OR_KEY   = process.env.OPENROUTER_API_KEY || 'YOUR_OPENROUTER_KEY_HERE';

var MY_ID     = 451682370;
var MODEL     = "google/gemini-2.5-flash-lite";
var TIME_ZONE = "Europe/Kiev";
var LOG_LEVEL = "DEBUG";
var WEB_APP_URL = "https://aureliusclients.web.app";

var MASTER_DB_ID = '1MLhrsKbmuR63xIRNouqb1EsfJzYH2WzNxR6BvzdLhaA';
var ADS_DATA_SHEET_ID = MASTER_DB_ID;
var HEALTH_SHEET_ID   = ADS_DATA_SHEET_ID;
var MY_NICK           = "dimscreamee";

var RADAR_CHANNEL_URL = 'https://t.me/s/povestki_ap';
var RED_ZONE    = ['военстрой', 'воєнбуд', 'військбуд', 'війскбуд', 'городок', 'городк', 'авиагородок'];
var ORANGE_ZONE = ['чаривн', 'чарівн', 'магистрал', 'кузнецов', 'гортоп', 'карпенк', 'иванова'];
var YELLOW_ZONE = [' бочаров', 'авраменк', 'поляков', 'косыгин', 'стефанов', 'уральск', 'стартов', 'мотор', 'шевчик', 'шева'];

globalThis.TG_TOKEN = TG_TOKEN;
globalThis.OR_KEY = OR_KEY;
globalThis.MY_ID = MY_ID;
globalThis.MODEL = MODEL;
globalThis.TIME_ZONE = TIME_ZONE;
globalThis.LOG_LEVEL = LOG_LEVEL;
globalThis.WEB_APP_URL = WEB_APP_URL;
globalThis.MASTER_DB_ID = MASTER_DB_ID;
globalThis.ADS_DATA_SHEET_ID = ADS_DATA_SHEET_ID;
globalThis.HEALTH_SHEET_ID = HEALTH_SHEET_ID;
globalThis.MY_NICK = MY_NICK;
globalThis.RADAR_CHANNEL_URL = RADAR_CHANNEL_URL;
globalThis.RED_ZONE = RED_ZONE;
globalThis.ORANGE_ZONE = ORANGE_ZONE;
globalThis.YELLOW_ZONE = YELLOW_ZONE;

module.exports = {
  TG_TOKEN, OR_KEY, MY_ID, MODEL, TIME_ZONE, LOG_LEVEL, WEB_APP_URL,
  MASTER_DB_ID, ADS_DATA_SHEET_ID, HEALTH_SHEET_ID, MY_NICK,
  RADAR_CHANNEL_URL, RED_ZONE, ORANGE_ZONE, YELLOW_ZONE
};
