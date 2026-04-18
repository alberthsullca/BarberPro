/* ─── SUPABASE ─── */
var supabaseUrl = 'https://zosnbtcbuyjtpzmhfcwt.supabase.co';
var supabaseKey = 'sb_publishable_dN81AGjoKYjKQrTMVb6fXQ_6VaeaJMF';
var sb = window.supabase.createClient(supabaseUrl, supabaseKey);

/* ─── STATE ─── */
const WA_SOPORTE = '51929495198';
var SESSION = null;
var CURRENT_SUCURSAL = null;
var SUCURSALES_LIST = [];
var chartInst = null;
var PERIOD_DAYS = 'turno';
var SELECTED_APT_DATE = null;
var configData = { promoName: 'Corte Gratis', requiredCuts: 6, servicios: [] };

/* ─── UTILS ─── */
function showToast(msg, type = 'info') {
  var wrap = document.getElementById('toastWrap');
  var t = document.createElement('div');
  var icons = { success: '✅', error: '❌', info: 'ℹ️' };
  t.className = `toast ${type}`;
  t.innerHTML = `<span>${icons[type] || '💬'}</span><span>${msg}</span>`;
  wrap.appendChild(t);
  setTimeout(() => { t.style.transition='opacity .3s'; t.style.opacity='0'; setTimeout(()=>t.remove(), 300); }, 3000);
}

function fmtMoney(n) { return 'S/ ' + parseFloat(n||0).toFixed(2); }
function formatPhone(p) { p = p.replace(/\D/g, ''); return (p.length === 9 && p.startsWith('9')) ? '51' + p : p; }
function initials(name) { return (name||'?').split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2); }

/* ─── CONFIRM ─── */
var confirmCallback = null;
function abrirConfirm(titulo, texto, callback, icon = '⚠️') {
  document.getElementById('mcIcon').innerText = icon;
  document.getElementById('mcTitle').innerText = titulo;
  document.getElementById('mcText').innerText = texto;
  confirmCallback = callback;
  document.getElementById('modalConfirm').style.display = 'flex';
}
function cerrarConfirm() { document.getElementById('modalConfirm').style.display = 'none'; confirmCallback = null; }
document.getElementById('mcBtnConfirm').addEventListener('click', () => { if(confirmCallback) confirmCallback(); cerrarConfirm(); });

/* ─── DAY TABS ─── */
function buildDayTabs() {
  var wrap = document.getElementById('dayTabs');
  var today = new Date();
  wrap.innerHTML = '';
  for (var i = -1; i <= 5; i++) {
    var d = new Date(today);
    d.setDate(d.getDate() + i);
    var label = i === -1 ? 'Ayer' : i === 0 ? 'Hoy' : i === 1 ? 'Mañana' :
      d.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric' });
    var ds = d.toISOString().split('T')[0];
    var btn = document.createElement('button');
    btn.className = 'day-tab' + (i === 0 ? ' active' : '');
    btn.innerText = label;
    btn.dataset.date = ds;
    btn.onclick = function() {
      document.querySelectorAll('.day-tab').forEach(b => b.classList.remove('active'));
      this.classList.add('active');
      SELECTED_APT_DATE = this.dataset.date;
      document.getElementById('aptDate').value = SELECTED_APT_DATE;
      renderApts();
    };
    wrap.appendChild(btn);
  }
  SELECTED_APT_DATE = today.toISOString().split('T')[0];
}

/* ─── LINK ─── */
function copiarLink() {
  var val = document.getElementById('miLinkReserva').innerText;
  navigator.clipboard.writeText(val).then(() => showToast('Link copiado', 'success'));
}
async function compartirLink() {
  var val = document.getElementById('miLinkReserva').innerText;
  if (navigator.share) await navigator.share({ title: 'Reservas BarberPro', url: val });
  else copiarLink();
}

/* ─── LOGIN / REGISTRO / SESSION ─── */
window.onload = async function() {
  var saved = localStorage.getItem('barberpro_session') || sessionStorage.getItem('barberpro_session');
  if (saved) { 
    // 1. Cargamos lo que dice el navegador temporalmente
    SESSION = JSON.parse(saved); 
    
    // 🛡️ 2. PARCHE DE SEGURIDAD: Preguntamos a la bóveda de Supabase quién es realmente
    var { data: authData } = await sb.auth.getUser();
    
    // Si no tiene una sesión criptográfica real, lo sacamos del sistema
    if (!authData || !authData.user) {
      localStorage.removeItem('barberpro_session');
      sessionStorage.removeItem('barberpro_session');
      return; 
    }

    // 3. Traemos su VERDADERO ROL directamente de la base de datos
    var { data: realData, error } = await sb.from('empleados')
      .select('rol, activo, sucursal_id')
      .eq('auth_id', authData.user.id)
      .single();

    if (error || !realData || !realData.activo) {
      localStorage.removeItem('barberpro_session');
      location.reload();
      return;
    }

    // 4. Sobrescribimos cualquier intento de trampa con la verdad absoluta
    SESSION.rol = realData.rol;
    SESSION.sucursal_id = realData.sucursal_id;
    SESSION.activo = realData.activo;
    
    // Guardamos la versión corregida y limpia
    if (localStorage.getItem('barberpro_session')) {
      localStorage.setItem('barberpro_session', JSON.stringify(SESSION));
    } else {
      sessionStorage.setItem('barberpro_session', JSON.stringify(SESSION));
    }

    // 5. Ahora sí, con los datos verificados, iniciamos la app
    initSession(); 
  }
};

function switchLogin(mode) {
  document.getElementById('tabIngresar').style.color = mode==='in' ? 'var(--gold)' : 'var(--muted)';
  document.getElementById('tabIngresar').style.borderBottom = mode==='in' ? '2px solid var(--gold)' : 'none';
  document.getElementById('tabRegistrar').style.color = mode==='up' ? 'var(--gold)' : 'var(--muted)';
  document.getElementById('tabRegistrar').style.borderBottom = mode==='up' ? '2px solid var(--gold)' : 'none';
  document.getElementById('formIngresar').style.display = mode==='in' ? 'block' : 'none';
  document.getElementById('formRegistrar').style.display = mode==='up' ? 'block' : 'none';
}

async function iniciarSesion() {
  var u = document.getElementById('logUser').value.trim().toLowerCase(); 
  var p = document.getElementById('logPass').value.trim();
  var btn = document.getElementById('btnLogin');
  
  if (!u || !p || !u.includes('@')) return showToast('Ingresa un correo electrónico válido y tu contraseña', 'error');
  
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Verificando...'; btn.disabled = true;

  try {
    let authUserId = null;

    var { data: authData, error: authError } = await sb.auth.signInWithPassword({ email: u, password: p });

    if (authError) {
      var { data: empMatch, error: errEmp } = await sb.from('empleados')
        .select('id, auth_id')
        .eq('usuario', u) 
        .eq('clave', p)
        .single();

      if (!empMatch) throw new Error('Correo o contraseña incorrectos');

      if (!empMatch.auth_id) {
        var { data: newAuth, error: errSignUp } = await sb.auth.signUp({ email: u, password: p });
        if (errSignUp) throw new Error('Error al registrar credenciales de seguridad');
        
        authUserId = newAuth.user.id;
        await sb.from('empleados').update({ auth_id: authUserId }).eq('id', empMatch.id);
      } else {
        throw new Error('Credenciales inválidas, revisa tu correo y clave');
      }
    } else {
      authUserId = authData.user.id;
    }

    var { data: empData, error: errData } = await sb.from('empleados')
      .select('*, negocios(*)')
      .eq('auth_id', authUserId)
      .single();

    if (errData || !empData) throw new Error('Perfil no encontrado en la base de datos');

    if (!empData.activo || empData.negocios.estado === 'suspendido') {
      document.getElementById('formIngresar').style.display = 'none';
      document.getElementById('tabIngresar').parentElement.style.display = 'none';
      document.getElementById('actUser').innerText = empData.usuario;
      document.getElementById('actPlan').innerText = empData.negocios.plan;
      document.getElementById('pantallaActivacion').style.display = 'block';
      return;
    }

    SESSION = empData;
    if(document.getElementById('logKeep').checked) localStorage.setItem('barberpro_session', JSON.stringify(SESSION));
    else sessionStorage.setItem('barberpro_session', JSON.stringify(SESSION));

    initSession();
  } catch (e) {
    showToast(e.message, 'error');
    btn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Acceder al Sistema'; btn.disabled = false;
  }
}

