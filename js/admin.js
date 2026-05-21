// Valhalla Barbearia - Admin panel logic
const db = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);

let adminPassword = sessionStorage.getItem('vb_admin_pwd') || '';

// Auto-login if session exists
if (adminPassword) {
  db.rpc('verify_admin_password', { pwd: adminPassword }).then(({ data }) => {
    if (data) {
      document.getElementById('login-screen').classList.add('hidden');
      document.getElementById('admin-panel').classList.remove('hidden');
      const today = new Date().toISOString().split('T')[0];
      document.getElementById('av-date').value = today;
      document.getElementById('apt-filter-date').value = today;
      loadAvailability();
      loadAppointments();
    } else {
      adminPassword = '';
      sessionStorage.removeItem('vb_admin_pwd');
    }
  });
}

// --- Login ---
async function doLogin() {
  const pwd = document.getElementById('password-input').value;
  const errorEl = document.getElementById('login-error');

  const { data, error } = await db.rpc('verify_admin_password', { pwd });

  if (error || !data) {
    errorEl.textContent = 'Senha incorreta';
    errorEl.classList.remove('hidden');
    return;
  }

  adminPassword = pwd;
  sessionStorage.setItem('vb_admin_pwd', pwd);
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('admin-panel').classList.remove('hidden');

  const today = new Date().toISOString().split('T')[0];
  document.getElementById('av-date').value = today;
  document.getElementById('apt-filter-date').value = today;

  loadAvailability();
  loadAppointments();
}

function logout() {
  adminPassword = '';
  sessionStorage.removeItem('vb_admin_pwd');
  document.getElementById('admin-panel').classList.add('hidden');
  document.getElementById('login-screen').classList.remove('hidden');
  document.getElementById('password-input').value = '';
}

// --- Tabs ---
const ALL_TABS = ['availability', 'appointments', 'barbers', 'products', 'orders', 'followup'];

function switchTab(tab) {
  document.querySelectorAll('.tab').forEach(t => {
    t.classList.toggle('active', t.dataset.tab === tab);
  });
  ALL_TABS.forEach(t => {
    const el = document.getElementById(`tab-${t}`);
    if (el) el.classList.toggle('hidden', t !== tab);
  });

  if (tab === 'barbers') loadBarbers();
  if (tab === 'products') loadAdminProducts();
  if (tab === 'orders') loadOrders();
  if (tab === 'followup') loadFollowups();
}

// --- Barbers ---
async function loadBarbers() {
  const { data } = await db.from('valhalla_barbers').select('*').order('name');

  const container = document.getElementById('barbers-list');
  const empty = document.getElementById('barbers-empty');

  if (!data || data.length === 0) {
    container.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }

  empty.classList.add('hidden');
  container.innerHTML = data.map(b => `
    <div class="avail-item">
      <div class="info" style="flex:1;">
        <strong>${b.name}</strong>
        <div style="font-size:0.75rem; color:${b.active ? 'var(--success)' : 'var(--danger)'};">${b.active ? 'Ativo' : 'Inativo'}</div>
      </div>
      <div style="display:flex; gap:6px;">
        <button class="btn btn-outline btn-sm" onclick="toggleBarber('${b.id}', ${!b.active})">${b.active ? 'Desativar' : 'Ativar'}</button>
        <button class="delete-btn" onclick="deleteBarber('${b.id}')" title="Remover">&#10005;</button>
      </div>
    </div>
  `).join('');
}

async function addBarber() {
  const name = document.getElementById('barber-name').value.trim();
  if (!name) return;

  const { data } = await db.rpc('admin_manage_barber', {
    pwd: adminPassword,
    action: 'insert',
    b_name: name
  });

  if (data?.error) { alert(data.error); return; }

  document.getElementById('barber-name').value = '';
  loadBarbers();
  loadBarberSelect();
}

async function toggleBarber(id, active) {
  await db.rpc('admin_manage_barber', {
    pwd: adminPassword,
    action: 'update',
    b_id: id,
    b_active: active
  });
  loadBarbers();
  loadBarberSelect();
}

