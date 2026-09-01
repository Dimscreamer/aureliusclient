// config.js — Конфигурация приложения
var GOOGLE_SCRIPT_URL = "https://api-lzh3pje5pa-uc.a.run.app/api";

var FIREBASE_CONFIG = {
    apiKey: "AIzaSyDY3T5iVpsWCiJX6LaytEpTvAvaVcPWYZ0",
    authDomain: "aureliusclients.firebaseapp.com",
    projectId: "aureliusclients",
    storageBucket: "aureliusclients.firebasestorage.app",
    messagingSenderId: "1058461381786",
    appId: "1:1058461381786:web:42d4f9beaad6c43b579b23"
};

var COHORT_MAP = {
    new: { label: 'Новый', color: 'bg-blue-500/20 text-blue-400', weight: 3 },
    loyal: { label: 'Лояльный', color: 'bg-green-500/20 text-green-400', weight: 2 },
    problematic: { label: 'Проблемный', color: 'bg-red-500/20 text-red-400', weight: 4 },
    vip: { label: 'VIP (High)', color: 'bg-purple-500/20 text-purple-400', weight: 1 }
};
