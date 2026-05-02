// ==========================================================================
// API CONFIGURATION
// ==========================================================================
const API_BASE = 'https://absensi-api-delta.vercel.app/api';

// ==========================================================================
// GLOBAL VARIABLES
// ==========================================================================
let currentUser = null;
let html5QrCode = null;
let isSidebarOpen = true;
let notificationInterval = null;
let adminChart = null;
let guruChart = null;

// Table State
const tableState = {
    siswa: { fullData: [], filtered: [], limit: 10, page: 1, search: '' },
    guru: { fullData: [], filtered: [], limit: 10, page: 1, search: '' },
    monitoring: { fullData: [], filtered: [], limit: 10, page: 1, search: '' }
};

// ==========================================================================
// LOADING FUNCTIONS
// ==========================================================================
function showLoading(title = 'Memproses...', message = 'Harap tunggu') {
    const overlay = document.getElementById('loadingOverlay');
    overlay.querySelector('.loading-text').innerHTML = `${title}<br><span style="font-size:10px">${message}</span>`;
    overlay.classList.remove('hidden');
}
function hideLoading() {
    document.getElementById('loadingOverlay').classList.add('hidden');
}

// ==========================================================================
// API HELPER
// ==========================================================================
async function apiRequest(endpoint, method = 'GET', body = null) {
    const headers = { 'Content-Type': 'application/json' };
    if (currentUser?.token) headers['Authorization'] = `Bearer ${currentUser.token}`;
    const response = await fetch(`${API_BASE}${endpoint}`, {
        method, headers, body: body ? JSON.stringify(body) : null
    });
    if (!response.ok && response.status === 401) { logout(); throw new Error('Session expired'); }
    return response.json();
}

// ==========================================================================
// DATE SETUP
// ==========================================================================
const dateOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
document.getElementById('currentDateDisplay').textContent = new Date().toLocaleDateString('id-ID', dateOptions);

// ==========================================================================
// SESSION MANAGEMENT
// ==========================================================================
function checkSession() {
    const storedSession = localStorage.getItem('absensiAppSession');
    if (storedSession) {
        try {
            const sessionData = JSON.parse(storedSession);
            if (sessionData && sessionData.success) {
                currentUser = sessionData;
                document.getElementById('loginPage').classList.add('hidden');
                document.getElementById('dashboardContainer').classList.remove('hidden');
                if (window.innerWidth < 768) document.getElementById('sidebar').classList.add('-translate-x-full');
                initDashboard();
            }
        } catch (e) { localStorage.removeItem('absensiAppSession'); }
    }
}

// ==========================================================================
// UI FUNCTIONS
// ==========================================================================
function showView(viewId, content) {
    const mainArea = document.getElementById('mainContentArea');
    if (!mainArea) return;
    if (content) mainArea.innerHTML = content;
    document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active'));
    const target = document.getElementById(viewId);
    if (target) target.classList.add('active');
}

function setActiveMenu(targetName) {
    const allLinks = document.querySelectorAll('#sidebarMenu a');
    const centerClass = !isSidebarOpen ? 'justify-center px-0' : 'space-x-3 px-4';
    const baseStyle = `flex items-center ${centerClass} py-3 rounded-xl transition-all duration-200 group overflow-hidden whitespace-nowrap cursor-pointer `;
    const activeStyle = "bg-indigo-600 text-white shadow-lg shadow-indigo-900/50";
    const inactiveStyle = "text-gray-400 hover:bg-gray-800 hover:text-white";
    allLinks.forEach(link => {
        const menuName = link.getAttribute('data-name');
        if (menuName === targetName) link.className = baseStyle + activeStyle;
        else link.className = baseStyle + inactiveStyle;
    });
}

function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const main = document.getElementById('mainContent');
    const overlay = document.getElementById('mobileOverlay');
    const labels = document.querySelectorAll('.sidebar-label');
    const isMobile = window.innerWidth < 768;
    if (isMobile) {
        if (sidebar.classList.contains('-translate-x-full')) {
            sidebar.classList.remove('-translate-x-full');
            overlay.classList.remove('hidden');
            setTimeout(() => overlay.classList.remove('opacity-0'), 10);
        } else {
            sidebar.classList.add('-translate-x-full');
            overlay.classList.add('opacity-0');
            setTimeout(() => overlay.classList.add('hidden'), 300);
        }
    } else {
        if (isSidebarOpen) {
            sidebar.classList.remove('w-64'); sidebar.classList.add('w-20');
            main.classList.remove('md:ml-64'); main.classList.add('md:ml-20');
            labels.forEach(el => el.classList.add('hidden'));
            isSidebarOpen = false;
        } else {
            sidebar.classList.remove('w-20'); sidebar.classList.add('w-64');
            main.classList.remove('md:ml-20'); main.classList.add('md:ml-64');
            labels.forEach(el => el.classList.remove('hidden'));
            isSidebarOpen = true;
        }
    }
}

function showAlert(type, message) {
    Swal.fire({ icon: type, title: type === 'success' ? 'Berhasil!' : 'Gagal!', text: message, toast: true, position: 'top-end', showConfirmButton: false, timer: 3000 });
}

function closeModal() { document.getElementById('modalContainer').innerHTML = ''; }

function showModal(content) {
    document.getElementById('modalContainer').innerHTML = `
        <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div class="absolute inset-0 bg-gray-900/60 backdrop-blur-sm" onclick="closeModal()"></div>
            <div class="relative w-full max-w-2xl transform transition-all animate-fade-in">${content}</div>
        </div>`;
}

// ==========================================================================
// AUTHENTICATION
// ==========================================================================
function switchLoginTab(tab) {
    document.getElementById('loginError').classList.add('hidden');
    const btnSiswa = document.getElementById('btnSiswaTab'), btnAdmin = document.getElementById('btnAdminTab');
    const activeClass = "bg-white text-indigo-600 shadow-sm", inactiveClass = "text-gray-500 hover:text-gray-700 hover:bg-gray-200";
    btnSiswa.className = `flex-1 py-2.5 text-sm font-semibold rounded-lg transition-all duration-200 ${tab === 'siswa' ? activeClass : inactiveClass}`;
    btnAdmin.className = `flex-1 py-2.5 text-sm font-semibold rounded-lg transition-all duration-200 ${tab === 'admin' ? activeClass : inactiveClass}`;
    if (tab === 'admin') { document.getElementById('formAdminLogin').classList.remove('hidden'); document.getElementById('formSiswaLogin').classList.add('hidden'); }
    else { document.getElementById('formAdminLogin').classList.add('hidden'); document.getElementById('formSiswaLogin').classList.remove('hidden'); }
}