async function deleteBarber(id) {
  if (!confirm('Remover este barbeiro e todos os seus horarios?')) return;
  await db.rpc('admin_manage_barber', {
    pwd: adminPassword,
    action: 'delete',
    b_id: id
  });
  loadBarbers();
  loadBarberSelect();
}

// --- Schedule (per barber) ---
const DAY_NAMES = ['Domingo', 'Segunda', 'Terca', 'Quarta', 'Quinta', 'Sexta', 'Sabado'];

async function loadBarberSelect() {
  const { data } = await db.from('valhalla_barbers').select('id, name').eq('active', true).order('name');
  const select = document.getElementById('schedule-barber-select');
  const current = select.value;

  select.innerHTML = '<option value="">-- Selecione --</option>' +
    (data || []).map(b => `<option value="${b.id}">${b.name}</option>`).join('');

  if (current && (data || []).find(b => b.id === current)) {
    select.value = current;
  }
}

function getSelectedBarberId() {
  return document.getElementById('schedule-barber-select').value;
}

async function loadAvailability() {
  await loadBarberSelect();
  const barberId = getSelectedBarberId();
  const section = document.getElementById('schedule-section');

  if (!barberId) {
    section.classList.add('hidden');
    return;
  }

  section.classList.remove('hidden');
  await Promise.all([loadSchedule(barberId), loadDaysOff(barberId)]);
}

async function loadSchedule(barberId) {
  const { data } = await db.from('valhalla_schedule')
    .select('*')
    .eq('barber_id', barberId)
    .order('day_of_week');

  const container = document.getElementById('schedule-list');
  if (!data || data.length === 0) {
    container.innerHTML = '<p class="empty-state">Horario nao configurado pra este barbeiro.</p>';
    return;
  }

  container.innerHTML = data.map(s => {
    const start = s.start_time ? s.start_time.slice(0, 5) : '09:00';
    const end = s.end_time ? s.end_time.slice(0, 5) : '19:00';
    const checked = s.is_working ? 'checked' : '';
    const dimStyle = s.is_working ? '' : 'opacity: 0.4;';

    return `
      <div class="avail-item" style="${dimStyle}" id="sched-${s.day_of_week}">
        <div class="info" style="flex:1;">
          <label style="display:flex; align-items:center; gap:8px; cursor:pointer;">
            <input type="checkbox" ${checked} onchange="toggleScheduleDay(${s.day_of_week}, this.checked)">
            <strong>${DAY_NAMES[s.day_of_week]}</strong>
          </label>
        </div>
        <div style="display:flex; gap:6px; align-items:center;" id="sched-times-${s.day_of_week}">
          <input type="time" value="${start}" style="padding:6px; background:var(--bg); border:1px solid var(--border); border-radius:6px; color:var(--text); font-size:0.8rem;" onchange="updateScheduleTime(${s.day_of_week})">
          <span style="color:var(--text-muted);">-</span>
          <input type="time" value="${end}" style="padding:6px; background:var(--bg); border:1px solid var(--border); border-radius:6px; color:var(--text); font-size:0.8rem;" onchange="updateScheduleTime(${s.day_of_week})">
        </div>
      </div>`;
  }).join('');
}

async function toggleScheduleDay(dow, working) {
  const barberId = getSelectedBarberId();
  if (!barberId) return;
  const timesEl = document.getElementById(`sched-times-${dow}`);
  const inputs = timesEl.querySelectorAll('input[type=time]');

  await db.rpc('admin_update_schedule', {
    pwd: adminPassword,
    p_barber_id: barberId,
    p_day: dow,
    p_working: working,
    p_start: working ? inputs[0].value : null,
    p_end: working ? inputs[1].value : null
  });

  loadSchedule(barberId);
}

async function updateScheduleTime(dow) {
  const barberId = getSelectedBarberId();
  if (!barberId) return;
  const timesEl = document.getElementById(`sched-times-${dow}`);
  const inputs = timesEl.querySelectorAll('input[type=time]');
  const start = inputs[0].value;
  const end = inputs[1].value;

  if (!start || !end || start >= end) return;

  await db.rpc('admin_update_schedule', {
    pwd: adminPassword,
    p_barber_id: barberId,
    p_day: dow,
    p_working: true,
    p_start: start,
    p_end: end
  });
}