async function initSession() {
  document.getElementById('loginOverlay').style.display = 'none';
  document.getElementById('userChip').style.display = 'flex';
  document.getElementById('headerUserName').innerText = SESSION.nombre.split(' ')[0];
  document.getElementById('userAvatar').innerText = initials(SESSION.nombre);
  configData = SESSION.negocios.configuracion || configData;

  var planActual = SESSION.negocios.plan || 'equipo'; 
  var { data: sucursales } = await sb.from('sucursales').select('*').eq('negocio_id', SESSION.negocio_id);
  SUCURSALES_LIST = sucursales || [];

  var bBar = document.getElementById('branchBar');
  var bSel = document.getElementById('branchSelector');

  if (SESSION.rol === 'superadmin' || SESSION.rol === 'admin') {
    document.querySelectorAll('.admin-only').forEach(el => {
      if(el.classList.contains('grid-2')) el.style.display = 'grid'; 
      else el.style.display = 'block';
    });
    
    bBar.style.display = 'flex';
    
    if (SESSION.rol === 'superadmin') {
      bSel.innerHTML = SUCURSALES_LIST.map(s => `<option value="${s.id}">${s.nombre_sucursal}</option>`).join('');
      CURRENT_SUCURSAL = SUCURSALES_LIST[0]?.id;
      if (planActual === 'independiente') bSel.disabled = true;
      else bSel.disabled = false;
    } else {
      var miSede = SUCURSALES_LIST.find(s => s.id === SESSION.sucursal_id);
      bSel.innerHTML = `<option value="${SESSION.sucursal_id}">${miSede ? miSede.nombre_sucursal : 'Mi Local'}</option>`;
      bSel.disabled = true;
      CURRENT_SUCURSAL = SESSION.sucursal_id;
      var btnSede = document.querySelector('button[onclick="crearNuevaSede()"]');
      if(btnSede) btnSede.style.display = 'none';
    }
    
    if (planActual === 'independiente') {
      var aptB = document.getElementById('aptBarbero'); if(aptB) aptB.parentElement.style.display = 'none';
      var mE = document.getElementById('mEmpId'); if(mE) { mE.previousElementSibling.style.display = 'none'; mE.style.display = 'none'; }
      var topB = document.getElementById('topBarberosCard'); if(topB) topB.style.display = 'none';
    }
  } else {
    var miSede = SUCURSALES_LIST.find(s => s.id === SESSION.sucursal_id);
    bSel.innerHTML = `<option value="${SESSION.sucursal_id}">${miSede ? miSede.nombre_sucursal : 'Mi Local'}</option>`;
    bSel.disabled = true;
    CURRENT_SUCURSAL = SESSION.sucursal_id;
    bBar.style.display = 'flex';
    
    var tCaja = document.getElementById('tabCaja'); if(tCaja) tCaja.style.display = 'none';
    var tConf = document.getElementById('tabConfig'); if(tConf) tConf.style.display = 'none';
    
    var aptBarbero = document.getElementById('aptBarbero');
    if(aptBarbero) aptBarbero.parentElement.style.display = 'none';
    var mEmpId = document.getElementById('mEmpId');
    if(mEmpId) { mEmpId.previousElementSibling.style.display = 'none'; mEmpId.style.display = 'none'; }
  }

  buildDayTabs();
  document.getElementById('aptDate').value = new Date().toISOString().split('T')[0];
  document.getElementById('cfgRequiredCuts').value = configData.requiredCuts || 6;
  document.getElementById('cfgPromoName').value = configData.promoName || 'Corte Gratis';
  document.getElementById('cfgFidelidadActiva').checked = configData.fidelidadActiva !== false;
  toggleFidelidadUI();
  renderServiciosDropdowns();
  renderServiciosConfig();
  loadCuponesBD();
  changeBranch();
  activarTiempoReal();
  
  showToast(`Bienvenido, ${SESSION.nombre.split(' ')[0]} 👋`, 'success');
}

function changeBranch() {
  CURRENT_SUCURSAL = document.getElementById('branchSelector').value;
  var urlActual = window.location.href.split('?')[0].replace('index.html', '');
  if (!urlActual.endsWith('/')) urlActual += '/';
  document.getElementById('miLinkReserva').innerText = urlActual + 'reservas.html?sucursal=' + CURRENT_SUCURSAL;
  
  loadBarberosConfig();
  loadSedeConfig();
  loadData();
}

/* ─── GESTIÓN DE SEDES Y LÍMITES ─── */
function loadSedeConfig() {
  var sede = SUCURSALES_LIST.find(s => s.id == CURRENT_SUCURSAL);
  if(sede) {
    var inName = document.getElementById('cfgSedeName'); if(inName) inName.value = sede.nombre_sucursal || '';
    var inAddr = document.getElementById('cfgSedeAddress'); if(inAddr) inAddr.value = sede.direccion || '';
    var inMsg = document.getElementById('cfgSedeMsg'); if(inMsg) inMsg.value = sede.mensaje_cierre || '';
    
    var btn = document.getElementById('branchStatusBtn');
    var lbl = document.getElementById('lblStatus');
    if(btn && lbl) {
      if(sede.activa !== false) {
        btn.className = 'badge badge-green';
        lbl.innerText = 'Activa';
      } else {
        btn.className = 'badge badge-red';
        lbl.innerText = 'Cerrada';
      }
    }
  }
}

async function updateSedeActual() {
  var n = document.getElementById('cfgSedeName').value.trim();
  var d = document.getElementById('cfgSedeAddress').value.trim();
  var m = document.getElementById('cfgSedeMsg') ? document.getElementById('cfgSedeMsg').value.trim() : '';
  
  if(!n) return showToast('El nombre de la sede es obligatorio', 'error');

  var { error } = await sb.from('sucursales').update({ nombre_sucursal: n, direccion: d, mensaje_cierre: m }).eq('id', CURRENT_SUCURSAL);
  if(error) return showToast('Error al guardar', 'error');

  showToast('Datos de sede actualizados', 'success');
  var sIndex = SUCURSALES_LIST.findIndex(s => s.id == CURRENT_SUCURSAL);
  if(sIndex > -1) { 
    SUCURSALES_LIST[sIndex].nombre_sucursal = n; 
    SUCURSALES_LIST[sIndex].direccion = d; 
    SUCURSALES_LIST[sIndex].mensaje_cierre = m;
  }
  
  var opt = document.querySelector(`#branchSelector option[value="${CURRENT_SUCURSAL}"]`);
  if(opt) opt.text = n;
}

async function toggleEstadoSede() {
  var sede = SUCURSALES_LIST.find(s => s.id == CURRENT_SUCURSAL);
  var nuevoEstado = sede.activa === false ? true : false; 
  
  var { error } = await sb.from('sucursales').update({ activa: nuevoEstado }).eq('id', CURRENT_SUCURSAL);
  if(error) return showToast('Error al cambiar estado', 'error');
  
  sede.activa = nuevoEstado;
  showToast(nuevoEstado ? 'Sede Abierta' : 'Sede Cerrada Temporalmente', 'info');
  loadSedeConfig();
}

async function crearNuevaSede() {
  var planActual = SESSION.negocios.plan || 'equipo';
  if(planActual === 'independiente') return showToast('El Plan Independiente no permite sedes.', 'error');

  var { count } = await sb.from('sucursales').select('*', { count: 'exact', head: true }).eq('negocio_id', SESSION.negocio_id);

  if(planActual === 'equipo' && count >= 2) {
    abrirConfirm('Límite de Sedes', 'El Plan Equipo permite un máximo de 2 sedes. Mejora al Plan Empresarial para expandirte sin límites.', () => {
      window.open(`https://wa.me/${WA_SOPORTE}?text=Hola,%20quiero%20mejorar%20mi%20plan%20a%20Empresarial%20para%20crear%20más%20sedes.`, '_blank');
    }, '🚀');
    return;
  }

  document.getElementById('newSedeNameInput').value = '';
  document.getElementById('modalNuevaSede').style.display = 'flex';
}

async function guardarNuevaSede(btnObj) {
  var nombreNueva = document.getElementById('newSedeNameInput').value.trim();
  if(!nombreNueva) return showToast('Escribe un nombre para la sede', 'error');

  var textoOriginal = btnObj.innerHTML;
  btnObj.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creando...';
  btnObj.disabled = true;

  var { data, error } = await sb.from('sucursales').insert([{ negocio_id: SESSION.negocio_id, nombre_sucursal: nombreNueva }]).select().single();
  
  btnObj.innerHTML = textoOriginal;
  btnObj.disabled = false;

  if(error) return showToast('Error al crear sede', 'error');

  document.getElementById('modalNuevaSede').style.display = 'none';
  showToast('Nueva Sede creada', 'success');
  
  SUCURSALES_LIST.push(data);
  var bSel = document.getElementById('branchSelector');
  bSel.innerHTML += `<option value="${data.id}">${data.nombre_sucursal}</option>`;
  bSel.value = data.id;
  changeBranch();
}

function logout() {
  abrirConfirm('Cerrar Sesión', '¿Seguro que deseas salir del sistema?', async () => {
    await sb.auth.signOut(); 
    localStorage.removeItem('barberpro_session'); 
    sessionStorage.removeItem('barberpro_session'); 
    location.reload();
  }, '🔒');
}

function goPage(pageId, btn) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.tab-item').forEach(t => t.classList.remove('active'));
  document.getElementById('page-' + pageId).classList.add('active');
  btn.classList.add('active');
  if (pageId === 'metricas') renderChart();
}

function setPeriod(days, btn) {
  PERIOD_DAYS = days;
  document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderChart();
}

async function loadData() { 
  renderApts(); 
  renderClients(); 
  renderChart(); 
  actualizarDashboardRapido();
}

/* ─── CATÁLOGO ─── */
function renderServiciosDropdowns() {
  var checks = configData.servicios.map((s, i) => `
    <label style="display:flex; align-items:center; gap:8px; font-size:13px; margin-bottom:8px; cursor:pointer;">
      <input type="checkbox" class="srv-checkbox-apt" value="${s.nombre}" ${i===0?'checked':''}>
      ${s.nombre}
    </label>
  `).join('');
  
  if(document.getElementById('aptServiciosChecklist')) document.getElementById('aptServiciosChecklist').innerHTML = checks || '<p style="font-size:12px; color:var(--muted);">Sin servicios</p>';
  
  var checksModal = configData.servicios.map((s, i) => `
    <label style="display:flex; align-items:center; gap:8px; font-size:13px; margin-bottom:8px; cursor:pointer;">
      <input type="checkbox" class="srv-checkbox" value="${s.nombre}" data-precio="${s.precio}" onchange="updatePrecioModal()" ${i===0?'checked':''}>
      ${s.nombre} — <span style="color:var(--success); font-family:'Space Mono';">S/${parseFloat(s.precio).toFixed(2)}</span>
    </label>
  `).join('');
  if(document.getElementById('mServiciosChecklist')) document.getElementById('mServiciosChecklist').innerHTML = checksModal || '<p style="font-size:12px; color:var(--muted);">Sin servicios</p>';
}

function renderServiciosConfig() {
  document.getElementById('cfgServiciosList').innerHTML = (configData.servicios || []).map(s => `
    <div class="srv-item">
      <div class="srv-name">${s.nombre}</div>
      <div style="display:flex; align-items:center; gap:10px;">
        <span class="srv-price">S/ ${s.precio}</span>
        <button onclick="removeServicioConfig(${s.id})" style="background:none; border:none; color:var(--danger); cursor:pointer;"><i class="fas fa-trash-alt"></i></button>
      </div>
    </div>`).join('') || '<p style="text-align:center; color:var(--muted); font-size:12px; padding:10px;">Sin servicios</p>';
}