async function handleLogin(event) {
    event.preventDefault();
    showLoading('Login', 'Memverifikasi akun Anda...');
    const username = document.getElementById('username').value, password = document.getElementById('password').value, nisn = document.getElementById('nisn').value;
    const isSiswa = !document.getElementById('formAdminLogin').classList.contains('hidden');
    const body = isSiswa ? { nisn } : { username, password };
    try {
        const response = await fetch(`${API_BASE}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        const result = await response.json();
        hideLoading();
        if (result.success) {
            currentUser = result;
            localStorage.setItem('absensiAppSession', JSON.stringify(result));
            document.getElementById('loginPage').classList.add('hidden');
            document.getElementById('dashboardContainer').classList.remove('hidden');
            initDashboard();
            Swal.fire({ icon: 'success', title: 'Login Berhasil!', text: `Selamat datang ${result.nama}`, timer: 2000, showConfirmButton: false });
        } else {
            const errorDiv = document.getElementById('loginError');
            document.getElementById('errorText').textContent = result.message;
            errorDiv.classList.remove('hidden');
            setTimeout(() => errorDiv.classList.add('hidden'), 5000);
        }
    } catch (error) { hideLoading(); Swal.fire('Error', 'Gagal terhubung ke server', 'error'); }
}

function logout() {
    if (html5QrCode) html5QrCode.stop().catch(() => {});
    if (notificationInterval) clearInterval(notificationInterval);
    localStorage.removeItem('absensiAppSession');
    currentUser = null;
    document.getElementById('dashboardContainer').classList.add('hidden');
    document.getElementById('loginPage').classList.remove('hidden');
    document.getElementById('username').value = ''; document.getElementById('password').value = ''; document.getElementById('nisn').value = '';
    document.getElementById('sidebar').classList.add('-translate-x-full');
}

// ==========================================================================
// DASHBOARD INIT
// ==========================================================================
async function initDashboard() {
    const name = currentUser.nama || currentUser.username;
    document.getElementById('navUserName').textContent = name;
    document.getElementById('navUserRole').textContent = currentUser.role.toUpperCase();
    document.getElementById('navUserInitial').textContent = name.charAt(0).toUpperCase();

    const menuContainer = document.getElementById('sidebarMenu');
    let menuHTML = '';
    const createItem = (label, icon, onclick, isDefaultActive = false) => {
        const hideText = !isSidebarOpen ? 'hidden' : '';
        const centerClass = !isSidebarOpen ? 'justify-center px-0' : 'space-x-3 px-4';
        const baseStyle = `flex items-center ${centerClass} py-3 rounded-xl transition-all duration-200 group overflow-hidden whitespace-nowrap cursor-pointer `;
        const activeStyle = "bg-indigo-600 text-white shadow-lg shadow-indigo-900/50";
        const inactiveStyle = "text-gray-400 hover:bg-gray-800 hover:text-white";
        const currentStyle = isDefaultActive ? (baseStyle + activeStyle) : (baseStyle + inactiveStyle);
        return `<a data-name="${label}" onclick="${onclick}" class="${currentStyle}"><i class="fas ${icon} w-6 text-center flex-shrink-0 group-hover:scale-110 transition-transform"></i><span class="sidebar-label font-medium transition-opacity duration-300 ${hideText}">${label}</span></a>`;
    };
    if (currentUser.role === 'admin') {
        menuHTML += createItem('Dashboard', 'fa-home', 'loadAdminDashboard()', true);
        menuHTML += createItem('Data Siswa', 'fa-user-graduate', 'loadDataSiswa()');
        menuHTML += createItem('Data Guru', 'fa-chalkboard-teacher', 'loadDataGuru()');
        menuHTML += createItem('Laporan', 'fa-clipboard-list', 'loadRekapAbsensi()');
        menuHTML += createItem('Kelola Absen', 'fa-calendar-times', 'loadKelolaAbsen()');
        menuHTML += createItem('Scan Absensi', 'fa-qrcode', 'loadScanAbsensi()');
        loadAdminDashboard();
    } else if (currentUser.role === 'guru') {
        menuHTML += createItem('Dashboard', 'fa-home', 'loadGuruDashboard()', true);
        menuHTML += createItem('Monitoring', 'fa-eye', 'loadMonitoringAbsensi()');
        menuHTML += createItem('Scan Absensi', 'fa-qrcode', 'loadScanAbsensi()');
        loadGuruDashboard();
    } else if (currentUser.role === 'siswa') {
        menuHTML += createItem('Dashboard', 'fa-home', 'loadSiswaDashboard()', true);
        menuHTML += createItem('Kartu Saya', 'fa-id-card', 'loadQRCodeSiswa()');
        loadSiswaDashboard();
    }
    menuContainer.innerHTML = menuHTML;
    await loadKelasSuggestions();
    if (currentUser.role === 'admin' || currentUser.role === 'guru') {
        startNotificationPolling();
        loadAdminNotifications();
    }
}

async function loadKelasSuggestions() {
    if (!currentUser?.token) return;
    try {
        const result = await apiRequest('/siswa/kelas');
        if (result.success) existingClasses = result.data;
    } catch (error) { console.error('Failed to load kelas:', error); }
}

// ==========================================================================
// ADMIN DASHBOARD - GRAFIK SEDERHANA
// ==========================================================================
async function loadAdminDashboard() {
    stopAndBack(false);
    setActiveMenu('Dashboard');
    
    const content = `
    <div id="view-admin-dashboard" class="view-section active">
        <div class="flex flex-col md:flex-row justify-between items-end mb-6 gap-4">
            <div><h2 class="text-2xl font-bold text-gray-800">Dashboard Admin</h2><p class="text-sm text-gray-500">Pusat kontrol data absensi sekolah.</p></div>
            <div class="flex items-center gap-3">
                <span class="text-xs font-bold bg-white text-gray-600 px-3 py-1.5 rounded-lg border border-gray-200 shadow-sm"><i class="far fa-clock mr-2"></i> ${new Date().toLocaleDateString('id-ID', dateOptions)}</span>
                <button onclick="refreshData('dashboard')" class="flex items-center space-x-2 text-xs font-bold text-white bg-indigo-600 border border-indigo-600 px-4 py-2 rounded-lg shadow-md hover:bg-indigo-700 transition"><i class="fas fa-sync-alt"></i> <span>Refresh</span></button>
            </div>
        </div>
        <div class="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
            <div class="bg-white p-4 rounded-xl shadow-sm border-l-4 border-indigo-500"><p class="text-gray-400 text-xs">Total Siswa</p><h3 id="statTotal" class="text-2xl font-bold">-</h3></div>
            <div class="bg-white p-4 rounded-xl shadow-sm border-l-4 border-green-500"><p class="text-gray-400 text-xs">Hadir</p><h3 id="statHadir" class="text-2xl font-bold text-green-600">-</h3></div>
            <div class="bg-white p-4 rounded-xl shadow-sm border-l-4 border-yellow-500"><p class="text-gray-400 text-xs">Sakit</p><h3 id="statSakit" class="text-2xl font-bold text-yellow-600">-</h3></div>
            <div class="bg-white p-4 rounded-xl shadow-sm border-l-4 border-blue-500"><p class="text-gray-400 text-xs">Izin</p><h3 id="statIzin" class="text-2xl font-bold text-blue-600">-</h3></div>
            <div class="bg-white p-4 rounded-xl shadow-sm border-l-4 border-red-500"><p class="text-gray-400 text-xs">Alpa</p><h3 id="statAlpa" class="text-2xl font-bold text-red-600">-</h3></div>
        </div>
        <div class="bg-white rounded-xl p-5 shadow-sm mb-6">
            <div class="flex justify-between items-center mb-4"><h3 class="text-sm font-bold text-gray-700"><i class="fas fa-chart-bar text-indigo-500 mr-2"></i> Grafik Statistik Kehadiran</h3></div>
            <div class="relative w-full h-[300px]"><canvas id="adminChart"></canvas></div>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
            <button onclick="loadDataSiswa()" class="bg-indigo-50 hover:bg-indigo-100 p-4 rounded-xl text-left transition"><div class="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center mb-2"><i class="fas fa-user-graduate text-indigo-600"></i></div><div class="font-bold text-sm">Data Siswa</div><div class="text-xs text-gray-500">Kelola database siswa</div></button>
            <button onclick="loadDataGuru()" class="bg-purple-50 hover:bg-purple-100 p-4 rounded-xl text-left transition"><div class="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center mb-2"><i class="fas fa-chalkboard-teacher text-purple-600"></i></div><div class="font-bold text-sm">Data Guru</div><div class="text-xs text-gray-500">Kelola akun guru</div></button>
            <button onclick="loadRekapAbsensi()" class="bg-emerald-50 hover:bg-emerald-100 p-4 rounded-xl text-left transition"><div class="w-10 h-10 bg-emerald-100 rounded-lg flex items-center justify-center mb-2"><i class="fas fa-file-alt text-emerald-600"></i></div><div class="font-bold text-sm">Laporan</div><div class="text-xs text-gray-500">Export & rekap data</div></button>
            <button onclick="loadKelolaAbsen()" class="bg-amber-50 hover:bg-amber-100 p-4 rounded-xl text-left transition"><div class="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center mb-2"><i class="fas fa-calendar-alt text-amber-600"></i></div><div class="font-bold text-sm">Kelola Absen</div><div class="text-xs text-gray-500">Pengaturan waktu & libur</div></button>
            <button onclick="loadMonitoringAbsensi()" class="bg-cyan-50 hover:bg-cyan-100 p-4 rounded-xl text-left transition"><div class="w-10 h-10 bg-cyan-100 rounded-lg flex items-center justify-center mb-2"><i class="fas fa-eye text-cyan-600"></i></div><div class="font-bold text-sm">Monitoring</div><div class="text-xs text-gray-500">Kehadiran realtime</div></button>
            <button onclick="loadScanAbsensi()" class="bg-rose-50 hover:bg-rose-100 p-4 rounded-xl text-left transition"><div class="w-10 h-10 bg-rose-100 rounded-lg flex items-center justify-center mb-2"><i class="fas fa-qrcode text-rose-600"></i></div><div class="font-bold text-sm">Scan Absensi</div><div class="text-xs text-gray-500">Mode scanner kamera</div></button>
        </div>
    </div>`;
    
    showView('view-admin-dashboard', content);
    
    try {
        const result = await apiRequest('/monitoring/realtime');
        if (result.success) {
            const data = result.data;
            const total = data.length;
            const hadir = data.filter(d => d.status === 'Hadir').length;
            const sakit = data.filter(d => d.status === 'Sakit').length;
            const izin = data.filter(d => d.status === 'Izin').length;
            const alpa = data.filter(d => d.status === 'Alpa').length;
            
            document.getElementById('statTotal').innerHTML = total;
            document.getElementById('statHadir').innerHTML = hadir;
            document.getElementById('statSakit').innerHTML = sakit;
            document.getElementById('statIzin').innerHTML = izin;
            document.getElementById('statAlpa').innerHTML = alpa;
            
            const ctx = document.getElementById('adminChart').getContext('2d');
            if (adminChart) adminChart.destroy();
            adminChart = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: ['Hadir', 'Sakit', 'Izin', 'Alpa'],
                    datasets: [{ label: 'Jumlah Siswa', data: [hadir, sakit, izin, alpa], backgroundColor: ['#10B981', '#F59E0B', '#3B82F6', '#EF4444'], borderRadius: 8 }]
                },
                options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, grid: { borderDash: [2, 2] } }, x: { grid: { display: false } } } }
            });
        }
    } catch (error) { console.error(error); }
}

// ==========================================================================
// GURU DASHBOARD
// ==========================================================================
async function loadGuruDashboard() {
    stopAndBack(false);
    setActiveMenu('Dashboard');
    const content = `
    <div id="view-guru-dashboard" class="view-section active">
        <div class="flex justify-between items-center mb-6"><div><h2 class="text-2xl font-bold text-gray-800">Dashboard Guru</h2><p class="text-sm text-gray-500">Ringkasan aktivitas siswa hari ini.</p></div><button onclick="refreshData('dashboard')" class="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm"><i class="fas fa-sync-alt mr-2"></i> Refresh</button></div>
        <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div class="bg-white p-5 rounded-xl shadow-sm border-l-4 border-indigo-500"><p class="text-gray-400 text-xs">Total Siswa</p><h3 id="guruTotal" class="text-2xl font-bold">-</h3></div>
            <div class="bg-white p-5 rounded-xl shadow-sm border-l-4 border-green-500"><p class="text-gray-400 text-xs">Hadir</p><h3 id="guruHadir" class="text-2xl font-bold text-green-600">-</h3></div>
            <div class="bg-white p-5 rounded-xl shadow-sm border-l-4 border-yellow-500"><p class="text-gray-400 text-xs">Sakit</p><h3 id="guruSakit" class="text-2xl font-bold text-yellow-600">-</h3></div>
            <div class="bg-white p-5 rounded-xl shadow-sm border-l-4 border-blue-500"><p class="text-gray-400 text-xs">Izin</p><h3 id="guruIzin" class="text-2xl font-bold text-blue-600">-</h3></div>
        </div>
        <div class="bg-white rounded-xl p-5 shadow-sm mb-6"><h3 class="text-sm font-bold text-gray-700 mb-4"><i class="fas fa-chart-bar text-indigo-500 mr-2"></i> Statistik Kehadiran Hari Ini</h3><div class="relative w-full h-[300px]"><canvas id="guruChart"></canvas></div></div>
        <div class="bg-gradient-to-br from-indigo-600 to-purple-700 rounded-2xl p-6 text-white text-center"><div class="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center text-2xl mb-4 mx-auto"><i class="fas fa-qrcode"></i></div><h3 class="text-lg font-bold mb-2">Mulai Absensi</h3><p class="text-xs mb-6">Buka pemindai kamera untuk melakukan absensi siswa secara cepat.</p><button onclick="loadScanAbsensi()" class="bg-white text-indigo-700 px-6 py-3 rounded-xl font-bold text-sm w-full">Buka Scanner</button></div>
    </div>`;
    
    showView('view-guru-dashboard', content);
    
    try {
        const kelasFilter = currentUser.role === 'guru' ? currentUser.kelas : null;
        const params = kelasFilter ? `?kelas=${encodeURIComponent(kelasFilter)}` : '';
        const result = await apiRequest(`/monitoring/realtime${params}`);
        if (result.success) {
            const data = result.data;
            const total = data.length;
            const hadir = data.filter(d => d.status === 'Hadir').length;
            const sakit = data.filter(d => d.status === 'Sakit').length;
            const izin = data.filter(d => d.status === 'Izin').length;
            const alpa = total - hadir - sakit - izin;
            
            document.getElementById('guruTotal').innerHTML = total;
            document.getElementById('guruHadir').innerHTML = hadir;
            document.getElementById('guruSakit').innerHTML = sakit;
            document.getElementById('guruIzin').innerHTML = izin;
            
            const ctx = document.getElementById('guruChart').getContext('2d');
            if (guruChart) guruChart.destroy();
            guruChart = new Chart(ctx, {
                type: 'bar',
                data: { labels: ['Hadir', 'Sakit', 'Izin', 'Alpa'], datasets: [{ label: 'Jumlah Siswa', data: [hadir, sakit, izin, alpa], backgroundColor: ['#10B981', '#F59E0B', '#3B82F6', '#EF4444'], borderRadius: 8 }] },
                options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
            });
        }
    } catch (error) { console.error(error); }
}

// ==========================================================================
// SISWA DASHBOARD
// ==========================================================================
async function loadSiswaDashboard() {
    stopAndBack(false);
    setActiveMenu('Dashboard');
    const content = `
    <div id="view-siswa-dashboard" class="view-section active">
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div class="lg:col-span-2 space-y-6">
                <div id="heroCard" class="relative overflow-hidden rounded-3xl bg-slate-800 p-6 text-white"><div class="flex justify-between items-start mb-6"><div><p id="dashDate" class="text-slate-300 text-[10px] font-bold mb-1">${new Date().toLocaleDateString('id-ID', dateOptions)}</p><h2 class="text-3xl font-bold mb-1">Hai, <span id="dashGreeting">${currentUser.nama?.split(' ')[0] || 'Siswa'}</span></h2><p class="text-slate-400 text-xs">Semoga harimu menyenangkan!</p></div><div id="dashStatusBadge" class="px-4 py-2 rounded-xl bg-white/10 backdrop-blur-md text-white text-xs font-bold">Memuat...</div></div><div class="grid grid-cols-2 gap-4"><div class="bg-white/5 p-4 rounded-2xl"><div class="flex items-center gap-2 mb-2 text-slate-300"><i class="fas fa-sign-in-alt text-xs"></i><span class="text-[10px] uppercase font-bold">Jam Datang</span></div><div id="valMasuk" class="font-mono text-2xl font-bold">--:--</div></div><div class="bg-white/5 p-4 rounded-2xl"><div class="flex items-center gap-2 mb-2 text-slate-300"><i class="fas fa-sign-out-alt text-xs"></i><span class="text-[10px] uppercase font-bold">Jam Pulang</span></div><div id="valPulang" class="font-mono text-2xl font-bold">--:--</div></div></div></div>
                <div id="alertBelumAbsen" class="hidden bg-rose-50 border border-rose-100 rounded-xl p-4 flex gap-3"><div class="bg-white p-2 rounded-full text-rose-500"><i class="fas fa-exclamation"></i></div><div><h4 class="text-sm font-bold text-rose-800">Peringatan Absensi</h4><p class="text-xs">Anda belum melakukan scan absensi datang hari ini.</p></div></div>
                <div class="bg-white rounded-2xl shadow-sm p-6"><h3 class="font-bold text-lg mb-4"><i class="fas fa-file-medical text-indigo-600 mr-2"></i> Ajukan Izin / Sakit</h3>
                    <form id="formIzin" class="space-y-4"><div><label class="block text-sm font-medium">Jenis</label><select id="jenisIzin" class="w-full border rounded-lg p-2.5"><option value="izin">Izin</option><option value="sakit">Sakit</option></select></div><div class="grid grid-cols-2 gap-4"><div><label>Tanggal Mulai</label><input type="date" id="tglMulai" class="w-full border rounded-lg p-2.5"></div><div><label>Tanggal Akhir</label><input type="date" id="tglAkhir" class="w-full border rounded-lg p-2.5"></div></div><div><label>Keterangan</label><textarea id="ketIzin" rows="3" class="w-full border rounded-lg p-2.5" placeholder="Jelaskan alasan..."></textarea></div><button type="submit" class="w-full bg-indigo-600 text-white py-2.5 rounded-lg font-bold hover:bg-indigo-700"><i class="fas fa-paper-plane mr-2"></i> Ajukan</button></form>
                </div>
            </div>
            <div class="space-y-6">
                <div class="bg-white rounded-2xl p-6 text-center relative overflow-hidden"><div class="absolute top-0 left-0 w-full h-16 bg-gradient-to-r from-indigo-500 to-purple-500"></div><div class="relative z-10 -mt-2"><div class="w-20 h-20 bg-white p-1 rounded-full mx-auto shadow-md"><div class="w-full h-full bg-slate-100 rounded-full flex items-center justify-center text-3xl"><i class="fas fa-user text-slate-300"></i></div></div><h3 class="font-bold text-slate-800 text-lg mt-3">${currentUser.nama || 'Siswa'}</h3><p id="profileNisn" class="text-xs font-mono text-slate-500 bg-slate-100 inline-block px-2 py-1 rounded mt-1">${currentUser.nisn || '-'}</p><div class="grid grid-cols-2 gap-2 mt-4"><div class="bg-slate-50 p-2 rounded-lg"><p class="text-[10px] uppercase font-bold">Kelas</p><p class="text-sm font-bold">${currentUser.kelas || '-'}</p></div><div class="bg-slate-50 p-2 rounded-lg"><p class="text-[10px] uppercase font-bold">Status</p><p class="text-sm font-bold text-emerald-600">Aktif</p></div></div></div></div>
                <button onclick="loadQRCodeSiswa()" class="w-full bg-slate-900 p-1 rounded-2xl"><div class="bg-slate-900 rounded-2xl px-5 py-4 flex justify-between"><div><h3 class="text-white font-bold text-sm">Kartu Digital</h3><p class="text-slate-400 text-[10px]">Tampilkan QR Code</p></div><div class="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center text-white text-lg"><i class="fas fa-qrcode"></i></div></div></button>
            </div>
        </div>
        <div class="mt-6 bg-white rounded-2xl shadow-sm p-6"><h3 class="font-bold text-lg mb-4"><i class="fas fa-history text-indigo-600 mr-2"></i> Riwayat Pengajuan</h3><div id="riwayatIzin" class="space-y-3 max-h-96 overflow-y-auto"><div class="text-center text-gray-400 py-8"><i class="fas fa-inbox text-2xl mb-2 block"></i>Belum ada pengajuan</div></div></div>
    </div>`;
    
    showView('view-siswa-dashboard', content);
    
    try {
        const result = await apiRequest(`/absensi/today/${currentUser.nisn}`);
        const absensi = result.data;
        const elBadge = document.getElementById('dashStatusBadge'), elMasuk = document.getElementById('valMasuk'), elPulang = document.getElementById('valPulang'), elAlert = document.getElementById('alertBelumAbsen');
        if (!absensi) {
            if (elBadge) { elBadge.className = "px-4 py-2 rounded-xl bg-rose-500/20 backdrop-blur-md text-rose-200 text-xs font-bold animate-pulse"; elBadge.innerHTML = '<i class="fas fa-circle text-[8px] mr-2"></i> BELUM ABSEN'; }
            if (elMasuk) elMasuk.textContent = "--:--";
            if (elPulang) elPulang.textContent = "--:--";
            if (elAlert) elAlert.classList.remove('hidden');
        } else {
            if (elAlert) elAlert.classList.add('hidden');
            if (elMasuk) elMasuk.textContent = absensi.jamDatang || "--:--";
            if (absensi.jamPulang) { if (elPulang) elPulang.textContent = absensi.jamPulang; if (elBadge) { elBadge.className = "px-4 py-2 rounded-xl bg-white/20 backdrop-blur-md text-white text-xs font-bold"; elBadge.innerHTML = '<i class="fas fa-check-circle mr-2"></i> SELESAI'; } }
            else { if (elBadge) { elBadge.className = "px-4 py-2 rounded-xl bg-white/20 backdrop-blur-md text-white text-xs font-bold animate-pulse"; elBadge.innerHTML = '<i class="fas fa-clock mr-2"></i> SEDANG BERLANGSUNG'; } }
        }
    } catch (error) { console.error(error); }
    
    await loadRiwayatIzin();
    document.getElementById('formIzin').addEventListener('submit', async (e) => { e.preventDefault(); await submitIzin(); });
}

async function loadRiwayatIzin() {
    try {
        const result = await apiRequest('/izin/my');
        const container = document.getElementById('riwayatIzin');
        if (!result.success || result.data.length === 0) { container.innerHTML = '<div class="text-center text-gray-400 py-8"><i class="fas fa-inbox text-2xl mb-2 block"></i>Belum ada pengajuan</div>'; return; }
        const statusClass = { pending: 'bg-yellow-100 text-yellow-700', disetujui: 'bg-green-100 text-green-700', ditolak: 'bg-red-100 text-red-700' };
        const statusText = { pending: 'Menunggu', disetujui: 'Disetujui', ditolak: 'Ditolak' };
        container.innerHTML = result.data.map(item => `<div class="border rounded-lg p-3"><div class="flex justify-between items-start mb-2"><span class="font-bold text-sm">${item.jenis === 'izin' ? '📋 Izin' : '🤒 Sakit'}</span><span class="px-2 py-0.5 rounded text-xs font-bold ${statusClass[item.status]}">${statusText[item.status]}</span></div><p class="text-xs text-gray-600">${new Date(item.tanggalPengajuan).toLocaleDateString('id-ID')}</p><p class="text-xs text-gray-500">${item.tanggalMulai} - ${item.tanggalAkhir}</p><p class="text-xs text-gray-400">${item.keterangan || '-'}</p></div>`).join('');
    } catch (error) { console.error(error); }
}

async function submitIzin() {
    const jenis = document.getElementById('jenisIzin').value, tglMulai = document.getElementById('tglMulai').value, tglAkhir = document.getElementById('tglAkhir').value, keterangan = document.getElementById('ketIzin').value;
    if (!tglMulai || !tglAkhir) { showAlert('warning', 'Pilih tanggal mulai dan akhir'); return; }
    showLoading('Mengirim', 'Mengajukan izin/sakit...');
    try {
        const result = await apiRequest('/izin/create', 'POST', { jenis, keterangan, tanggalMulai: tglMulai, tanggalAkhir: tglAkhir });
        if (result.success) { showAlert('success', result.message); document.getElementById('tglMulai').value = ''; document.getElementById('tglAkhir').value = ''; document.getElementById('ketIzin').value = ''; await loadRiwayatIzin(); }
        else showAlert('error', result.message);
    } catch (error) { showAlert('error', 'Gagal mengajukan'); } finally { hideLoading(); }
}

// ==========================================================================
// DATA SISWA
// ==========================================================================
async function loadDataSiswa() {
    stopAndBack(false);
    setActiveMenu('Data Siswa');
    const content = `
    <div id="view-data-siswa" class="view-section active">
        <div class="bg-white rounded-xl shadow-sm overflow-hidden">
            <div class="p-4 border-b flex justify-between items-center bg-gray-50/30"><div><h3 class="font-bold text-sm">Direktori Siswa</h3></div><div class="flex gap-2"><button onclick="refreshData('siswa')" class="bg-white border px-3 py-1.5 rounded-lg text-xs"><i class="fas fa-sync-alt"></i></button><button onclick="showAddSiswaModal()" class="bg-indigo-600 text-white px-3 py-1.5 rounded-lg text-xs"><i class="fas fa-plus mr-1"></i> Tambah</button></div></div>
            <div class="p-4 flex flex-wrap gap-4 justify-between"><div class="flex items-center gap-2"><span class="text-gray-500 text-xs">Show</span><select onchange="handleTableLimit('siswa', this.value)" class="border rounded p-1 text-xs"><option value="10">10</option><option value="25">25</option><option value="50">50</option><option value="all">Semua</option></select></div><div class="relative"><i class="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs"></i><input type="text" oninput="handleTableSearch('siswa', this.value)" class="border rounded pl-8 p-2 text-xs w-64" placeholder="Cari..."></div></div>
            <div class="overflow-x-auto"><table class="w-full"><thead class="bg-gray-50 text-gray-500 text-[10px]"><tr><th class="p-3 text-center">No</th><th class="p-3">Nama</th><th class="p-3">NISN</th><th class="p-3">Kelas</th><th class="p-3 text-center">Aksi</th></tr></thead><tbody id="siswaTableBody"></tbody></table></div>
            <div class="p-4 border-t flex justify-between items-center text-xs"><span id="siswaInfo">Menampilkan 0 data</span><div class="flex gap-1"><button onclick="changePage('siswa', -1)" class="px-3 py-1 bg-white border rounded disabled:opacity-50" id="siswaPrev">Prev</button><button onclick="changePage('siswa', 1)" class="px-3 py-1 bg-white border rounded disabled:opacity-50" id="siswaNext">Next</button></div></div>
        </div>
    </div>`;
    showView('view-data-siswa', content);
    if (tableState.siswa.fullData.length > 0) processTableData('siswa');
    else { try { const result = await apiRequest('/siswa'); if (result.success) { tableState.siswa.fullData = result.data; processTableData('siswa'); } } catch (error) { showAlert('error', 'Gagal memuat data'); } }
}

function renderSiswaRows(data, startIdx) {
    const tbody = document.getElementById('siswaTableBody');
    if (data.length === 0) { tbody.innerHTML = '<tr><td colspan="5" class="p-8 text-center text-gray-400">Data tidak ditemukan</td></tr>'; return; }
    tbody.innerHTML = data.map((s, i) => `<tr class="border-b hover:bg-gray-50"><td class="p-3 text-center">${startIdx + i + 1}</td><td class="p-3"><div class="flex items-center"><div class="w-6 h-6 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-xs mr-2">${s.nama.charAt(0)}</div>${s.nama}</div></td><td class="p-3">${s.nisn}</td><td class="p-3"><span class="bg-blue-50 text-blue-700 px-2 py-1 rounded text-xs">${s.kelas}</span></td><td class="p-3 text-center"><div class="flex justify-center gap-1"><button onclick="viewSiswa(${JSON.stringify(s)})" class="p-1.5 bg-emerald-50 text-emerald-600 rounded"><i class="fas fa-eye text-xs"></i></button><button onclick="editSiswa(${JSON.stringify(s)})" class="p-1.5 bg-amber-50 text-amber-600 rounded"><i class="fas fa-edit text-xs"></i></button><button onclick="deleteSiswaConfirm('${s.nisn}','${s.nama}')" class="p-1.5 bg-red-50 text-red-600 rounded"><i class="fas fa-trash text-xs"></i></button><button onclick="generateQRForSiswa('${s.nisn}','${s.nama}','${s.kelas}')" class="p-1.5 bg-blue-50 text-blue-600 rounded"><i class="fas fa-qrcode text-xs"></i></button></div></td></tr>`).join('');
}

async function showAddSiswaModal() {
    const { value: form } = await Swal.fire({
        title: 'Tambah Siswa Baru', html: `<input id="nama" class="swal2-input" placeholder="Nama Lengkap"><input id="nisn" class="swal2-input" placeholder="NISN"><input id="kelas" class="swal2-input" placeholder="Kelas"><select id="jk" class="swal2-input"><option value="Laki-laki">Laki-laki</option><option value="Perempuan">Perempuan</option></select><input type="date" id="tgl" class="swal2-input"><input id="agama" class="swal2-input" placeholder="Agama"><input id="ayah" class="swal2-input" placeholder="Nama Ayah"><input id="ibu" class="swal2-input" placeholder="Nama Ibu"><input id="hp" class="swal2-input" placeholder="No HP"><textarea id="alamat" class="swal2-textarea" placeholder="Alamat" rows="2"></textarea>`, width: '600px', showCancelButton: true, confirmButtonText: 'Simpan', preConfirm: () => ({ nama: document.getElementById('nama').value, nisn: document.getElementById('nisn').value, kelas: document.getElementById('kelas').value, jenisKelamin: document.getElementById('jk').value, tanggalLahir: document.getElementById('tgl').value, agama: document.getElementById('agama').value, namaAyah: document.getElementById('ayah').value, namaIbu: document.getElementById('ibu').value, noHp: document.getElementById('hp').value, alamat: document.getElementById('alamat').value })
    });
    if (form) { showLoading('Menyimpan', 'Menambah data siswa...'); try { const res = await apiRequest('/siswa', 'POST', form); if (res.success) { showAlert('success', res.message); tableState.siswa.fullData = []; loadDataSiswa(); } else showAlert('error', res.message); } catch (error) { showAlert('error', 'Gagal menyimpan'); } finally { hideLoading(); } }
}

async function editSiswa(s) {
    const { value: form } = await Swal.fire({
        title: 'Edit Siswa', html: `<input id="nama" class="swal2-input" value="${s.nama}"><input id="nisn" class="swal2-input" value="${s.nisn}" readonly style="background:#f3f4f6"><input id="kelas" class="swal2-input" value="${s.kelas}"><select id="jk" class="swal2-input"><option value="Laki-laki" ${s.jenisKelamin === 'Laki-laki' ? 'selected' : ''}>Laki-laki</option><option value="Perempuan" ${s.jenisKelamin === 'Perempuan' ? 'selected' : ''}>Perempuan</option></select><input type="date" id="tgl" class="swal2-input" value="${s.tanggalLahir || ''}"><input id="agama" class="swal2-input" value="${s.agama || ''}"><input id="ayah" class="swal2-input" value="${s.namaAyah || ''}"><input id="ibu" class="swal2-input" value="${s.namaIbu || ''}"><input id="hp" class="swal2-input" value="${s.noHp || ''}"><textarea id="alamat" class="swal2-textarea" rows="2">${s.alamat || ''}</textarea>`, width: '600px', showCancelButton: true, confirmButtonText: 'Update', preConfirm: () => ({ nama: document.getElementById('nama').value, nisn: s.nisn, kelas: document.getElementById('kelas').value, jenisKelamin: document.getElementById('jk').value, tanggalLahir: document.getElementById('tgl').value, agama: document.getElementById('agama').value, namaAyah: document.getElementById('ayah').value, namaIbu: document.getElementById('ibu').value, noHp: document.getElementById('hp').value, alamat: document.getElementById('alamat').value })
    });
    if (form) { showLoading('Mengupdate', 'Mengupdate data siswa...'); try { const res = await apiRequest(`/siswa/${s.nisn}`, 'PUT', form); if (res.success) { showAlert('success', res.message); tableState.siswa.fullData = []; loadDataSiswa(); } else showAlert('error', res.message); } catch (error) { showAlert('error', 'Gagal mengupdate'); } finally { hideLoading(); } }
}

async function deleteSiswaConfirm(nisn, nama) {
    const result = await Swal.fire({ title: 'Hapus Siswa?', text: `Hapus ${nama}?`, icon: 'warning', showCancelButton: true, confirmButtonColor: '#EF4444', confirmButtonText: 'Ya, Hapus!' });
    if (result.isConfirmed) { showLoading('Menghapus', 'Menghapus data...'); try { const res = await apiRequest(`/siswa/${nisn}`, 'DELETE'); if (res.success) { showAlert('success', res.message); tableState.siswa.fullData = []; loadDataSiswa(); } else showAlert('error', res.message); } catch (error) { showAlert('error', 'Gagal menghapus'); } finally { hideLoading(); } }
}

async function viewSiswa(s) {
    Swal.fire({ title: 'Detail Siswa', html: `<div class="text-left"><p><strong>Nama:</strong> ${s.nama}</p><p><strong>NISN:</strong> ${s.nisn}</p><p><strong>Kelas:</strong> ${s.kelas}</p><p><strong>JK:</strong> ${s.jenisKelamin || '-'}</p><p><strong>Tgl Lahir:</strong> ${s.tanggalLahir || '-'}</p><p><strong>Agama:</strong> ${s.agama || '-'}</p><p><strong>Ayah:</strong> ${s.namaAyah || '-'}</p><p><strong>Ibu:</strong> ${s.namaIbu || '-'}</p><p><strong>HP:</strong> ${s.noHp || '-'}</p><p><strong>Alamat:</strong> ${s.alamat || '-'}</p></div>`, icon: 'info', confirmButtonText: 'Tutup' });
}

function generateQRForSiswa(nisn, nama, kelas) { loadQRCodeSiswa(); }

// ==========================================================================
// DATA GURU (Singkat)
// ==========================================================================
async function loadDataGuru() {
    if (currentUser.role !== 'admin') { showAlert('error', 'Akses ditolak'); return; }
    stopAndBack(false);
    setActiveMenu('Data Guru');
    const content = `<div id="view-data-guru" class="view-section active"><div class="bg-white rounded-xl shadow-sm overflow-hidden"><div class="p-4 border-b flex justify-between"><h3 class="font-bold">Manajemen Guru</h3><button onclick="refreshData('guru')" class="bg-white border px-3 py-1.5 rounded-lg"><i class="fas fa-sync-alt"></i></button></div><div class="overflow-x-auto"><table class="w-full"><thead class="bg-gray-50"><tr><th class="p-3">No</th><th>Username</th><th>Kelas</th><th>Aksi</th></tr></thead><tbody id="guruTableBody"></tbody></table></div><div class="p-4 border-t flex justify-between text-xs"><span id="guruInfo">Menampilkan 0 data</span><div><button onclick="changePage('guru', -1)" class="px-3 py-1 bg-white border rounded" id="guruPrev">Prev</button><button onclick="changePage('guru', 1)" class="px-3 py-1 bg-white border rounded ml-1" id="guruNext">Next</button></div></div></div></div>`;
    showView('view-data-guru', content);
    if (tableState.guru.fullData.length > 0) processTableData('guru');
    else { try { const res = await apiRequest('/guru'); if (res.success) { tableState.guru.fullData = res.data; processTableData('guru'); } } catch (error) { showAlert('error', 'Gagal memuat data'); } }
}

function renderGuruRows(data, startIdx) {
    const tbody = document.getElementById('guruTableBody');
    if (data.length === 0) { tbody.innerHTML = '<tr><td colspan="4" class="p-8 text-center text-gray-400">Data tidak ditemukan</td></tr>'; return; }
    tbody.innerHTML = data.map((g, i) => `<tr class="border-b"><td class="p-3 text-center">${startIdx + i + 1}</td><td class="p-3">${g.username}</td><td class="p-3">${g.kelas || '<span class="text-gray-400 italic">Semua Akses</span>'}</td><td class="p-3 text-center"><button onclick="editGuru(${JSON.stringify(g)})" class="text-amber-600 mr-2"><i class="fas fa-edit"></i></button><button onclick="deleteGuruConfirm('${g.username}')" class="text-red-600"><i class="fas fa-trash"></i></button></td></tr>`).join('');
}

function handleTableLimit(type, limit) { tableState[type].limit = limit === 'all' ? Infinity : parseInt(limit); tableState[type].page = 1; processTableData(type); }
function handleTableSearch(type, query) { tableState[type].search = query.toLowerCase(); tableState[type].page = 1; processTableData(type); }
function changePage(type, dir) { const s = tableState[type]; const max = Math.ceil(s.filtered.length / s.limit); const np = s.page + dir; if (np >= 1 && np <= max) { s.page = np; processTableData(type); } }
function processTableData(type) {
    const s = tableState[type];
    let result = [...s.fullData];
    if (s.search) { const q = s.search.toLowerCase(); result = result.filter(item => Object.values(item).some(v => String(v).toLowerCase().includes(q))); }
    s.filtered = result;
    const total = result.length, totalPages = Math.ceil(total / s.limit);
    if (s.page > totalPages) s.page = totalPages || 1;
    const start = (s.page - 1) * s.limit;
    const paged = result.slice(start, start + s.limit);
    if (type === 'siswa') renderSiswaRows(paged, start);
    if (type === 'guru') renderGuruRows(paged, start);
    const info = document.getElementById(`${type}Info`);
    const prev = document.getElementById(`${type}Prev`);
    const next = document.getElementById(`${type}Next`);
    if (info) info.innerHTML = `Menampilkan ${start + 1} - ${Math.min(start + s.limit, total)} dari ${total} data`;
    if (prev) prev.disabled = s.page === 1;
    if (next) next.disabled = s.page >= totalPages;
}

function editGuru(g) { showAlert('info', 'Fitur edit guru sedang dalam pengembangan'); }
function deleteGuruConfirm(u) { showAlert('warning', 'Fitur hapus guru sedang dalam pengembangan'); }

// ==========================================================================
// REKAP, MONITORING, SCAN, KARTU, KELOLA ABSEN (Stub sederhana)
// ==========================================================================
async function loadRekapAbsensi() { setActiveMenu('Laporan'); document.getElementById('pageTitle').innerHTML = 'Rekap Absensi'; document.getElementById('mainContentArea').innerHTML = '<div class="bg-white rounded-xl p-6 text-center">📊 Fitur Rekap Absensi sedang dalam pengembangan</div>'; }
async function loadMonitoringAbsensi() { setActiveMenu('Monitoring'); document.getElementById('pageTitle').innerHTML = 'Monitoring'; document.getElementById('mainContentArea').innerHTML = '<div class="bg-white rounded-xl p-6 text-center">👁️ Fitur Monitoring sedang dalam pengembangan</div>'; }
async function loadKelolaAbsen() { setActiveMenu('Kelola Absen'); document.getElementById('pageTitle').innerHTML = 'Kelola Absen'; document.getElementById('mainContentArea').innerHTML = '<div class="bg-white rounded-xl p-6 text-center">⚙️ Fitur Kelola Absen sedang dalam pengembangan</div>'; }
async function loadScanAbsensi() { setActiveMenu('Scan Absensi'); document.getElementById('pageTitle').innerHTML = 'Scan QR'; document.getElementById('mainContentArea').innerHTML = '<div class="max-w-sm mx-auto"><div class="bg-white rounded-xl p-4 text-center"><div id="reader"></div><div id="scanResult" class="mt-3 text-sm"></div><button onclick="stopScanner()" class="w-full mt-3 bg-gray-500 text-white py-2 rounded-lg">Tutup</button></div></div>'; setTimeout(() => startScanner(), 500); }
function loadQRCodeSiswa() { setActiveMenu('Kartu Saya'); document.getElementById('pageTitle').innerHTML = 'Kartu Digital'; document.getElementById('mainContentArea').innerHTML = '<div class="flex justify-center"><div class="bg-white rounded-2xl shadow-xl w-full max-w-sm"><div class="bg-gradient-to-r from-indigo-600 to-purple-600 p-5 text-white text-center"><h2 class="text-xl font-bold">KARTU PELAJAR</h2></div><div class="p-6 text-center"><div id="qrcode"></div><h3 class="text-lg font-bold mt-3">' + currentUser.nama + '</h3><p class="text-indigo-600 font-mono">' + currentUser.nisn + '</p><span class="inline-block bg-gray-200 px-3 py-1 rounded-full text-sm mt-2">' + currentUser.kelas + '</span></div><div class="p-4 flex gap-3"><button onclick="window.print()" class="flex-1 bg-gray-900 text-white py-2 rounded-lg"><i class="fas fa-print mr-2"></i> Cetak</button><button onclick="loadSiswaDashboard()" class="flex-1 border py-2 rounded-lg">Tutup</button></div></div></div>'; setTimeout(() => { new QRCode(document.getElementById("qrcode"), { text: String(currentUser.nisn), width: 150, height: 150 }); }, 100); }

let qrScanner = null;
function startScanner() {
    if (qrScanner) qrScanner.stop().catch(()=>{});
    qrScanner = new Html5Qrcode("reader");
    qrScanner.start({ facingMode: "environment" }, { fps: 10, qrbox: { width: 250, height: 250 } }, async (text) => {
        document.getElementById('scanResult').innerHTML = '<div class="bg-indigo-100 p-2 rounded"><i class="fas fa-spinner fa-spin mr-2"></i> Memproses...</div>';
        const res = await apiCall('/absensi/scan', 'POST', { nisn: text, scannerRole: currentUser.role, scannerKelas: currentUser.kelas || '' });
        if (res.success) document.getElementById('scanResult').innerHTML = `<div class="bg-green-100 text-green-700 p-2 rounded">${res.message}<br>${res.nama} (${res.kelas})</div>`;
        else document.getElementById('scanResult').innerHTML = `<div class="bg-red-100 text-red-700 p-2 rounded">${res.message}</div>`;
        if (currentUser.role === 'siswa') loadSiswaDashboard();
    }, (err) => {});
}
function stopScanner() { if (qrScanner) qrScanner.stop().catch(()=>{}); loadDashboard(); }

// ==========================================================================
// NOTIFICATION FUNCTIONS
// ==========================================================================
function toggleNotificationPanel() { const p = document.getElementById('notificationPanel'); p.classList.toggle('hidden'); if (!p.classList.contains('hidden')) loadAdminNotifications(); }
async function loadAdminNotifications() { try { const res = await apiRequest('/notifications/admin'); if (res.success) renderNotifications(res.data); } catch(e) {} }
function renderNotifications(notifs) {
    const c = document.getElementById('notificationList');
    if (notifs.length === 0) { c.innerHTML = '<div class="p-8 text-center text-gray-400"><i class="fas fa-bell-slash text-2xl mb-2 block"></i>Tidak ada notifikasi</div>'; return; }
    c.innerHTML = notifs.map(n => `<div class="p-3 ${n.status === 'unread' ? 'bg-indigo-50 border-l-4 border-indigo-500' : ''}"><div class="flex justify-between"><div><div class="flex items-center gap-2"><i class="fas ${n.type === 'success' ? 'fa-check-circle text-green-500' : 'fa-info-circle text-blue-500'} text-xs"></i><span class="font-bold text-sm">${n.title}</span>${n.status === 'unread' ? '<span class="bg-indigo-500 text-white text-[9px] px-1.5 py-0.5 rounded-full ml-2">Baru</span>' : ''}</div><p class="text-xs text-gray-600">${n.message}</p><p class="text-[10px] text-gray-400 mt-1">${formatTime(n.tanggal)}</p></div>${n.status === 'unread' ? `<button onclick="markRead(${n.id})" class="text-gray-400 hover:text-indigo-600"><i class="fas fa-check-circle"></i></button>` : ''}</div></div>`).join('');
    updateBadge(notifs);
}
function formatTime(d) { const diff = new Date() - new Date(d); const m = Math.floor(diff / 60000); if (m < 1) return 'Baru saja'; if (m < 60) return `${m} menit lalu`; if (m < 1440) return `${Math.floor(m / 60)} jam lalu`; return new Date(d).toLocaleDateString('id-ID'); }
function updateBadge(notifs) { const u = notifs.filter(n => n.status === 'unread').length; const b = document.querySelector('.notification-badge'); if (u > 0) { b.textContent = u > 9 ? '9+' : u; b.classList.remove('hidden'); } else b.classList.add('hidden'); }
async function markRead(id) { await apiRequest(`/notifications/${id}/read`, 'PUT'); loadAdminNotifications(); }
async function markAllNotificationsRead() { await apiRequest('/notifications/read-all', 'PUT'); loadAdminNotifications(); showAlert('success', 'Semua notifikasi ditandai dibaca'); }
function startNotificationPolling() { if (notificationInterval) clearInterval(notificationInterval); let last = null; notificationInterval = setInterval(async () => { if (!currentUser || currentUser.role === 'siswa') return; try { const res = await apiRequest('/notifications/admin'); if (res.success && res.data.length) { updateBadge(res.data); if (last) res.data.filter(n => new Date(n.tanggal) > last && n.status === 'unread').forEach(n => showToast(n.title, n.message, n.type)); last = new Date(); } } catch(e) {} }, 10000); }
function showToast(title, msg, type) { const c = document.getElementById('toastContainer'); const toast = document.createElement('div'); toast.className = `toast toast-${type || 'info'}`; toast.innerHTML = `<div class="flex-1"><p class="font-bold text-xs">${title}</p><p class="text-[10px] opacity-90">${msg}</p></div><button onclick="this.parentElement.remove()" class="toast-close">✕</button>`; c.appendChild(toast); setTimeout(() => { toast.classList.add('toast-out'); setTimeout(() => toast.remove(), 300); }, 5000); }

// ==========================================================================
// HELPERS & START
// ==========================================================================
function refreshData(type) { if (type === 'siswa') { tableState.siswa.fullData = []; loadDataSiswa(); } else if (type === 'guru') { tableState.guru.fullData = []; loadDataGuru(); } else if (type === 'dashboard') { if (currentUser.role === 'admin') loadAdminDashboard(); else if (currentUser.role === 'guru') loadGuruDashboard(); else loadSiswaDashboard(); } showAlert('success', 'Data diperbarui'); }
function stopAndBack(redirect) { if (qrScanner) qrScanner.stop().catch(()=>{}); if (redirect && currentUser) { if (currentUser.role === 'admin') loadAdminDashboard(); else if (currentUser.role === 'guru') loadGuruDashboard(); else loadSiswaDashboard(); } }
function loadDashboard() { if (currentUser.role === 'admin') loadAdminDashboard(); else if (currentUser.role === 'guru') loadGuruDashboard(); else loadSiswaDashboard(); }

// Set default tab
switchLoginTab('siswa');

// Event listeners
document.getElementById('loginForm').addEventListener('submit', handleLogin);
document.getElementById('btnSiswaTab').onclick = () => switchLoginTab('siswa');
document.getElementById('btnAdminTab').onclick = () => switchLoginTab('admin');

// Start
checkSession();
</script>
</body>
</html>