async function loadDaysOff(barberId) {
  const today = new Date().toISOString().split('T')[0];
  const { data } = await db.from('valhalla_days_off')
    .select('*')
    .eq('barber_id', barberId)
    .gte('date', today)
    .order('date', { ascending: true });

  const container = document.getElementById('daysoff-list');
  const empty = document.getElementById('daysoff-empty');

  if (!data || data.length === 0) {
    container.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }

  empty.classList.add('hidden');
  container.innerHTML = data.map(d => {
    const dateObj = new Date(d.date + 'T00:00:00');
    const dayName = DAY_NAMES[dateObj.getDay()];
    const parts = d.date.split('-');
    const formatted = `${parts[2]}/${parts[1]}/${parts[0]}`;

    return `
      <div class="avail-item">
        <div class="info">
          <strong>${dayName} ${formatted}</strong>${d.reason ? ` &mdash; ${d.reason}` : ''}
        </div>
        <button class="delete-btn" onclick="deleteDayOff('${d.id}')" title="Remover">&#10005;</button>
      </div>`;
  }).join('');
}

async function addDayOff() {
  const barberId = getSelectedBarberId();
  if (!barberId) { alert('Selecione um barbeiro'); return; }
  const date = document.getElementById('dayoff-date').value;
  if (!date) return;

  const { data } = await db.rpc('admin_manage_day_off', {
    pwd: adminPassword,
    action: 'insert',
    p_barber_id: barberId,
    p_date: date
  });

  if (data?.error) { alert(data.error); return; }

  document.getElementById('dayoff-date').value = '';
  loadDaysOff(barberId);
}

async function deleteDayOff(id) {
  if (!confirm('Remover esta folga?')) return;
  const barberId = getSelectedBarberId();

  await db.rpc('admin_manage_day_off', {
    pwd: adminPassword,
    action: 'delete',
    p_id: id
  });

  loadDaysOff(barberId);
}

// --- Appointments ---
async function loadAppointments() {
  const date = document.getElementById('apt-filter-date').value;
  if (!date) return;

  const { data } = await db
    .from('valhalla_appointments')
    .select('*, valhalla_services(name, duration_minutes)')
    .eq('date', date)
    .order('start_time', { ascending: true });

  const container = document.getElementById('apt-list');
  const empty = document.getElementById('apt-empty');

  if (!data || data.length === 0) {
    container.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }

  empty.classList.add('hidden');

  container.innerHTML = data.map(apt => {
    const start = apt.start_time.slice(0, 5);
    const end = apt.end_time.slice(0, 5);
    const isCancelled = apt.status === 'cancelled';
    const isCompleted = apt.status === 'completed';
    const cls = isCancelled ? 'apt-item cancelled' : isCompleted ? 'apt-item completed' : 'apt-item';

    let statusHTML = '';
    if (isCancelled) statusHTML = '<div class="details" style="color:var(--danger)">CANCELADO</div>';
    if (isCompleted) statusHTML = '<div class="details" style="color:var(--success)">CONCLUIDO</div>';

    let actionsHTML = '';
    if (!isCancelled && !isCompleted) {
      actionsHTML = `
        <div style="display:flex; gap:6px; flex-wrap:wrap;">
          <button class="btn btn-primary btn-sm" onclick="completeAppointment('${apt.id}')">Concluido</button>
          <button class="btn btn-danger btn-sm" onclick="cancelAppointment('${apt.id}')">Cancelar</button>
        </div>`;
    }

    return `
      <div class="${cls}">
        <div>
          <div class="client">${apt.client_name}</div>
          <div class="details">
            ${apt.services?.name || 'Servico'} &mdash; ${start} - ${end}
          </div>
          <div class="details">${apt.client_phone}</div>
          ${statusHTML}
        </div>
        ${actionsHTML}
      </div>
    `;
  }).join('');
}

