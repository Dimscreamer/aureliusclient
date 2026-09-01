// app.js — Точка входа в приложение (ES модуль)
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getFirestore, doc, setDoc, onSnapshot, getDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";

// Экспортируем функции SDK в глобальный объект для работы из классических скриптов
window.doc = doc;
window.setDoc = setDoc;
window.getDoc = getDoc;

function initPullToRefresh() {
    const container = document.getElementById('content-container');
    const indicator = document.getElementById('ptr-indicator');
    const icon = indicator.querySelector('i');
    let startY = 0; let dist = 0; const threshold = 60;
    container.addEventListener('touchstart', (e) => { if(container.scrollTop === 0) startY = e.touches[0].clientY; }, {passive: true});
    container.addEventListener('touchmove', (e) => {
        const y = e.touches[0].clientY;
        if(container.scrollTop === 0 && y > startY) {
            dist = y - startY;
            if(dist > 0) { e.preventDefault(); indicator.style.height = Math.min(dist, 80) + 'px'; if(dist > threshold) icon.classList.add('spin'); else icon.classList.remove('spin'); }
        }
    }, {passive: false});
    container.addEventListener('touchend', async () => {
        if(dist > threshold) {
            indicator.style.height = '40px'; icon.classList.add('spin');
            if(auth.currentUser) {
                const docRef = doc(db, 'artifacts', FIREBASE_CONFIG.projectId, 'public', 'data', 'clients_db', 'master');
                const snap = await getDoc(docRef); 
                if (snap.exists()) { clientsData = snap.data().clients || []; renderAllGrids(); updateAnalytics(); if (currentClientId) openClientProfile(currentClientId, true); }
            }
            setTimeout(() => { indicator.style.height = '0px'; icon.classList.remove('spin'); }, 800);
        } else indicator.style.height = '0px';
        startY = 0; dist = 0;
    });
}

function initKeyboardShortcuts() {
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') switchView('clients');
        if (document.getElementById('details-view').classList.contains('active')) {
            if (e.key === 'ArrowRight') navigateClient(1); if (e.key === 'ArrowLeft') navigateClient(-1);
        }
    });
}

function initBackground() { 
    const canvas = document.getElementById('bg-canvas'); 
    const ctx = canvas.getContext('2d'); 
    canvas.width = window.innerWidth; 
    canvas.height = window.innerHeight; 
    let parts = []; 
    for(let i=0; i<30; i++) parts.push({ x: Math.random()*canvas.width, y: Math.random()*canvas.height, vx: (Math.random()-0.5)*0.2, vy: (Math.random()-0.5)*0.2 });
    function animate() { 
        ctx.clearRect(0, 0, canvas.width, canvas.height); 
        ctx.fillStyle = "#00f2ff"; 
        ctx.globalAlpha = 0.05; 
        parts.forEach(p => { 
            p.x += p.vx; 
            p.y += p.vy; 
            if(p.x<0 || p.x>canvas.width) p.vx*=-1; 
            if(p.y<0 || p.y>canvas.height) p.vy*=-1; 
            ctx.beginPath(); 
            ctx.arc(p.x, p.y, 1, 0, Math.PI*2); 
            ctx.fill(); 
        }); 
        requestAnimationFrame(animate); 
    } 
    animate();
}

async function startSystem() {
    const app = initializeApp(FIREBASE_CONFIG);
    db = getFirestore(app);
    auth = getAuth(app);
    onAuthStateChanged(auth, (user) => {
        if (user) {
            const docRef = doc(db, 'artifacts', FIREBASE_CONFIG.projectId, 'public', 'data', 'clients_db', 'master');
            onSnapshot(docRef, snap => {
                if (snap.exists()) { clientsData = snap.data().clients || []; renderAllGrids(); updateAnalytics(); if (currentClientId) openClientProfile(currentClientId, true); }
                else setDoc(docRef, { clients: [] });
            });
        } else signInAnonymously(auth);
    });
    initKeyboardShortcuts(); initBackground(); initPullToRefresh(); lucide.createIcons();
    
    // Telegram WebApp Support
    if (window.Telegram && window.Telegram.WebApp) {
        try {
            window.Telegram.WebApp.ready();
            window.Telegram.WebApp.expand();
            if (typeof window.Telegram.WebApp.disableVerticalSwipes === 'function') {
                window.Telegram.WebApp.disableVerticalSwipes();
            }
        } catch(e) {}
    }

    // Deep linking from Telegram WebApp buttons (?view=ares&sub=calendar or ?page=calendar)
    const urlParams = new URLSearchParams(window.location.search);
    const viewParam = urlParams.get('view') || urlParams.get('page');
    const subParam = urlParams.get('sub') || (viewParam === 'calendar' ? 'calendar' : null);
    
    if (viewParam === 'ares' || viewParam === 'calendar') {
        if (typeof switchView === 'function') switchView('ares');
        if (subParam && typeof switchAresSubView === 'function') {
            setTimeout(() => switchAresSubView(subParam), 50);
        }
    }
}

startSystem();