function addServicioConfig() {
  var n = document.getElementById('newSrvName').value.trim();
  var p = parseFloat(document.getElementById('newSrvPrice').value) || 0;
  if (!n) return showToast('Escribe un nombre', 'error');
  configData.servicios.push({ id: Date.now(), nombre: n, precio: p });
  document.getElementById('newSrvName').value = '';
  document.getElementById('newSrvPrice').value = '';
  renderServiciosConfig(); renderServiciosDropdowns();
}

function removeServicioConfig(id) {
  configData.servicios = configData.servicios.filter(s => s.id !== id);
  renderServiciosConfig(); renderServiciosDropdowns();
}

function updatePrecioModal() {
  var checkboxes = document.querySelectorAll('.srv-checkbox:checked');
  var precioTotal = 0;
  checkboxes.forEach(chk => {
    precioTotal += parseFloat(chk.getAttribute('data-precio')) || 0;
  });
  document.getElementById('mPrecio').value = precioTotal;
  updateCobroPreview();
}

if(document.getElementById('mPrecio')) document.getElementById('mPrecio').addEventListener('input', updateCobroPreview);
if(document.getElementById('mEmpId')) document.getElementById('mEmpId').addEventListener('change', updateCobroPreview);

async function saveConfig() {
  await sb.from('negocios').update({ configuracion: configData }).eq('id', SESSION.negocio_id);
  SESSION.negocios.configuracion = configData;
  localStorage.setItem('barberpro_session', JSON.stringify(SESSION));
  showToast('Catálogo guardado', 'success');
}

function toggleFidelidadUI() {
  var isActiva = document.getElementById('cfgFidelidadActiva').checked;
  document.getElementById('fidelidadSettings').style.opacity = isActiva ? '1' : '0.3';
  document.getElementById('fidelidadSettings').style.pointerEvents = isActiva ? 'auto' : 'none';
}

async function saveConfigFidelidad() {
  configData.fidelidadActiva = document.getElementById('cfgFidelidadActiva').checked;
  configData.requiredCuts = parseInt(document.getElementById('cfgRequiredCuts').value) || 6;
  configData.promoName = document.getElementById('cfgPromoName').value.trim() || 'Corte Gratis';
  
  await sb.from('negocios').update({ configuracion: configData }).eq('id', SESSION.negocio_id);
  SESSION.negocios.configuracion = configData;
  localStorage.setItem('barberpro_session', JSON.stringify(SESSION));
  
  showToast('Programa de fidelidad actualizado', 'success');
  renderClients(); 
}

/* ─── GESTIÓN DE CUPONES ─── */
async function loadCuponesBD() {
  if (!SESSION || SESSION.rol !== 'admin') return;
  var { data } = await sb.from('cupones').select('*').eq('negocio_id', SESSION.negocio_id).order('created_at', { ascending: false });
  
  document.getElementById('cfgCuponesList').innerHTML = (data || []).map(c => {
    var vencido = new Date(c.fecha_caducidad + 'T23:59:59') < new Date();
    var agotado = c.usos_actuales >= c.stock_total;
    var color = (vencido || agotado) ? 'var(--danger)' : 'var(--gold)';
    
    return `
    <div class="srv-item" style="border-left: 3px solid ${color}; flex-direction:column; align-items:start; gap:4px; padding:12px;">
      <div style="display:flex; justify-content:space-between; width:100%; align-items:center;">
        <div class="srv-name" style="font-family:'Space Mono'; color:var(--gold); font-size:14px;">
          ${c.codigo} ${vencido ? '🛑 Vencido' : agotado ? '🚫 Agotado' : '✅'}
        </div>
        <div style="display:flex; align-items:center; gap:10px;">
          <span class="srv-price">${c.tipo === 'porcentaje' ? '-' + c.valor + '%' : '-S/' + c.valor}</span>
          <button onclick="eliminarCuponBD('${c.id}')" style="background:none; border:none; color:var(--danger); cursor:pointer;"><i class="fas fa-trash-alt"></i></button>
        </div>
      </div>
      <div style="display:flex; justify-content:space-between; width:100%; font-size:10px; color:var(--muted); font-weight:600;">
        <span>STOCK: ${c.usos_actuales} / ${c.stock_total}</span>
        <span>VENCE: ${c.fecha_caducidad}</span>
        <span>LÍMITE: ${c.limite_por_cliente} uso(s)</span>
      </div>
    </div>`;
  }).join('') || '<p style="text-align:center; color:var(--muted); font-size:11px; padding:20px;">No has creado cupones aún.</p>';
}

async function crearCuponBD() {
  var code = document.getElementById('newCupCode').value.trim().toUpperCase();
  var val = parseFloat(document.getElementById('newCupVal').value);
  var tipo = document.getElementById('newCupTipo').value;
  var fecha = document.getElementById('newCupDate').value;
  var stock = parseInt(document.getElementById('newCupStock').value);
  var limite = parseInt(document.getElementById('newCupLimit').value);

  if (!code || !val || !fecha || !stock) return showToast('Completa todos los campos', 'error');

  var { error } = await sb.from('cupones').insert([{
    negocio_id: SESSION.negocio_id, codigo: code, tipo: tipo, valor: val,
    fecha_caducidad: fecha, stock_total: stock, limite_por_cliente: limite
  }]);

  if (error) return showToast('Error: Código duplicado o inválido', 'error');
  
  showToast('Cupón creado', 'success');
  loadCuponesBD();
}

async function eliminarCuponBD(id) {
  abrirConfirm('Eliminar Cupón', '¿Deseas eliminar esta promoción?', async () => {
    await sb.from('cupones').delete().eq('id', id);
    loadCuponesBD();
  });
}

/* ─── BARBEROS Y EQUIPO ─── */
async function loadBarberosConfig() {
 var { data } = await sb.from('empleados').select('*').eq('sucursal_id', CURRENT_SUCURSAL).eq('activo', true).order('created_at', { ascending: true });
  
  document.getElementById('barberosList').innerHTML = (data || []).map(b => {
    var pagoTag = b.tipo_pago === 'fijo' ? `<span class="barbero-com" style="background:var(--blue-dim); color:var(--blue);">S/ ${b.pago_fijo} / día</span>` : `<span class="barbero-com">${b.comision_porcentaje}% comis.</span>`;
    var rolTag = b.rol === 'admin' ? `<span class="badge badge-gold" style="margin-left:6px; font-size:8px;">MANAGER</span>` : (b.rol === 'superadmin' ? `<span class="badge badge-blue" style="margin-left:6px; font-size:8px;">SÚPER ADMIN</span>` : '');
    
    return `
    <div class="barbero-item" style="flex-wrap:wrap; position:relative;">
      <div style="display:flex; width:100%; align-items:center; gap:12px;">
        <div class="barbero-dot"></div>
        <div class="barbero-info" style="flex:1;">
          <div class="barbero-name">${b.nombre} ${rolTag}</div>
          <div class="barbero-user">@${b.usuario}</div>
        </div>
        ${pagoTag}
      </div>
      <div style="display:flex; gap:8px; width:100%; margin-top:10px;">
        <button onclick="abrirModalEditarBarbero('${b.id}', '${b.nombre}', '${b.usuario}', '${b.comision_porcentaje}', '${b.sucursal_id}', '${b.tipo_pago}', '${b.pago_fijo}', '${b.rol}')" class="btn btn-secondary btn-sm" style="flex:1; border-color:var(--border2); color:var(--blue);">
          <i class="fas fa-edit"></i> Editar
        </button>
      </div>
    </div>`;
  }).join('') || '<p style="color:var(--muted); font-size:12px;">Sin barberos en esta sede</p>';

  var opts = (data || []).map(b => `<option value="${b.id}" data-tipo="${b.tipo_pago || 'comision'}" data-com="${b.comision_porcentaje}" data-fijo="${b.pago_fijo}">${b.nombre}</option>`).join('');
  var aptBarbero = document.getElementById('aptBarbero'); if(aptBarbero) aptBarbero.innerHTML = opts;
  var mEmpId = document.getElementById('mEmpId'); if(mEmpId) mEmpId.innerHTML = opts;
}

function abrirModalHorario(id, nombre, hi, hf, di, df) {
  document.getElementById('hEmpId').value = id;
  document.getElementById('horarioEmpName').innerText = nombre;
  document.getElementById('hInicio').value = hi.substring(0,5);
  document.getElementById('hFin').value = hf.substring(0,5);
  document.getElementById('dInicio').value = di.substring(0,5);
  document.getElementById('dFin').value = df.substring(0,5);
  document.getElementById('modalHorario').style.display = 'flex';
}

async function guardarHorarioEmpleado(btnObj) {
  var id = document.getElementById('hEmpId').value;
  var hi = document.getElementById('hInicio').value;
  var hf = document.getElementById('hFin').value;
  var di = document.getElementById('dInicio').value;
  var df = document.getElementById('dFin').value;
  if(!hi || !hf || !di || !df) return showToast('Completa todas las horas', 'error');

  btnObj.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...'; btnObj.disabled = true;
  var { error } = await sb.from('empleados').update({ hora_inicio: hi, hora_fin: hf, descanso_inicio: di, descanso_fin: df }).eq('id', id);
  btnObj.innerHTML = '<i class="fas fa-save"></i> Guardar Horario'; btnObj.disabled = false;

  if(error) return showToast('Error al guardar en BD', 'error');
  document.getElementById('modalHorario').style.display = 'none';
  showToast('Horario actualizado', 'success'); loadBarberosConfig();
}

function togglePagoModo(prefix) {
  var tipo = document.getElementById(prefix + 'BarbTipoPago');
  if(!tipo) return; 
  var valor = tipo.value;
  var lbl = document.getElementById('lbl' + (prefix === 'new' ? 'New' : 'Edit') + 'BarbMonto');
  if(lbl) {
    if(valor === 'comision') {
      lbl.innerText = '% de Comisión por Corte';
    } else {
      lbl.innerText = 'Monto Fijo Diario (S/)';
    }
  }
}