async function cancelAppointment(id) {
  if (!confirm('Cancelar este agendamento?')) return;

  await db.rpc('admin_cancel_appointment', {
    pwd: adminPassword,
    apt_id: id
  });

  loadAppointments();
}

// --- Products ---
async function loadAdminProducts() {
  const { data } = await db.from('valhalla_products')
    .select('*')
    .order('created_at', { ascending: false });

  const container = document.getElementById('products-list');
  const empty = document.getElementById('products-empty');

  if (!data || data.length === 0) {
    container.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }

  empty.classList.add('hidden');
  container.innerHTML = data.map(p => `
    <div class="avail-item" style="flex-wrap: wrap; gap: 8px;">
      <div class="info" style="flex: 1;">
        <strong>${p.name}</strong> &mdash; ${Number(p.price).toFixed(2)} R$
        <div style="font-size: 0.75rem; color: var(--text-muted);">${p.description || ''}</div>
        <div style="font-size: 0.7rem; color: ${p.active ? 'var(--success)' : 'var(--danger)'};">${p.active ? 'Ativo' : 'Inativo'}</div>
      </div>
      <div style="display:flex; gap:6px;">
        <button class="btn btn-outline btn-sm" onclick="toggleProduct('${p.id}', ${!p.active}, event)">${p.active ? 'Desativar' : 'Ativar'}</button>
        <button class="delete-btn" onclick="deleteProduct('${p.id}', event)" title="Remover">&#10005;</button>
      </div>
    </div>
  `).join('');
}

// Selected image file (from camera or gallery)
let selectedImageFile = null;

function handleImageSelect(input) {
  const file = input.files[0];
  const preview = document.getElementById('prod-image-preview');
  if (file) {
    selectedImageFile = file;
    const reader = new FileReader();
    reader.onload = (ev) => {
      preview.innerHTML = `<img src="${ev.target.result}">`;
      preview.classList.remove('hidden');
    };
    reader.readAsDataURL(file);
  } else {
    selectedImageFile = null;
    preview.classList.add('hidden');
    preview.innerHTML = '';
  }
}

document.addEventListener('DOMContentLoaded', () => {
});

async function uploadProductImage(file) {
  const ext = file.name.split('.').pop();
  const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

  const { data, error } = await db.storage
    .from('product-images')
    .upload(fileName, file, { contentType: file.type });

  if (error) {
    console.error('Upload error:', error);
    return null;
  }

  // Get public URL
  const { data: urlData } = db.storage
    .from('product-images')
    .getPublicUrl(fileName);

  return urlData.publicUrl;
}

async function addProduct() {
  const name = document.getElementById('prod-name').value.trim();
  const desc = document.getElementById('prod-desc').value.trim();
  const price = parseFloat(document.getElementById('prod-price').value);

  if (!name || !price) {
    alert('Nome e preco sao obrigatorios');
    return;
  }

  let imageUrl = null;
  if (selectedImageFile) {
    imageUrl = await uploadProductImage(selectedImageFile);
    if (!imageUrl) {
      alert('Erro ao fazer upload da imagem. Tente novamente.');
      return;
    }
  }

  const { data } = await db.rpc('admin_manage_product', {
    pwd: adminPassword,
    action: 'insert',
    p_name: name,
    p_description: desc || null,
    p_price: price,
    p_image_url: imageUrl,
    p_active: true
  });

  if (data?.error) {
    alert(data.error);
    return;
  }

  // Clear form
  document.getElementById('prod-name').value = '';
  document.getElementById('prod-desc').value = '';
  document.getElementById('prod-price').value = '';
  document.getElementById('prod-image-camera').value = '';
  document.getElementById('prod-image-gallery').value = '';
  document.getElementById('prod-image-preview').classList.add('hidden');
  selectedImageFile = null;

  loadAdminProducts();
}

async function toggleProduct(id, active, event) {
  if (event) event.stopPropagation();
  await db.rpc('admin_manage_product', {
    pwd: adminPassword,
    action: 'update',
    p_id: id,
    p_active: active
  });
  loadAdminProducts();
}