async function addBarbero() {
  var n = document.getElementById('newBarbName').value.trim();
  var u = document.getElementById('newBarbUser').value.trim();
  var p = document.getElementById('newBarbPass').value.trim();
  var tipoPago = document.getElementById('newBarbTipoPago').value;
  var monto = parseFloat(document.getElementById('newBarbMonto').value) || 0;
  var rolElegido = document.getElementById('newBarbRol') ? document.getElementById('newBarbRol').value : 'barbero';

  if (!n || !u || !p) return showToast('Faltan datos', 'error');
  if (!u.includes('@')) return showToast('Debes ingresar un correo electrónico válido', 'error');
  u = u.toLowerCase();

  var comision = tipoPago === 'comision' ? monto : 0;
  var fijo = tipoPago === 'fijo' ? monto : 0;

  var { error } = await sb.from('empleados').insert([{ 
    negocio_id: SESSION.negocio_id, 
    sucursal_id: CURRENT_SUCURSAL, 
    nombre: n, 
    usuario: u, 
    clave: p, 
    rol: rolElegido, 
    tipo_pago: tipoPago,
    comision_porcentaje: comision, 
    pago_fijo: fijo,
    activo: true
  }]);

  if (error) return showToast('Error o usuario duplicado', 'error');
  showToast('Empleado agregado', 'success');
  document.getElementById('newBarbName').value = ''; 
  document.getElementById('newBarbUser').value = ''; 
  document.getElementById('newBarbPass').value = '';
  loadBarberosConfig();
}

function abrirModalEditarBarbero(id, nombre, usr, com, sucId, tipoPago, pagoFijo, rolActual) {
  document.getElementById('editBarbId').value = id;
  document.getElementById('editBarbName').value = nombre;
  document.getElementById('editBarbUser').value = usr;
  document.getElementById('editBarbPass').value = ''; 

  var selectRol = document.getElementById('editBarbRol');
  if(selectRol) {
    selectRol.value = rolActual || 'barbero';
    selectRol.disabled = (SESSION.rol !== 'superadmin' || id === SESSION.id);
  }

  var selectTipo = document.getElementById('editBarbTipoPago');
  selectTipo.value = tipoPago === 'undefined' || !tipoPago ? 'comision' : tipoPago;

  var inputMonto = document.getElementById('editBarbMonto');
  inputMonto.value = selectTipo.value === 'fijo' ? pagoFijo : com;
  togglePagoModo('edit'); 

  var selectSede = document.getElementById('editBarbSede');
  selectSede.innerHTML = SUCURSALES_LIST.map(s => `<option value="${s.id}">${s.nombre_sucursal}</option>`).join('');
  selectSede.value = sucId; 
  selectSede.disabled = SESSION.rol !== 'superadmin';

  document.getElementById('modalEditarBarbero').style.display = 'flex';
}

async function guardarEdicionBarbero(btnObj) {
  var id = document.getElementById('editBarbId').value;
  var n = document.getElementById('editBarbName').value.trim();
  var u = document.getElementById('editBarbUser').value.trim();
  var p = document.getElementById('editBarbPass').value.trim();
  var tipoPago = document.getElementById('editBarbTipoPago').value;
  var monto = parseFloat(document.getElementById('editBarbMonto').value) || 0;
  var s = document.getElementById('editBarbSede').value;
  var rolNuevo = document.getElementById('editBarbRol') ? document.getElementById('editBarbRol').value : null;
  
  if(!n || !u) return showToast('Nombre y usuario son obligatorios', 'error');

  var comision = tipoPago === 'comision' ? monto : 0;
  var fijo = tipoPago === 'fijo' ? monto : 0;

  var payload = { 
    nombre: n, 
    usuario: u, 
    tipo_pago: tipoPago,
    comision_porcentaje: comision, 
    pago_fijo: fijo,
    sucursal_id: s 
  };
  
  if (rolNuevo && SESSION.rol === 'superadmin' && id !== SESSION.id) {
    payload.rol = rolNuevo;
  }
  
  if (p !== '') payload.clave = p; 

  btnObj.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...'; btnObj.disabled = true;
  var { error } = await sb.from('empleados').update(payload).eq('id', id);
  btnObj.innerHTML = '<i class="fas fa-save"></i> Guardar Cambios'; btnObj.disabled = false;

  if (error) return showToast('Error: Usuario duplicado', 'error');
  
  document.getElementById('modalEditarBarbero').style.display = 'none';
  showToast('Datos actualizados', 'success');
  loadBarberosConfig();
}

function eliminarBarbero() {
  var id = document.getElementById('editBarbId').value;
  var usr = document.getElementById('editBarbUser').value;
  
  abrirConfirm('Eliminar Barbero', '¿Estás seguro de que quieres dar de baja a este empleado? Ya no podrá acceder al sistema.', async () => {
    var { error } = await sb.from('empleados').update({ 
      activo: false,
      usuario: usr + '_baja_' + Date.now() 
    }).eq('id', id);
    
    if(error) return showToast('Error al eliminar', 'error');
    
    document.getElementById('modalEditarBarbero').style.display = 'none';
    showToast('Empleado eliminado', 'success');
    loadBarberosConfig();
  }, '🛑');
}

/* ─── CLIENTES ─── */
function filterClients() {
  var input = document.getElementById('cliSearch').value.toLowerCase();
  document.querySelectorAll('.cli-item').forEach(i => {
    i.style.display = i.getAttribute('data-name').toLowerCase().includes(input) ? 'flex' : 'none';
  });
}

async function renderClients() {
  var { data } = await sb.from('clientes').select('*').eq('negocio_id', SESSION.negocio_id).order('created_at', { ascending: false });
  
  var isFidelidad = configData.fidelidadActiva !== false;
  var rc = configData.requiredCuts || 6;
  
  var dataFiltrada = (data || []).filter(c => c.whatsapp !== '000000000');
  var premios = dataFiltrada.filter(c => c.cortes_acumulados >= rc).length;
  
  document.getElementById('cliTotal').innerText = dataFiltrada.length;
  document.getElementById('cliPremios').innerText = premios;
  document.getElementById('clientStats').style.display = isFidelidad ? 'grid' : 'none';

  if (!dataFiltrada.length) {
    document.getElementById('cliList').innerHTML = '<div class="empty-state"><i class="fas fa-users"></i><p>Sin clientes registrados</p></div>';
    return;
  }

  document.getElementById('cliList').innerHTML = dataFiltrada.map(c => {
    var done = c.cortes_acumulados >= rc;
    var pct = Math.min(100, (c.cortes_acumulados / rc) * 100);
    var phone = c.whatsapp?.replace('51', '') || '—';
    var barraHTML = isFidelidad ? `
        <div class="loyalty-bar">
          <div class="loyalty-track">
            <div class="loyalty-fill ${done ? 'done' : 'progress'}" style="width:${pct}%;"></div>
          </div>
          <div class="loyalty-label">${done ? '🎁 ' + configData.promoName : c.cortes_acumulados + ' / ' + rc + ' cortes'}</div>
        </div>` : '';

    return `<div class="cli-item" data-name="${c.nombre}">
      <div class="cli-avatar">${initials(c.nombre)}</div>
      <div class="cli-info">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <div class="cli-name">${c.nombre}</div>
          <button onclick="abrirEditarCliente('${c.id}', '${c.nombre.replace(/'/g, "\\'")}', '${c.whatsapp}')" style="background:none; border:none; color:var(--blue); cursor:pointer;"><i class="fas fa-pen"></i></button>
        </div>
        <div class="cli-phone">${phone}</div>
        ${barraHTML}
      </div>
      <div class="cli-action" style="display:flex; flex-direction:column; gap:6px; min-width:80px;">
        ${(!done || !isFidelidad)
          ? `<button onclick="abrirModalCobro('${c.id}','${c.whatsapp}',${c.cortes_acumulados},null,null,'${SESSION.id}')" class="btn btn-secondary btn-sm" style="width:100%;"><i class="fas fa-plus"></i> Visita</button>`
          : `<button onclick="reiniciarCorte('${c.id}')" class="btn btn-success btn-sm" style="width:100%;"><i class="fas fa-gift"></i> Canjear</button>`}
        <button onclick="verHistorial('${c.id}', '${c.nombre.replace(/'/g, "\\'")}')" class="btn btn-secondary btn-sm" style="width:100%; background:transparent; border-color:var(--border2); color:var(--blue);"><i class="fas fa-history"></i> 2 Meses</button>
      </div>
    </div>`;
  }).join('');
}

async function addClient() {
  var n = document.getElementById('cliName').value.trim();
  var p = document.getElementById('cliPhone').value.trim();
  if (!n || !p) return showToast('Completa los datos', 'error');

  var wpFormateado = formatPhone(p);

  var { data: existe } = await sb.from('clientes')
    .select('id')
    .eq('negocio_id', SESSION.negocio_id)
    .eq('whatsapp', wpFormateado)
    .maybeSingle();

  if (existe) {
    return showToast('Este número de WhatsApp ya está registrado', 'error');
  }

  var planActual = SESSION.negocios.plan || 'equipo';
  var limiteClientes = (planActual === 'empresarial') ? 1000 : 100;

  var { count } = await sb.from('clientes').select('*', { count: 'exact', head: true }).eq('negocio_id', SESSION.negocio_id);

  if (count >= limiteClientes) {
    abrirConfirm('Límite Alcanzado', `Tu plan actual permite registrar hasta ${limiteClientes} clientes. Mejora al Plan Empresarial para seguir creciendo.`, () => {
      window.open(`https://wa.me/${WA_SOPORTE}?text=Hola,%20quiero%20mejorar%20mi%20SaaS%20al%20Plan%20Empresarial%20para%20más%20clientes.`, '_blank');
    }, '🚀');
    return;
  }

  var { error } = await sb.from('clientes').insert([{ negocio_id: SESSION.negocio_id, nombre: n, whatsapp: wpFormateado, cortes_acumulados: 0 }]);
  if (error) return showToast('Error al guardar', 'error');
  
  document.getElementById('cliName').value = '';
  document.getElementById('cliPhone').value = '';
  showToast('Cliente registrado exitosamente', 'success');
  renderClients();
}