async function deleteProduct(id, event) {
  if (event) event.stopPropagation();
  if (!confirm('Remover este produto e suas encomendas?')) return;

  try {
    // Get related orders and delete them first via admin RPC
    const { data: orders } = await db.from('valhalla_orders').select('id').eq('product_id', id);
    if (orders && orders.length > 0) {
      for (const o of orders) {
        await db.rpc('admin_manage_order', {
          pwd: adminPassword,
          action: 'delete',
          o_id: o.id
        });
      }
    }

    const { data, error } = await db.rpc('admin_manage_product', {
      pwd: adminPassword,
      action: 'delete',
      p_id: id
    });
    if (error) {
      alert('Erro ao deletar: ' + error.message);
      console.error('Delete error:', error);
    }
  } catch (e) {
    alert('Erro ao deletar produto');
    console.error('Delete exception:', e);
  }
  loadAdminProducts();
}

// --- Orders ---
async function loadOrders() {
  const { data } = await db.from('valhalla_orders')
    .select('*, valhalla_products(name, price)')
    .order('created_at', { ascending: false });

  const container = document.getElementById('orders-list');
  const empty = document.getElementById('orders-empty');

  if (!data || data.length === 0) {
    container.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }

  empty.classList.add('hidden');
  const statusLabels = {
    pending: 'Pendente',
    paid: 'Pago',
    delivered: 'Entregue',
    cancelled: 'Cancelado'
  };
  const statusColors = {
    pending: 'var(--accent)',
    paid: 'var(--success)',
    delivered: 'var(--text-muted)',
    cancelled: 'var(--danger)'
  };

  container.innerHTML = data.map(o => {
    const date = new Date(o.created_at).toLocaleDateString('pt-BR');
    return `
      <div class="avail-item" style="flex-wrap: wrap; gap: 8px;">
        <div class="info" style="flex: 1;">
          <strong>${o.products?.name || 'Produto'}</strong> &mdash; ${Number(o.products?.price || 0).toFixed(2)} R$
          <div style="font-size: 0.8rem;">${o.client_name} - ${o.client_phone}</div>
          <div style="font-size: 0.75rem; color: ${statusColors[o.status]};">${statusLabels[o.status]} | ${date}</div>
        </div>
        <div style="display:flex; gap:4px; flex-wrap:wrap;">
          ${o.status === 'pending' ? `<button class="btn btn-primary btn-sm" onclick="updateOrderStatus('${o.id}','paid')">Pago</button>` : ''}
          ${o.status === 'paid' ? `<button class="btn btn-primary btn-sm" onclick="updateOrderStatus('${o.id}','delivered')">Entregue</button>` : ''}
          ${o.status !== 'cancelled' ? `<button class="btn btn-danger btn-sm" onclick="updateOrderStatus('${o.id}','cancelled')">Cancelar</button>` : ''}
        </div>
      </div>
    `;
  }).join('');
}

async function updateOrderStatus(id, status) {
  await db.rpc('admin_manage_order', {
    pwd: adminPassword,
    action: 'update_status',
    o_id: id,
    o_status: status
  });
  loadOrders();
}

// --- Complete Appointment ---
async function completeAppointment(id) {
  if (!confirm('Marcar como concluido?')) return;

  const { data } = await db.rpc('admin_complete_appointment', {
    pwd: adminPassword,
    apt_id: id
  });

  if (data?.error) {
    alert(data.error);
    return;
  }

  if (data?.card_complete) {
    alert('Cliente completou o cartao fidelidade! Proximo corte GRATIS!');
  } else if (data?.stamps) {
    alert(`Selo adicionado! Cliente tem ${data.stamps}/10 selos.`);
  }

  loadAppointments();
}