function abrirModalCobro(cliId, cliPhone, cliCortes, aptId = null, srvSugerido = null, empIdSugerido = null) {
  CUPON_APLICADO = null;
  
  var chk = document.getElementById('mSendWa');
  if(chk) { chk.checked = true; chk.parentElement.style.display = 'flex'; }
  var cupContainer = document.getElementById('mCupInput')?.parentElement;
  if(cupContainer) { cupContainer.style.display = 'flex'; cupContainer.previousElementSibling.style.display = 'block'; }
  
  var cupInput = document.getElementById('mCupInput'); if(cupInput) cupInput.value = '';
  var msg = document.getElementById('cupStatusMsg'); if(msg) msg.style.display = 'none';

  document.getElementById('mCliId').value = cliId;
  document.getElementById('mCliPhone').value = cliPhone;
  document.getElementById('mCliCortes').value = cliCortes;
  document.getElementById('mAptId').value = aptId || '';
  document.getElementById('cobroClienteNombre').innerText = 'Registrando servicio...';

  var mE = document.getElementById('mEmpId');
  if (mE && mE.options && empIdSugerido) {
    for (var i = 0; i < mE.options.length; i++) {
      if (mE.options[i].value === empIdSugerido) mE.selectedIndex = i;
    }
  }

  var checkboxes = document.querySelectorAll('.srv-checkbox');
  checkboxes.forEach(c => c.checked = false); 

  if (srvSugerido) {
    checkboxes.forEach(c => {
      if (srvSugerido.includes(c.value)) c.checked = true; 
    });
  } else {
    if(checkboxes.length > 0) checkboxes[0].checked = true;
  }

  updatePrecioModal();
  document.getElementById('modalCobro').style.display = 'flex';
}

/* ─── LÓGICA DE COBRO Y CUPONES ─── */
var CUPON_APLICADO = null;

async function validarCuponCobro() {
  var code = document.getElementById('mCupInput').value.trim().toUpperCase();
  var msg = document.getElementById('cupStatusMsg');
  var cliId = document.getElementById('mCliId').value;
  
  if (!code) return;
  
  msg.style.display = 'block'; msg.style.color = 'var(--gold)'; msg.innerText = "Verificando...";
  
  var { data: cup, error } = await sb.from('cupones').select('*').eq('negocio_id', SESSION.negocio_id).eq('codigo', code).maybeSingle();
  
  if (!cup) return mostrarErrorCupon("Este cupón no existe");
  if (new Date(cup.fecha_caducidad + 'T23:59:59') < new Date()) return mostrarErrorCupon("Cupón vencido");
  if (cup.usos_actuales >= cup.stock_total) return mostrarErrorCupon("Stock de cupones agotado");

  var { count } = await sb.from('historial_servicios').select('*', { count: 'exact', head: true }).eq('cliente_id', cliId).eq('cupon_codigo', code);
  if (count >= cup.limite_por_cliente) return mostrarErrorCupon(`Límite alcanzado (${cup.limite_por_cliente} uso máximo por cliente)`);

  CUPON_APLICADO = cup;
  msg.style.color = 'var(--success)';
  msg.innerText = `✅ Cupón aplicado: -${cup.tipo === 'porcentaje' ? cup.valor+'%' : 'S/'+cup.valor}`;
  updateCobroPreview(); 
}

function mostrarErrorCupon(texto) {
  CUPON_APLICADO = null;
  var msg = document.getElementById('cupStatusMsg');
  msg.style.display = 'block'; msg.style.color = 'var(--danger)';
  msg.innerText = "❌ " + texto;
  updateCobroPreview();
}

function updateCobroPreview() {
  var precioBase = parseFloat(document.getElementById('mPrecio').value) || 0;
  var descuento = 0;

  if (CUPON_APLICADO) {
    descuento = CUPON_APLICADO.tipo === 'porcentaje' ? (precioBase * CUPON_APLICADO.valor / 100) : CUPON_APLICADO.valor;
  }

  var totalFinal = Math.max(0, precioBase - descuento);
  
  var empSel = document.getElementById('mEmpId');
  var opt = empSel.options[empSel.selectedIndex];
  var tipoPago = opt ? opt.getAttribute('data-tipo') : 'comision';
  var com = parseFloat(opt ? opt.getAttribute('data-com') : 0) || 0;
  
  var comCalc = 0;
  var textoComision = '';

  if (tipoPago === 'comision') {
    comCalc = (totalFinal * com) / 100;
    textoComision = fmtMoney(comCalc) + ` (${com}%)`;
  } else {
    comCalc = 0;
    textoComision = `S/ 0.00 (Pago Fijo)`;
  }
  
  var neto = totalFinal - comCalc;
  
  var mPrecioVis = document.getElementById('mPrecioVisual');
  if(mPrecioVis) mPrecioVis.innerText = totalFinal.toFixed(2);
  
  document.getElementById('prevComision').innerText = textoComision;
  document.getElementById('prevNeto').innerText = fmtMoney(neto);
  document.getElementById('cobroPreview').style.display = precioBase > 0 ? 'block' : 'none';
}

async function procesarCobro() {
  var id = document.getElementById('mCliId').value; 
  var phone = document.getElementById('mCliPhone').value;
  var actuales = parseInt(document.getElementById('mCliCortes').value) || 0;
  var aptId = document.getElementById('mAptId').value;
  var empSelect = document.getElementById('mEmpId');
  var empId = empSelect.value;
  var empNombre = empSelect.options[empSelect.selectedIndex].text;
  var porcentaje = parseFloat(empSelect.options[empSelect.selectedIndex]?.getAttribute('data-com')) || 0;
  
  var checkboxes = document.querySelectorAll('.srv-checkbox:checked');
  var serviciosSeleccionados = [];
  checkboxes.forEach(chk => serviciosSeleccionados.push(chk.value));
  var servicio = serviciosSeleccionados.join(' + ');

  if (serviciosSeleccionados.length === 0) return showToast('Selecciona al menos un servicio', 'error');

  var precioBase = parseFloat(document.getElementById('mPrecio').value) || 0;
  var descuentoCalc = 0;
  if (CUPON_APLICADO) {
    descuentoCalc = CUPON_APLICADO.tipo === 'porcentaje' ? (precioBase * CUPON_APLICADO.valor / 100) : CUPON_APLICADO.valor;
  }
  var totalFinal = Math.max(0, precioBase - descuentoCalc);
  var comisionCalc = (totalFinal * porcentaje) / 100;

  var { error: errCobro } = await sb.from('historial_servicios').insert([{
    sucursal_id: CURRENT_SUCURSAL, 
    cliente_id: id ? id : null, 
    empleado_id: empId,
    servicio_realizado: servicio, 
    monto: totalFinal, 
    comision_generada: comisionCalc,
    cupon_codigo: CUPON_APLICADO ? CUPON_APLICADO.codigo : null,
    descuento_aplicado: descuentoCalc
  }]);

  if (errCobro) return alert("❌ Error al guardar el cobro: " + errCobro.message);

  document.getElementById('modalCobro').style.display = 'none';
  
  var isFidelidad = configData.fidelidadActiva !== false;
  var nuevosCortes = isFidelidad ? actuales + 1 : actuales;

  if (isFidelidad && id) {
    await sb.from('clientes').update({ cortes_acumulados: nuevosCortes }).eq('id', id);
  }

  if (CUPON_APLICADO) {
    await sb.from('cupones').update({ usos_actuales: CUPON_APLICADO.usos_actuales + 1 }).eq('id', CUPON_APLICADO.id);
  }

  if (aptId) { await sb.from('citas').delete().eq('id', aptId); renderApts(); }

  var rc = configData.requiredCuts || 6;
  var faltan = rc - nuevosCortes;
  var sedeTxt = document.getElementById('branchSelector').options[document.getElementById('branchSelector').selectedIndex].text;
  
  var chkWa = document.getElementById('mSendWa');
  if (id && (!chkWa || chkWa.checked)) {
    var msg = '';
    if (!isFidelidad) {
      msg = `💈 *TICKET DE SERVICIO*\n🏪 Sede: ${sedeTxt}\n\n✂️ Servicio: ${servicio}\n👤 Atendido por: ${empNombre}\n💰 Total: S/ ${totalFinal.toFixed(2)} ${CUPON_APLICADO ? '(Descuento aplicado 🎉)' : ''}\n\n¡Gracias por tu preferencia!`;
    } else {
      msg = faltan > 0 
        ? `💈 *TICKET DE SERVICIO*\n🏪 Sede: ${sedeTxt}\n\n✂️ Servicio: ${servicio}\n👤 Atendido por: ${empNombre}\n💰 Total: S/ ${totalFinal.toFixed(2)} ${CUPON_APLICADO ? '(Descuento aplicado 🎉)' : ''}\n\n✅ Tienes ${nuevosCortes} puntos.\n🎁 Te faltan ${faltan} para tu *${configData.promoName}*.\n\n¡Gracias por tu preferencia!` 
        : `🏆 *¡PREMIO DESBLOQUEADO!*\n🏪 Sede: ${sedeTxt}\n\n✂️ Servicio: ${servicio}\n💰 Total: S/ ${totalFinal.toFixed(2)}\n\n✅ Alcanzaste los ${rc} puntos.\n\n¡Felicidades! Tienes tu *${configData.promoName}* listo para tu próxima visita.`;
    }
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank');
  }
    
  if (isFidelidad && nuevosCortes >= rc && id) showToast(`🎁 ¡${configData.promoName} disponible!`, 'success');
  else showToast(`Cobro S/${totalFinal.toFixed(2)} registrado`, 'success');

  CUPON_APLICADO = null; 
  document.getElementById('mCupInput').value = '';
  var msgStatus = document.getElementById('cupStatusMsg'); if(msgStatus) msgStatus.style.display = 'none';
  
  renderClients(); renderChart(); loadCuponesBD(); actualizarDashboardRapido();
}

function reiniciarCorte(id) {
  abrirConfirm('Canjear Premio', `El cliente recibirá "${configData.promoName}" y vuelve a 0 puntos.`, async () => {
    await sb.from('clientes').update({ cortes_acumulados: 0 }).eq('id', id);
    showToast('Premio canjeado 🎁', 'success');
    renderClients();
  }, '🎁');
}

/* ─── AGENDA ─── */
async function renderApts() {
  var dateFilter = SELECTED_APT_DATE || new Date().toISOString().split('T')[0];
  document.getElementById('agendaSubtitle').innerText = 'Citas del ' + new Date(dateFilter + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });

  let q = sb.from('citas').select('*, empleados(nombre)').eq('sucursal_id', CURRENT_SUCURSAL).eq('fecha', dateFilter).order('hora', { ascending: true });
  if (SESSION.rol === 'barbero') q = q.eq('empleado_id', SESSION.id);
  var { data } = await q;

  if (!data || !data.length) {
    document.getElementById('aptList').innerHTML = '<div class="empty-state"><i class="far fa-calendar-check"></i><p>Agenda libre este día</p></div>';
    return;
  }

  document.getElementById('aptList').innerHTML = data.map(a => `
    <div class="apt-item">
      <div class="apt-header">
        <div class="apt-time-badge">
          <div class="time">${a.hora?.slice(0,5) || '—'}</div>
          <div class="date-mini">${new Date(a.fecha + 'T12:00').toLocaleDateString('es-ES', {day:'2-digit', month:'short'})}</div>
        </div>
        <div class="apt-info">
          <div class="apt-name">${a.nombre_cliente}</div>
          <div class="apt-meta"><i class="fas fa-cut" style="opacity:.5;"></i> ${a.servicio}</div>
          <div class="apt-barber"><i class="fas fa-user" style="opacity:.6;"></i> ${a.empleados?.nombre || '—'}</div>
        </div>
      </div>
      <div class="apt-actions">
        <button class="apt-action-btn success" onclick="completarCitaRapida('${a.id}','${a.nombre_cliente}','${a.whatsapp}','${a.servicio}','${a.empleado_id}')"><i class="fas fa-check"></i> Cobrar</button>
        <button class="apt-action-btn primary" onclick="abrirEditarCita('${a.id}', '${a.nombre_cliente}', '${a.whatsapp}')"><i class="fas fa-pen"></i> Editar</button>
        <button class="apt-action-btn danger" onclick="delApt('${a.id}', '${a.whatsapp}')"><i class="fas fa-trash-alt"></i> Anular</button>
      </div>
    </div>`).join('');
}

async function completarCitaRapida(aptId, nombre, phone, servicio, empId) {
  var { data } = await sb.from('clientes').select('*').eq('negocio_id', SESSION.negocio_id).eq('whatsapp', phone).maybeSingle();
  if (data) abrirModalCobro(data.id, data.whatsapp, data.cortes_acumulados, aptId, servicio, empId);
  else {
    var r = await sb.from('clientes').insert([{ negocio_id: SESSION.negocio_id, nombre: nombre, whatsapp: phone, cortes_acumulados: 0 }]).select().single();
    if (r.data) abrirModalCobro(r.data.id, r.data.whatsapp, 0, aptId, servicio, empId);
  }
}

async function addApt() {
  var n = document.getElementById('aptClient').value.trim();
  var p = document.getElementById('aptPhone').value.trim();
  var checkboxes = document.querySelectorAll('.srv-checkbox-apt:checked');
  var serviciosAgendados = [];
  checkboxes.forEach(chk => serviciosAgendados.push(chk.value));
  var s = serviciosAgendados.join(' + ');
  if (serviciosAgendados.length === 0) return showToast('Selecciona un servicio', 'error');
  var f = document.getElementById('aptDate').value;
  var h = document.getElementById('aptTime').value;
  var empId = document.getElementById('aptBarbero').value;
  if (!n || !p || !f || !h || !empId) return showToast('Faltan datos', 'error');
  
  var wp = formatPhone(p);
  await sb.from('citas').insert([{ sucursal_id: CURRENT_SUCURSAL, empleado_id: empId, nombre_cliente: n, whatsapp: wp, servicio: s, fecha: f, hora: h }]);
  
  showToast('Cita agendada', 'success');
  document.getElementById('aptClient').value = '';
  document.getElementById('aptPhone').value = '';
  SELECTED_APT_DATE = f;
  document.querySelectorAll('.day-tab').forEach(b => { b.classList.toggle('active', b.dataset.date === f); });
  renderApts();

  var sedeName = document.getElementById('branchSelector').options[document.getElementById('branchSelector').selectedIndex].text;
  var msgApt = `💈 *CITA CONFIRMADA*\n🏪 ${sedeName}\n\n👤 Cliente: ${n}\n✂️ Servicio: ${s}\n📅 Fecha: ${f}\n⏰ Hora: ${h.substring(0, 5)}\n\n¡Te esperamos!`;
  window.open(`https://wa.me/${wp}?text=${encodeURIComponent(msgApt)}`, '_blank');
}

function delApt(id, wp) {
  abrirConfirm('Eliminar Cita', '¿Confirmas que deseas cancelar esta cita y avisar al cliente?', async () => {
    await sb.from('citas').delete().eq('id', id);
    showToast('Cita eliminada', 'success');
    renderApts();
    var msg = `💈 *CITA CANCELADA*\nHola, te informamos que tu cita ha sido cancelada o reprogramada. Por favor contáctanos si tienes dudas.`;
    window.open(`https://wa.me/${wp}?text=${encodeURIComponent(msg)}`, '_blank');
  }, '🗑️');
}

function abrirEditarCita(id, nombre, wp) {
  document.getElementById('editAptId').value = id;
  document.getElementById('editAptName').value = nombre;
  document.getElementById('editAptPhone').value = wp.replace('51', '');
  document.getElementById('modalEditarCita').style.display = 'flex';
}

async function guardarEdicionCita() {
  var id = document.getElementById('editAptId').value;
  var n = document.getElementById('editAptName').value.trim();
  var p = document.getElementById('editAptPhone').value.trim();
  
  if(!n || !p) return showToast('Completa los datos', 'error');
  
  var wp = formatPhone(p);
  await sb.from('citas').update({ nombre_cliente: n, whatsapp: wp }).eq('id', id);
  
  document.getElementById('modalEditarCita').style.display = 'none';
  showToast('Cita actualizada', 'success');
  renderApts();
}

/* ─── GASTOS ─── */
async function procesarGasto() {
  var desc = document.getElementById('gDesc').value.trim();
  var monto = parseFloat(document.getElementById('gMonto').value) || 0;
  if (!desc || monto <= 0) return showToast('Datos inválidos', 'error');
  await sb.from('gastos').insert([{ sucursal_id: CURRENT_SUCURSAL, empleado_id: SESSION.id, descripcion: desc, monto: monto }]);
  document.getElementById('modalGasto').style.display = 'none';
  document.getElementById('gDesc').value = '';
  document.getElementById('gMonto').value = '';
  showToast('Gasto registrado', 'success');
  renderChart();
}