// --- Follow-up ---
async function loadFollowups() {
  const { data } = await db.from('valhalla_clients')
    .select('*')
    .not('last_completed_at', 'is', null)
    .order('last_completed_at', { ascending: true });

  const listEl = document.getElementById('followup-list');
  const emptyEl = document.getElementById('followup-empty');
  const nofreqEl = document.getElementById('followup-nofreq');
  const nofreqEmptyEl = document.getElementById('followup-nofreq-empty');

  if (!data || data.length === 0) {
    listEl.innerHTML = '';
    emptyEl.classList.remove('hidden');
    nofreqEl.innerHTML = '';
    nofreqEmptyEl.classList.remove('hidden');
    return;
  }

  const now = new Date();
  const withFreq = [];
  const withoutFreq = [];

  data.forEach(c => {
    const lastVisit = new Date(c.last_completed_at);
    const daysSince = Math.floor((now - lastVisit) / (1000 * 60 * 60 * 24));

    if (c.haircut_frequency_days) {
      const daysUntilDue = c.haircut_frequency_days - daysSince;
      withFreq.push({ ...c, daysSince, daysUntilDue });
    } else {
      withoutFreq.push({ ...c, daysSince });
    }
  });

  // Sort by urgency (most overdue first)
  withFreq.sort((a, b) => a.daysUntilDue - b.daysUntilDue);

  if (withFreq.length === 0) {
    listEl.innerHTML = '';
    emptyEl.classList.remove('hidden');
  } else {
    emptyEl.classList.add('hidden');
    listEl.innerHTML = withFreq.map(c => {
      let dotClass = 'green';
      let statusText = `Em dia (falta ${c.daysUntilDue} dia${c.daysUntilDue !== 1 ? 's' : ''})`;

      if (c.daysUntilDue <= 0) {
        dotClass = 'red';
        statusText = `Atrasado ${Math.abs(c.daysUntilDue)} dia${Math.abs(c.daysUntilDue) !== 1 ? 's' : ''}`;
      } else if (c.daysUntilDue <= 3) {
        dotClass = 'yellow';
        statusText = `Proximo (${c.daysUntilDue} dia${c.daysUntilDue !== 1 ? 's' : ''})`;
      }

      const lastDate = new Date(c.last_completed_at).toLocaleDateString('pt-BR');
      const waMsg = `Oi ${c.name.split(' ')[0]}! Ja faz ${c.daysSince} dias desde seu ultimo corte. Quer agendar? https://valhalla-barbearia.vercel.app`;
      const waUrl = `https://wa.me/${c.phone.replace(/\D/g, '')}?text=${encodeURIComponent(waMsg)}`;

      return `
        <div class="followup-item">
          <div class="fu-dot ${dotClass}"></div>
          <div class="fu-info">
            <div class="fu-name">${c.name}</div>
            <div class="fu-details">${c.phone} | Ultimo: ${lastDate} (${c.daysSince}d) | Freq: ${c.haircut_frequency_days}d</div>
            <div class="fu-details" style="color: var(--${dotClass === 'red' ? 'danger' : dotClass === 'yellow' ? 'accent' : 'success'})">${statusText}</div>
          </div>
          <a class="wa-send-btn" href="${waUrl}" target="_blank">Enviar</a>
        </div>`;
    }).join('');
  }

  // Clients without frequency
  if (withoutFreq.length === 0) {
    nofreqEl.innerHTML = '';
    nofreqEmptyEl.classList.remove('hidden');
  } else {
    nofreqEmptyEl.classList.add('hidden');
    nofreqEl.innerHTML = withoutFreq.map(c => {
      const lastDate = new Date(c.last_completed_at).toLocaleDateString('pt-BR');
      const waMsg = `Oi ${c.name.split(' ')[0]}! Ja faz ${c.daysSince} dias desde seu ultimo corte. Quer agendar? https://valhalla-barbearia.vercel.app`;
      const waUrl = `https://wa.me/${c.phone.replace(/\D/g, '')}?text=${encodeURIComponent(waMsg)}`;

      return `
        <div class="followup-item">
          <div class="fu-dot yellow"></div>
          <div class="fu-info">
            <div class="fu-name">${c.name}</div>
            <div class="fu-details">${c.phone} | Ultimo: ${lastDate} (${c.daysSince}d) | Sem frequencia</div>
          </div>
          <a class="wa-send-btn" href="${waUrl}" target="_blank">Enviar</a>
        </div>`;
    }).join('');
  }
}