/* ─── FINANZAS / CHART ─── */
async function renderChart() {
  if (!CURRENT_SUCURSAL) return;
  
  var start;
  if (PERIOD_DAYS === 'turno') {
    var { data: sede } = await sb.from('sucursales').select('ultimo_cierre').eq('id', CURRENT_SUCURSAL).single();
    start = sede?.ultimo_cierre || new Date(new Date().setHours(0,0,0,0)).toISOString();
  } else {
    start = new Date(Date.now() - PERIOD_DAYS * 24 * 60 * 60 * 1000).toISOString();
  }

  let qI = sb.from('historial_servicios').select('*').eq('sucursal_id', CURRENT_SUCURSAL).gte('fecha_servicio', start);
  let qG = sb.from('gastos').select('*').eq('sucursal_id', CURRENT_SUCURSAL).gte('fecha_gasto', start);
  
  if (SESSION.rol === 'barbero') { 
    qI = qI.eq('empleado_id', SESSION.id); 
    qG = qG.eq('empleado_id', SESSION.id); 
  }

  var [{ data: ingresos }, { data: gastos }] = await Promise.all([qI, qG]);
  ingresos = ingresos || [];
  gastos = gastos || [];

  var totalI = ingresos.reduce((a, v) => a + parseFloat(v.monto), 0);
  var totalCom = ingresos.reduce((a, v) => a + parseFloat(v.comision_generada), 0);
  var totalG = gastos.reduce((a, v) => a + parseFloat(v.monto), 0);
  var totalEgresos = totalCom + totalG;
  var neto = totalI - totalEgresos;
  var margen = totalI > 0 ? ((neto / totalI) * 100).toFixed(1) : 0;
  var ticket = ingresos.length > 0 ? (totalI / ingresos.length).toFixed(2) : 0;

  if(document.getElementById('mIngresos')) {
    document.getElementById('mIngresos').innerText = fmtMoney(totalI);
    document.getElementById('mIngresosCount').innerText = ingresos.length + ' servicios';
    document.getElementById('mGastos').innerText = fmtMoney(totalEgresos);
    document.getElementById('mNeto').innerText = fmtMoney(neto);
    document.getElementById('mMargen').innerText = 'Margen: ' + margen + '%';
    document.getElementById('mTicket').innerText = fmtMoney(ticket);
  }

  var daysToIterate = PERIOD_DAYS === 'turno' ? 7 : PERIOD_DAYS;
  var dias = [], montosI = [];
  for (var i = daysToIterate - 1; i >= 0; i--) {
    var d = new Date(); d.setDate(d.getDate() - i);
    var ds = d.toISOString().split('T')[0];
    var suma = ingresos.filter(x => x.fecha_servicio && x.fecha_servicio.startsWith(ds)).reduce((a, v) => a + parseFloat(v.monto), 0);
    dias.push(d.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric' }));
    montosI.push(suma);
  }

  if (SESSION.rol === 'superadmin' || SESSION.rol === 'admin') {
    var bMap = {};
    ingresos.forEach(s => {
      bMap[s.empleado_id] = bMap[s.empleado_id] || { count: 0, total: 0 };
      bMap[s.empleado_id].count++;
      bMap[s.empleado_id].total += parseFloat(s.monto);
    });
    var barbData = Object.entries(bMap).sort((a, b) => b[1].total - a[1].total);
    
    var { data: emps } = await sb.from('empleados').select('id, nombre').eq('negocio_id', SESSION.negocio_id);
    var empMap = {}; (emps || []).forEach(e => empMap[e.id] = e.nombre);
    
    var topList = document.getElementById('topBarberosList');
    if(topList) {
      topList.innerHTML = barbData.length ? barbData.map(([id, v], i) => `
        <div style="display:flex; align-items:center; gap:10px; padding:8px 0; border-bottom:1px solid var(--border);">
          <span style="font-family:'Space Mono'; font-size:14px; color:var(--muted); width:20px;">${i+1}</span>
          <span style="flex:1; font-weight:700; font-size:13px;">${empMap[id] || 'Barbero'}</span>
          <span style="font-size:11px; color:var(--muted);">${v.count} serv.</span>
          <span style="font-family:'Space Mono'; font-size:12px; color:var(--success); font-weight:700;">${fmtMoney(v.total)}</span>
        </div>`).join('') : '<p style="text-align:center; color:var(--muted); font-size:12px; padding:10px;">Sin datos en este período</p>';
    }
  }

  var gastosList = document.getElementById('gastosRecientesList');
  if(gastosList) {
    gastosList.innerHTML = gastos.slice(0, 5).map(g => `
      <div style="display:flex; align-items:center; justify-content:space-between; padding:8px 0; border-bottom:1px solid var(--border); font-size:13px;">
        <div>
          <div style="font-weight:600;">${g.descripcion}</div>
          <div style="font-size:10px; color:var(--muted);">${g.fecha_gasto?.split('T')[0] || '—'}</div>
        </div>
        <span style="color:var(--danger); font-weight:700; font-family:'Space Mono';">${fmtMoney(g.monto)}</span>
      </div>`).join('') || '<p style="text-align:center; color:var(--muted); font-size:12px; padding:10px;">Sin gastos en este período</p>';
  }

  var ctx = document.getElementById('chartVentas');
  if (ctx) {
    if (chartInst) chartInst.destroy();
    Chart.defaults.color = '#5a564f';
    Chart.defaults.font.family = 'Outfit';
    chartInst = new Chart(ctx, { type: 'bar', data: { labels: dias, datasets: [{ label: 'Ingresos', data: montosI, backgroundColor: montosI.map(v => v > 0 ? 'rgba(201,168,76,.85)' : 'rgba(255,255,255,.06)'), borderRadius: 6, borderSkipped: false, hoverBackgroundColor: '#e8c96a', }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { backgroundColor: '#1a1a1a', borderColor: '#2e2e2e', borderWidth: 1, titleColor: '#9ca3af', bodyColor: '#f0ede8', callbacks: { label: ctx => ' S/ ' + ctx.raw.toFixed(2) } } }, scales: { x: { grid: { display: false }, ticks: { font: { size: 10 } } }, y: { grid: { color: 'rgba(255,255,255,.04)' }, ticks: { font: { size: 10 }, callback: v => 'S/' + v } } } } });
  }
}

async function verHistorial(cliId, nombre) {
  document.getElementById('histName').innerText = nombre;
  document.getElementById('histContent').innerHTML = '<p style="color:var(--muted); font-size:12px; text-align:center; padding:20px;">Buscando...</p>';
  document.getElementById('modalHistorial').style.display = 'flex';
  
  var start = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
  var { data } = await sb.from('historial_servicios').select('*, empleados(nombre)').eq('cliente_id', cliId).gte('fecha_servicio', start).order('fecha_servicio', { ascending: false });
  
  document.getElementById('histContent').innerHTML = (data || []).map(h => {
    var dateShort = new Date(h.fecha_servicio).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
    
    var adminBtn = (SESSION.rol === 'superadmin' || SESSION.rol === 'admin') ? `<button onclick="anularCobro('${h.id}', '${cliId}')" style="background:none; border:none; color:var(--danger); cursor:pointer; margin-left:10px;"><i class="fas fa-trash-alt"></i></button>` : '';
    return `
    <div style="background:var(--card2); border:1px solid var(--border2); border-radius:var(--r); padding:12px; margin-bottom:8px;">
      <div style="display:flex; justify-content:space-between; margin-bottom:6px; align-items:start;">
        <strong style="color:var(--text); font-size:13px; flex:1;">${h.servicio_realizado}</strong>
        <div style="display:flex; align-items:center;">
          <span style="color:var(--success); font-family:'Space Mono'; font-weight:700; font-size:13px;">S/ ${parseFloat(h.monto).toFixed(2)}</span>
          ${adminBtn}
        </div>
      </div>
      <div style="font-size:11px; color:var(--muted); display:flex; justify-content:space-between;">
        <span><i class="fas fa-user" style="opacity:0.5;"></i> ${h.empleados?.nombre || '—'}</span>
        <span><i class="far fa-calendar" style="opacity:0.5;"></i> ${dateShort}</span>
      </div>
    </div>`;
  }).join('') || '<p style="font-size:12px; color:var(--muted); text-align:center; padding:20px;">Sin visitas en los últimos 2 meses.</p>';
}

// 🔒 HACER EL CIERRE Y VACIAR LA CAJA
async function cierreDeCaja() {
  var { data: sede } = await sb.from('sucursales').select('ultimo_cierre').eq('id', CURRENT_SUCURSAL).single();
  var puntoDeCorte = sede?.ultimo_cierre || new Date(new Date().setHours(0,0,0,0)).toISOString();
  
  var { data: ingresos } = await sb.from('historial_servicios').select('*').eq('sucursal_id', CURRENT_SUCURSAL).gte('fecha_servicio', puntoDeCorte);
  var { data: gastos } = await sb.from('gastos').select('*').eq('sucursal_id', CURRENT_SUCURSAL).gte('fecha_gasto', puntoDeCorte);
  
  var totI = (ingresos || []).reduce((a, v) => a + parseFloat(v.monto), 0);
  var totCom = (ingresos || []).reduce((a, v) => a + parseFloat(v.comision_generada), 0);
  var totG = (gastos || []).reduce((a, v) => a + parseFloat(v.monto), 0);
  var neto = totI - (totCom + totG);

  if (totI === 0 && totG === 0) {
    return showToast('La caja de este turno ya está en cero.', 'warning');
  }

  abrirConfirm('Cierre de Turno', `La caja actual tiene un Neto de S/ ${neto.toFixed(2)}. Al confirmar, el contador volverá a CERO para el próximo turno.`, async () => {
    
    var nuevoCierre = new Date().toISOString();
    var { error } = await sb.from('sucursales').update({ ultimo_cierre: nuevoCierre }).eq('id', CURRENT_SUCURSAL);

    if (error) {
      showToast('Error de conexión. Revisa tu base de datos.', 'error');
      cerrarConfirm();
      return;
    }

    var sedeName = document.getElementById('branchSelector').options[document.getElementById('branchSelector').selectedIndex].text;
    var report = `🔒 *CIERRE DE CAJA (TURNO)*\n🏪 Sede: ${sedeName}\n📅 Cierre: ${new Date().toLocaleString('es-ES')}\n\n📈 *INGRESOS:* S/ ${totI.toFixed(2)} (${(ingresos||[]).length} serv.)\n✂️ *Comisiones a Pagar:* S/ ${totCom.toFixed(2)}\n📉 *Gastos del Local:* S/ ${totG.toFixed(2)}\n\n💎 *NETO PARA LA CAJA:* S/ ${neto.toFixed(2)}`;
    
    // 🔥 Ahora el cierre le llega al dueño real del local, no a ti.
    var wpDueño = SESSION.negocios.admin_whatsapp || WA_SOPORTE;
    window.open(`https://wa.me/${wpDueño}?text=${encodeURIComponent(report)}`, '_blank');
    
    actualizarDashboardRapido();
    renderChart();
    
    showToast('Cierre exitoso. Caja en cero.', 'success');
    cerrarConfirm();
  }, '🔒');
}

/* ─── WIZARD DE REGISTRO PASO A PASO ─── */
var wizBarberosGuardados = [];

function wizGoTo(step) {
  document.getElementById('wizStep1').style.display = 'none';
  document.getElementById('wizStep2').style.display = 'none';
  document.getElementById('wizStep3').style.display = 'none';
  document.getElementById('wizStep' + step).style.display = 'block';
}

function wizEvaluarPlan() {
  var plan = document.getElementById('regPlan').value;
  var btn = document.getElementById('btnWizNext');
  if(plan === 'independiente') {
    btn.innerHTML = '<i class="fas fa-rocket"></i> Crear Cuenta';
    btn.style.background = 'var(--success)';
  } else {
    btn.innerHTML = 'Siguiente <i class="fas fa-arrow-right"></i>';
    btn.style.background = 'var(--gold)';
  }
}
function wizSiguienteDesdePlan() {
  var plan = document.getElementById('regPlan').value;
  var admin = document.getElementById('regAdminName').value.trim();
  var user = document.getElementById('regUser').value.trim();
  var pass = document.getElementById('regPass').value.trim();

  if(!admin || !user || !pass) return showToast('Completa tu nombre, usuario y clave', 'error');

  if(plan === 'independiente') {
    registrarSaaS(); 
  } else {
    wizGoTo(3); 
  }
}

function wizAddBarber() {
  var n = document.getElementById('wizBarbName').value.trim();
  var c = parseFloat(document.getElementById('wizBarbCom').value) || 0;
  if(!n) return;
  wizBarberosGuardados.push({ nombre: n, comision: c });
  
  document.getElementById('wizBarbName').value = '';
  document.getElementById('wizBarbCom').value = '';
  
  renderWizBarberos(); 
}

function wizRemoveBarber(index) {
  wizBarberosGuardados.splice(index, 1); 
  renderWizBarberos();
}

function renderWizBarberos() {
  document.getElementById('wizBarberList').innerHTML = wizBarberosGuardados.map((b, i) => `
    <div style="display:flex; justify-content:space-between; align-items:center; padding:8px 12px; background:var(--card2); border:1px solid var(--border2); border-radius:8px; margin-bottom:6px;">
      <span style="color:var(--text); font-weight:600;"><i class="fas fa-user" style="color:var(--gold); margin-right:8px;"></i>${b.nombre}</span>
      <div style="display:flex; align-items:center; gap:12px;">
        <span style="color:var(--success); font-family:'Space Mono'; font-weight:700;">${b.comision}%</span>
        <button onclick="wizRemoveBarber(${i})" style="background:none; border:none; color:var(--danger); cursor:pointer;"><i class="fas fa-times"></i></button>
      </div>
    </div>
  `).join('');
}

async function registrarSaaS() {
  var nLocal = document.getElementById('regLocal').value.trim();
  var wa = document.getElementById('regWa').value.trim();
  var plan = document.getElementById('regPlan').value;
  var adminName = document.getElementById('regAdminName').value.trim() || 'Admin';
  var u = document.getElementById('regUser').value.trim();
  var p = document.getElementById('regPass').value.trim();
  
  if(!nLocal || !wa || !u || !p) return showToast('Completa todos los campos', 'error');
  if(p.length < 6) return showToast('La clave debe tener al menos 6 caracteres', 'warning');
  
  showToast('Creando bóveda de seguridad...', 'info');
  
  try {
    var { data: authData, error: authError } = await sb.auth.signUp({ email: u, password: p });
    if (authError) throw new Error('El correo ya existe o es inválido');
    
    var authId = authData.user.id;

    var { data: neg, error: e1 } = await sb.from('negocios').insert([{ nombre_marca: nLocal, admin_whatsapp: formatPhone(wa), plan: plan }]).select().single();
    if(e1) throw new Error('Error al crear el negocio en la base de datos');
    
    var nombreSede = plan === 'independiente' ? 'Mi Local' : 'Sede Principal';
    var { data: suc } = await sb.from('sucursales').insert([{ negocio_id: neg.id, nombre_sucursal: nombreSede }]).select().single();
    
    await sb.from('empleados').insert([{ 
      negocio_id: neg.id, sucursal_id: suc.id, nombre: adminName, 
      usuario: u, clave: p, rol: 'admin', comision_porcentaje: 100, 
      activo: false, auth_id: authId 
    }]);
    
    showToast('¡Cuenta segura creada con éxito!', 'success');
    
    setTimeout(() => {
      document.getElementById('logUser').value = u;
      document.getElementById('logPass').value = p;
      switchLogin('in');
      iniciarSesion();
    }, 1000);
    
    }
    catch (e) {
    showToast(e.message, 'error');
  }
}

function switchConfigTab(tabId, btnElement) {
  document.querySelectorAll('.config-section').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.config-menu-item').forEach(el => el.classList.remove('active'));
  document.getElementById('cfg-' + tabId).classList.add('active');
  btnElement.classList.add('active');
}

function activarTiempoReal() {
  sb.channel('citas_en_vivo')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'citas' },
      (payload) => {
        console.log('¡Cambio detectado!', payload);
        showToast('¡La agenda se ha actualizado!', 'success');
        renderApts(); 
        actualizarDashboardRapido(); 
      }
    )
    .subscribe();
} 

async function actualizarDashboardRapido() {
  if (!SESSION || SESSION.rol === 'barbero') return; 
  
  var { data: sede } = await sb.from('sucursales').select('ultimo_cierre').eq('id', CURRENT_SUCURSAL).single();
  var puntoDeCorte = sede?.ultimo_cierre || new Date(new Date().setHours(0,0,0,0)).toISOString();
  
  var { data: cobrosTurno } = await sb.from('historial_servicios')
    .select('monto')
    .eq('sucursal_id', CURRENT_SUCURSAL)
    .gte('fecha_servicio', puntoDeCorte);
    
  var totalTurno = (cobrosTurno || []).reduce((sum, item) => sum + parseFloat(item.monto), 0);
  
  var hoyStr = new Date().toISOString().split('T')[0];
  var { count: citasPendientes } = await sb.from('citas')
    .select('*', { count: 'exact', head: true })
    .eq('sucursal_id', CURRENT_SUCURSAL)
    .eq('fecha', hoyStr);

  var mDashIngresos = document.getElementById('dashIngresos');
  if(mDashIngresos) {
    mDashIngresos.innerText = fmtMoney(totalTurno);
    document.getElementById('dashServicios').innerText = (cobrosTurno || []).length + ' completados (Turno Actual)';
    document.getElementById('dashPendientes').innerText = citasPendientes || 0;
  }
}

// 🎧 FUNCIONES DE SOPORTE Y VENTAS
function contactarVentas() {
  var plan = document.getElementById('actPlan').innerText;
  var user = document.getElementById('actUser').innerText;
  var msj = `Hola, acabo de crear mi cuenta en BarberPro SaaS.\n\n👤 Usuario: *${user}*\n📦 Plan: *${plan}*\n\nDeseo realizar el pago para activar mi cuenta.`;
  window.open(`https://wa.me/${WA_SOPORTE}?text=${encodeURIComponent(msj)}`, '_blank');
}

function abrirSoporteLogin() {
  var msj = "Hola, necesito ayuda para ingresar a mi cuenta de BarberPro.";
  window.open(`https://wa.me/${WA_SOPORTE}?text=${encodeURIComponent(msj)}`, '_blank');
}

function abrirSoporteGeneral() {
  var msj = "Hola, necesito soporte con BarberPro SaaS.";
  window.open(`https://wa.me/${WA_SOPORTE}?text=${encodeURIComponent(msj)}`, '_blank');
}

// ⚡ COBRO EXPRESS (CLIENTE DE PASO)
async function cobrarClienteDePaso() {
  abrirModalCobro('', '', 0, null, null, SESSION.rol === 'barbero' ? SESSION.id : null);
  document.getElementById('cobroClienteNombre').innerText = '🚶 Cobro Express (Sin registro)';
  
  setTimeout(() => {
    var chk = document.getElementById('mSendWa');
    if(chk) { chk.checked = false; chk.parentElement.style.display = 'none'; }
    var cupContainer = document.getElementById('mCupInput')?.parentElement;
    if(cupContainer) { cupContainer.style.display = 'none'; cupContainer.previousElementSibling.style.display = 'none'; }
  }, 50);
}

function abrirEditarCliente(id, nombre, whatsapp) {
  document.getElementById('editCliId').value = id;
  document.getElementById('editCliName').value = nombre;
  document.getElementById('editCliPhone').value = whatsapp.replace('51', '');
  document.getElementById('modalEditarCliente').style.display = 'flex';
}

async function guardarEdicionCliente() {
  var id = document.getElementById('editCliId').value;
  var n = document.getElementById('editCliName').value.trim();
  var p = document.getElementById('editCliPhone').value.trim();
  if(!n || !p) return showToast('Completa los datos', 'error');

  var wpF = formatPhone(p);
  var { error } = await sb.from('clientes').update({ nombre: n, whatsapp: wpF }).eq('id', id);

  if(error) return showToast('Error al actualizar o número duplicado', 'error');

  document.getElementById('modalEditarCliente').style.display = 'none';
  showToast('Cliente actualizado', 'success');
  renderClients();
}

function anularCobro(historialId, clienteId) {
  abrirConfirm('Anular Cobro', '¿Seguro que deseas anular este cobro? Esto restará el punto al cliente y descontará el dinero de la caja.', async () => {
    await sb.from('historial_servicios').delete().eq('id', historialId);
    var { data: cli } = await sb.from('clientes').select('cortes_acumulados').eq('id', clienteId).single();
    if(cli && cli.cortes_acumulados > 0) {
      await sb.from('clientes').update({ cortes_acumulados: cli.cortes_acumulados - 1 }).eq('id', clienteId);
    }
    showToast('Cobro anulado correctamente', 'success');
    document.getElementById('modalHistorial').style.display = 'none';
    renderClients();
    renderChart();
  }, '🗑️');
}

async function verHistorialGlobal() {
  document.getElementById('toastWrap').innerHTML = ''; 
  document.getElementById('histName').innerText = 'Todos los Clientes (Sede Actual)';
  document.getElementById('histContent').innerHTML = '<p style="color:var(--muted); font-size:12px; text-align:center; padding:20px;"><i class="fas fa-spinner fa-spin"></i> Cargando historial global...</p>';
  document.getElementById('modalHistorial').style.display = 'flex';
  
  var start = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
  
  var { data } = await sb.from('historial_servicios')
    .select('*, clientes(nombre), empleados(nombre)')
    .eq('sucursal_id', CURRENT_SUCURSAL)
    .gte('fecha_servicio', start)
    .order('fecha_servicio', { ascending: false });
  
  document.getElementById('histContent').innerHTML = (data || []).map(h => {
    var dateShort = new Date(h.fecha_servicio).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
    var nombreCliente = h.clientes?.nombre;
    if (!h.cliente_id) {
      nombreCliente = '🚶 Cliente Express';
    } else if (!nombreCliente) {
      nombreCliente = 'Cliente Borrado';
    }
    
    var adminBtn = (SESSION.rol === 'superadmin' || SESSION.rol === 'admin') ? `<button onclick="anularCobro('${h.id}', '${h.cliente_id}')" style="background:none; border:none; color:var(--danger); cursor:pointer; margin-left:10px;" title="Anular este cobro"><i class="fas fa-trash-alt"></i></button>` : '';

    return `
    <div style="background:var(--card2); border:1px solid var(--border2); border-radius:var(--r); padding:12px; margin-bottom:8px;">
      <div style="display:flex; justify-content:space-between; margin-bottom:6px; align-items:start;">
        <div style="flex:1;">
          <strong style="color:var(--text); font-size:13px; display:block;">${h.servicio_realizado}</strong>
          <span style="color:var(--gold); font-size:11px; font-weight:600;">${nombreCliente}</span>
        </div>
        <div style="display:flex; align-items:center;">
          <span style="color:var(--success); font-family:'Space Mono'; font-weight:700; font-size:13px;">S/ ${parseFloat(h.monto).toFixed(2)}</span>
          ${adminBtn}
        </div>
      </div>
      <div style="font-size:11px; color:var(--muted); display:flex; justify-content:space-between; border-top:1px dashed var(--border); padding-top:6px; margin-top:4px;">
        <span><i class="fas fa-user" style="opacity:0.5;"></i> ${h.empleados?.nombre || '—'}</span>
        <span><i class="far fa-calendar" style="opacity:0.5;"></i> ${dateShort}</span>
      </div>
    </div>`;
  }).join('') || '<p style="font-size:12px; color:var(--muted); text-align:center; padding:20px;">No hay cobros en los últimos 2 meses.</p>';
}